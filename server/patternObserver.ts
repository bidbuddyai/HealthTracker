import { storage } from "./storage";
import type { Activity, Wbs, Relationship, UserLearnedRule, Project } from "@shared/schema";

interface SequencePair {
  predecessor: string;
  successor: string;
  count: number;
}

interface ActivitySnapshot {
  id: string;
  name: string;
  wbsId?: string | null;
  earlyStart?: string | null;
}

interface LogicDiff {
  triggerKeyword: string;
  targetKeyword: string;
  isUserOverride: boolean;
  description: string;
}

interface VocabularyChange {
  canonicalTerm: string;
  aliasTerm: string;
}

interface ScopePredecessor {
  predecessorKeyword: string;
  targetKeyword: string;
  projectScope: string;
}

const CONFIDENCE_INCREMENT = 5;
const CONFIDENCE_DECREMENT = 2;
const MIN_OCCURRENCES_FOR_RULE = 3;
const CANONICAL_TERMS = [
  "Abatement", "Demolition", "Containment", "Survey", "Mobilization",
  "Earthwork", "Foundations", "Structure", "Envelope", "MEP",
  "Finishes", "Punchlist", "BIM", "Commissioning", "Testing"
];

export class PatternObserver {
  private userId: string;
  private projectId: string;
  private previousActivities: Map<string, ActivitySnapshot> = new Map();
  private previousRelationships: Map<string, { predecessorId: string; successorId: string }> = new Map();

  constructor(userId: string, projectId: string) {
    this.userId = userId;
    this.projectId = projectId;
  }

  async captureSnapshot(): Promise<void> {
    const activities = await storage.getActivitiesByProject(this.projectId);
    const relationships = await storage.getRelationshipsByProject(this.projectId);

    this.previousActivities.clear();
    for (const activity of activities) {
      this.previousActivities.set(activity.id, {
        id: activity.id,
        name: activity.name,
        wbsId: activity.wbsId,
        earlyStart: activity.earlyStart
      });
    }

    this.previousRelationships.clear();
    for (const rel of relationships) {
      this.previousRelationships.set(rel.id, {
        predecessorId: rel.predecessorId,
        successorId: rel.successorId
      });
    }
  }

  async analyzeChanges(): Promise<{
    sequencePatterns: SequencePair[];
    logicDiffs: LogicDiff[];
    vocabularyChanges: VocabularyChange[];
    scopePredecessors: ScopePredecessor[];
  }> {
    const activities = await storage.getActivitiesByProject(this.projectId);
    const relationships = await storage.getRelationshipsByProject(this.projectId);
    const wbsList = await storage.getWbsByProject(this.projectId);
    const project = await storage.getProject(this.projectId);

    const sequencePatterns = await this.extractSequencePatterns(activities, relationships);
    const logicDiffs = await this.detectLogicDiffs(activities, relationships);
    const vocabularyChanges = this.detectVocabularyChanges(activities);
    const scopePredecessors = await this.detectScopePredecessors(activities, relationships, project);

    return { sequencePatterns, logicDiffs, vocabularyChanges, scopePredecessors };
  }

  private async extractSequencePatterns(
    activities: Activity[],
    relationships: Relationship[]
  ): Promise<SequencePair[]> {
    const pairs: Map<string, number> = new Map();

    for (const rel of relationships) {
      const predecessor = activities.find(a => a.id === rel.predecessorId);
      const successor = activities.find(a => a.id === rel.successorId);

      if (predecessor && successor) {
        const predKeyword = this.extractKeyword(predecessor.name);
        const succKeyword = this.extractKeyword(successor.name);
        
        if (predKeyword && succKeyword && predKeyword !== succKeyword) {
          const key = `${predKeyword}::${succKeyword}`;
          pairs.set(key, (pairs.get(key) || 0) + 1);
        }
      }
    }

    return Array.from(pairs.entries())
      .filter(([_, count]) => count >= 1)
      .map(([key, count]) => {
        const [predecessor, successor] = key.split("::");
        return { predecessor, successor, count };
      });
  }

  private async detectLogicDiffs(
    activities: Activity[],
    relationships: Relationship[]
  ): Promise<LogicDiff[]> {
    const diffs: LogicDiff[] = [];
    const userRules = await storage.getUserLearnedRules(this.userId);
    const templateRulesMap = new Map<string, UserLearnedRule>();
    
    for (const rule of userRules) {
      if (rule.sourceType === "template") {
        templateRulesMap.set(`${rule.triggerKeyword}::${rule.targetKeyword}`, rule);
      }
    }

    for (const rel of relationships) {
      const predecessor = activities.find(a => a.id === rel.predecessorId);
      const successor = activities.find(a => a.id === rel.successorId);

      if (predecessor && successor) {
        const predKeyword = this.extractKeyword(predecessor.name);
        const succKeyword = this.extractKeyword(successor.name);

        if (predKeyword && succKeyword) {
          const reverseKey = `${succKeyword}::${predKeyword}`;
          const templateRule = templateRulesMap.get(reverseKey);

          if (templateRule) {
            diffs.push({
              triggerKeyword: predKeyword,
              targetKeyword: succKeyword,
              isUserOverride: true,
              description: `User moved '${predKeyword}' before '${succKeyword}' (contrary to template rule)`
            });
          }
        }
      }
    }

    return diffs;
  }

