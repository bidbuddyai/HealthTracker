import { tradeTemplateSeeds, getTemplateByCategory } from "./seeds/tradeTemplates";

export interface GapSuggestion {
  id: string;
  type: 'missing_activity' | 'missing_sequence' | 'best_practice';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedActivity?: {
    name: string;
    duration: number;
    durationType: string;
    afterActivity?: string;
    beforeActivity?: string;
  };
  tradeCategory: string;
  keywords: string[];
}

interface TradeGapRule {
  tradeCategory: string;
  requiredKeywords: {
    keywords: string[];
    activityName: string;
    duration: number;
    durationType: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
    insertAfter?: string[];
    insertBefore?: string[];
  }[];
}

const tradeGapRules: TradeGapRule[] = [
  {
    tradeCategory: "Abatement",
    requiredKeywords: [
      {
        keywords: ["air clearance", "clearance", "hygienist", "3rd party", "third party", "air test", "air quality"],
        activityName: "3rd Party Air Clearance",
        duration: 1,
        durationType: "days",
        priority: "high",
        description: "A 3rd Party Air Clearance test is required by EPA/OSHA regulations to verify safe air quality before teardown. This is a critical regulatory requirement.",
        insertAfter: ["abatement", "removal", "asbestos"],
        insertBefore: ["teardown", "demobilization"]
      },
      {
        keywords: ["asbestos survey", "haz mat survey", "hazmat survey", "acm survey", "hazardous material survey"],
        activityName: "Asbestos Survey",
        duration: 3,
        durationType: "days",
        priority: "high",
        description: "An Asbestos/Hazardous Material Survey should be completed before any abatement work begins to identify all ACM locations.",
        insertBefore: ["setup", "containment", "abatement"]
      },
      {
        keywords: ["containment", "setup containment", "install containment", "negative air"],
        activityName: "Setup Containment",
        duration: 2,
        durationType: "days",
        priority: "high",
        description: "Containment setup with negative air pressure is required before abatement work to prevent fiber release.",
        insertAfter: ["survey"],
        insertBefore: ["abatement", "removal"]
      }
    ]
  },
  {
    tradeCategory: "Demolition",
    requiredKeywords: [
      {
        keywords: ["disconnect utilities", "utility disconnect", "kill utilities", "terminate utilities"],
        activityName: "Disconnect Utilities",
        duration: 3,
        durationType: "days",
        priority: "high",
        description: "Utilities must be confirmed disconnected or rerouted before demolition begins. This is a critical safety requirement.",
        insertBefore: ["demo", "demolition", "above ground"]
      },
      {
        keywords: ["bmp", "erosion control", "silt fence", "sediment control", "stormwater"],
        activityName: "Install BMPs (Erosion Control)",
        duration: 2,
        durationType: "days",
        priority: "medium",
        description: "Best Management Practices for erosion and sediment control should be installed before ground disturbance.",
        insertBefore: ["demo", "demolition", "grading", "earthwork"]
      },
      {
        keywords: ["utility locate", "mark utilities", "pothole", "utility survey"],
        activityName: "Utility Locate/Potholing",
        duration: 2,
        durationType: "days",
        priority: "medium",
        description: "Underground utilities should be located and marked before any excavation or demolition work.",
        insertBefore: ["disconnect", "demo", "excavation"]
      }
    ]
  },
  {
    tradeCategory: "General Construction",
    requiredKeywords: [
      {
        keywords: ["mobilization", "mobilize", "mob", "site setup"],
        activityName: "Mobilization",
        duration: 5,
        durationType: "days",
        priority: "medium",
        description: "A Mobilization activity captures site setup, trailer installation, and initial material staging.",
        insertBefore: ["earthwork", "grading", "foundation", "construction"]
      },
      {
        keywords: ["punchlist", "punch list", "deficiency", "final walkthrough", "substantial completion"],
        activityName: "Punchlist",
        duration: 15,
        durationType: "days",
        priority: "medium",
        description: "A Punchlist phase should be included to address deficiencies before final completion.",
        insertAfter: ["finishes", "finish", "trim", "final"]
      },
      {
        keywords: ["commissioning", "cx", "start-up", "startup", "testing", "balance"],
        activityName: "Testing/Commissioning",
        duration: 10,
        durationType: "days",
        priority: "medium",
        description: "System testing and commissioning should be included to verify all building systems operate correctly.",
        insertAfter: ["mep", "mechanical", "electrical"],
        insertBefore: ["punchlist", "substantial"]
      }
    ]
  },
  {
    tradeCategory: "MEP",
    requiredKeywords: [
      {
        keywords: ["bim coordination", "bim", "clash detection", "mep coordination", "trade coordination"],
        activityName: "BIM Coordination",
        duration: 15,
        durationType: "days",
        priority: "high",
        description: "BIM Coordination should be completed before installation to identify and resolve clashes.",
        insertBefore: ["hangers", "rough", "installation"]
      },
      {
        keywords: ["testing", "commissioning", "cx", "start-up", "startup", "functional testing"],
        activityName: "Testing/Commissioning",
        duration: 10,
        durationType: "days",
        priority: "high",
        description: "MEP systems require testing and commissioning to verify proper operation.",
        insertAfter: ["trim", "final", "finish"]
      },
      {
        keywords: ["hangers", "inserts", "sleeves", "embeds"],
        activityName: "Hangers/Inserts",
        duration: 10,
        durationType: "days",
        priority: "medium",
        description: "Hangers and inserts should be installed before rough-in to support MEP systems.",
        insertAfter: ["bim", "coordination"],
        insertBefore: ["rough"]
      }
    ]
  }
];

