import { z } from "zod";

const BASE_SYSTEM_PROMPT = `You are ScheduleSam's AI assistant - an advanced CPM scheduling expert for construction project management.
Return ONLY JSON matching the provided "tool" schema.
Never include Markdown or prose unless in the optional "speak" field.
`;

const GENERAL_TOOLS = `
General Schedule Tools (Always Available):
- createSchedule({ projectId, description, activities: [{ id, name, duration, predecessors, wbsId? }] }) - Create CPM schedule
- updateSchedule({ scheduleId, updates: [{ activityId, field, value }] }) - Update schedule activities
- generateLookahead({ projectId, baseScheduleId, startDate }) - Generate 3-week lookahead
- analyzeSchedule({ scheduleId }) - Analyze critical path and float
- calculateCpm({ projectId }) - Run CPM calculations
`;

const CALENDAR_TOOLS = `
Calendar Management Tools:
- createCalendar({ projectId?, name, type: "Global"|"Project"|"Resource"|"Activity", workDaysPerWeek: 1-7, workHoursPerDay: 1-24, isDefault?: boolean }) - Create work calendar
- updateCalendar({ calendarId, updates: { name?, workDaysPerWeek?, workHoursPerDay? } }) - Update calendar
- deleteCalendar({ calendarId }) - Delete calendar
- addCalendarException({ calendarId, exceptionDate, exceptionType: "Holiday"|"NonWorkingDay"|"ModifiedHours", name?, startTime?, endTime? }) - Add holiday/exception
- assignCalendar({ calendarId, entityType: "Project"|"Resource"|"Activity", entityId, effectiveFrom?, effectiveTo? }) - Assign calendar to entity
- createShift({ projectId?, name, code?, startTime, endTime, workHours }) - Create shift template
- listCalendars({ projectId? }) - List all calendars for a project
`;

const WBS_TOOLS = `
WBS (Work Breakdown Structure) Management Tools:
- createWbs({ projectId, code, name, parentId?, level }) - Create WBS item
- updateWbs({ wbsId, updates: { name?, code?, parentId? } }) - Update WBS item
- deleteWbs({ wbsId }) - Delete WBS and all children
- moveWbs({ wbsId, newParentId?, newSequenceNumber }) - Move/reorder WBS item
- assignActivityToWbs({ activityId, wbsId }) - Link activity to WBS
- getWbsHierarchy({ projectId }) - Get full WBS tree structure
- calculateWbsRollups({ wbsId }) - Calculate cost/progress rollups
- exportWbs({ projectId, format: "json"|"csv"|"xml" }) - Export WBS structure
`;

const TIA_TOOLS = `
TIA (Time Impact Analysis) Tools:
- createTiaScenario({ projectId, name, description, analysisMethod: "ImpactedAsPlanned"|"TimeSliceWindows"|"AsPlannedVsAsBuilt"|"CollapsedAsBuilt", dataDate }) - Create TIA scenario
- addTiaFragnet({ scenarioId, name, insertionPoint, activities: [{ name, duration, lag }] }) - Add delay fragnet
- addTiaDelay({ scenarioId, affectedActivityId, delayDays, delayType: "EOT"|"Disruption"|"Acceleration", responsible: "Owner"|"Contractor"|"ThirdParty"|"ForceMajeure" }) - Add delay event
- runTiaAnalysis({ scenarioId }) - Calculate time impact
- getTiaResult({ scenarioId }) - Get analysis results with critical path changes
- compareTiaScenarios({ scenarioIds: string[] }) - Compare multiple scenarios
- generateTiaReport({ scenarioId, format: "summary"|"detailed" }) - Generate TIA report
`;

const MEETING_TOOLS = `
Meeting Tools:
- insertActionItems({ meetingId, actions: [{ agendaTopicOrder, action, owner, ballInCourt, dueDate }] })
- createRFI({ meetingId, number?, title, submittedDate?, responseDue?, owner, ballInCourt, impact })
- updateAgendaDiscussion({ meetingId, topicOrder, discussion, decision })
- distributeMinutes({ meetingId, recipients: string[] })
- summarizeMeeting({ meetingId }) -> { summary, topDecisions: string[], risks: string[], nextSteps: string[] }
`;

