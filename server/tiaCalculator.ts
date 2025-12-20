import type { Activity, Relationship, TiaScenario, TiaFragnet, TiaDelay, TiaResult } from "@shared/schema";
import { storage } from "./storage";
import { calculateCPM } from "./cpmCalculator";

export interface TiaCalculationOptions {
  considerResourceConstraints?: boolean;
  considerWeatherImpacts?: boolean;
  analyzeAcceleration?: boolean;
  analyzeRecovery?: boolean;
}

export interface NegativeFloatInfo {
  activityId: string;
  activityName: string;
  totalFloat: number;
  freeFloat?: number;
  constraintViolation?: string;
}

export interface FinishVariance {
  unimpactedFinish: Date;
  impactedFinish: Date;
  varianceDays: number;
  varianceCalendarDays: number;
  exceedsContractDate: boolean;
  contractVariance?: number;
}

export interface TiaAnalysisResult {
  scenarioId: string;
  baselineFinish: Date;
  impactedFinish: Date;
  netImpact: number;
  finishVariance: FinishVariance;
  hasNegativeFloat: boolean;
  negativeFloatActivities: NegativeFloatInfo[];
  criticalPathChanges: {
    previousCritical: string[];
    newCritical: string[];
    becameCritical: string[];
    lostCriticality: string[];
  };
  floatConsumption: Map<string, number>;
  affectedMilestones: {
    activityId: string;
    name: string;
    baselineDate: Date;
    impactedDate: Date;
    delayDays: number;
  }[];
  paceAnalysis?: {
    requiredPace: number;
    currentPace: number;
    feasibility: "feasible" | "challenging" | "unlikely";
  };
  compressionOpportunities?: {
    activityId: string;
    name: string;
    potentialSavings: number;
    method: "fast-track" | "crash" | "resource-add" | "shift-work";
    riskLevel: "low" | "medium" | "high";
  }[];
  aaceCompliance: {
    methodology: string;
    windowAnalysisUsed: boolean;
    prospectiveAnalysis: boolean;
    contemporaneousData: boolean;
  };
}

export class TiaCalculator {
  
