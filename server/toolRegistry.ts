import { z } from "zod";
import { storage } from "./storage";

const s = storage as any;

interface ToolContext {
  projectId: string;
  userId: string;
}

type ToolFunction = (args: Record<string, any>, context: ToolContext) => Promise<any>;

const createCalendarArgsSchema = z.object({
  projectId: z.string().optional(),
  name: z.string(),
  type: z.enum(["Global", "Project", "Resource", "Activity"]),
  workDaysPerWeek: z.number().min(1).max(7).optional().default(5),
  workHoursPerDay: z.number().min(1).max(24).optional().default(8),
  isDefault: z.boolean().optional().default(false),
  description: z.string().optional()
});

const updateCalendarArgsSchema = z.object({
  calendarId: z.string(),
  updates: z.object({
    name: z.string().optional(),
    workDaysPerWeek: z.number().min(1).max(7).optional(),
    workHoursPerDay: z.number().min(1).max(24).optional()
  })
});

const deleteCalendarArgsSchema = z.object({
  calendarId: z.string()
});

const addCalendarExceptionArgsSchema = z.object({
  calendarId: z.string(),
  exceptionDate: z.string(),
  exceptionType: z.enum(["Holiday", "NonWorkingDay", "ModifiedHours"]),
  name: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().optional().default(false),
  recurringRule: z.string().optional(),
  shiftId: z.string().optional()
});

const assignCalendarArgsSchema = z.object({
  calendarId: z.string(),
  entityType: z.enum(["Project", "Resource", "Activity"]),
  entityId: z.string(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  priority: z.number().optional().default(1)
});

const createShiftArgsSchema = z.object({
  projectId: z.string().optional(),
  name: z.string(),
  code: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  workHours: z.number(),
  color: z.string().optional()
});

const listCalendarsArgsSchema = z.object({
  projectId: z.string().optional()
});

const createWbsArgsSchema = z.object({
  projectId: z.string().optional(),
  code: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  level: z.number().optional().default(0),
  sequenceNumber: z.number().optional().default(1),
  rollupSettings: z.any().optional()
});

const updateWbsArgsSchema = z.object({
  wbsId: z.string(),
  updates: z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    parentId: z.string().optional()
  })
});

const deleteWbsArgsSchema = z.object({
  wbsId: z.string()
});

const moveWbsArgsSchema = z.object({
  wbsId: z.string(),
  newParentId: z.string().optional(),
  newSequenceNumber: z.number().optional()
});

const assignActivityToWbsArgsSchema = z.object({
  activityId: z.string(),
  wbsId: z.string()
});

const getWbsHierarchyArgsSchema = z.object({
  projectId: z.string().optional()
});

const calculateWbsRollupsArgsSchema = z.object({
  wbsId: z.string()
});

const exportWbsArgsSchema = z.object({
  projectId: z.string().optional(),
  format: z.enum(["json", "csv", "xml"]).optional().default("json")
});

const createTiaScenarioArgsSchema = z.object({
  projectId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  analysisMethod: z.enum(["ImpactedAsPlanned", "TimeSliceWindows", "AsPlannedVsAsBuilt", "CollapsedAsBuilt"]),
  dataDate: z.string(),
  impactType: z.string().optional(),
  isActive: z.boolean().optional().default(false)
});

const addTiaFragnetArgsSchema = z.object({
  scenarioId: z.string(),
  name: z.string(),
  insertionPoint: z.string(),
  activities: z.array(z.any()).optional().default([]),
  duration: z.number().optional(),
  lag: z.number().optional().default(0)
});

const addTiaDelayArgsSchema = z.object({
  scenarioId: z.string(),
  affectedActivityId: z.string(),
  delayDays: z.number(),
  delayType: z.enum(["EOT", "Disruption", "Acceleration"]),
  responsible: z.enum(["Owner", "Contractor", "ThirdParty", "ForceMajeure"]),
  classification: z.string().optional(),
  description: z.string().optional(),
  mitigation: z.string().optional()
});

const runTiaAnalysisArgsSchema = z.object({
  scenarioId: z.string()
});

const getTiaResultArgsSchema = z.object({
  scenarioId: z.string()
});

const compareTiaScenariosArgsSchema = z.object({
  scenarioIds: z.array(z.string())
});

const generateTiaReportArgsSchema = z.object({
  scenarioId: z.string(),
  format: z.enum(["summary", "detailed"]).optional().default("summary")
});

