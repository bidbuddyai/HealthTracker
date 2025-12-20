import { storage } from "./storage";
import type { User, UserLearnedRule, TradeTemplate } from "@shared/schema";

export interface TradeKnowledgeContext {
  userId: string;
  trade: string;
  learnedRules: UserLearnedRule[];
  tradeTemplates: TradeTemplate[];
  vocabularyAliases: { canonical: string; alias: string }[];
  constraintRules: ConstraintRule[];
}

export interface ConstraintRule {
  predecessorKeyword: string;
  successorKeyword: string;
  relationshipType: "FS" | "SS" | "FF" | "SF";
  lag: number;
  description: string;
  confidence: number;
  source: "template" | "observed" | "user_preference" | "trained";
}

export interface GenerationPromptEnrichment {
  tradeContext: string;
  constraintInstructions: string;
  defaultActivities: string[];
  logicRules: ConstraintRule[];
}

export async function getTradeKnowledge(userId: string): Promise<TradeKnowledgeContext> {
  const user = await storage.getUser(userId);
  const trade = user?.primaryTrade || "General Contractor";
  
  const learnedRules = await storage.getUserLearnedRules(userId);
  const activeRules = learnedRules.filter(r => r.isActive);
  
  let tradeTemplates: TradeTemplate[] = [];
  try {
    tradeTemplates = await storage.getTradeTemplatesByCategory(trade);
  } catch (e) {
    console.log(`[TradeKnowledge] No templates found for trade: ${trade}`);
  }
  
  let vocabularyAliases: { canonical: string; alias: string }[] = [];
  try {
    const aliases = await storage.getVocabularyAliases(userId);
    vocabularyAliases = aliases.map(a => ({
      canonical: a.canonicalTerm,
      alias: a.aliasTerm
    }));
  } catch (e) {
    console.log(`[TradeKnowledge] No vocabulary aliases found for user`);
  }
  
  const constraintRules: ConstraintRule[] = activeRules
    .filter(r => r.ruleType === "must_precede" || r.ruleType === "must_follow")
    .map(r => ({
      predecessorKeyword: r.triggerKeyword,
      successorKeyword: r.targetKeyword,
      relationshipType: "FS" as const,
      lag: 0,
      description: `${r.triggerKeyword} must precede ${r.targetKeyword}`,
      confidence: r.confidenceScore || 50,
      source: (r.sourceType || "template") as "template" | "observed" | "user_preference" | "trained"
    }));
  
  for (const template of tradeTemplates) {
    if (template.logicRules && Array.isArray(template.logicRules)) {
      for (const rule of template.logicRules) {
        const existingRule = constraintRules.find(
          c => c.predecessorKeyword === rule.predecessorKeyword && 
               c.successorKeyword === rule.successorKeyword
        );
        if (!existingRule) {
          constraintRules.push({
            predecessorKeyword: rule.predecessorKeyword,
            successorKeyword: rule.successorKeyword,
            relationshipType: rule.relationshipType,
            lag: rule.lag || 0,
            description: rule.description || `${rule.predecessorKeyword} → ${rule.successorKeyword}`,
            confidence: 80,
            source: "template"
          });
        }
      }
    }
  }
  
  return {
    userId,
    trade,
    learnedRules: activeRules,
    tradeTemplates,
    vocabularyAliases,
    constraintRules
  };
}

