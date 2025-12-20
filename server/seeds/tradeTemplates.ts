import type { InsertTradeTemplate } from "@shared/schema";

export const tradeTemplateSeeds: InsertTradeTemplate[] = [
  {
    tradeCategory: "Abatement",
    templateName: "Hazardous Material Abatement",
    description: "Standard sequence for asbestos and hazardous material removal following EPA/OSHA regulations",
    defaultActivities: [
      { sequence: 1, name: "Asbestos Survey", duration: 3, durationType: "days" },
      { sequence: 2, name: "Setup Containment", duration: 2, durationType: "days" },
      { sequence: 3, name: "Abatement Activities", duration: 10, durationType: "days" },
      { sequence: 4, name: "3rd Party Air Clearance", duration: 1, durationType: "days" },
      { sequence: 5, name: "Teardown Containment", duration: 1, durationType: "days" }
    ],
    logicRules: [
      {
        predecessorKeyword: "Survey",
        successorKeyword: "Setup",
        relationshipType: "FS",
        lag: 0,
        description: "Survey must be completed before containment setup can begin"
      },
      {
        predecessorKeyword: "Setup Containment",
        successorKeyword: "Abatement",
        relationshipType: "FS",
        lag: 0,
        description: "Containment must be established before abatement work"
      },
      {
        predecessorKeyword: "Abatement",
        successorKeyword: "Air Clearance",
        relationshipType: "FS",
        lag: 0,
        description: "All abatement must complete before air clearance testing"
      },
      {
        predecessorKeyword: "Air Clearance",
        successorKeyword: "Teardown",
        relationshipType: "FS",
        lag: 0,
        description: "Air clearance MUST be Finish-to-Start with teardown - critical regulatory requirement"
      }
    ],
    isActive: true
  },
  {
    tradeCategory: "Demolition",
    templateName: "Structural Demolition",
    description: "Complete structural demolition sequence with utility management and environmental controls",
    defaultActivities: [
      { sequence: 1, name: "Install BMPs (Erosion Control)", duration: 2, durationType: "days" },
      { sequence: 2, name: "Disconnect Utilities", duration: 3, durationType: "days" },
      { sequence: 3, name: "Reroute Utilities", duration: 5, durationType: "days", isConditional: true, condition: "If utilities need to remain active for adjacent structures" },
      { sequence: 4, name: "Above Ground Demo", duration: 15, durationType: "days" },
      { sequence: 5, name: "Slab/Foundation Demo", duration: 10, durationType: "days" },
      { sequence: 6, name: "Grading/Backfill", duration: 5, durationType: "days" }
    ],
    logicRules: [
      {
        predecessorKeyword: "BMPs",
        successorKeyword: "Demo",
        relationshipType: "FS",
        lag: 0,
        description: "Environmental controls must be in place before any demolition"
      },
      {
        predecessorKeyword: "Disconnect Utilities",
        successorKeyword: "Above Ground Demo",
        relationshipType: "FS",
        lag: 0,
        description: "Utilities must be confirmed KILLED or REROUTED before Above Ground Demo starts - critical safety requirement"
      },
      {
        predecessorKeyword: "Reroute Utilities",
        successorKeyword: "Above Ground Demo",
        relationshipType: "FS",
        lag: 0,
        description: "If rerouting, must complete before demo",
        isConditional: true,
        condition: "Only applies if utilities are being rerouted rather than killed"
      },
      {
        predecessorKeyword: "Above Ground Demo",
        successorKeyword: "Slab",
        relationshipType: "FS",
        lag: 0,
        description: "Above ground structures must be removed before slab/foundation work"
      },
      {
        predecessorKeyword: "Slab",
        successorKeyword: "Grading",
        relationshipType: "FS",
        lag: 0,
        description: "Foundation removal before site grading"
      }
    ],
    isActive: true
  },
  {
    tradeCategory: "General Construction",
    templateName: "General Contractor (New Build)",
    description: "Standard GC sequence for new commercial/industrial construction from mobilization through punchlist",
    defaultActivities: [
      { sequence: 1, name: "Mobilization", duration: 5, durationType: "days" },
      { sequence: 2, name: "Earthwork", duration: 20, durationType: "days" },
      { sequence: 3, name: "Foundations", duration: 30, durationType: "days" },
      { sequence: 4, name: "Structure", duration: 45, durationType: "days" },
      { sequence: 5, name: "Envelope", duration: 30, durationType: "days" },
      { sequence: 6, name: "MEP Rough", duration: 40, durationType: "days" },
      { sequence: 7, name: "Finishes", duration: 60, durationType: "days" },
      { sequence: 8, name: "Punchlist", duration: 15, durationType: "days" }
    ],
    logicRules: [
      {
        predecessorKeyword: "Mobilization",
        successorKeyword: "Earthwork",
        relationshipType: "FS",
        lag: 0,
        description: "Site ready before earthwork begins"
      },
      {
        predecessorKeyword: "Earthwork",
        successorKeyword: "Foundations",
        relationshipType: "FS",
        lag: 0,
        description: "Site graded before foundation work"
      },
      {
        predecessorKeyword: "Foundations",
        successorKeyword: "Structure",
        relationshipType: "FS",
        lag: 0,
        description: "Foundations complete before structural erection"
      },
      {
        predecessorKeyword: "Structure",
        successorKeyword: "Envelope",
        relationshipType: "SS",
        lag: 5,
        description: "Envelope can start shortly after structure begins (follow-on trade)"
      },
      {
        predecessorKeyword: "Envelope",
        successorKeyword: "MEP Rough",
        relationshipType: "SS",
        lag: 10,
        description: "MEP rough-in follows envelope installation"
      },
      {
        predecessorKeyword: "MEP Rough",
        successorKeyword: "Finishes",
        relationshipType: "FF",
        lag: -5,
        description: "Finishes can begin before MEP rough completes in some areas"
      },
      {
        predecessorKeyword: "Finishes",
        successorKeyword: "Punchlist",
        relationshipType: "FS",
        lag: 0,
        description: "All finishes complete before punchlist walk"
      }
    ],
    isActive: true
  },
  {
    tradeCategory: "MEP",
    templateName: "MEP Subcontractor",
    description: "Standard MEP (Mechanical, Electrical, Plumbing) subcontractor installation sequence",
    defaultActivities: [
      { sequence: 1, name: "BIM Coordination", duration: 15, durationType: "days" },
      { sequence: 2, name: "Hangers/Inserts", duration: 10, durationType: "days" },
      { sequence: 3, name: "Rough-in", duration: 30, durationType: "days" },
      { sequence: 4, name: "Trim-out", duration: 20, durationType: "days" },
      { sequence: 5, name: "Testing/Commissioning", duration: 10, durationType: "days" }
    ],
    logicRules: [
      {
        predecessorKeyword: "BIM Coordination",
        successorKeyword: "Hangers",
        relationshipType: "FS",
        lag: 0,
        description: "Coordination models approved before hanger installation"
      },
      {
        predecessorKeyword: "Hangers",
        successorKeyword: "Rough-in",
        relationshipType: "SS",
        lag: 3,
        description: "Rough-in follows hanger installation closely"
      },
      {
        predecessorKeyword: "Rough-in",
        successorKeyword: "Trim-out",
        relationshipType: "FS",
        lag: 0,
        description: "All rough-in complete before trim work"
      },
      {
        predecessorKeyword: "Trim-out",
        successorKeyword: "Testing",
        relationshipType: "FS",
        lag: 0,
        description: "Trim complete before system testing and commissioning"
      }
    ],
    isActive: true
  }
];

export function getTradeTemplatesAsJson(): object[] {
  return tradeTemplateSeeds.map(template => ({
    ...template,
    defaultActivities: template.defaultActivities,
    logicRules: template.logicRules
  }));
}

export function getTemplateByCategory(category: string): InsertTradeTemplate | undefined {
  return tradeTemplateSeeds.find(t => 
    t.tradeCategory.toLowerCase() === category.toLowerCase() ||
    t.templateName.toLowerCase().includes(category.toLowerCase())
  );
}

export function getTemplateByName(name: string): InsertTradeTemplate | undefined {
  return tradeTemplateSeeds.find(t => 
    t.templateName.toLowerCase().includes(name.toLowerCase())
  );
}

export function getAllTradeCategories(): string[] {
  return Array.from(new Set(tradeTemplateSeeds.map(t => t.tradeCategory)));
}