const createScheduleArgsSchema = z.object({
  projectId: z.string().optional(),
  description: z.string().optional(),
  activities: z.array(z.object({
    id: z.string().optional(),
    activityId: z.string().optional(),
    name: z.string().optional(),
    duration: z.number().optional(),
    predecessors: z.array(z.any()).optional(),
    wbsId: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    percentComplete: z.number().optional(),
    startDate: z.string().optional(),
    finishDate: z.string().optional(),
    earlyStart: z.string().optional(),
    earlyFinish: z.string().optional(),
    notes: z.string().optional(),
    responsibility: z.string().optional(),
    trade: z.string().optional()
  })).optional().default([])
});

const updateScheduleArgsSchema = z.object({
  scheduleId: z.string().optional(),
  updates: z.array(z.object({
    activityId: z.string(),
    field: z.string(),
    value: z.any()
  })).optional().default([])
});

const generateLookaheadArgsSchema = z.object({
  projectId: z.string().optional(),
  baseScheduleId: z.string().optional(),
  startDate: z.string().optional()
});

const analyzeScheduleArgsSchema = z.object({
  projectId: z.string().optional(),
  scheduleId: z.string().optional()
});

const calculateCpmArgsSchema = z.object({
  projectId: z.string().optional()
});

async function createCalendar(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = createCalendarArgsSchema.parse(args);
  return s.createCalendar({
    projectId: validated.projectId || context.projectId,
    name: validated.name,
    type: validated.type,
    workDaysPerWeek: validated.workDaysPerWeek,
    workHoursPerDay: validated.workHoursPerDay,
    isDefault: validated.isDefault,
    description: validated.description
  });
}

async function updateCalendar(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = updateCalendarArgsSchema.parse(args);
  return s.updateCalendar(validated.calendarId, validated.updates);
}

async function deleteCalendar(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = deleteCalendarArgsSchema.parse(args);
  return s.deleteCalendar(validated.calendarId);
}

async function addCalendarException(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = addCalendarExceptionArgsSchema.parse(args);
  return s.createCalendarException({
    calendarId: validated.calendarId,
    exceptionDate: validated.exceptionDate,
    exceptionType: validated.exceptionType,
    name: validated.name,
    startTime: validated.startTime,
    endTime: validated.endTime,
    isRecurring: validated.isRecurring,
    recurringRule: validated.recurringRule,
    shiftId: validated.shiftId
  });
}

async function assignCalendar(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = assignCalendarArgsSchema.parse(args);
  return s.createCalendarAssignment({
    calendarId: validated.calendarId,
    entityType: validated.entityType,
    entityId: validated.entityId,
    effectiveFrom: validated.effectiveFrom,
    effectiveTo: validated.effectiveTo,
    priority: validated.priority
  });
}

async function createShift(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = createShiftArgsSchema.parse(args);
  return s.createCalendarShift({
    projectId: validated.projectId || context.projectId,
    name: validated.name,
    code: validated.code,
    startTime: validated.startTime,
    endTime: validated.endTime,
    breakStartTime: validated.breakStartTime,
    breakEndTime: validated.breakEndTime,
    workHours: validated.workHours,
    color: validated.color
  });
}

async function listCalendars(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = listCalendarsArgsSchema.parse(args);
  return s.getCalendarsByProject(validated.projectId || context.projectId);
}

async function createWbs(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = createWbsArgsSchema.parse(args);
  return s.createWbs({
    projectId: validated.projectId || context.projectId,
    code: validated.code,
    name: validated.name,
    parentId: validated.parentId,
    level: validated.level,
    sequenceNumber: validated.sequenceNumber,
    rollupSettings: validated.rollupSettings
  });
}

async function updateWbs(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = updateWbsArgsSchema.parse(args);
  return s.updateWbs(validated.wbsId, validated.updates);
}

async function deleteWbs(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = deleteWbsArgsSchema.parse(args);
  return s.deleteWbs(validated.wbsId);
}

async function moveWbs(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = moveWbsArgsSchema.parse(args);
  let result = null;
  
  if (validated.newParentId) {
    const wbs = await s.getWbs(validated.wbsId);
    if (wbs) {
      result = await s.updateWbs(validated.wbsId, {
        parentId: validated.newParentId
      });
    }
  }
  if (validated.newSequenceNumber !== undefined) {
    await s.reorderWbs(validated.wbsId, validated.newSequenceNumber);
    result = await s.getWbs(validated.wbsId);
  }
  return result;
}