export function generatePromptEnrichment(context: TradeKnowledgeContext): GenerationPromptEnrichment {
  const tradeNormalized = context.trade.toLowerCase();
  
  let tradeContext = `\n**USER TRADE PROFILE: ${context.trade}**\n`;
  
  if (tradeNormalized.includes("abatement") || tradeNormalized.includes("demo")) {
    tradeContext += `This user specializes in Abatement and Demolition work. Generate schedules that include:
- Regulatory notifications (EPA, Air Quality Board, OSHA)
- Containment setup and verification
- Hazardous material handling sequences
- Clearance testing and documentation
- Demolition sequencing (structural, selective, or full)
- Utility disconnection/rerouting\n`;
  } else if (tradeNormalized.includes("general") || tradeNormalized.includes("contractor")) {
    tradeContext += `This user is a General Contractor. Generate schedules that include:
- Preconstruction activities (permits, submittals, procurement)
- Site work and foundation sequences
- Structural phases (concrete, steel, framing)
- MEP rough-in coordination
- Finishes and closeout activities
- Owner milestones and inspections\n`;
  } else if (tradeNormalized.includes("mep") || tradeNormalized.includes("mechanical") || 
             tradeNormalized.includes("electrical") || tradeNormalized.includes("plumbing")) {
    tradeContext += `This user is an MEP Subcontractor. Generate schedules that include:
- Coordination and shop drawing activities
- Underground rough-in sequences
- Above-ceiling rough-in phases
- Equipment installation sequences
- Testing and balancing activities
- Commissioning and startup\n`;
  }
  
  if (context.vocabularyAliases.length > 0) {
    tradeContext += `\n**USER TERMINOLOGY PREFERENCES:**\n`;
    for (const alias of context.vocabularyAliases) {
      tradeContext += `- Use "${alias.alias}" instead of "${alias.canonical}"\n`;
    }
  }
  
  let constraintInstructions = "";
  const highConfidenceRules = context.constraintRules
    .filter(r => r.confidence >= 70)
    .sort((a, b) => b.confidence - a.confidence);
  
  if (highConfidenceRules.length > 0) {
    constraintInstructions = `\n**MANDATORY CONSTRAINT ENFORCEMENT (User's Learned Rules):**\n`;
    constraintInstructions += `You MUST enforce these relationships in the generated schedule:\n`;
    
    for (const rule of highConfidenceRules) {
      const lagText = rule.lag > 0 ? ` with ${rule.lag} day lag` : "";
      constraintInstructions += `- "${rule.predecessorKeyword}" MUST precede "${rule.successorKeyword}" (${rule.relationshipType}${lagText}) [Confidence: ${rule.confidence}%]\n`;
    }
    
    constraintInstructions += `\nWhen generating activities:
1. If an activity name contains "${highConfidenceRules[0]?.successorKeyword || 'keyword'}", add its required predecessor
2. Apply Finish-to-Start (FS) ties unless specified otherwise
3. Include lag times when specified by the user's rules\n`;
  }
  
  const defaultActivities: string[] = [];
  for (const template of context.tradeTemplates) {
    if (template.defaultActivities && Array.isArray(template.defaultActivities)) {
      for (const activity of template.defaultActivities) {
        if (!defaultActivities.includes(activity.name)) {
          defaultActivities.push(activity.name);
        }
      }
    }
  }
  
  return {
    tradeContext,
    constraintInstructions,
    defaultActivities,
    logicRules: context.constraintRules
  };
}

export async function enrichSystemPrompt(userId: string, basePrompt: string): Promise<string> {
  try {
    const context = await getTradeKnowledge(userId);
    const enrichment = generatePromptEnrichment(context);
    
    let enrichedPrompt = basePrompt;
    
    const insertPoint = enrichedPrompt.indexOf("**CPM NETWORK REQUIREMENTS:**");
    if (insertPoint > 0) {
      enrichedPrompt = 
        enrichedPrompt.slice(0, insertPoint) +
        enrichment.tradeContext +
        enrichment.constraintInstructions +
        "\n" +
        enrichedPrompt.slice(insertPoint);
    } else {
      enrichedPrompt = enrichment.tradeContext + enrichment.constraintInstructions + "\n\n" + enrichedPrompt;
    }
    
    console.log(`[TradeKnowledge] Enriched prompt with ${context.constraintRules.length} rules for ${context.trade} user`);
    
    return enrichedPrompt;
  } catch (error) {
    console.error("[TradeKnowledge] Error enriching prompt:", error);
    return basePrompt;
  }
}

export interface TrainCommandResult {
  success: boolean;
  rule?: {
    triggerKeyword: string;
    targetKeyword: string;
    ruleType: string;
    lag?: number;
    description: string;
  };
  error?: string;
  message?: string;
}