  private detectVocabularyChanges(activities: Activity[]): VocabularyChange[] {
    const changes: VocabularyChange[] = [];
    const activityNames = activities.map(a => a.name);

    for (const name of activityNames) {
      for (const canonical of CANONICAL_TERMS) {
        if (name.toLowerCase().includes(canonical.toLowerCase())) {
          continue;
        }

        const similarityAliases = this.findSimilarTerms(name, canonical);
        if (similarityAliases) {
          changes.push({
            canonicalTerm: canonical,
            aliasTerm: similarityAliases
          });
        }
      }
    }

    return changes;
  }

  private findSimilarTerms(activityName: string, canonical: string): string | null {
    const synonymMap: Record<string, string[]> = {
      "Abatement": ["Remediation", "Removal", "Cleanup"],
      "Demolition": ["Demo", "Teardown", "Deconstruction"],
      "Containment": ["Enclosure", "Barrier", "Isolation"],
      "Survey": ["Inspection", "Assessment", "Evaluation"],
      "Mobilization": ["Mob", "Setup", "Site Prep"],
      "Foundations": ["Foundation", "Footings", "Slab"],
      "Structure": ["Structural", "Framing", "Steel"],
      "Envelope": ["Exterior", "Shell", "Cladding"],
      "MEP": ["Mechanical", "Electrical", "Plumbing", "HVAC"],
      "Finishes": ["Finish", "Interior", "Paint"],
      "Punchlist": ["Punch", "Deficiency", "Closeout"],
      "BIM": ["Coordination", "Clash Detection", "Model"],
      "Commissioning": ["Cx", "Startup", "Functional Testing"],
      "Testing": ["Test", "QC", "Verification"]
    };

    const synonyms = synonymMap[canonical] || [];
    const lowerName = activityName.toLowerCase();

    for (const synonym of synonyms) {
      if (lowerName.includes(synonym.toLowerCase())) {
        const words = activityName.split(/\s+/);
        for (const word of words) {
          if (word.toLowerCase().includes(synonym.toLowerCase())) {
            return word;
          }
        }
      }
    }

    return null;
  }

  private async detectScopePredecessors(
    activities: Activity[],
    relationships: Relationship[],
    project: Project | undefined
  ): Promise<ScopePredecessor[]> {
    const scopePreds: ScopePredecessor[] = [];
    
    if (!project) return scopePreds;

    const projectScope = this.detectProjectScope(project, activities);
    if (!projectScope) return scopePreds;

    const startActivities = activities.filter(a => 
      a.name.toLowerCase().includes("start") || 
      a.name.toLowerCase().includes("mobilization") ||
      a.activityId?.toLowerCase().includes("start")
    );

    for (const rel of relationships) {
      const predecessor = activities.find(a => a.id === rel.predecessorId);
      const successor = activities.find(a => a.id === rel.successorId);

      if (predecessor && successor && startActivities.some(s => s.id === successor.id)) {
        const predKeyword = this.extractKeyword(predecessor.name);
        if (predKeyword) {
          scopePreds.push({
            predecessorKeyword: predKeyword,
            targetKeyword: "Start",
            projectScope
          });
        }
      }
    }

    return scopePreds;
  }

  private detectProjectScope(project: Project, activities: Activity[]): string | null {
    const projectName = project.name.toLowerCase();
    const activityNames = activities.map(a => a.name.toLowerCase());

    if (projectName.includes("abatement") || activityNames.some(n => n.includes("abatement"))) {
      return "Abatement";
    }
    if (projectName.includes("demolition") || activityNames.some(n => n.includes("demo"))) {
      return "Demolition";
    }
    if (activityNames.some(n => n.includes("mep") || n.includes("mechanical") || n.includes("electrical"))) {
      return "MEP";
    }
    if (activityNames.some(n => n.includes("foundations") || n.includes("structure"))) {
      return "General Construction";
    }

    return null;
  }

  private extractKeyword(activityName: string): string | null {
    for (const term of CANONICAL_TERMS) {
      if (activityName.toLowerCase().includes(term.toLowerCase())) {
        return term;
      }
    }

    const words = activityName.split(/\s+/).filter(w => w.length > 3);
    return words[0] || null;
  }