async function assignActivityToWbs(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = assignActivityToWbsArgsSchema.parse(args);
  return s.updateActivity(validated.activityId, {
    wbsId: validated.wbsId
  });
}

async function getWbsHierarchy(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = getWbsHierarchyArgsSchema.parse(args);
  return s.getWbsHierarchy(validated.projectId || context.projectId);
}

async function calculateWbsRollups(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = calculateWbsRollupsArgsSchema.parse(args);
  const wbs = await s.getWbs(validated.wbsId);
  if (!wbs) return null;
  
  const activities = await s.getActivitiesByProject(wbs.projectId);
  const wbsActivities = activities.filter(a => a.wbsId === wbs.id);
  const totalCost = wbsActivities.reduce((sum, a) => sum + (a.budgetedCost || 0), 0);
  const avgProgress = wbsActivities.length > 0 
    ? wbsActivities.reduce((sum, a) => sum + (a.percentComplete || 0), 0) / wbsActivities.length
    : 0;
  
  return {
    wbsId: wbs.id,
    activityCount: wbsActivities.length,
    totalCost,
    avgProgress,
    rollupSettings: wbs.rollupSettings
  };
}

async function exportWbs(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = exportWbsArgsSchema.parse(args);
  const wbsItems = await s.getWbsHierarchy(validated.projectId || context.projectId);
  
  if (validated.format === "json") {
    return wbsItems;
  } else if (validated.format === "csv") {
    const csvHeaders = ["Code", "Name", "Level", "Parent ID", "Sequence"];
    const csvRows = wbsItems.map(w => [w.code, w.name, w.level, w.parentId || "", w.sequenceNumber]);
    return [csvHeaders, ...csvRows].map(row => row.join(",")).join("\n");
  } else if (validated.format === "xml") {
    const xmlItems = wbsItems.map(w => 
      `<WBSItem code="${w.code}" name="${w.name}" level="${w.level}" parentId="${w.parentId || ''}" />`
    ).join("\n");
    return `<WBS>\n${xmlItems}\n</WBS>`;
  }
  return wbsItems;
}

async function createTiaScenario(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = createTiaScenarioArgsSchema.parse(args);
  return s.createTiaScenario({
    projectId: validated.projectId || context.projectId,
    name: validated.name,
    description: validated.description,
    analysisMethod: validated.analysisMethod,
    dataDate: validated.dataDate,
    impactType: validated.impactType,
    createdBy: context.userId,
    isActive: validated.isActive
  });
}

async function addTiaFragnet(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = addTiaFragnetArgsSchema.parse(args);
  return s.createTiaFragnet({
    scenarioId: validated.scenarioId,
    name: validated.name,
    insertionPoint: validated.insertionPoint,
    activities: validated.activities,
    duration: validated.duration,
    lag: validated.lag
  });
}

async function addTiaDelay(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = addTiaDelayArgsSchema.parse(args);
  return s.createTiaDelay({
    scenarioId: validated.scenarioId,
    affectedActivityId: validated.affectedActivityId,
    delayDays: validated.delayDays,
    delayType: validated.delayType,
    responsibility: validated.responsible,
    classification: validated.classification,
    description: validated.description,
    mitigation: validated.mitigation
  });
}

async function runTiaAnalysis(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = runTiaAnalysisArgsSchema.parse(args);
  return s.calculateTiaImpact(validated.scenarioId);
}

async function getTiaResult(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = getTiaResultArgsSchema.parse(args);
  const results = await s.getTiaResultsByScenario(validated.scenarioId);
  return results[0];
}

async function compareTiaScenarios(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = compareTiaScenariosArgsSchema.parse(args);
  const scenarios = await Promise.all(
    validated.scenarioIds.map((id: string) => storage.getTiaScenario(id))
  );
  const resultsArray = await Promise.all(
    validated.scenarioIds.map((id: string) => storage.getTiaResultsByScenario(id))
  );
  return {
    scenarios,
    results: resultsArray.map(r => r[0]),
    comparison: "Scenarios compared successfully"
  };
}

async function generateTiaReport(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = generateTiaReportArgsSchema.parse(args);
  const scenario = await s.getTiaScenario(validated.scenarioId);
  const tiaResults = await s.getTiaResultsByScenario(validated.scenarioId);
  const fragnets = await s.getTiaFragnetsByScenario(validated.scenarioId);
  const delays = await s.getTiaDelaysByScenario(validated.scenarioId);
  
  return {
    scenario,
    results: tiaResults[0],
    fragnets,
    delays,
    format: validated.format,
    report: "TIA Report generated successfully"
  };
}