const TRAIN_PATTERNS = [
  // Pattern: "When I do demolition, I always need a 10-day notification period before starting"
  {
    pattern: /(?:when\s+(?:I\s+)?(?:do|have|need|start|perform)\s+)?["']?(.+?)["']?\s*,?\s*(?:I\s+)?(?:always\s+)?(?:need|require|must\s+have|want)\s+(?:a\s+)?(\d+)[- ]?(?:day|d)\s+(?:notification|lead\s*time|notice|waiting|lag|delay)(?:\s+(?:period|time))?\s*(?:before\s+(?:starting|beginning))?/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[1].trim(),
      targetKeyword: `${match[1].trim()} Start`,
      lag: parseInt(match[2]),
      ruleType: "lag_requirement",
      description: `${match[2]}-day notification period before ${match[1].trim()}`
    })
  },
  // Pattern: "X must come before Y" / "X should happen before Y"
  {
    pattern: /["']?([^"']+?)["']?\s+(?:must|should|needs?\s+to|has\s+to)\s+(?:come|happen|occur|be\s+done|precede|be\s+completed?)\s+(?:before|prior\s+to)\s+["']?([^"']+?)["']?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[1].trim(),
      targetKeyword: match[2].trim(),
      lag: 0,
      ruleType: "predecessor_successor",
      description: `${match[1].trim()} must precede ${match[2].trim()}`
    })
  },
  // Pattern: "Always do X before Y" / "X comes before Y"
  {
    pattern: /(?:always\s+)?(?:do\s+)?["']?([^"']+?)["']?\s+(?:comes?|goes?)\s+(?:before|prior\s+to|first,?\s+then)\s+["']?([^"']+?)["']?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[1].trim(),
      targetKeyword: match[2].trim(),
      lag: 0,
      ruleType: "predecessor_successor",
      description: `${match[1].trim()} must precede ${match[2].trim()}`
    })
  },
  // Pattern: "Before X, I always do Y" / "Before X, do Y first"
  {
    pattern: /(?:before\s+)?["']?([^"']+?)["']?\s*,?\s*(?:I\s+)?(?:always\s+)?(?:do|add|include|need)\s+["']?([^"']+?)["']?(?:\s+first)?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[2].trim(),
      targetKeyword: match[1].trim(),
      lag: 0,
      ruleType: "predecessor_successor",
      description: `${match[2].trim()} required before ${match[1].trim()}`
    })
  },
  // Pattern: "X and Y must start together"
  {
    pattern: /["']?([^"']+?)["']?\s+(?:and|with)\s+["']?([^"']+?)["']?\s+(?:must|should|need\s+to)\s+(?:start|begin|happen)\s+(?:together|at\s+the\s+same\s+time|simultaneously)/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[1].trim(),
      targetKeyword: match[2].trim(),
      lag: 0,
      ruleType: "concurrent_start",
      description: `${match[1].trim()} and ${match[2].trim()} start together`
    })
  },
  // Pattern: "I call X as Y" / "I refer to X as Y"
  {
    pattern: /(?:I\s+)?(?:call|name|refer\s+to|use)\s+["']?([^"']+?)["']?\s+(?:as|instead\s+of|for)\s+["']?([^"']+?)["']?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[2].trim(),
      targetKeyword: match[1].trim(),
      lag: 0,
      ruleType: "vocabulary",
      description: `User prefers "${match[1].trim()}" instead of "${match[2].trim()}"`
    })
  },
  // Pattern: "Use X instead of Y" / "Say X not Y"
  {
    pattern: /(?:use|say|prefer)\s+["']?([^"']+?)["']?\s+(?:instead\s+of|not|rather\s+than)\s+["']?([^"']+?)["']?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[2].trim(),
      targetKeyword: match[1].trim(),
      lag: 0,
      ruleType: "vocabulary",
      description: `User prefers "${match[1].trim()}" instead of "${match[2].trim()}"`
    })
  },
  // Pattern: "X requires Y first" / "X needs Y to be done first"
  {
    pattern: /["']?([^"']+?)["']?\s+(?:requires?|needs?)\s+["']?([^"']+?)["']?\s+(?:first|to\s+be\s+done\s+first|beforehand|completed\s+first)/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[2].trim(),
      targetKeyword: match[1].trim(),
      lag: 0,
      ruleType: "predecessor_successor",
      description: `${match[2].trim()} required before ${match[1].trim()}`
    })
  },
  // Pattern: "After X, always do Y" / "After X comes Y"
  {
    pattern: /after\s+["']?([^"']+?)["']?\s*,?\s*(?:always\s+)?(?:do|comes?|I\s+do)\s+["']?([^"']+?)["']?$/i,
    extract: (match: RegExpMatchArray) => ({
      triggerKeyword: match[1].trim(),
      targetKeyword: match[2].trim(),
      lag: 0,
      ruleType: "predecessor_successor",
      description: `${match[1].trim()} must precede ${match[2].trim()}`
    })
  }
];