  async performTiaAnalysis(
    scenarioId: string,
    options: TiaCalculationOptions = {}
  ): Promise<TiaAnalysisResult> {
    
    // Get scenario and project data
    const scenario = await storage.getTiaScenario(scenarioId);
    if (!scenario) throw new Error("TIA scenario not found");
    
    const activities = await storage.getActivitiesByProject(scenario.projectId);
    const relationships = await storage.getRelationshipsByProject(scenario.projectId);
    const fragnets = await storage.getTiaFragnetsByScenario(scenarioId);
    const delays = await storage.getTiaDelaysByScenario(scenarioId);
    
    // AACE RP 29R-03 (MIP 3.7) Compliance: Time Impact Analysis
    // Step 1: Establish the Unimpacted Schedule (baseline before delay event)
    const baselineResult = calculateCPM(activities, relationships);
    const baselineCriticalPath = this.extractCriticalPath(activities);
    const baselineFinish = this.getProjectFinish(activities);
    
    // Step 2: Create impacted schedule by inserting fragnets (delay events)
    // Per AACE RP 29R-03: Insert fragnet at the point of impact
    let impactedActivities = [...activities];
    let impactedRelationships = [...relationships];
    
    for (const fragnet of fragnets) {
      const insertion = this.insertFragnet(
        impactedActivities,
        impactedRelationships,
        fragnet
      );
      impactedActivities = insertion.activities;
      impactedRelationships = insertion.relationships;
    }
    
    // Step 3: Apply delays to activities
    impactedActivities = this.applyDelays(impactedActivities, delays);
    
    // Step 4: Recalculate CPM for Impacted Schedule
    // CRITICAL: Always recalculate project finish after fragnet insertion
    const impactedResult = calculateCPM(impactedActivities, impactedRelationships);
    const impactedCriticalPath = this.extractCriticalPath(impactedActivities);
    const impactedFinish = this.getProjectFinish(impactedActivities);
    
    // Step 5: Analyze critical path changes
    const criticalPathChanges = this.analyzeCriticalPathChanges(
      baselineCriticalPath,
      impactedCriticalPath
    );
    
    // Step 6: Calculate float consumption
    const floatConsumption = this.calculateFloatConsumption(
      activities,
      impactedActivities
    );
    
    // Step 7: Identify affected milestones
    const affectedMilestones = this.identifyAffectedMilestones(
      activities,
      impactedActivities
    );
    
    // Step 8: DELTA CHECK - Calculate finish variance per AACE RP 29R-03
    const varianceDays = Math.ceil(
      (impactedFinish.getTime() - baselineFinish.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Calculate calendar day variance (accounting for non-work days would require calendar)
    const varianceCalendarDays = varianceDays;
    
    // Check against contract date if specified
    const contractDate = scenario.targetDate ? new Date(scenario.targetDate) : null;
    const exceedsContractDate = contractDate ? impactedFinish > contractDate : false;
    const contractVariance = contractDate 
      ? Math.ceil((impactedFinish.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    
    const finishVariance: FinishVariance = {
      unimpactedFinish: baselineFinish,
      impactedFinish: impactedFinish,
      varianceDays,
      varianceCalendarDays,
      exceedsContractDate,
      contractVariance
    };
    
    // Step 9: NEGATIVE FLOAT DETECTION
    // Per AACE: Negative float indicates delay extends beyond contract completion
    const negativeFloatActivities = this.detectNegativeFloat(impactedActivities);
    const hasNegativeFloat = negativeFloatActivities.length > 0;
    
    if (hasNegativeFloat) {
      console.warn(`[TIA] WARNING: Negative float detected on ${negativeFloatActivities.length} activities. ` +
        `Delay extends beyond project completion date.`);
    }
    
    // Legacy netImpact for backward compatibility
    const netImpact = varianceDays;
    
    // Optional analyses
    let paceAnalysis, compressionOpportunities;
    
    if (options.analyzeRecovery) {
      paceAnalysis = this.analyzePaceRequired(
        impactedActivities,
        scenario.targetDate ? new Date(scenario.targetDate) : baselineFinish
      );
    }
    
    if (options.analyzeAcceleration) {
      compressionOpportunities = this.identifyCompressionOpportunities(
        impactedActivities,
        impactedRelationships
      );
    }
    
    // AACE RP 29R-03 Compliance metadata
    const aaceCompliance = {
      methodology: "MIP 3.7 - Modeled/Additive Time Impact Analysis",
      windowAnalysisUsed: false,
      prospectiveAnalysis: true,
      contemporaneousData: true
    };
    
    // Save result to storage
    await storage.createTiaResult({
      scenarioId,
      unimpactedFinishDate: baselineFinish.toISOString().split('T')[0],
      impactedFinishDate: impactedFinish.toISOString().split('T')[0],
      netImpactDays: netImpact,
      criticalPathChanges: criticalPathChanges,
      floatErosion: Object.fromEntries(floatConsumption),
      affectedMilestones: affectedMilestones.map(m => ({
        ...m,
        baselineDate: m.baselineDate.toISOString(),
        impactedDate: m.impactedDate.toISOString()
      }))
    });
    
    return {
      scenarioId,
      baselineFinish,
      impactedFinish,
      netImpact,
      finishVariance,
      hasNegativeFloat,
      negativeFloatActivities,
      criticalPathChanges,
      floatConsumption,
      affectedMilestones,
      paceAnalysis,
      compressionOpportunities,
      aaceCompliance
    };
  }
  
  private detectNegativeFloat(activities: Activity[]): NegativeFloatInfo[] {
    const negativeFloatActivities: NegativeFloatInfo[] = [];
    
    for (const activity of activities) {
      const totalFloat = activity.totalFloat;
      
      if (totalFloat !== null && totalFloat !== undefined && totalFloat < 0) {
        let constraintViolation: string | undefined;
        
        // Check if negative float is due to constraint violation
        if (activity.constraintType && activity.constraintDate) {
          const constraintDate = new Date(activity.constraintDate);
          const earlyFinish = activity.earlyFinish ? new Date(activity.earlyFinish) : null;
          const earlyStart = activity.earlyStart ? new Date(activity.earlyStart) : null;
          
          if (activity.constraintType === "FNLT" && earlyFinish && earlyFinish > constraintDate) {
            constraintViolation = `Finish No Later Than ${activity.constraintDate} violated`;
          } else if (activity.constraintType === "SNLT" && earlyStart && earlyStart > constraintDate) {
            constraintViolation = `Start No Later Than ${activity.constraintDate} violated`;
          } else if (activity.constraintType === "MFO" && earlyFinish && earlyFinish > constraintDate) {
            constraintViolation = `Must Finish On ${activity.constraintDate} violated`;
          } else if (activity.constraintType === "MSO" && earlyStart && earlyStart > constraintDate) {
            constraintViolation = `Must Start On ${activity.constraintDate} violated`;
          }
        }
        
        negativeFloatActivities.push({
          activityId: activity.activityId,
          activityName: activity.name,
          totalFloat: totalFloat,
          freeFloat: activity.freeFloat ?? undefined,
          constraintViolation
        });
      }
    }
    
    // Sort by most negative float first
    negativeFloatActivities.sort((a, b) => a.totalFloat - b.totalFloat);
    
    return negativeFloatActivities;
  }
  
  private insertFragnet(
    activities: Activity[],
    relationships: Relationship[],
    fragnet: TiaFragnet
  ): { activities: Activity[]; relationships: Relationship[] } {
    
    if (!fragnet.activities || !fragnet.insertionPoint) {
      return { activities, relationships };
    }
    
    // Parse fragnet activities and relationships
    const fragnetActivities = fragnet.activities as any[];
    const fragnetRelationships = fragnet.relationships as any[] || [];
    const linkedActivities = fragnet.linkedActivities as string[] || [];
    
    // Add fragnet activities with unique IDs
    const activityIdMap = new Map<string, string>();
    const newActivities = [...activities];
    
    for (const fragActivity of fragnetActivities) {
      const newId = `fragnet-${fragnet.id}-${fragActivity.id}`;
      activityIdMap.set(fragActivity.id, newId);
      
      newActivities.push({
        ...fragActivity,
        id: newId,
        projectId: activities[0]?.projectId || ""
      });
    }
    
    // Add fragnet relationships with mapped IDs
    const newRelationships = [...relationships];
    
    for (const fragRel of fragnetRelationships) {
      newRelationships.push({
        ...fragRel,
        id: `fragnet-rel-${fragnet.id}-${fragRel.id}`,
        predecessorId: activityIdMap.get(fragRel.predecessorId) || fragRel.predecessorId,
        successorId: activityIdMap.get(fragRel.successorId) || fragRel.successorId,
        projectId: activities[0]?.projectId || ""
      });
    }
    
    // Link fragnet to existing schedule
    const insertionActivity = activities.find(a => a.activityId === fragnet.insertionPoint);
    if (insertionActivity) {
      // Link fragnet start to insertion point
      const fragnetStartActivities = fragnetActivities.filter(a => 
        !fragnetRelationships.some(r => r.successorId === a.id)
      );
      
      for (const startActivity of fragnetStartActivities) {
        newRelationships.push({
          id: `link-${fragnet.id}-${startActivity.id}`,
          projectId: activities[0]?.projectId || "",
          predecessorId: insertionActivity.id,
          successorId: activityIdMap.get(startActivity.id) || startActivity.id,
          relationshipType: "FS",
          lag: 0
        } as Relationship);
      }
      
      // Link fragnet end to linked activities
      const fragnetEndActivities = fragnetActivities.filter(a =>
        !fragnetRelationships.some(r => r.predecessorId === a.id)
      );
      
      for (const linkedId of linkedActivities) {
        const linkedActivity = activities.find(a => a.activityId === linkedId);
        if (linkedActivity) {
          for (const endActivity of fragnetEndActivities) {
            newRelationships.push({
              id: `link-end-${fragnet.id}-${endActivity.id}-${linkedId}`,
              projectId: activities[0]?.projectId || "",
              predecessorId: activityIdMap.get(endActivity.id) || endActivity.id,
              successorId: linkedActivity.id,
              relationshipType: "FS",
              lag: 0
            } as Relationship);
          }
        }
      }
    }
    
    return { activities: newActivities, relationships: newRelationships };
  }
  
  private applyDelays(activities: Activity[], delays: TiaDelay[]): Activity[] {
    const updatedActivities = [...activities];
    
    for (const delay of delays) {
      const affectedActivity = updatedActivities.find(
        a => a.activityId === delay.affectedActivityId
      );
      
      if (affectedActivity) {
        // Add delay days to duration
        if (affectedActivity.originalDuration) {
          affectedActivity.originalDuration += (delay.delayDays || 0);
          if (affectedActivity.remainingDuration) {
            affectedActivity.remainingDuration += (delay.delayDays || 0);
          }
        }
        
        // Apply constraint if delay has specific dates
        if (delay.delayType === "start-delay" && delay.startDate) {
          affectedActivity.constraintType = "SNET";
          affectedActivity.constraintDate = delay.startDate;
        } else if (delay.delayType === "finish-delay" && delay.endDate) {
          affectedActivity.constraintType = "FNET";
          affectedActivity.constraintDate = delay.endDate;
        }
      }
    }
    
    return updatedActivities;
  }
  
  private extractCriticalPath(activities: Activity[]): string[] {
    return activities
      .filter(a => a.totalFloat === 0)
      .map(a => a.activityId);
  }
  
  private getProjectFinish(activities: Activity[]): Date {
    const finishDates = activities
      .filter(a => a.earlyFinish)
      .map(a => new Date(a.earlyFinish!));
    
    return finishDates.length > 0
      ? new Date(Math.max(...finishDates.map(d => d.getTime())))
      : new Date();
  }
  
  private analyzeCriticalPathChanges(
    baselinePath: string[],
    impactedPath: string[]
  ): TiaAnalysisResult["criticalPathChanges"] {
    const baselineSet = new Set(baselinePath);
    const impactedSet = new Set(impactedPath);
    
    const becameCritical = impactedPath.filter(id => !baselineSet.has(id));
    const lostCriticality = baselinePath.filter(id => !impactedSet.has(id));
    
    return {
      previousCritical: baselinePath,
      newCritical: impactedPath,
      becameCritical,
      lostCriticality
    };
  }
  
  private calculateFloatConsumption(
    baselineActivities: Activity[],
    impactedActivities: Activity[]
  ): Map<string, number> {
    const floatConsumption = new Map<string, number>();
    
    for (const baselineActivity of baselineActivities) {
      const impactedActivity = impactedActivities.find(
        a => a.activityId === baselineActivity.activityId
      );
      
      if (impactedActivity) {
        const baselineFloat = baselineActivity.totalFloat || 0;
        const impactedFloat = impactedActivity.totalFloat || 0;
        const consumed = baselineFloat - impactedFloat;
        
        if (consumed > 0) {
          floatConsumption.set(baselineActivity.activityId, consumed);
        }
      }
    }
    
    return floatConsumption;
  }
  
  private identifyAffectedMilestones(
    baselineActivities: Activity[],
    impactedActivities: Activity[]
  ): TiaAnalysisResult["affectedMilestones"] {
    const milestones: TiaAnalysisResult["affectedMilestones"] = [];
    
    const baselineMilestones = baselineActivities.filter(a => a.type === "Milestone");
    
    for (const baselineMilestone of baselineMilestones) {
      const impactedMilestone = impactedActivities.find(
        a => a.activityId === baselineMilestone.activityId
      );
      
      if (impactedMilestone && baselineMilestone.earlyFinish && impactedMilestone.earlyFinish) {
        const baselineDate = new Date(baselineMilestone.earlyFinish);
        const impactedDate = new Date(impactedMilestone.earlyFinish);
        const delayDays = Math.ceil(
          (impactedDate.getTime() - baselineDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (delayDays > 0) {
          milestones.push({
            activityId: baselineMilestone.activityId,
            name: baselineMilestone.name,
            baselineDate,
            impactedDate,
            delayDays
          });
        }
      }
    }
    
    return milestones;
  }
  
  private analyzePaceRequired(
    activities: Activity[],
    targetDate: Date
  ): TiaAnalysisResult["paceAnalysis"] {
    const currentFinish = this.getProjectFinish(activities);
    const remainingDays = Math.ceil(
      (targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const requiredDays = Math.ceil(
      (currentFinish.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    const requiredPace = requiredDays / remainingDays;
    const currentPace = 1.0;
    
    let feasibility: "feasible" | "challenging" | "unlikely";
    if (requiredPace <= 1.2) {
      feasibility = "feasible";
    } else if (requiredPace <= 1.5) {
      feasibility = "challenging";
    } else {
      feasibility = "unlikely";
    }
    
    return {
      requiredPace,
      currentPace,
      feasibility
    };
  }
  
  private identifyCompressionOpportunities(
    activities: Activity[],
    relationships: Relationship[]
  ): TiaAnalysisResult["compressionOpportunities"] {
    const opportunities: TiaAnalysisResult["compressionOpportunities"] = [];
    
    // Identify activities on critical path
    const criticalActivities = activities.filter(a => a.totalFloat === 0);
    
    for (const activity of criticalActivities) {
      if (activity.type === "Task" && activity.originalDuration && activity.originalDuration > 5) {
        
        // Fast-tracking opportunity (parallel execution)
        const hasSSRelationship = relationships.some(
          r => r.successorId === activity.id && r.relationshipType === "SS"
        );
        
        if (!hasSSRelationship) {
          opportunities.push({
            activityId: activity.activityId,
            name: activity.name,
            potentialSavings: Math.floor(activity.originalDuration * 0.3),
            method: "fast-track",
            riskLevel: "medium"
          });
        }
        
        // Crashing opportunity (add resources)
        if (activity.originalDuration > 10) {
          opportunities.push({
            activityId: activity.activityId,
            name: activity.name,
            potentialSavings: Math.floor(activity.originalDuration * 0.25),
            method: "crash",
            riskLevel: "low"
          });
        }
        
        // Shift work opportunity (24/7 operations)
        if (activity.originalDuration > 20) {
          opportunities.push({
            activityId: activity.activityId,
            name: activity.name,
            potentialSavings: Math.floor(activity.originalDuration * 0.5),
            method: "shift-work",
            riskLevel: "high"
          });
        }
      }
    }
    
    // Sort by potential savings
    opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);
    
    return opportunities.slice(0, 10); // Return top 10 opportunities
  }
  
  async compareScenarios(
    scenarioIds: string[]
  ): Promise<{
    scenarios: TiaAnalysisResult[];
    comparison: {
      minImpact: number;
      maxImpact: number;
      averageImpact: number;
      mostLikelyScenario: string;
      worstCaseScenario: string;
      bestCaseScenario: string;
    };
  }> {
    const results: TiaAnalysisResult[] = [];
    
    for (const scenarioId of scenarioIds) {
      const result = await this.performTiaAnalysis(scenarioId);
      results.push(result);
    }
    
    const impacts = results.map(r => r.netImpact);
    const minImpact = Math.min(...impacts);
    const maxImpact = Math.max(...impacts);
    const averageImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
    
    const worstCaseScenario = results.find(r => r.netImpact === maxImpact)?.scenarioId || "";
    const bestCaseScenario = results.find(r => r.netImpact === minImpact)?.scenarioId || "";
    const mostLikelyScenario = results[Math.floor(results.length / 2)]?.scenarioId || "";
    
    return {
      scenarios: results,
      comparison: {
        minImpact,
        maxImpact,
        averageImpact,
        mostLikelyScenario,
        worstCaseScenario,
        bestCaseScenario
      }
    };
  }
}

export const tiaCalculator = new TiaCalculator();