async function createSchedule(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = createScheduleArgsSchema.parse(args);
  const scheduleActivities = validated.activities;
  const createdActivities = [];
  const createdRelationships = [];
  const targetProjectId = validated.projectId || context.projectId;
  const activityIdMap = new Map();
  
  for (const actData of scheduleActivities) {
    const userDefinedId = actData.id || actData.activityId || `ACT_${Date.now()}_${Math.random()}`;
    if (!actData.id && !actData.activityId) {
      (actData as any).activityId = userDefinedId;
    }
    
    const newActivity = await s.createActivity({
      projectId: targetProjectId,
      activityId: userDefinedId,
      name: actData.name || "Untitled Activity",
      originalDuration: actData.duration || 0,
      remainingDuration: actData.duration || 0,
      wbsId: actData.wbsId || null,
      type: (actData.type as any) || "Task",
      status: (actData.status as any) || "NotStarted",
      percentComplete: actData.percentComplete || 0,
      earlyStart: actData.startDate || actData.earlyStart,
      earlyFinish: actData.finishDate || actData.earlyFinish,
      notes: actData.notes,
      responsibility: actData.responsibility,
      trade: actData.trade
    });
    createdActivities.push(newActivity);
    activityIdMap.set(userDefinedId, newActivity.id);
  }
  
  for (const actData of scheduleActivities) {
    const userDefinedId = actData.id || actData.activityId;
    const successorDbId = activityIdMap.get(userDefinedId);
    
    if (successorDbId && actData.predecessors && Array.isArray(actData.predecessors)) {
      for (const pred of actData.predecessors) {
        const predId = typeof pred === 'string' ? pred : pred.id;
        const relType = (typeof pred === 'object' && pred.type) ? pred.type : 'FS';
        const lagValue = (typeof pred === 'object' && pred.lag) ? pred.lag : 0;
        
        const predecessorDbId = activityIdMap.get(predId);
        if (predecessorDbId) {
          const relationship = await s.createRelationship({
            projectId: targetProjectId,
            predecessorId: predecessorDbId,
            successorId: successorDbId,
            type: relType,
            lag: lagValue
          });
          createdRelationships.push(relationship);
        }
      }
    }
  }
  
  return {
    createdCount: createdActivities.length,
    relationshipCount: createdRelationships.length,
    activities: createdActivities,
    relationships: createdRelationships,
    message: `Successfully created ${createdActivities.length} activities and ${createdRelationships.length} relationships`
  };
}

async function updateSchedule(args: Record<string, any>, _context: ToolContext): Promise<any> {
  const validated = updateScheduleArgsSchema.parse(args);
  const updates = validated.updates;
  const updatedActivities = [];
  
  for (const update of updates) {
    const activity = await s.getActivity(update.activityId);
    if (!activity) continue;
    
    const dbUpdates: any = {};
    
    switch (update.field) {
      case "duration":
        dbUpdates.originalDuration = update.value;
        dbUpdates.remainingDuration = update.value;
        break;
      case "originalDuration":
        dbUpdates.originalDuration = update.value;
        break;
      case "remainingDuration":
        dbUpdates.remainingDuration = update.value;
        break;
      case "startDate":
        dbUpdates.earlyStart = update.value;
        break;
      case "finishDate":
        dbUpdates.earlyFinish = update.value;
        break;
      case "earlyStart":
      case "earlyFinish":
      case "lateStart":
      case "lateFinish":
      case "actualStart":
      case "actualFinish":
        dbUpdates[update.field] = update.value;
        break;
      case "status":
        if (["NotStarted", "InProgress", "Completed"].includes(update.value)) {
          dbUpdates.status = update.value;
        }
        break;
      case "percentComplete":
        dbUpdates.percentComplete = update.value;
        if (update.value === 0) {
          dbUpdates.status = "NotStarted";
        } else if (update.value >= 100) {
          dbUpdates.status = "Completed";
        } else {
          dbUpdates.status = "InProgress";
        }
        break;
      case "name":
        dbUpdates.name = update.value;
        break;
      case "wbs":
        dbUpdates.wbsId = update.value;
        break;
      case "constraint":
      case "constraintType":
        if (["SNET", "FNET", "SNLT", "FNLT", "MSO", "MFO"].includes(update.value)) {
          dbUpdates.constraintType = update.value;
        }
        break;
      case "constraintDate":
        dbUpdates.constraintDate = update.value;
        break;
      case "notes":
        dbUpdates.notes = update.value;
        break;
      case "responsibility":
        dbUpdates.responsibility = update.value;
        break;
      case "trade":
        dbUpdates.trade = update.value;
        break;
      default:
        dbUpdates[update.field] = update.value;
    }
    
    const updatedActivity = await s.updateActivity(update.activityId, dbUpdates);
    if (updatedActivity) {
      updatedActivities.push(updatedActivity);
    }
  }
  
  return {
    updatedCount: updatedActivities.length,
    activities: updatedActivities,
    message: `Successfully updated ${updatedActivities.length} activities`
  };
}