export function parseTrainCommand(input: string): TrainCommandResult {
  const cleanInput = input.replace(/^\/train\s*/i, "").trim();
  
  if (!cleanInput) {
    return {
      success: false,
      error: "Please provide a training instruction. Example: '/train When I do demolition, I always need a 10-day notification period before starting.'"
    };
  }
  
  for (const { pattern, extract } of TRAIN_PATTERNS) {
    const match = cleanInput.match(pattern);
    if (match) {
      const extracted = extract(match);
      return {
        success: true,
        rule: extracted,
        message: `I learned: "${extracted.description}". This will be applied to future schedules.`
      };
    }
  }
  
  const words = cleanInput.split(/\s+/);
  const significantWords = words.filter(w => w.length > 3 && !["when", "always", "must", "should", "need", "have", "before", "after", "with"].includes(w.toLowerCase()));
  
  if (significantWords.length >= 2) {
    return {
      success: true,
      rule: {
        triggerKeyword: significantWords[0],
        targetKeyword: significantWords[1],
        ruleType: "custom_rule",
        description: cleanInput
      },
      message: `I recorded your rule: "${cleanInput}". I'll try to apply this pattern in future schedules.`
    };
  }
  
  return {
    success: false,
    error: "I couldn't understand that instruction. Try phrases like:\n- 'When I do demolition, I always need a 10-day notification before starting'\n- 'Clearance must come before Abatement'\n- 'I call Abatement as Remediation'"
  };
}

export async function saveTrainedRule(userId: string, rule: TrainCommandResult["rule"]): Promise<{ success: boolean; ruleId?: string; error?: string }> {
  if (!rule) {
    return { success: false, error: "No rule to save" };
  }
  
  try {
    if (rule.ruleType === "vocabulary") {
      await storage.createVocabularyAlias({
        userId,
        canonicalTerm: rule.triggerKeyword,
        aliasTerm: rule.targetKeyword,
        occurrenceCount: 1,
        isActive: true
      });
      return { success: true };
    }
    
    let ruleType: "must_precede" | "must_follow" | "cannot_overlap" | "requires_gap" | "concurrent_allowed" = "must_precede";
    if (rule.ruleType === "concurrent_start") {
      ruleType = "concurrent_allowed";
    } else if (rule.ruleType === "lag_requirement") {
      ruleType = "requires_gap";
    }
    
    const newRule = await storage.createUserLearnedRule({
      userId,
      triggerKeyword: rule.triggerKeyword,
      ruleType,
      targetKeyword: rule.lag 
        ? `${rule.targetKeyword} [Lag: ${rule.lag}d]` 
        : rule.targetKeyword,
      confidenceScore: 95,
      occurrenceCount: 1,
      isActive: true,
      isUserPreference: true,
      sourceType: "user_preference"
    });
    
    return { success: true, ruleId: newRule.id };
  } catch (error) {
    console.error("[TrainCommand] Error saving rule:", error);
    return { success: false, error: "Failed to save the rule" };
  }
}

export function applyConstraintsToActivities(
  activities: any[],
  constraintRules: ConstraintRule[]
): any[] {
  const activityNames = activities.map(a => a.name.toLowerCase());
  const activityMap = new Map(activities.map(a => [a.activityId, a]));
  
  for (const rule of constraintRules) {
    const predecessorKeyword = rule.predecessorKeyword.toLowerCase();
    const successorKeyword = rule.successorKeyword.toLowerCase();
    
    const predecessorActivities = activities.filter(a => 
      a.name.toLowerCase().includes(predecessorKeyword)
    );
    const successorActivities = activities.filter(a => 
      a.name.toLowerCase().includes(successorKeyword)
    );
    
    for (const successor of successorActivities) {
      for (const predecessor of predecessorActivities) {
        if (predecessor.activityId !== successor.activityId) {
          if (!successor.predecessors) {
            successor.predecessors = [];
          }
          if (!successor.predecessors.includes(predecessor.activityId)) {
            successor.predecessors.push(predecessor.activityId);
            console.log(`[ConstraintEnforcement] Applied rule: ${predecessor.name} → ${successor.name} (${rule.source})`);
          }
        }
      }
    }
  }
  
  return activities;
}