export class GapDetector {
  static detectGaps(
    activities: Array<{ activityId: string; activityName: string; wbs?: string }>,
    userTrade: string | null | undefined
  ): GapSuggestion[] {
    const suggestions: GapSuggestion[] = [];
    
    if (!userTrade) {
      return suggestions;
    }
    
    const normalizedTrade = userTrade.toLowerCase();
    const activityNames = activities.map(a => a.activityName.toLowerCase());
    const allText = activityNames.join(' ');
    
    const matchingRules = tradeGapRules.filter(rule => 
      normalizedTrade.includes(rule.tradeCategory.toLowerCase()) ||
      rule.tradeCategory.toLowerCase().includes(normalizedTrade)
    );
    
    if (matchingRules.length === 0) {
      const template = getTemplateByCategory(userTrade);
      if (template) {
        return this.checkAgainstTemplate(activities, template);
      }
      return suggestions;
    }
    
    for (const rule of matchingRules) {
      for (const required of rule.requiredKeywords) {
        const hasKeyword = required.keywords.some(kw => 
          allText.includes(kw.toLowerCase())
        );
        
        if (!hasKeyword) {
          const afterActivity = this.findMatchingActivity(activityNames, required.insertAfter);
          const beforeActivity = this.findMatchingActivity(activityNames, required.insertBefore);
          
          suggestions.push({
            id: `gap-${rule.tradeCategory}-${required.activityName}`.replace(/\s+/g, '-').toLowerCase(),
            type: 'missing_activity',
            priority: required.priority,
            title: `Missing: ${required.activityName}`,
            description: required.description,
            suggestedActivity: {
              name: required.activityName,
              duration: required.duration,
              durationType: required.durationType,
              afterActivity: afterActivity || undefined,
              beforeActivity: beforeActivity || undefined
            },
            tradeCategory: rule.tradeCategory,
            keywords: required.keywords
          });
        }
      }
    }
    
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  private static checkAgainstTemplate(
    activities: Array<{ activityId: string; activityName: string; wbs?: string }>,
    template: { tradeCategory: string; templateName: string; defaultActivities: any[]; logicRules: any[] }
  ): GapSuggestion[] {
    const suggestions: GapSuggestion[] = [];
    const activityNames = activities.map(a => a.activityName.toLowerCase());
    const allText = activityNames.join(' ');
    
    for (const defaultAct of template.defaultActivities) {
      const actNameLower = defaultAct.name.toLowerCase();
      const keywords = actNameLower.split(/\s+/).filter((w: string) => w.length > 3);
      
      const hasActivity = keywords.some((kw: string) => allText.includes(kw));
      
      if (!hasActivity && !defaultAct.isConditional) {
        suggestions.push({
          id: `gap-template-${defaultAct.sequence}`,
          type: 'missing_activity',
          priority: defaultAct.sequence <= 2 ? 'high' : 'medium',
          title: `Missing: ${defaultAct.name}`,
          description: `This activity is part of the standard ${template.templateName} sequence.`,
          suggestedActivity: {
            name: defaultAct.name,
            duration: defaultAct.duration,
            durationType: defaultAct.durationType || 'days'
          },
          tradeCategory: template.tradeCategory,
          keywords: keywords
        });
      }
    }
    
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  private static findMatchingActivity(
    activityNames: string[],
    keywords?: string[]
  ): string | null {
    if (!keywords || keywords.length === 0) return null;
    
    for (const kw of keywords) {
      for (const actName of activityNames) {
        if (actName.includes(kw.toLowerCase())) {
          return actName;
        }
      }
    }
    
    return null;
  }
  
  static formatSuggestionMessage(suggestion: GapSuggestion): string {
    let message = suggestion.description;
    
    if (suggestion.suggestedActivity) {
      message += ` Would you like to add "${suggestion.suggestedActivity.name}" (${suggestion.suggestedActivity.duration} ${suggestion.suggestedActivity.durationType})?`;
    }
    
    return message;
  }
  
  static getQuickFixAction(suggestion: GapSuggestion): {
    action: 'add_activity';
    payload: {
      activityName: string;
      duration: number;
      predecessorHint?: string;
      successorHint?: string;
    };
  } | null {
    if (!suggestion.suggestedActivity) return null;
    
    return {
      action: 'add_activity',
      payload: {
        activityName: suggestion.suggestedActivity.name,
        duration: suggestion.suggestedActivity.duration,
        predecessorHint: suggestion.suggestedActivity.afterActivity,
        successorHint: suggestion.suggestedActivity.beforeActivity
      }
    };
  }
}

export function analyzeImportGaps(
  activities: Array<{ activityId: string; activityName: string; wbs?: string }>,
  userTrade: string | null | undefined
): {
  suggestions: GapSuggestion[];
  hasCriticalGaps: boolean;
  summary: string;
} {
  const suggestions = GapDetector.detectGaps(activities, userTrade);
  
  const highPriority = suggestions.filter(s => s.priority === 'high');
  const hasCriticalGaps = highPriority.length > 0;
  
  let summary = '';
  if (suggestions.length === 0) {
    summary = 'Your schedule appears complete for your trade. No missing activities detected.';
  } else if (hasCriticalGaps) {
    summary = `Found ${highPriority.length} critical missing ${highPriority.length === 1 ? 'activity' : 'activities'} that ${highPriority.length === 1 ? 'is' : 'are'} standard for ${userTrade || 'your trade'}. Review recommended.`;
  } else {
    summary = `Found ${suggestions.length} optional ${suggestions.length === 1 ? 'activity' : 'activities'} that may improve your schedule.`;
  }
  
  return {
    suggestions,
    hasCriticalGaps,
    summary
  };
}