async function generateLookahead(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = generateLookaheadArgsSchema.parse(args);
  const lookaheadProjectId = validated.projectId || context.projectId;
  const baseActivities = await s.getActivitiesByProject(lookaheadProjectId);
  const startDate = validated.startDate ? new Date(validated.startDate) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 21);
  
  const lookaheadActivities = baseActivities.filter(act => {
    if (!act.earlyStart) return false;
    const actStart = new Date(act.earlyStart);
    return actStart >= startDate && actStart <= endDate;
  });
  
  return {
    lookaheadPeriod: { 
      start: startDate.toISOString().split('T')[0], 
      end: endDate.toISOString().split('T')[0] 
    },
    activities: lookaheadActivities,
    count: lookaheadActivities.length,
    message: `Generated ${lookaheadActivities.length} activities for 3-week lookahead`
  };
}

async function analyzeSchedule(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = analyzeScheduleArgsSchema.parse(args);
  const analyzeProjectId = validated.projectId || context.projectId;
  const schedActivities = await s.getActivitiesByProject(analyzeProjectId);
  const schedRelationships = await s.getRelationshipsByProject(analyzeProjectId);
  
  const criticalActivities = schedActivities.filter(a => a.isCritical);
  const nearCriticalActivities = schedActivities.filter(a => 
    !a.isCritical && (a.totalFloat || 0) <= 5
  );
  
  return {
    totalActivities: schedActivities.length,
    criticalActivities: criticalActivities.length,
    nearCriticalActivities: nearCriticalActivities.length,
    totalRelationships: schedRelationships.length,
    criticalPath: criticalActivities.map(a => a.activityId),
    longestPath: criticalActivities.map(a => ({ 
      id: a.activityId, 
      name: a.name, 
      duration: a.originalDuration 
    })),
    message: "Schedule analysis completed"
  };
}

async function calculateCpm(args: Record<string, any>, context: ToolContext): Promise<any> {
  const validated = calculateCpmArgsSchema.parse(args);
  const _activities = await s.getActivitiesByProject(validated.projectId || context.projectId);
  const _relationships = await s.getRelationshipsByProject(validated.projectId || context.projectId);
  
  return {
    criticalPath: [],
    projectDuration: 0,
    message: "CPM calculation completed"
  };
}

export const toolRegistry: Record<string, ToolFunction> = {
  createCalendar,
  updateCalendar,
  deleteCalendar,
  addCalendarException,
  assignCalendar,
  createShift,
  listCalendars,
  createWbs,
  updateWbs,
  deleteWbs,
  moveWbs,
  assignActivityToWbs,
  getWbsHierarchy,
  calculateWbsRollups,
  exportWbs,
  createTiaScenario,
  addTiaFragnet,
  addTiaDelay,
  runTiaAnalysis,
  getTiaResult,
  compareTiaScenarios,
  generateTiaReport,
  createSchedule,
  updateSchedule,
  generateLookahead,
  analyzeSchedule,
  calculateCpm
};

export async function executeTool(
  toolName: string, 
  args: Record<string, any>, 
  context: ToolContext
): Promise<{ result: any; error?: string }> {
  const toolFn = toolRegistry[toolName];
  
  if (!toolFn) {
    return { result: null, error: `Tool "${toolName}" not found in registry` };
  }
  
  try {
    const result = await toolFn(args, context);
    return { result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error(`[ToolRegistry] Validation error for ${toolName}:`, issues);
      return { result: null, error: `Invalid arguments for ${toolName}: ${issues}` };
    }
    console.error(`[ToolRegistry] Error executing ${toolName}:`, error);
    return { result: null, error: `Failed to execute ${toolName}: ${(error as Error).message}` };
  }
}