  async applyLearning(): Promise<{
    rulesUpdated: number;
    rulesCreated: number;
    aliasesCreated: number;
    scopeRulesCreated: number;
  }> {
    const { sequencePatterns, logicDiffs, vocabularyChanges, scopePredecessors } = await this.analyzeChanges();
    
    let rulesUpdated = 0;
    let rulesCreated = 0;
    let aliasesCreated = 0;
    let scopeRulesCreated = 0;

    for (const pattern of sequencePatterns) {
      const existingRule = await storage.getUserLearnedRuleByKeywords(
        this.userId,
        pattern.predecessor,
        pattern.successor
      );

      if (existingRule) {
        const newCount = (existingRule.occurrenceCount || 0) + pattern.count;
        const newConfidence = Math.min(100, (existingRule.confidenceScore || 50) + CONFIDENCE_INCREMENT);
        
        await storage.updateUserLearnedRule(existingRule.id, {
          occurrenceCount: newCount,
          confidenceScore: newConfidence,
          lastApplied: new Date()
        });
        rulesUpdated++;
      } else if (pattern.count >= MIN_OCCURRENCES_FOR_RULE) {
        await storage.createUserLearnedRule({
          userId: this.userId,
          triggerKeyword: pattern.predecessor,
          ruleType: "must_precede",
          targetKeyword: pattern.successor,
          confidenceScore: 50 + (pattern.count * CONFIDENCE_INCREMENT),
          occurrenceCount: pattern.count,
          isActive: true,
          isUserPreference: false,
          sourceType: "observed"
        });
        rulesCreated++;
      }
    }

    for (const diff of logicDiffs) {
      if (diff.isUserOverride) {
        const existingRule = await storage.getUserLearnedRuleByKeywords(
          this.userId,
          diff.triggerKeyword,
          diff.targetKeyword
        );

        if (!existingRule) {
          await storage.createUserLearnedRule({
            userId: this.userId,
            triggerKeyword: diff.triggerKeyword,
            ruleType: "must_precede",
            targetKeyword: diff.targetKeyword,
            confidenceScore: 75,
            occurrenceCount: 1,
            isActive: true,
            isUserPreference: true,
            sourceType: "user_preference"
          });
          rulesCreated++;
        } else if (!existingRule.isUserPreference) {
          await storage.updateUserLearnedRule(existingRule.id, {
            isUserPreference: true,
            sourceType: "user_preference",
            confidenceScore: Math.max(existingRule.confidenceScore || 50, 75)
          });
          rulesUpdated++;
        }
      }
    }

    for (const change of vocabularyChanges) {
      const existingAlias = await storage.getVocabularyAlias(
        this.userId,
        change.canonicalTerm,
        change.aliasTerm
      );

      if (existingAlias) {
        await storage.updateVocabularyAlias(existingAlias.id, {
          occurrenceCount: (existingAlias.occurrenceCount || 0) + 1
        });
      } else {
        await storage.createVocabularyAlias({
          userId: this.userId,
          canonicalTerm: change.canonicalTerm,
          aliasTerm: change.aliasTerm,
          occurrenceCount: 1,
          isActive: true
        });
        aliasesCreated++;
      }
    }

    for (const scopePred of scopePredecessors) {
      const existingRule = await storage.getUserLearnedRuleByKeywords(
        this.userId,
        scopePred.predecessorKeyword,
        scopePred.targetKeyword
      );

      if (!existingRule) {
        await storage.createUserLearnedRule({
          userId: this.userId,
          triggerKeyword: scopePred.predecessorKeyword,
          ruleType: "must_precede",
          targetKeyword: scopePred.targetKeyword,
          confidenceScore: 60,
          occurrenceCount: 1,
          isActive: true,
          isUserPreference: false,
          sourceType: "observed",
          projectScope: scopePred.projectScope
        });
        scopeRulesCreated++;
      } else {
        await storage.updateUserLearnedRule(existingRule.id, {
          projectScope: scopePred.projectScope,
          occurrenceCount: (existingRule.occurrenceCount || 0) + 1,
          confidenceScore: Math.min(100, (existingRule.confidenceScore || 50) + CONFIDENCE_INCREMENT)
        });
        rulesUpdated++;
      }
    }

    console.log(`[PatternObserver] Applied learning for user ${this.userId}:`, {
      rulesUpdated,
      rulesCreated,
      aliasesCreated,
      scopeRulesCreated
    });

    return { rulesUpdated, rulesCreated, aliasesCreated, scopeRulesCreated };
  }
}

export async function observeScheduleSave(userId: string, projectId: string): Promise<void> {
  try {
    const observer = new PatternObserver(userId, projectId);
    await observer.applyLearning();
  } catch (error) {
    console.error("[PatternObserver] Error during schedule observation:", error);
  }
}
