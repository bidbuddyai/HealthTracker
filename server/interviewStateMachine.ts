import { storage } from "./storage";
import type { User } from "@shared/schema";

export type InterviewState = 
  | "SCOPE_GATHERING" 
  | "SEQUENCE_VERIFICATION" 
  | "GENERATION"
  | "COMPLETED";

export interface InterviewQuestion {
  id: string;
  question: string;
  type: "yes_no" | "single_choice" | "multiple_choice" | "text";
  options?: string[];
  required: boolean;
  dependsOn?: { questionId: string; answer: string | string[] };
}

export interface InterviewAnswer {
  questionId: string;
  answer: string | string[] | boolean;
}

export interface InterviewSession {
  id: string;
  userId: string;
  projectId?: string;
  state: InterviewState;
  trade: string;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  currentQuestionIndex: number;
  schedulePlan?: SchedulePlan;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchedulePlan {
  projectName: string;
  phases: PhasePlan[];
  includeUtilityReroutes: boolean;
  includeUtilityDisconnects: boolean;
  containmentType?: "localized" | "full";
  buildingCount: number;
  selfPerformConcrete?: boolean;
  estimatedActivities: number;
  summary: string;
}

export interface PhasePlan {
  name: string;
  type: string;
  description: string;
  estimatedDuration: string;
}

const ABATEMENT_DEMO_QUESTIONS: InterviewQuestion[] = [
  {
    id: "building_count",
    question: "Is this a single building or multiple buildings?",
    type: "single_choice",
    options: ["Single building", "Multiple buildings"],
    required: true
  },
  {
    id: "building_quantity",
    question: "How many buildings are involved?",
    type: "text",
    required: true,
    dependsOn: { questionId: "building_count", answer: "Multiple buildings" }
  },
  {
    id: "utility_handling",
    question: "Do we need to include utility reroutes or just disconnects?",
    type: "single_choice",
    options: ["Utility reroutes (full relocation)", "Utility disconnects only", "Both reroutes and disconnects", "No utility work needed"],
    required: true
  },
  {
    id: "containment_type",
    question: "Is the abatement localized or full containment?",
    type: "single_choice",
    options: ["Localized containment (specific areas)", "Full containment (entire building)"],
    required: true
  },
  {
    id: "hazmat_types",
    question: "What types of hazardous materials are being abated?",
    type: "multiple_choice",
    options: ["Asbestos", "Lead paint", "Mold", "PCBs", "Mercury", "Other"],
    required: true
  },
  {
    id: "demolition_type",
    question: "What type of demolition is planned after abatement?",
    type: "single_choice",
    options: ["Full structural demolition", "Interior selective demolition", "Exterior shell remains", "No demolition (abatement only)"],
    required: true
  },
  {
    id: "air_monitoring",
    question: "Will continuous air monitoring be required?",
    type: "yes_no",
    required: true
  },
  {
    id: "regulatory_notifications",
    question: "Which regulatory bodies need notification?",
    type: "multiple_choice",
    options: ["EPA", "State Air Quality Board", "OSHA", "Local Building Department", "None required"],
    required: true
  }
];

const GENERAL_CONTRACTOR_QUESTIONS: InterviewQuestion[] = [
  {
    id: "project_phased",
    question: "Is the project phased?",
    type: "yes_no",
    required: true
  },
  {
    id: "phase_count",
    question: "How many phases are planned?",
    type: "text",
    required: true,
    dependsOn: { questionId: "project_phased", answer: "true" }
  },
  {
    id: "phase_descriptions",
    question: "Please describe each phase briefly (e.g., 'Phase 1: Site prep, Phase 2: Foundation'):",
    type: "text",
    required: true,
    dependsOn: { questionId: "project_phased", answer: "true" }
  },
  {
    id: "concrete_self_perform",
    question: "Are you self-performing concrete or subbing it out?",
    type: "single_choice",
    options: ["Self-performing", "Subcontracting", "Mix of both"],
    required: true
  },
  {
    id: "project_type",
    question: "What type of construction project is this?",
    type: "single_choice",
    options: ["New construction - Commercial", "New construction - Residential", "Renovation/Remodel", "Tenant improvement", "Infrastructure/Civil"],
    required: true
  },
  {
    id: "critical_trades",
    question: "Which trades are critical path for this project?",
    type: "multiple_choice",
    options: ["Structural steel", "Concrete", "MEP (Mechanical/Electrical/Plumbing)", "Roofing", "Exterior envelope", "Interior finishes"],
    required: true
  },
  {
    id: "owner_milestone",
    question: "Are there owner-imposed milestones or deadlines?",
    type: "yes_no",
    required: true
  },
  {
    id: "milestone_details",
    question: "Please describe the key milestones and their dates:",
    type: "text",
    required: true,
    dependsOn: { questionId: "owner_milestone", answer: "true" }
  }
];

const MEP_QUESTIONS: InterviewQuestion[] = [
  {
    id: "mep_scope",
    question: "What is the scope of MEP work?",
    type: "multiple_choice",
    options: ["Mechanical/HVAC", "Electrical", "Plumbing", "Fire protection", "Controls/BMS"],
    required: true
  },
  {
    id: "new_or_retrofit",
    question: "Is this new installation or retrofit?",
    type: "single_choice",
    options: ["New installation", "Retrofit/Replacement", "Addition to existing"],
    required: true
  },
  {
    id: "coordination_required",
    question: "Is 3D MEP coordination required?",
    type: "yes_no",
    required: true
  },
  {
    id: "prefabrication",
    question: "Will prefabrication be utilized?",
    type: "yes_no",
    required: true
  },
  {
    id: "shutdown_required",
    question: "Are system shutdowns required for tie-ins?",
    type: "yes_no",
    required: true
  }
];

const interviewSessions = new Map<string, InterviewSession>();

export function getQuestionsForTrade(trade: string): InterviewQuestion[] {
  const normalizedTrade = trade?.toLowerCase() || "";
  
  if (normalizedTrade.includes("abatement") || normalizedTrade.includes("demo")) {
    return [...ABATEMENT_DEMO_QUESTIONS];
  } else if (normalizedTrade.includes("general") || normalizedTrade.includes("contractor")) {
    return [...GENERAL_CONTRACTOR_QUESTIONS];
  } else if (normalizedTrade.includes("mep") || normalizedTrade.includes("mechanical") || 
             normalizedTrade.includes("electrical") || normalizedTrade.includes("plumbing")) {
    return [...MEP_QUESTIONS];
  } else {
    return [...GENERAL_CONTRACTOR_QUESTIONS];
  }
}

export function createInterviewSession(userId: string, trade: string, projectId?: string): InterviewSession {
  const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const questions = getQuestionsForTrade(trade);
  
  const session: InterviewSession = {
    id: sessionId,
    userId,
    projectId,
    state: "SCOPE_GATHERING",
    trade,
    questions,
    answers: [],
    currentQuestionIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  interviewSessions.set(sessionId, session);
  return session;
}

export function getInterviewSession(sessionId: string): InterviewSession | undefined {
  return interviewSessions.get(sessionId);
}

export function getActiveQuestions(session: InterviewSession): InterviewQuestion[] {
  return session.questions.filter(q => {
    if (!q.dependsOn) return true;
    
    const dependentAnswer = session.answers.find(a => a.questionId === q.dependsOn!.questionId);
    if (!dependentAnswer) return false;
    
    const expectedAnswer = q.dependsOn.answer;
    const actualAnswer = dependentAnswer.answer;
    
    if (Array.isArray(expectedAnswer)) {
      return expectedAnswer.includes(String(actualAnswer));
    }
    return String(actualAnswer) === expectedAnswer || 
           (expectedAnswer === "true" && actualAnswer === true) ||
           (expectedAnswer === "false" && actualAnswer === false);
  });
}

export function getCurrentQuestion(session: InterviewSession): InterviewQuestion | null {
  const activeQuestions = getActiveQuestions(session);
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  
  const unanswered = activeQuestions.filter(q => !answeredIds.has(q.id));
  return unanswered[0] || null;
}

export function submitAnswer(sessionId: string, answer: InterviewAnswer): { 
  success: boolean; 
  nextQuestion: InterviewQuestion | null;
  stateChange?: InterviewState;
  error?: string;
} {
  const session = interviewSessions.get(sessionId);
  if (!session) {
    return { success: false, nextQuestion: null, error: "Session not found" };
  }
  
  const existingIndex = session.answers.findIndex(a => a.questionId === answer.questionId);
  if (existingIndex >= 0) {
    session.answers[existingIndex] = answer;
  } else {
    session.answers.push(answer);
  }
  
  session.updatedAt = new Date();
  
  const nextQuestion = getCurrentQuestion(session);
  
  if (!nextQuestion && session.state === "SCOPE_GATHERING") {
    session.state = "SEQUENCE_VERIFICATION";
    session.schedulePlan = generateSchedulePlan(session);
    return { 
      success: true, 
      nextQuestion: null, 
      stateChange: "SEQUENCE_VERIFICATION" 
    };
  }
  
  return { success: true, nextQuestion };
}

export function generateSchedulePlan(session: InterviewSession): SchedulePlan {
  const answers = new Map(session.answers.map(a => [a.questionId, a.answer]));
  const trade = session.trade.toLowerCase();
  
  if (trade.includes("abatement") || trade.includes("demo")) {
    return generateAbatementDemoPlan(answers);
  } else if (trade.includes("general") || trade.includes("contractor")) {
    return generateGeneralContractorPlan(answers);
  } else if (trade.includes("mep")) {
    return generateMEPPlan(answers);
  }
  
  return generateGeneralContractorPlan(answers);
}

function generateAbatementDemoPlan(answers: Map<string, string | string[] | boolean>): SchedulePlan {
  const buildingCount = answers.get("building_count") === "Multiple buildings" 
    ? parseInt(String(answers.get("building_quantity")) || "2") 
    : 1;
  
  const utilityHandling = String(answers.get("utility_handling") || "");
  const includeReroutes = utilityHandling.includes("reroute");
  const includeDisconnects = utilityHandling.includes("disconnect") || utilityHandling.includes("both");
  
  const containmentType = String(answers.get("containment_type") || "").includes("Full") 
    ? "full" as const 
    : "localized" as const;
  
  const hazmatTypes = answers.get("hazmat_types") as string[] || ["Asbestos"];
  const demolitionType = String(answers.get("demolition_type") || "");
  const airMonitoring = answers.get("air_monitoring") === true;
  const regulatoryBodies = answers.get("regulatory_notifications") as string[] || [];
  
  const phases: PhasePlan[] = [];
  let activityCount = 0;
  
  if (regulatoryBodies.length > 0 && !regulatoryBodies.includes("None required")) {
    phases.push({
      name: "Regulatory Notifications",
      type: "admin",
      description: `Submit notifications to: ${regulatoryBodies.join(", ")}`,
      estimatedDuration: "5-10 days"
    });
    activityCount += regulatoryBodies.length * 2;
  }
  
  if (includeReroutes || includeDisconnects) {
    phases.push({
      name: "Utility Work",
      type: "utility",
      description: includeReroutes 
        ? "Utility reroutes and temporary services" 
        : "Utility disconnection and capping",
      estimatedDuration: includeReroutes ? "10-15 days" : "3-5 days"
    });
    activityCount += includeReroutes ? 15 : 8;
  }
  
  for (let i = 0; i < buildingCount; i++) {
    const buildingLabel = buildingCount > 1 ? ` - Building ${String.fromCharCode(65 + i)}` : "";
    
    phases.push({
      name: `Abatement${buildingLabel}`,
      type: "abatement",
      description: `${containmentType === "full" ? "Full" : "Localized"} containment abatement of ${hazmatTypes.join(", ")}${airMonitoring ? " with continuous air monitoring" : ""}`,
      estimatedDuration: containmentType === "full" ? "15-25 days" : "7-12 days"
    });
    activityCount += containmentType === "full" ? 25 : 15;
    
    if (!demolitionType.includes("No demolition")) {
      phases.push({
        name: `Demolition${buildingLabel}`,
        type: "demolition",
        description: demolitionType,
        estimatedDuration: demolitionType.includes("Full") ? "10-20 days" : "5-10 days"
      });
      activityCount += demolitionType.includes("Full") ? 20 : 12;
    }
  }
  
  const summary = `I will create a schedule with ${phases.length} phases for ${buildingCount} building${buildingCount > 1 ? "s" : ""}. ` +
    phases.map((p, i) => `Phase ${i + 1}: ${p.name}`).join(". ") + ". " +
    (includeReroutes ? "I included utility reroutes. " : includeDisconnects ? "I included utility disconnects. " : "") +
    `Estimated ${activityCount} activities total.`;
  
  return {
    projectName: "Abatement & Demolition Project",
    phases,
    includeUtilityReroutes: includeReroutes,
    includeUtilityDisconnects: includeDisconnects,
    containmentType,
    buildingCount,
    estimatedActivities: activityCount,
    summary
  };
}

function generateGeneralContractorPlan(answers: Map<string, string | string[] | boolean>): SchedulePlan {
  const isPhased = answers.get("project_phased") === true;
  const phaseCount = isPhased ? parseInt(String(answers.get("phase_count")) || "2") : 1;
  const phaseDescriptions = String(answers.get("phase_descriptions") || "");
  const concreteApproach = String(answers.get("concrete_self_perform") || "");
  const projectType = String(answers.get("project_type") || "");
  const criticalTrades = answers.get("critical_trades") as string[] || [];
  const hasMilestones = answers.get("owner_milestone") === true;
  const milestoneDetails = String(answers.get("milestone_details") || "");
  
  const phases: PhasePlan[] = [];
  let activityCount = 0;
  
  phases.push({
    name: "Preconstruction",
    type: "preconstruction",
    description: "Permits, submittals, procurement",
    estimatedDuration: "15-30 days"
  });
  activityCount += 20;
  
  if (isPhased && phaseDescriptions) {
    const phaseTexts = phaseDescriptions.split(/[,;]|\bphase\s*\d+\s*:/i).filter(Boolean);
    for (let i = 0; i < phaseCount; i++) {
      const desc = phaseTexts[i]?.trim() || `Phase ${i + 1} activities`;
      phases.push({
        name: `Phase ${i + 1}`,
        type: "construction",
        description: desc,
        estimatedDuration: "30-60 days"
      });
      activityCount += 40;
    }
  } else {
    phases.push({
      name: "Site Work & Foundations",
      type: "sitework",
      description: `Site preparation, excavation, and foundation work. Concrete ${concreteApproach.includes("Self") ? "self-performed" : "subcontracted"}.`,
      estimatedDuration: "20-40 days"
    });
    activityCount += 25;
    
    phases.push({
      name: "Structure",
      type: "structure",
      description: criticalTrades.includes("Structural steel") 
        ? "Structural steel erection and deck" 
        : "Vertical construction and framing",
      estimatedDuration: "30-60 days"
    });
    activityCount += 35;
    
    phases.push({
      name: "MEP Rough-in",
      type: "mep",
      description: "Mechanical, electrical, and plumbing rough-in",
      estimatedDuration: "30-45 days"
    });
    activityCount += 30;
    
    phases.push({
      name: "Finishes & Closeout",
      type: "finishes",
      description: "Interior finishes, punch list, and closeout",
      estimatedDuration: "30-45 days"
    });
    activityCount += 35;
  }
  
  const selfPerformNote = concreteApproach.includes("Self") ? "Self-performing concrete work. " : "";
  const milestoneNote = hasMilestones ? `Owner milestones: ${milestoneDetails}. ` : "";
  
  const summary = `I will create a ${isPhased ? `${phaseCount}-phase ` : ""}${projectType} schedule with ${phases.length} major sections. ` +
    phases.map((p, i) => `${i + 1}. ${p.name}`).join(", ") + ". " +
    selfPerformNote + milestoneNote +
    `Estimated ${activityCount} activities total.`;
  
  return {
    projectName: projectType || "Construction Project",
    phases,
    includeUtilityReroutes: false,
    includeUtilityDisconnects: false,
    buildingCount: 1,
    selfPerformConcrete: concreteApproach.includes("Self"),
    estimatedActivities: activityCount,
    summary
  };
}

function generateMEPPlan(answers: Map<string, string | string[] | boolean>): SchedulePlan {
  const mepScope = answers.get("mep_scope") as string[] || ["Mechanical/HVAC"];
  const isNewInstall = String(answers.get("new_or_retrofit") || "").includes("New");
  const needsCoordination = answers.get("coordination_required") === true;
  const usesPrefab = answers.get("prefabrication") === true;
  const needsShutdowns = answers.get("shutdown_required") === true;
  
  const phases: PhasePlan[] = [];
  let activityCount = 0;
  
  if (needsCoordination) {
    phases.push({
      name: "3D Coordination",
      type: "coordination",
      description: "BIM coordination and clash detection",
      estimatedDuration: "10-20 days"
    });
    activityCount += 10;
  }
  
  if (usesPrefab) {
    phases.push({
      name: "Prefabrication",
      type: "prefab",
      description: "Offsite prefabrication of assemblies",
      estimatedDuration: "15-30 days"
    });
    activityCount += 15;
  }
  
  for (const scope of mepScope) {
    phases.push({
      name: `${scope} ${isNewInstall ? "Installation" : "Retrofit"}`,
      type: "mep",
      description: `${scope} rough-in and installation`,
      estimatedDuration: "20-40 days"
    });
    activityCount += 25;
  }
  
  if (needsShutdowns) {
    phases.push({
      name: "System Tie-ins",
      type: "tieins",
      description: "Coordinated shutdowns and system connections",
      estimatedDuration: "5-10 days"
    });
    activityCount += 10;
  }
  
  phases.push({
    name: "Testing & Commissioning",
    type: "commissioning",
    description: "System testing, balancing, and commissioning",
    estimatedDuration: "10-20 days"
  });
  activityCount += 15;
  
  const summary = `I will create an MEP ${isNewInstall ? "installation" : "retrofit"} schedule covering ${mepScope.join(", ")}. ` +
    `${needsCoordination ? "Includes 3D coordination. " : ""}` +
    `${usesPrefab ? "Utilizing prefabrication. " : ""}` +
    `${needsShutdowns ? "Includes coordinated shutdown sequences. " : ""}` +
    `Estimated ${activityCount} activities total.`;
  
  return {
    projectName: "MEP Project",
    phases,
    includeUtilityReroutes: false,
    includeUtilityDisconnects: false,
    buildingCount: 1,
    estimatedActivities: activityCount,
    summary
  };
}

export function confirmPlanAndGenerate(sessionId: string): {
  success: boolean;
  plan?: SchedulePlan;
  error?: string;
} {
  const session = interviewSessions.get(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }
  
  if (session.state !== "SEQUENCE_VERIFICATION") {
    return { success: false, error: "Session not in verification state" };
  }
  
  session.state = "GENERATION";
  session.updatedAt = new Date();
  
  return { success: true, plan: session.schedulePlan };
}

export function getSessionSummary(sessionId: string): {
  state: InterviewState;
  progress: number;
  plan?: SchedulePlan;
  answeredQuestions: number;
  totalQuestions: number;
} | null {
  const session = interviewSessions.get(sessionId);
  if (!session) return null;
  
  const activeQuestions = getActiveQuestions(session);
  const answeredCount = session.answers.length;
  const progress = activeQuestions.length > 0 
    ? Math.round((answeredCount / activeQuestions.length) * 100) 
    : 100;
  
  return {
    state: session.state,
    progress,
    plan: session.schedulePlan,
    answeredQuestions: answeredCount,
    totalQuestions: activeQuestions.length
  };
}

export function deleteSession(sessionId: string): boolean {
  return interviewSessions.delete(sessionId);
}