interface ToolCategory {
  name: string;
  keywords: string[];
  tools: string;
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: "TIA",
    keywords: [
      "delay", "tia", "time impact", "eot", "extension of time", "fragnet",
      "impact analysis", "disruption", "acceleration", "claim", "excusable",
      "compensable", "critical delay", "concurrent", "pacing", "float consumption",
      "impacted", "as-planned", "as-built", "collapsed", "forensic", "schedule analysis",
      "owner delay", "contractor delay", "force majeure", "weather delay"
    ],
    tools: TIA_TOOLS
  },
  {
    name: "WBS",
    keywords: [
      "wbs", "work breakdown", "structure", "hierarchy", "parent", "child",
      "indent", "outdent", "level", "rollup", "cost rollup", "organize",
      "breakdown", "tree", "node", "summary", "subtask", "grouping"
    ],
    tools: WBS_TOOLS
  },
  {
    name: "Calendar",
    keywords: [
      "calendar", "work days", "work hours", "holiday", "exception", "shift",
      "non-working", "workweek", "5-day", "6-day", "7-day", "hours per day",
      "schedule calendar", "resource calendar", "activity calendar", "global calendar",
      "overtime", "weekend", "bank holiday"
    ],
    tools: CALENDAR_TOOLS
  },
  {
    name: "Meeting",
    keywords: [
      "meeting", "action item", "rfi", "minutes", "agenda", "discussion",
      "decision", "attendees", "distribute", "summarize meeting"
    ],
    tools: MEETING_TOOLS
  }
];

export function detectToolCategories(userMessage: string): string[] {
  const lowerMessage = userMessage.toLowerCase();
  const detectedCategories: string[] = [];

  for (const category of TOOL_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (lowerMessage.includes(keyword)) {
        if (!detectedCategories.includes(category.name)) {
          detectedCategories.push(category.name);
        }
        break;
      }
    }
  }

  return detectedCategories;
}

export function generateSystemPrompt(userMessage: string): string {
  const detectedCategories = detectToolCategories(userMessage);
  
  let prompt = BASE_SYSTEM_PROMPT;
  prompt += GENERAL_TOOLS;

  if (detectedCategories.length === 0) {
    prompt += `\nAdditional tool categories available: Calendar, WBS, TIA, Meeting. Ask about specific needs to see those tools.\n`;
  } else {
    for (const categoryName of detectedCategories) {
      const category = TOOL_CATEGORIES.find(c => c.name === categoryName);
      if (category) {
        prompt += category.tools;
      }
    }
    
    const undetected = TOOL_CATEGORIES
      .filter(c => !detectedCategories.includes(c.name))
      .map(c => c.name);
    
    if (undetected.length > 0) {
      prompt += `\n(Other tool categories available: ${undetected.join(", ")})\n`;
    }
  }

  return prompt;
}

/** @deprecated Use generateSystemPrompt(userMessage) instead for dynamic tool injection */
export const SYSTEM_ASSISTANT = generateSystemPrompt("");

export const ToolSchema = z.object({
  tool: z.enum([
    // Calendar tools
    "createCalendar",
    "updateCalendar",
    "deleteCalendar",
    "addCalendarException",
    "assignCalendar",
    "createShift",
    "listCalendars",
    // WBS tools
    "createWbs",
    "updateWbs",
    "deleteWbs",
    "moveWbs",
    "assignActivityToWbs",
    "getWbsHierarchy",
    "calculateWbsRollups",
    "exportWbs",
    // TIA tools
    "createTiaScenario",
    "addTiaFragnet",
    "addTiaDelay",
    "runTiaAnalysis",
    "getTiaResult",
    "compareTiaScenarios",
    "generateTiaReport",
    // Schedule tools
    "createSchedule",
    "updateSchedule",
    "generateLookahead",
    "analyzeSchedule",
    "calculateCpm",
    // Meeting tools
    "insertActionItems",
    "createRFI",
    "updateAgendaDiscussion",
    "distributeMinutes",
    "summarizeMeeting"
  ]),
  args: z.record(z.any()),
  speak: z.string().optional(),
});

export type AssistantTool = z.infer<typeof ToolSchema>;
