import { randomUUID } from "crypto";
import type {
  Project, InsertProject, Activity, InsertActivity, Wbs, InsertWbs,
  Calendar, InsertCalendar, CalendarWeekPattern, InsertCalendarWeekPattern,
  CalendarException, InsertCalendarException, CalendarAssignment, InsertCalendarAssignment,
  CalendarShift, InsertCalendarShift, Relationship, InsertRelationship,
  Resource, InsertResource, ResourceAssignment, InsertResourceAssignment,
  Baseline, InsertBaseline, TiaScenario, InsertTiaScenario,
  TiaFragnet, InsertTiaFragnet, TiaDelay, InsertTiaDelay,
  TiaResult, InsertTiaResult, ScheduleUpdate, InsertScheduleUpdate,
  ImportExportHistory, InsertImportExportHistory, AiContext, InsertAiContext,
  AiConversation, InsertAiConversation, AiMessage, InsertAiMessage,
  ActivityCode, InsertActivityCode,
  ActivityComment, InsertActivityComment, Attachment, InsertAttachment,
  AuditLog, InsertAuditLog, ProjectMember, InsertProjectMember,
  ScheduleVersion, InsertScheduleVersion,
  User, UpsertUser,
  TradeTemplate, InsertTradeTemplate, UserLearnedRule, InsertUserLearnedRule,
  VocabularyAlias, InsertVocabularyAlias
} from "@shared/schema";

export interface IStorage {
  // User operations (MANDATORY for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // WBS
  getWbsByProject(projectId: string): Promise<Wbs[]>;
  getWbsHierarchy(projectId: string): Promise<Wbs[]>; // Returns WBS in hierarchy order
  getWbs(id: string): Promise<Wbs | undefined>;
  createWbs(wbs: InsertWbs): Promise<Wbs>;
  updateWbs(id: string, updates: Partial<Wbs>): Promise<Wbs | undefined>;
  deleteWbs(id: string): Promise<boolean>;
  indentWbs(wbsId: string): Promise<Wbs | undefined>; // Move item one level deeper
  outdentWbs(wbsId: string): Promise<Wbs | undefined>; // Move item one level up
  generateWbsCode(projectId: string, parentId?: string): Promise<string>; // Generate next WBS code
  reorderWbs(wbsId: string, newSequenceNumber: number): Promise<void>; // Reorder WBS items
  getWbsChildren(wbsId: string): Promise<Wbs[]>; // Get immediate children
  getWbsDescendants(wbsId: string): Promise<Wbs[]>; // Get all descendants
  validateWbsHierarchy(projectId: string): Promise<boolean>; // Validate hierarchy integrity
  
  // Activities
  getActivitiesByProject(projectId: string): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | undefined>;
  upsertActivity(activity: InsertActivity): Promise<Activity>; // Insert or update based on projectId + activityId
  deleteActivity(id: string): Promise<boolean>;
  bulkUpdateActivities(updates: { id: string; updates: Partial<Activity> }[]): Promise<void>;
  
  // Relationships
  getRelationshipsByProject(projectId: string): Promise<Relationship[]>;
  getRelationshipsForActivity(activityId: string): Promise<{
    predecessors: Relationship[];
    successors: Relationship[];
  }>;
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  updateRelationship(id: string, updates: Partial<Relationship>): Promise<Relationship | undefined>;
  deleteRelationship(id: string): Promise<boolean>;
  
  // Calendars
  getCalendarsByProject(projectId: string | null): Promise<Calendar[]>;
  getCalendar(id: string): Promise<Calendar | undefined>;
  createCalendar(calendar: InsertCalendar): Promise<Calendar>;
  updateCalendar(id: string, updates: Partial<Calendar>): Promise<Calendar | undefined>;
  deleteCalendar(id: string): Promise<boolean>;
  getDefaultCalendar(projectId: string): Promise<Calendar | undefined>;
  
  // Calendar Week Patterns
  getCalendarWeekPatterns(calendarId: string): Promise<CalendarWeekPattern[]>;
  createCalendarWeekPattern(pattern: InsertCalendarWeekPattern): Promise<CalendarWeekPattern>;
  updateCalendarWeekPattern(id: string, updates: Partial<CalendarWeekPattern>): Promise<CalendarWeekPattern | undefined>;
  deleteCalendarWeekPattern(id: string): Promise<boolean>;
  
  // Calendar Exceptions
  getCalendarExceptions(calendarId: string): Promise<CalendarException[]>;
  createCalendarException(exception: InsertCalendarException): Promise<CalendarException>;
  updateCalendarException(id: string, updates: Partial<CalendarException>): Promise<CalendarException | undefined>;
  deleteCalendarException(id: string): Promise<boolean>;
  
  // Calendar Assignments
  getCalendarAssignments(calendarId: string): Promise<CalendarAssignment[]>;
  getCalendarAssignmentsByEntity(entityType: string, entityId: string): Promise<CalendarAssignment[]>;
  createCalendarAssignment(assignment: InsertCalendarAssignment): Promise<CalendarAssignment>;
  updateCalendarAssignment(id: string, updates: Partial<CalendarAssignment>): Promise<CalendarAssignment | undefined>;
  deleteCalendarAssignment(id: string): Promise<boolean>;
  
  // Calendar Shifts
  getCalendarShifts(projectId: string | null): Promise<CalendarShift[]>;
  getCalendarShift(id: string): Promise<CalendarShift | undefined>;
  createCalendarShift(shift: InsertCalendarShift): Promise<CalendarShift>;
  updateCalendarShift(id: string, updates: Partial<CalendarShift>): Promise<CalendarShift | undefined>;
  deleteCalendarShift(id: string): Promise<boolean>;
  
  // Resources
  getResourcesByProject(projectId: string): Promise<Resource[]>;
  getResource(id: string): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: string, updates: Partial<Resource>): Promise<Resource | undefined>;
  deleteResource(id: string): Promise<boolean>;
  
  // Resource Assignments
  getAssignmentsByActivity(activityId: string): Promise<ResourceAssignment[]>;
  getAssignmentsByResource(resourceId: string): Promise<ResourceAssignment[]>;
  createAssignment(assignment: InsertResourceAssignment): Promise<ResourceAssignment>;
  updateAssignment(id: string, updates: Partial<ResourceAssignment>): Promise<ResourceAssignment | undefined>;
  deleteAssignment(id: string): Promise<boolean>;
  
  // Baselines
  getBaselinesByProject(projectId: string): Promise<Baseline[]>;
  getBaseline(id: string): Promise<Baseline | undefined>;
  createBaseline(baseline: InsertBaseline): Promise<Baseline>;
  setActiveBaseline(projectId: string, baselineId: string): Promise<void>;
  deleteBaseline(id: string): Promise<boolean>;
  calculateVariance(projectId: string, baselineId?: string): Promise<any[]>;
  
  // TIA Scenarios
  getTiaScenariosByProject(projectId: string): Promise<TiaScenario[]>;
  getTiaScenario(id: string): Promise<TiaScenario | undefined>;
  createTiaScenario(scenario: InsertTiaScenario): Promise<TiaScenario>;
  updateTiaScenario(id: string, updates: Partial<TiaScenario>): Promise<TiaScenario | undefined>;
  deleteTiaScenario(id: string): Promise<boolean>;
  
  // TIA Fragnets
  getTiaFragnetsByScenario(scenarioId: string): Promise<TiaFragnet[]>;
  getTiaFragnet(id: string): Promise<TiaFragnet | undefined>;
  createTiaFragnet(fragnet: InsertTiaFragnet): Promise<TiaFragnet>;
  updateTiaFragnet(id: string, updates: Partial<TiaFragnet>): Promise<TiaFragnet | undefined>;
  deleteTiaFragnet(id: string): Promise<boolean>;
  
  // TIA Delays
  getTiaDelaysByScenario(scenarioId: string): Promise<TiaDelay[]>;
  getTiaDelay(id: string): Promise<TiaDelay | undefined>;
  createTiaDelay(delay: InsertTiaDelay): Promise<TiaDelay>;
  updateTiaDelay(id: string, updates: Partial<TiaDelay>): Promise<TiaDelay | undefined>;
  deleteTiaDelay(id: string): Promise<boolean>;
  
  // TIA Results
  getTiaResultsByScenario(scenarioId: string): Promise<TiaResult[]>;
  getTiaResult(id: string): Promise<TiaResult | undefined>;
  createTiaResult(result: InsertTiaResult): Promise<TiaResult>;
  calculateTiaImpact(scenarioId: string): Promise<TiaResult>;
  
  // Schedule Updates
  getScheduleUpdatesByProject(projectId: string): Promise<ScheduleUpdate[]>;
  getScheduleUpdate(id: string): Promise<ScheduleUpdate | undefined>;
  createScheduleUpdate(update: InsertScheduleUpdate): Promise<ScheduleUpdate>;
  
  // Activity Comments
  getActivityComments(activityId: string): Promise<ActivityComment[]>;
  createActivityComment(comment: InsertActivityComment): Promise<ActivityComment>;
  resolveComment(commentId: string): Promise<ActivityComment | undefined>;
  
  // Attachments
  getAttachmentsByActivity(activityId: string): Promise<Attachment[]>;
  getAttachmentsByProject(projectId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  
  // Audit Logs
  getAuditLogs(projectId: string, entityId?: string, entityType?: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Project Members
  getProjectMembers(projectId: string): Promise<ProjectMember[]>;
  createProjectMember(member: InsertProjectMember): Promise<ProjectMember>;
  updateProjectMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | undefined>;
  
  // Schedule Versions
  getScheduleVersions(projectId: string): Promise<ScheduleVersion[]>;
  createScheduleVersion(version: InsertScheduleVersion): Promise<ScheduleVersion>;
  restoreScheduleVersion(versionId: string): Promise<boolean>;
  
  // AI Conversations
  getConversationsByProject(projectId: string): Promise<AiConversation[]>;
  getConversation(id: string): Promise<AiConversation | undefined>;
  getActiveConversation(projectId: string): Promise<AiConversation | undefined>;
  createConversation(conversation: InsertAiConversation): Promise<AiConversation>;
  updateConversation(id: string, updates: Partial<AiConversation>): Promise<AiConversation | undefined>;
  
  // AI Messages
  getMessagesByConversation(conversationId: string): Promise<AiMessage[]>;
  createMessage(message: InsertAiMessage): Promise<AiMessage>;
  
  // Trade Templates (Adaptive Learning)
  getTradeTemplates(): Promise<TradeTemplate[]>;
  getTradeTemplate(id: string): Promise<TradeTemplate | undefined>;
  getTradeTemplatesByCategory(category: string): Promise<TradeTemplate[]>;
  createTradeTemplate(template: InsertTradeTemplate): Promise<TradeTemplate>;
  
  // User Learned Rules
  getUserLearnedRules(userId: string): Promise<UserLearnedRule[]>;
  getUserLearnedRuleByKeywords(userId: string, triggerKeyword: string, targetKeyword: string): Promise<UserLearnedRule | undefined>;
  createUserLearnedRule(rule: InsertUserLearnedRule): Promise<UserLearnedRule>;
  updateUserLearnedRule(id: string, updates: Partial<UserLearnedRule>): Promise<UserLearnedRule | undefined>;
  deleteUserLearnedRule(id: string): Promise<boolean>;
  
  // Vocabulary Aliases (Pattern Observer)
  getVocabularyAliases(userId: string): Promise<VocabularyAlias[]>;
  getVocabularyAlias(userId: string, canonicalTerm: string, aliasTerm: string): Promise<VocabularyAlias | undefined>;
  createVocabularyAlias(alias: InsertVocabularyAlias): Promise<VocabularyAlias>;
  updateVocabularyAlias(id: string, updates: Partial<VocabularyAlias>): Promise<VocabularyAlias | undefined>;
}

export class MemStorage implements IStorage {
  private projects = new Map<string, Project>();
  private wbs = new Map<string, Wbs>();
  private activities = new Map<string, Activity>();
  private relationships = new Map<string, Relationship>();
  private calendars = new Map<string, Calendar>();
  private calendarWeekPatterns = new Map<string, CalendarWeekPattern>();
  private calendarExceptions = new Map<string, CalendarException>();
  private calendarAssignments = new Map<string, CalendarAssignment>();
  private calendarShifts = new Map<string, CalendarShift>();
  private resources = new Map<string, Resource>();
  private resourceAssignments = new Map<string, ResourceAssignment>();
  private baselines = new Map<string, Baseline>();
  private tiaScenarios = new Map<string, TiaScenario>();
  private tiaFragnets = new Map<string, TiaFragnet>();
  private tiaDelays = new Map<string, TiaDelay>();
  private tiaResults = new Map<string, TiaResult>();
  private scheduleUpdates = new Map<string, ScheduleUpdate>();
  private importExportHistory = new Map<string, ImportExportHistory>();
  private aiContext = new Map<string, AiContext>();
  private aiConversations = new Map<string, AiConversation>();
  private aiMessages = new Map<string, AiMessage>();
  private activityCodes = new Map<string, ActivityCode>();
  private activityComments = new Map<string, ActivityComment>();
  private attachments = new Map<string, Attachment>();
  private auditLogs = new Map<string, AuditLog>();
  private projectMembers = new Map<string, ProjectMember>();
  private scheduleVersions = new Map<string, ScheduleVersion>();
  private users = new Map<string, User>();
  private tradeTemplates = new Map<string, TradeTemplate>();
  private userLearnedRules = new Map<string, UserLearnedRule>();
  private vocabularyAliases = new Map<string, VocabularyAlias>();

  constructor() {
    this.seedData();
  }

  // User operations (MANDATORY for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(userData.id!);
    const user: User = existingUser ? {
      ...existingUser,
      ...userData,
      updatedAt: new Date()
    } : {
      id: userData.id!,
      email: userData.email ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      primaryTrade: userData.primaryTrade ?? null,
      specialties: userData.specialties ?? null,
      createdAt: userData.createdAt ?? new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  private seedData() {
    // Add a sample demolition project
    const project: Project = {
      id: "project-1",
      name: "5-Story Office Building Demolition",
      description: "Complete demolition of existing office structure including abatement and site clearing",
      contractStartDate: "2024-01-15",
      contractFinishDate: "2024-06-30",
      dataDate: "2024-02-01",
      colorPrimary: "#10b981",
      colorSecondary: "#059669",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.projects.set(project.id, project);
    
    // Create default calendar
    const calendar: Calendar = {
      id: "cal-1",
      projectId: project.id,
      name: "Standard 5-Day",
      type: "Project",
      standardWorkweek: {
        monday: { working: true, hours: [8, 17] },
        tuesday: { working: true, hours: [8, 17] },
        wednesday: { working: true, hours: [8, 17] },
        thursday: { working: true, hours: [8, 17] },
        friday: { working: true, hours: [8, 17] },
        saturday: { working: false },
        sunday: { working: false }
      },
      holidays: ["2024-01-01", "2024-07-04", "2024-12-25"],
      exceptions: null
    };
    this.calendars.set(calendar.id, calendar);

    // Create WBS structure
    const wbsItems = [
      { id: "wbs-1", parentId: null, code: "1", name: "Demolition Project", level: 1, sequenceNumber: 1 },
      { id: "wbs-2", parentId: "wbs-1", code: "1.1", name: "Mobilization", level: 2, sequenceNumber: 1 },
      { id: "wbs-3", parentId: "wbs-1", code: "1.2", name: "Abatement", level: 2, sequenceNumber: 2 },
      { id: "wbs-4", parentId: "wbs-1", code: "1.3", name: "Structural Demolition", level: 2, sequenceNumber: 3 },
      { id: "wbs-5", parentId: "wbs-1", code: "1.4", name: "Site Clearing", level: 2, sequenceNumber: 4 }
    ];
    
    wbsItems.forEach(item => {
      const wbs: Wbs = {
        ...item,
        projectId: project.id,
        rollupSettings: null
      };
      this.wbs.set(wbs.id, wbs);
    });

    // Create sample activities
    const activities = [
      { 
        id: "act-1", 
        activityId: "A1000", 
        name: "Mobilize Equipment", 
        wbsId: "wbs-2",
        originalDuration: 3,
        remainingDuration: 3,
        earlyStart: "2024-01-15",
        earlyFinish: "2024-01-17",
        trade: "General"
      },
      { 
        id: "act-2", 
        activityId: "A1010", 
        name: "Site Setup & Safety", 
        wbsId: "wbs-2",
        originalDuration: 2,
        remainingDuration: 2,
        earlyStart: "2024-01-18",
        earlyFinish: "2024-01-19",
        trade: "Safety"
      },
      { 
        id: "act-3", 
        activityId: "A2000", 
        name: "Asbestos Survey", 
        wbsId: "wbs-3",
        originalDuration: 5,
        remainingDuration: 5,
        earlyStart: "2024-01-22",
        earlyFinish: "2024-01-26",
        trade: "Abatement"
      },
      { 
        id: "act-4", 
        activityId: "A2010", 
        name: "Asbestos Removal - Floor 5", 
        wbsId: "wbs-3",
        originalDuration: 10,
        remainingDuration: 10,
        earlyStart: "2024-01-29",
        earlyFinish: "2024-02-09",
        trade: "Abatement"
      },
      { 
        id: "act-5", 
        activityId: "A3000", 
        name: "Soft Strip - Interior", 
        wbsId: "wbs-4",
        originalDuration: 15,
        remainingDuration: 15,
        earlyStart: "2024-02-12",
        earlyFinish: "2024-03-01",
        trade: "Demolition"
      },
      { 
        id: "act-6", 
        activityId: "A3010", 
        name: "Structural Demo - Roof", 
        wbsId: "wbs-4",
        originalDuration: 8,
        remainingDuration: 8,
        earlyStart: "2024-03-04",
        earlyFinish: "2024-03-13",
        trade: "Demolition",
        isCritical: true
      }
    ];

    activities.forEach(act => {
      const activity: Activity = {
        ...act,
        projectId: project.id,
        type: "Task",
        durationUnit: "days",
        lateStart: act.earlyStart,
        lateFinish: act.earlyFinish,
        actualStart: null,
        actualFinish: null,
        baselineStart: act.earlyStart,
        baselineFinish: act.earlyFinish,
        baselineDuration: act.originalDuration,
        baselineCost: null,
        baselineWork: null,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: act.isCritical || false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: calendar.id,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        responsibility: "Adams & Grand",
        location: "Main Building",
        actualDuration: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.activities.set(activity.id, activity);
    });

    // Create relationships
    const relationships = [
      { predecessorId: "act-1", successorId: "act-2", type: "FS" as const, lag: 0 },
      { predecessorId: "act-2", successorId: "act-3", type: "FS" as const, lag: 0 },
      { predecessorId: "act-3", successorId: "act-4", type: "FS" as const, lag: 0 },
      { predecessorId: "act-4", successorId: "act-5", type: "FS" as const, lag: 0 },
      { predecessorId: "act-5", successorId: "act-6", type: "FS" as const, lag: 0 }
    ];

    relationships.forEach((rel, index) => {
      const relationship: Relationship = {
        id: `rel-${index + 1}`,
        projectId: project.id,
        ...rel,
        lagUnit: "days"
      };
      this.relationships.set(relationship.id, relationship);
    });
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = {
      ...insertProject,
      id,
      description: insertProject.description ?? null,
      contractStartDate: insertProject.contractStartDate ?? null,
      contractFinishDate: insertProject.contractFinishDate ?? null,
      dataDate: insertProject.dataDate ?? null,
      colorPrimary: insertProject.colorPrimary ?? "#10b981",
      colorSecondary: insertProject.colorSecondary ?? "#059669",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  // WBS
  async getWbsByProject(projectId: string): Promise<Wbs[]> {
    return Array.from(this.wbs.values()).filter(w => w.projectId === projectId);
  }

  async getWbs(id: string): Promise<Wbs | undefined> {
    return this.wbs.get(id);
  }

  async createWbs(insertWbs: InsertWbs): Promise<Wbs> {
    const id = randomUUID();
    const wbs: Wbs = {
      ...insertWbs,
      id,
      parentId: insertWbs.parentId ?? null,
      rollupSettings: insertWbs.rollupSettings ?? null
    };
    this.wbs.set(id, wbs);
    return wbs;
  }

  async updateWbs(id: string, updates: Partial<Wbs>): Promise<Wbs | undefined> {
    const existing = this.wbs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.wbs.set(id, updated);
    return updated;
  }

  async deleteWbs(id: string): Promise<boolean> {
    // Check if this WBS has children
    const children = await this.getWbsChildren(id);
    if (children.length > 0) {
      throw new Error("Cannot delete WBS item that has children. Delete children first.");
    }
    
    // Check if this WBS has activities assigned to it
    const assignedActivities = Array.from(this.activities.values()).filter(a => a.wbsId === id);
    if (assignedActivities.length > 0) {
      throw new Error("Cannot delete WBS item that has activities assigned. Reassign or delete activities first.");
    }
    
    return this.wbs.delete(id);
  }

  async getWbsHierarchy(projectId: string): Promise<Wbs[]> {
    const wbsItems = Array.from(this.wbs.values())
      .filter(w => w.projectId === projectId)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.sequenceNumber - b.sequenceNumber;
      });
    return wbsItems;
  }

  async getWbsChildren(wbsId: string): Promise<Wbs[]> {
    return Array.from(this.wbs.values())
      .filter(w => w.parentId === wbsId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async getWbsDescendants(wbsId: string): Promise<Wbs[]> {
    const descendants: Wbs[] = [];
    const children = await this.getWbsChildren(wbsId);
    
    for (const child of children) {
      descendants.push(child);
      const childDescendants = await this.getWbsDescendants(child.id);
      descendants.push(...childDescendants);
    }
    
    return descendants;
  }

  async generateWbsCode(projectId: string, parentId?: string): Promise<string> {
    if (!parentId) {
      // Generate root level code (1, 2, 3, etc.)
      const rootItems = Array.from(this.wbs.values())
        .filter(w => w.projectId === projectId && !w.parentId)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      
      return (rootItems.length + 1).toString();
    } else {
      // Generate child code based on parent
      const parent = this.wbs.get(parentId);
      if (!parent) {
        throw new Error("Parent WBS not found");
      }
      
      const siblings = await this.getWbsChildren(parentId);
      const childNumber = siblings.length + 1;
      
      return `${parent.code}.${childNumber}`;
    }
  }

  async indentWbs(wbsId: string): Promise<Wbs | undefined> {
    const current = this.wbs.get(wbsId);
    if (!current) {
      throw new Error("WBS item not found");
    }
    
    // Find the previous sibling at the same level to become the new parent
    const siblings = Array.from(this.wbs.values())
      .filter(w => 
        w.projectId === current.projectId && 
        w.level === current.level && 
        w.parentId === current.parentId
      )
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    const currentIndex = siblings.findIndex(s => s.id === wbsId);
    if (currentIndex <= 0) {
      throw new Error("Cannot indent: no previous sibling to become parent");
    }
    
    const newParent = siblings[currentIndex - 1];
    
    // Get new sequence number as the last child of the new parent
    const newSiblings = await this.getWbsChildren(newParent.id);
    const newSequenceNumber = newSiblings.length + 1;
    
    // Generate new WBS code
    const newCode = await this.generateWbsCode(current.projectId, newParent.id);
    
    // Update the WBS item
    const updated: Wbs = {
      ...current,
      parentId: newParent.id,
      level: current.level + 1,
      sequenceNumber: newSequenceNumber,
      code: newCode
    };
    
    this.wbs.set(wbsId, updated);
    
    // Update codes for all descendants
    await this.updateDescendantCodesMemory(wbsId, newCode);
    
    return updated;
  }

  async outdentWbs(wbsId: string): Promise<Wbs | undefined> {
    const current = this.wbs.get(wbsId);
    if (!current) {
      throw new Error("WBS item not found");
    }
    
    // Cannot outdent root level items
    if (!current.parentId) {
      throw new Error("Cannot outdent root level item");
    }
    
    // Get parent to find the new parent (grandparent)
    const parent = this.wbs.get(current.parentId);
    if (!parent) {
      throw new Error("Parent WBS not found");
    }
    
    const newParentId = parent.parentId; // Could be null (root level)
    const newLevel = current.level - 1;
    
    // Get new sequence number at the new level
    let newSequenceNumber: number;
    if (newParentId) {
      const newSiblings = await this.getWbsChildren(newParentId);
      newSequenceNumber = newSiblings.length + 1;
    } else {
      // Moving to root level
      const rootItems = Array.from(this.wbs.values())
        .filter(w => w.projectId === current.projectId && !w.parentId)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      newSequenceNumber = rootItems.length + 1;
    }
    
    // Generate new WBS code
    const newCode = await this.generateWbsCode(current.projectId, newParentId || undefined);
    
    // Update the WBS item
    const updated: Wbs = {
      ...current,
      parentId: newParentId,
      level: newLevel,
      sequenceNumber: newSequenceNumber,
      code: newCode
    };
    
    this.wbs.set(wbsId, updated);
    
    // Update codes for all descendants
    await this.updateDescendantCodesMemory(wbsId, newCode);
    
    return updated;
  }

  async reorderWbs(wbsId: string, newSequenceNumber: number): Promise<void> {
    const current = this.wbs.get(wbsId);
    if (!current) {
      throw new Error("WBS item not found");
    }
    
    const oldSequenceNumber = current.sequenceNumber;
    
    if (oldSequenceNumber === newSequenceNumber) {
      return; // No change needed
    }
    
    // Get all siblings
    const siblings = Array.from(this.wbs.values())
      .filter(w => 
        w.projectId === current.projectId && 
        w.level === current.level && 
        w.parentId === current.parentId
      )
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    // Validate new sequence number
    if (newSequenceNumber < 1 || newSequenceNumber > siblings.length) {
      throw new Error("Invalid sequence number");
    }
    
    // Update sequence numbers
    if (newSequenceNumber < oldSequenceNumber) {
      // Moving up - increment sequence numbers in between
      for (const sibling of siblings) {
        if (sibling.sequenceNumber >= newSequenceNumber && sibling.sequenceNumber < oldSequenceNumber) {
          const updated = { ...sibling, sequenceNumber: sibling.sequenceNumber + 1 };
          this.wbs.set(sibling.id, updated);
        }
      }
    } else {
      // Moving down - decrement sequence numbers in between
      for (const sibling of siblings) {
        if (sibling.sequenceNumber > oldSequenceNumber && sibling.sequenceNumber <= newSequenceNumber) {
          const updated = { ...sibling, sequenceNumber: sibling.sequenceNumber - 1 };
          this.wbs.set(sibling.id, updated);
        }
      }
    }
    
    // Update the moved item
    const updated = { ...current, sequenceNumber: newSequenceNumber };
    this.wbs.set(wbsId, updated);
  }

  async validateWbsHierarchy(projectId: string): Promise<boolean> {
    const wbsItems = await this.getWbsByProject(projectId);
    
    for (const item of wbsItems) {
      // Check parent-child relationships
      if (item.parentId) {
        const parent = this.wbs.get(item.parentId);
        if (!parent) {
          console.error(`WBS item ${item.id} has invalid parent ${item.parentId}`);
          return false;
        }
        
        if (parent.level !== item.level - 1) {
          console.error(`WBS item ${item.id} has incorrect level ${item.level} relative to parent level ${parent.level}`);
          return false;
        }
      } else {
        // Root level items should have level 0
        if (item.level !== 0) {
          console.error(`Root WBS item ${item.id} should have level 0, has level ${item.level}`);
          return false;
        }
      }
    }
    
    return true;
  }

  // Helper method to update descendant codes when parent code changes (for MemStorage)
  private async updateDescendantCodesMemory(parentWbsId: string, newParentCode: string): Promise<void> {
    const children = await this.getWbsChildren(parentWbsId);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const newChildCode = `${newParentCode}.${i + 1}`;
      
      const updated = { ...child, code: newChildCode };
      this.wbs.set(child.id, updated);
      
      // Recursively update descendants
      await this.updateDescendantCodesMemory(child.id, newChildCode);
    }
  }

  // Activities
  async getActivitiesByProject(projectId: string): Promise<Activity[]> {
    return Array.from(this.activities.values()).filter(a => a.projectId === projectId);
  }

  async getActivity(id: string): Promise<Activity | undefined> {
    return this.activities.get(id);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const id = randomUUID();
    const activity: Activity = {
      ...insertActivity,
      id,
      type: insertActivity.type ?? "Task",
      wbsId: insertActivity.wbsId ?? null,
      originalDuration: insertActivity.originalDuration ?? null,
      remainingDuration: insertActivity.remainingDuration ?? null,
      actualDuration: insertActivity.actualDuration ?? null,
      durationUnit: insertActivity.durationUnit ?? null,
      earlyStart: insertActivity.earlyStart ?? null,
      earlyFinish: insertActivity.earlyFinish ?? null,
      lateStart: insertActivity.lateStart ?? null,
      lateFinish: insertActivity.lateFinish ?? null,
      actualStart: insertActivity.actualStart ?? null,
      actualFinish: insertActivity.actualFinish ?? null,
      baselineStart: insertActivity.baselineStart ?? null,
      baselineFinish: insertActivity.baselineFinish ?? null,
      baselineDuration: insertActivity.baselineDuration ?? null,
      baselineCost: insertActivity.baselineCost ?? null,
      baselineWork: insertActivity.baselineWork ?? null,
      totalFloat: insertActivity.totalFloat ?? null,
      freeFloat: insertActivity.freeFloat ?? null,
      isCritical: insertActivity.isCritical ?? null,
      criticalityIndex: insertActivity.criticalityIndex ?? null,
      percentComplete: insertActivity.percentComplete ?? null,
      physicalPercentComplete: insertActivity.physicalPercentComplete ?? null,
      status: insertActivity.status ?? "NotStarted",
      calendarId: insertActivity.calendarId ?? null,
      constraintType: insertActivity.constraintType ?? null,
      constraintDate: insertActivity.constraintDate ?? null,
      deadline: insertActivity.deadline ?? null,
      activityCodes: insertActivity.activityCodes ?? null,
      customFields: insertActivity.customFields ?? null,
      budgetedCost: insertActivity.budgetedCost ?? null,
      actualCost: insertActivity.actualCost ?? null,
      earnedValue: insertActivity.earnedValue ?? null,
      notes: insertActivity.notes ?? null,
      trade: insertActivity.trade ?? null,
      responsibility: insertActivity.responsibility ?? null,
      location: insertActivity.location ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.activities.set(id, activity);
    return activity;
  }

  async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | undefined> {
    const existing = this.activities.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.activities.set(id, updated);
    return updated;
  }

  async upsertActivity(insertActivity: InsertActivity): Promise<Activity> {
    // Find existing activity by projectId + activityId
    const existing = Array.from(this.activities.values()).find(
      a => a.projectId === insertActivity.projectId && a.activityId === insertActivity.activityId
    );
    
    if (existing) {
      // Update existing activity
      const updated = { 
        ...existing, 
        ...insertActivity, 
        id: existing.id, // Keep existing id
        createdAt: existing.createdAt, // Keep original creation date
        updatedAt: new Date() 
      };
      this.activities.set(existing.id, updated);
      return updated;
    } else {
      // Create new activity
      return await this.createActivity(insertActivity);
    }
  }

  async deleteActivity(id: string): Promise<boolean> {
    // Also delete related relationships
    const relationsToDelete: string[] = [];
    this.relationships.forEach((rel, relId) => {
      if (rel.predecessorId === id || rel.successorId === id) {
        relationsToDelete.push(relId);
      }
    });
    relationsToDelete.forEach(relId => this.relationships.delete(relId));
    
    return this.activities.delete(id);
  }

  async bulkUpdateActivities(updates: { id: string; updates: Partial<Activity> }[]): Promise<void> {
    for (const { id, updates: activityUpdates } of updates) {
      await this.updateActivity(id, activityUpdates);
    }
  }

  // Relationships
  async getRelationshipsByProject(projectId: string): Promise<Relationship[]> {
    return Array.from(this.relationships.values()).filter(r => r.projectId === projectId);
  }

  async getRelationshipsForActivity(activityId: string): Promise<{
    predecessors: Relationship[];
    successors: Relationship[];
  }> {
    const all = Array.from(this.relationships.values());
    return {
      predecessors: all.filter(r => r.successorId === activityId),
      successors: all.filter(r => r.predecessorId === activityId)
    };
  }

  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    const id = randomUUID();
    const relationship: Relationship = {
      ...insertRelationship,
      id,
      type: insertRelationship.type ?? "FS",
      lag: insertRelationship.lag ?? null,
      lagUnit: insertRelationship.lagUnit ?? null
    };
    this.relationships.set(id, relationship);
    return relationship;
  }

  async updateRelationship(id: string, updates: Partial<Relationship>): Promise<Relationship | undefined> {
    const existing = this.relationships.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.relationships.set(id, updated);
    return updated;
  }

  async deleteRelationship(id: string): Promise<boolean> {
    return this.relationships.delete(id);
  }

  // Calendars
  async getCalendarsByProject(projectId: string | null): Promise<Calendar[]> {
    return Array.from(this.calendars.values()).filter(c => 
      projectId === null ? c.projectId === null : c.projectId === projectId
    );
  }

  async getCalendar(id: string): Promise<Calendar | undefined> {
    return this.calendars.get(id);
  }

  async createCalendar(insertCalendar: InsertCalendar): Promise<Calendar> {
    const id = randomUUID();
    const calendar: Calendar = {
      ...insertCalendar,
      id,
      projectId: insertCalendar.projectId ?? null,
      description: insertCalendar.description ?? null,
      isDefault: insertCalendar.isDefault ?? false,
      workHoursPerDay: insertCalendar.workHoursPerDay ?? 8,
      workDaysPerWeek: insertCalendar.workDaysPerWeek ?? 5,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.calendars.set(id, calendar);
    
    // Create default week patterns if this is a new calendar
    if (insertCalendar.workDaysPerWeek === 5 || !insertCalendar.workDaysPerWeek) {
      // Standard 5-day work week
      for (let day = 0; day <= 6; day++) {
        const pattern: CalendarWeekPattern = {
          id: randomUUID(),
          calendarId: id,
          dayOfWeek: day,
          isWorkingDay: day >= 1 && day <= 5, // Mon-Fri
          startTime: day >= 1 && day <= 5 ? "08:00" : null,
          endTime: day >= 1 && day <= 5 ? "17:00" : null,
          breakStartTime: day >= 1 && day <= 5 ? "12:00" : null,
          breakEndTime: day >= 1 && day <= 5 ? "13:00" : null
        };
        this.calendarWeekPatterns.set(pattern.id, pattern);
      }
    }
    
    return calendar;
  }

  async updateCalendar(id: string, updates: Partial<Calendar>): Promise<Calendar | undefined> {
    const existing = this.calendars.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.calendars.set(id, updated);
    return updated;
  }

  async deleteCalendar(id: string): Promise<boolean> {
    // Delete associated patterns, exceptions, assignments
    for (const [patternId, pattern] of this.calendarWeekPatterns) {
      if (pattern.calendarId === id) {
        this.calendarWeekPatterns.delete(patternId);
      }
    }
    for (const [exceptionId, exception] of this.calendarExceptions) {
      if (exception.calendarId === id) {
        this.calendarExceptions.delete(exceptionId);
      }
    }
    for (const [assignmentId, assignment] of this.calendarAssignments) {
      if (assignment.calendarId === id) {
        this.calendarAssignments.delete(assignmentId);
      }
    }
    return this.calendars.delete(id);
  }

  async getDefaultCalendar(projectId: string): Promise<Calendar | undefined> {
    return Array.from(this.calendars.values()).find(c => 
      c.projectId === projectId && c.isDefault
    );
  }

  // Calendar Week Patterns
  async getCalendarWeekPatterns(calendarId: string): Promise<CalendarWeekPattern[]> {
    return Array.from(this.calendarWeekPatterns.values())
      .filter(p => p.calendarId === calendarId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  async createCalendarWeekPattern(pattern: InsertCalendarWeekPattern): Promise<CalendarWeekPattern> {
    const id = randomUUID();
    const newPattern: CalendarWeekPattern = {
      ...pattern,
      id,
      isWorkingDay: pattern.isWorkingDay ?? true,
      startTime: pattern.startTime ?? null,
      endTime: pattern.endTime ?? null,
      breakStartTime: pattern.breakStartTime ?? null,
      breakEndTime: pattern.breakEndTime ?? null
    };
    this.calendarWeekPatterns.set(id, newPattern);
    return newPattern;
  }

  async updateCalendarWeekPattern(id: string, updates: Partial<CalendarWeekPattern>): Promise<CalendarWeekPattern | undefined> {
    const existing = this.calendarWeekPatterns.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.calendarWeekPatterns.set(id, updated);
    return updated;
  }

  async deleteCalendarWeekPattern(id: string): Promise<boolean> {
    return this.calendarWeekPatterns.delete(id);
  }

  // Calendar Exceptions
  async getCalendarExceptions(calendarId: string): Promise<CalendarException[]> {
    return Array.from(this.calendarExceptions.values())
      .filter(e => e.calendarId === calendarId)
      .sort((a, b) => a.exceptionDate.localeCompare(b.exceptionDate));
  }

  async createCalendarException(exception: InsertCalendarException): Promise<CalendarException> {
    const id = randomUUID();
    const newException: CalendarException = {
      ...exception,
      id,
      name: exception.name ?? null,
      isRecurring: exception.isRecurring ?? false,
      recurringRule: exception.recurringRule ?? null,
      startTime: exception.startTime ?? null,
      endTime: exception.endTime ?? null,
      shiftId: exception.shiftId ?? null
    };
    this.calendarExceptions.set(id, newException);
    return newException;
  }

  async updateCalendarException(id: string, updates: Partial<CalendarException>): Promise<CalendarException | undefined> {
    const existing = this.calendarExceptions.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.calendarExceptions.set(id, updated);
    return updated;
  }

  async deleteCalendarException(id: string): Promise<boolean> {
    return this.calendarExceptions.delete(id);
  }

  // Calendar Assignments
  async getCalendarAssignments(calendarId: string): Promise<CalendarAssignment[]> {
    return Array.from(this.calendarAssignments.values())
      .filter(a => a.calendarId === calendarId);
  }

  async getCalendarAssignmentsByEntity(entityType: string, entityId: string): Promise<CalendarAssignment[]> {
    return Array.from(this.calendarAssignments.values())
      .filter(a => a.entityType === entityType && a.entityId === entityId)
      .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1)); // Higher priority first
  }

  async createCalendarAssignment(assignment: InsertCalendarAssignment): Promise<CalendarAssignment> {
    const id = randomUUID();
    const newAssignment: CalendarAssignment = {
      ...assignment,
      id,
      effectiveFrom: assignment.effectiveFrom ?? null,
      effectiveTo: assignment.effectiveTo ?? null,
      priority: assignment.priority ?? 1
    };
    this.calendarAssignments.set(id, newAssignment);
    return newAssignment;
  }

  async updateCalendarAssignment(id: string, updates: Partial<CalendarAssignment>): Promise<CalendarAssignment | undefined> {
    const existing = this.calendarAssignments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.calendarAssignments.set(id, updated);
    return updated;
  }

  async deleteCalendarAssignment(id: string): Promise<boolean> {
    return this.calendarAssignments.delete(id);
  }

  // Calendar Shifts
  async getCalendarShifts(projectId: string | null): Promise<CalendarShift[]> {
    return Array.from(this.calendarShifts.values()).filter(s => 
      projectId === null ? s.projectId === null : s.projectId === projectId
    );
  }

  async getCalendarShift(id: string): Promise<CalendarShift | undefined> {
    return this.calendarShifts.get(id);
  }

  async createCalendarShift(shift: InsertCalendarShift): Promise<CalendarShift> {
    const id = randomUUID();
    const newShift: CalendarShift = {
      ...shift,
      id,
      projectId: shift.projectId ?? null,
      code: shift.code ?? null,
      breakStartTime: shift.breakStartTime ?? null,
      breakEndTime: shift.breakEndTime ?? null,
      workHours: shift.workHours ?? null,
      color: shift.color ?? null
    };
    this.calendarShifts.set(id, newShift);
    return newShift;
  }

  async updateCalendarShift(id: string, updates: Partial<CalendarShift>): Promise<CalendarShift | undefined> {
    const existing = this.calendarShifts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.calendarShifts.set(id, updated);
    return updated;
  }

  async deleteCalendarShift(id: string): Promise<boolean> {
    return this.calendarShifts.delete(id);
  }

  // Resources
  async getResourcesByProject(projectId: string): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter(r => r.projectId === projectId);
  }

  async getResource(id: string): Promise<Resource | undefined> {
    return this.resources.get(id);
  }

  async createResource(insertResource: InsertResource): Promise<Resource> {
    const id = randomUUID();
    const resource: Resource = {
      ...insertResource,
      id,
      unit: insertResource.unit ?? null,
      standardRate: insertResource.standardRate ?? null,
      overtimeRate: insertResource.overtimeRate ?? null,
      maxUnits: insertResource.maxUnits ?? null,
      calendarId: insertResource.calendarId ?? null,
      notes: insertResource.notes ?? null
    };
    this.resources.set(id, resource);
    return resource;
  }

  async updateResource(id: string, updates: Partial<Resource>): Promise<Resource | undefined> {
    const existing = this.resources.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.resources.set(id, updated);
    return updated;
  }

  async deleteResource(id: string): Promise<boolean> {
    return this.resources.delete(id);
  }

  // Resource Assignments
  async getAssignmentsByActivity(activityId: string): Promise<ResourceAssignment[]> {
    return Array.from(this.resourceAssignments.values()).filter(a => a.activityId === activityId);
  }

  async getAssignmentsByResource(resourceId: string): Promise<ResourceAssignment[]> {
    return Array.from(this.resourceAssignments.values()).filter(a => a.resourceId === resourceId);
  }

  async createAssignment(insertAssignment: InsertResourceAssignment): Promise<ResourceAssignment> {
    const id = randomUUID();
    const assignment: ResourceAssignment = {
      ...insertAssignment,
      id,
      units: insertAssignment.units ?? null,
      plannedUnits: insertAssignment.plannedUnits ?? null,
      actualUnits: insertAssignment.actualUnits ?? null,
      remainingUnits: insertAssignment.remainingUnits ?? null,
      cost: insertAssignment.cost ?? null,
      actualCost: insertAssignment.actualCost ?? null,
      remainingCost: insertAssignment.remainingCost ?? null
    };
    this.resourceAssignments.set(id, assignment);
    return assignment;
  }

  async updateAssignment(id: string, updates: Partial<ResourceAssignment>): Promise<ResourceAssignment | undefined> {
    const existing = this.resourceAssignments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.resourceAssignments.set(id, updated);
    return updated;
  }

  async deleteAssignment(id: string): Promise<boolean> {
    return this.resourceAssignments.delete(id);
  }

  // Baselines
  async getBaselinesByProject(projectId: string): Promise<Baseline[]> {
    return Array.from(this.baselines.values()).filter(b => b.projectId === projectId);
  }

  async getBaseline(id: string): Promise<Baseline | undefined> {
    return this.baselines.get(id);
  }

  async createBaseline(insertBaseline: InsertBaseline): Promise<Baseline> {
    const id = randomUUID();
    const projectActivities = await this.getActivitiesByProject(insertBaseline.projectId);
    const relationships = await this.getRelationshipsByProject(insertBaseline.projectId);
    
    // Create comprehensive snapshot
    const snapshotData = {
      activities: projectActivities.map(activity => ({
        id: activity.id,
        activityId: activity.activityId,
        name: activity.name,
        originalDuration: activity.originalDuration,
        earlyStart: activity.earlyStart,
        earlyFinish: activity.earlyFinish,
        budgetedCost: activity.budgetedCost,
        type: activity.type,
        wbsId: activity.wbsId
      })),
      relationships: relationships,
      capturedAt: new Date().toISOString(),
      totalActivities: projectActivities.length
    };
    
    const baseline: Baseline = {
      ...insertBaseline,
      id,
      description: insertBaseline.description ?? null,
      isActive: insertBaseline.isActive ?? null,
      isLocked: insertBaseline.isLocked ?? null,
      snapshotData,
      createdAt: new Date()
    };
    this.baselines.set(id, baseline);
    
    // Update activity baseline fields if this is the active baseline
    if (insertBaseline.isActive) {
      await this.copyToActivityBaselines(projectActivities, id);
    }
    
    return baseline;
  }

  async copyToActivityBaselines(activities: Activity[], baselineId: string): Promise<void> {
    activities.forEach(activity => {
      const existing = this.activities.get(activity.id);
      if (existing) {
        this.activities.set(activity.id, {
          ...existing,
          baselineStart: activity.earlyStart,
          baselineFinish: activity.earlyFinish,
          baselineDuration: activity.originalDuration,
          baselineCost: activity.budgetedCost,
          baselineWork: activity.budgetedCost // Simplified assumption
        });
      }
    });
  }

  async calculateVariance(projectId: string, baselineId?: string): Promise<any[]> {
    const activities = await this.getActivitiesByProject(projectId);
    
    let baseline: Baseline | undefined;
    if (baselineId) {
      baseline = this.baselines.get(baselineId);
    } else {
      baseline = Array.from(this.baselines.values()).find(b => b.projectId === projectId && b.isActive);
    }
    
    if (!baseline || !baseline.snapshotData || !(baseline.snapshotData as any).activities) {
      return [];
    }
    
    const baselineActivities = (baseline.snapshotData as any).activities as any[];
    
    return activities.map(currentActivity => {
      const baselineActivity = baselineActivities.find((ba: any) => ba.activityId === currentActivity.activityId);
      
      if (!baselineActivity) {
        return {
          activityId: currentActivity.activityId,
          name: currentActivity.name,
          startVariance: 0,
          finishVariance: 0,
          durationVariance: 0,
          costVariance: 0
        };
      }
      
      // Calculate date variances in days
      const startVariance = this.calculateDateVariance(currentActivity.earlyStart, baselineActivity.earlyStart);
      const finishVariance = this.calculateDateVariance(currentActivity.earlyFinish, baselineActivity.earlyFinish);
      const durationVariance = (currentActivity.originalDuration || 0) - (baselineActivity.originalDuration || 0);
      const costVariance = (currentActivity.budgetedCost || 0) - (baselineActivity.budgetedCost || 0);
      
      return {
        activityId: currentActivity.activityId,
        name: currentActivity.name,
        currentStart: currentActivity.earlyStart,
        currentFinish: currentActivity.earlyFinish,
        baselineStart: baselineActivity.earlyStart,
        baselineFinish: baselineActivity.earlyFinish,
        startVariance,
        finishVariance,
        durationVariance,
        costVariance,
        isSlipping: finishVariance > 0,
        isCritical: currentActivity.isCritical
      };
    });
  }

  private calculateDateVariance(currentDate: string | null, baselineDate: string | null): number {
    if (!currentDate || !baselineDate) return 0;
    
    const current = new Date(currentDate);
    const baseline = new Date(baselineDate);
    const diffTime = current.getTime() - baseline.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  async setActiveBaseline(projectId: string, baselineId: string): Promise<void> {
    // Deactivate all baselines for the project
    this.baselines.forEach(baseline => {
      if (baseline.projectId === projectId) {
        baseline.isActive = baseline.id === baselineId;
      }
    });
    
    // Update activity baseline fields from snapshot
    const baseline = this.baselines.get(baselineId);
    if (baseline && baseline.snapshotData && (baseline.snapshotData as any).activities) {
      const baselineActivities = (baseline.snapshotData as any).activities as Activity[];
      await this.copyToActivityBaselines(baselineActivities, baselineId);
    }
  }

  async deleteBaseline(id: string): Promise<boolean> {
    return this.baselines.delete(id);
  }

  // TIA Scenarios
  async getTiaScenariosByProject(projectId: string): Promise<TiaScenario[]> {
    return Array.from(this.tiaScenarios.values()).filter(s => s.projectId === projectId);
  }

  async getTiaScenario(id: string): Promise<TiaScenario | undefined> {
    return this.tiaScenarios.get(id);
  }

  async createTiaScenario(insertScenario: InsertTiaScenario): Promise<TiaScenario> {
    const id = randomUUID();
    const scenario: TiaScenario = {
      ...insertScenario,
      id,
      description: insertScenario.description ?? null,
      isActive: insertScenario.isActive ?? null,
      impactType: insertScenario.impactType ?? null,
      createdBy: insertScenario.createdBy ?? null,
      createdAt: new Date()
    };
    this.tiaScenarios.set(id, scenario);
    return scenario;
  }

  async updateTiaScenario(id: string, updates: Partial<TiaScenario>): Promise<TiaScenario | undefined> {
    const existing = this.tiaScenarios.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.tiaScenarios.set(id, updated);
    return updated;
  }

  async deleteTiaScenario(id: string): Promise<boolean> {
    return this.tiaScenarios.delete(id);
  }
  
  // TIA Fragnets
  async getTiaFragnetsByScenario(scenarioId: string): Promise<TiaFragnet[]> {
    return Array.from(this.tiaFragnets.values()).filter(f => f.scenarioId === scenarioId);
  }

  async getTiaFragnet(id: string): Promise<TiaFragnet | undefined> {
    return this.tiaFragnets.get(id);
  }

  async createTiaFragnet(insertFragnet: InsertTiaFragnet): Promise<TiaFragnet> {
    const id = randomUUID();
    const fragnet: TiaFragnet = {
      ...insertFragnet,
      id,
      description: insertFragnet.description ?? null,
      insertionPoint: insertFragnet.insertionPoint ?? null,
      activities: insertFragnet.activities ?? null,
      relationships: insertFragnet.relationships ?? null,
      linkedActivities: insertFragnet.linkedActivities ?? null
    };
    this.tiaFragnets.set(id, fragnet);
    return fragnet;
  }

  async updateTiaFragnet(id: string, updates: Partial<TiaFragnet>): Promise<TiaFragnet | undefined> {
    const existing = this.tiaFragnets.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.tiaFragnets.set(id, updated);
    return updated;
  }

  async deleteTiaFragnet(id: string): Promise<boolean> {
    return this.tiaFragnets.delete(id);
  }
  
  // TIA Delays
  async getTiaDelaysByScenario(scenarioId: string): Promise<TiaDelay[]> {
    return Array.from(this.tiaDelays.values()).filter(d => d.scenarioId === scenarioId);
  }

  async getTiaDelay(id: string): Promise<TiaDelay | undefined> {
    return this.tiaDelays.get(id);
  }

  async createTiaDelay(insertDelay: InsertTiaDelay): Promise<TiaDelay> {
    const id = randomUUID();
    const delay: TiaDelay = {
      ...insertDelay,
      id,
      fragnetId: insertDelay.fragnetId ?? null,
      startDate: insertDelay.startDate ?? null,
      endDate: insertDelay.endDate ?? null,
      description: insertDelay.description ?? null,
      evidence: insertDelay.evidence ?? null
    };
    this.tiaDelays.set(id, delay);
    return delay;
  }

  async updateTiaDelay(id: string, updates: Partial<TiaDelay>): Promise<TiaDelay | undefined> {
    const existing = this.tiaDelays.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.tiaDelays.set(id, updated);
    return updated;
  }

  async deleteTiaDelay(id: string): Promise<boolean> {
    return this.tiaDelays.delete(id);
  }
  
  // TIA Results
  async getTiaResultsByScenario(scenarioId: string): Promise<TiaResult[]> {
    return Array.from(this.tiaResults.values()).filter(r => r.scenarioId === scenarioId);
  }

  async getTiaResult(id: string): Promise<TiaResult | undefined> {
    return this.tiaResults.get(id);
  }

  async createTiaResult(insertResult: InsertTiaResult): Promise<TiaResult> {
    const id = randomUUID();
    const result: TiaResult = {
      ...insertResult,
      id,
      impactedFinishDate: insertResult.impactedFinishDate ?? null,
      unimpactedFinishDate: insertResult.unimpactedFinishDate ?? null,
      netImpactDays: insertResult.netImpactDays ?? null,
      criticalPathChanges: insertResult.criticalPathChanges ?? null,
      floatErosion: insertResult.floatErosion ?? null,
      affectedMilestones: insertResult.affectedMilestones ?? null,
      analysisDate: new Date()
    };
    this.tiaResults.set(id, result);
    return result;
  }
  
  async calculateTiaImpact(scenarioId: string): Promise<TiaResult> {
    // Get the scenario and its delays
    const scenario = await this.getTiaScenario(scenarioId);
    if (!scenario) throw new Error("Scenario not found");
    
    const delays = await this.getTiaDelaysByScenario(scenarioId);
    const fragnets = await this.getTiaFragnetsByScenario(scenarioId);
    const activities = await this.getActivitiesByProject(scenario.projectId);
    
    // Simple TIA calculation (will be replaced with advanced logic later)
    const totalDelayDays = delays.reduce((sum, delay) => sum + (delay.delayDays || 0), 0);
    const currentFinish = activities.reduce((latest, act) => {
      const finish = act.earlyFinish ? new Date(act.earlyFinish) : new Date();
      return finish > latest ? finish : latest;
    }, new Date());
    
    const impactedFinish = new Date(currentFinish);
    impactedFinish.setDate(impactedFinish.getDate() + totalDelayDays);
    
    // Create result
    const result: InsertTiaResult = {
      scenarioId,
      unimpactedFinishDate: currentFinish.toISOString().split('T')[0],
      impactedFinishDate: impactedFinish.toISOString().split('T')[0],
      netImpactDays: totalDelayDays,
      criticalPathChanges: { previousCritical: [], newCritical: [] },
      floatErosion: {},
      affectedMilestones: []
    };
    
    return await this.createTiaResult(result);
  }

  // Schedule Updates
  async getScheduleUpdatesByProject(projectId: string): Promise<ScheduleUpdate[]> {
    return Array.from(this.scheduleUpdates.values()).filter(u => u.projectId === projectId);
  }

  async getScheduleUpdate(id: string): Promise<ScheduleUpdate | undefined> {
    return this.scheduleUpdates.get(id);
  }

  async createScheduleUpdate(insertUpdate: InsertScheduleUpdate): Promise<ScheduleUpdate> {
    const id = randomUUID();
    const update: ScheduleUpdate = {
      ...insertUpdate,
      id,
      narrative: insertUpdate.narrative ?? null,
      changesFromPrevious: insertUpdate.changesFromPrevious ?? null,
      progressData: insertUpdate.progressData ?? null,
      createdBy: insertUpdate.createdBy ?? null,
      approvedBy: insertUpdate.approvedBy ?? null,
      approvalDate: insertUpdate.approvalDate ?? null,
      createdAt: new Date()
    };
    this.scheduleUpdates.set(id, update);
    return update;
  }

  // Activity Comments
  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    return Array.from(this.activityComments.values())
      .filter(c => c.activityId === activityId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createActivityComment(comment: InsertActivityComment): Promise<ActivityComment> {
    const id = randomUUID();
    const newComment: ActivityComment = {
      ...comment,
      id,
      parentId: comment.parentId ?? null,
      authorRole: comment.authorRole ?? null,
      isResolved: comment.isResolved ?? false,
      mentionedUsers: comment.mentionedUsers ?? null,
      attachmentIds: comment.attachmentIds ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.activityComments.set(id, newComment);
    
    // Create audit log
    await this.createAuditLog({
      projectId: comment.projectId,
      entityType: 'comment',
      entityId: id,
      action: 'Create',
      performedBy: comment.authorName,
      notes: `Added comment to activity ${comment.activityId}`
    });
    
    return newComment;
  }

  async resolveComment(commentId: string): Promise<ActivityComment | undefined> {
    const comment = this.activityComments.get(commentId);
    if (!comment) return undefined;
    
    comment.isResolved = true;
    comment.updatedAt = new Date();
    this.activityComments.set(commentId, comment);
    
    // Create audit log
    await this.createAuditLog({
      projectId: comment.projectId,
      entityType: 'comment',
      entityId: commentId,
      action: 'Update',
      performedBy: 'System',
      notes: 'Comment marked as resolved'
    });
    
    return comment;
  }

  // Attachments
  async getAttachmentsByActivity(activityId: string): Promise<Attachment[]> {
    return Array.from(this.attachments.values())
      .filter(a => a.activityId === activityId);
  }

  async getAttachmentsByProject(projectId: string): Promise<Attachment[]> {
    return Array.from(this.attachments.values())
      .filter(a => a.projectId === projectId);
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const id = randomUUID();
    const newAttachment: Attachment = {
      ...attachment,
      id,
      activityId: attachment.activityId ?? null,
      description: attachment.description ?? null,
      category: attachment.category ?? 'Document',
      tags: attachment.tags ?? null,
      uploadedAt: new Date()
    };
    this.attachments.set(id, newAttachment);
    
    // Create audit log
    await this.createAuditLog({
      projectId: attachment.projectId,
      entityType: 'attachment',
      entityId: id,
      action: 'Create',
      performedBy: attachment.uploadedBy,
      notes: `Uploaded file: ${attachment.fileName}`
    });
    
    return newAttachment;
  }

  // Audit Logs
  async getAuditLogs(projectId: string, entityId?: string, entityType?: string): Promise<AuditLog[]> {
    let logs = Array.from(this.auditLogs.values())
      .filter(log => log.projectId === projectId);
    
    if (entityId) {
      logs = logs.filter(log => log.entityId === entityId);
    }
    
    if (entityType) {
      logs = logs.filter(log => log.entityType === entityType);
    }
    
    return logs.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const newLog: AuditLog = {
      ...log,
      id,
      changes: log.changes ?? null,
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
      notes: log.notes ?? null,
      performedAt: new Date()
    };
    this.auditLogs.set(id, newLog);
    return newLog;
  }

  // Project Members
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return Array.from(this.projectMembers.values())
      .filter(m => m.projectId === projectId && m.isActive);
  }

  async createProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    const id = randomUUID();
    const newMember: ProjectMember = {
      ...member,
      id,
      email: member.email ?? null,
      permissions: member.permissions ?? null,
      lastActiveAt: member.lastActiveAt ?? null,
      isActive: member.isActive ?? true,
      joinedAt: new Date()
    };
    this.projectMembers.set(id, newMember);
    
    // Create audit log
    await this.createAuditLog({
      projectId: member.projectId,
      entityType: 'projectMember',
      entityId: id,
      action: 'Create',
      performedBy: 'System',
      notes: `Added ${member.userName} as ${member.role}`
    });
    
    return newMember;
  }

  async updateProjectMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | undefined> {
    const member = this.projectMembers.get(id);
    if (!member) return undefined;
    
    const oldRole = member.role;
    Object.assign(member, updates, { lastActiveAt: new Date() });
    this.projectMembers.set(id, member);
    
    // Create audit log
    if (updates.role && updates.role !== oldRole) {
      await this.createAuditLog({
        projectId: member.projectId,
        entityType: 'projectMember',
        entityId: id,
        action: 'Update',
        performedBy: 'System',
        notes: `Changed role from ${oldRole} to ${updates.role}`,
        changes: { old: { role: oldRole }, new: { role: updates.role } }
      });
    }
    
    return member;
  }

  // Schedule Versions
  async getScheduleVersions(projectId: string): Promise<ScheduleVersion[]> {
    return Array.from(this.scheduleVersions.values())
      .filter(v => v.projectId === projectId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async createScheduleVersion(version: InsertScheduleVersion): Promise<ScheduleVersion> {
    const id = randomUUID();
    const newVersion: ScheduleVersion = {
      ...version,
      id,
      versionName: version.versionName ?? null,
      description: version.description ?? null,
      isAutoSave: version.isAutoSave ?? false,
      changesSummary: version.changesSummary ?? null,
      createdAt: new Date()
    };
    this.scheduleVersions.set(id, newVersion);
    
    // Create audit log
    await this.createAuditLog({
      projectId: version.projectId,
      entityType: 'scheduleVersion',
      entityId: id,
      action: 'Create',
      performedBy: version.createdBy,
      notes: `Created version ${version.versionNumber}: ${version.versionName || 'Auto-save'}`
    });
    
    return newVersion;
  }

  async restoreScheduleVersion(versionId: string): Promise<boolean> {
    const version = this.scheduleVersions.get(versionId);
    if (!version) return false;
    
    // In a real implementation, this would restore the schedule from the snapshot
    // For now, we'll just log the restoration
    await this.createAuditLog({
      projectId: version.projectId,
      entityType: 'scheduleVersion',
      entityId: versionId,
      action: 'Update',
      performedBy: 'System',
      notes: `Restored schedule to version ${version.versionNumber}: ${version.versionName || 'Auto-save'}`
    });
    
    return true;
  }

  // AI Conversations
  async getConversationsByProject(projectId: string): Promise<AiConversation[]> {
    return Array.from(this.aiConversations.values())
      .filter(c => c.projectId === projectId)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  async getConversation(id: string): Promise<AiConversation | undefined> {
    return this.aiConversations.get(id);
  }

  async getActiveConversation(projectId: string): Promise<AiConversation | undefined> {
    const conversations = await this.getConversationsByProject(projectId);
    return conversations[0]; // Most recent conversation
  }

  async createConversation(conversation: InsertAiConversation): Promise<AiConversation> {
    const id = randomUUID();
    const now = new Date();
    const newConversation: AiConversation = {
      ...conversation,
      id,
      title: conversation.title ?? null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now
    };
    this.aiConversations.set(id, newConversation);
    return newConversation;
  }

  async updateConversation(id: string, updates: Partial<AiConversation>): Promise<AiConversation | undefined> {
    const conversation = this.aiConversations.get(id);
    if (!conversation) return undefined;
    
    const updated: AiConversation = {
      ...conversation,
      ...updates,
      updatedAt: new Date()
    };
    this.aiConversations.set(id, updated);
    return updated;
  }

  // AI Messages
  async getMessagesByConversation(conversationId: string): Promise<AiMessage[]> {
    return Array.from(this.aiMessages.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(message: InsertAiMessage): Promise<AiMessage> {
    const id = randomUUID();
    const newMessage: AiMessage = {
      ...message,
      id,
      model: message.model ?? null,
      metadata: message.metadata ?? null,
      createdAt: new Date()
    };
    this.aiMessages.set(id, newMessage);
    
    // Update conversation's lastMessageAt
    await this.updateConversation(message.conversationId, {
      lastMessageAt: newMessage.createdAt
    });
    
    return newMessage;
  }

  // Trade Templates (Adaptive Learning)
  async getTradeTemplates(): Promise<TradeTemplate[]> {
    return Array.from(this.tradeTemplates.values())
      .filter(t => t.isActive)
      .sort((a, b) => a.tradeCategory.localeCompare(b.tradeCategory));
  }

  async getTradeTemplate(id: string): Promise<TradeTemplate | undefined> {
    return this.tradeTemplates.get(id);
  }

  async getTradeTemplatesByCategory(category: string): Promise<TradeTemplate[]> {
    return Array.from(this.tradeTemplates.values())
      .filter(t => t.isActive && t.tradeCategory.toLowerCase().includes(category.toLowerCase()));
  }

  async createTradeTemplate(template: InsertTradeTemplate): Promise<TradeTemplate> {
    const id = randomUUID();
    const newTemplate: TradeTemplate = {
      ...template,
      id,
      description: template.description ?? null,
      isActive: template.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.tradeTemplates.set(id, newTemplate);
    return newTemplate;
  }

  // User Learned Rules
  async getUserLearnedRules(userId: string): Promise<UserLearnedRule[]> {
    return Array.from(this.userLearnedRules.values())
      .filter(r => r.userId === userId && r.isActive)
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  }

  async createUserLearnedRule(rule: InsertUserLearnedRule): Promise<UserLearnedRule> {
    const id = randomUUID();
    const newRule: UserLearnedRule = {
      ...rule,
      id,
      confidenceScore: rule.confidenceScore ?? 50,
      occurrenceCount: rule.occurrenceCount ?? 1,
      lastApplied: rule.lastApplied ?? null,
      isActive: rule.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.userLearnedRules.set(id, newRule);
    return newRule;
  }

  async updateUserLearnedRule(id: string, updates: Partial<UserLearnedRule>): Promise<UserLearnedRule | undefined> {
    const rule = this.userLearnedRules.get(id);
    if (!rule) return undefined;
    
    const updated: UserLearnedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };
    this.userLearnedRules.set(id, updated);
    return updated;
  }

  async deleteUserLearnedRule(id: string): Promise<boolean> {
    return this.userLearnedRules.delete(id);
  }

  async getUserLearnedRuleByKeywords(userId: string, triggerKeyword: string, targetKeyword: string): Promise<UserLearnedRule | undefined> {
    return Array.from(this.userLearnedRules.values())
      .find(r => 
        r.userId === userId && 
        r.triggerKeyword.toLowerCase() === triggerKeyword.toLowerCase() && 
        r.targetKeyword.toLowerCase() === targetKeyword.toLowerCase() &&
        r.isActive
      );
  }

  // Vocabulary Aliases
  async getVocabularyAliases(userId: string): Promise<VocabularyAlias[]> {
    return Array.from(this.vocabularyAliases.values())
      .filter(a => a.userId === userId && a.isActive)
      .sort((a, b) => (b.occurrenceCount ?? 0) - (a.occurrenceCount ?? 0));
  }

  async getVocabularyAlias(userId: string, canonicalTerm: string, aliasTerm: string): Promise<VocabularyAlias | undefined> {
    return Array.from(this.vocabularyAliases.values())
      .find(a => 
        a.userId === userId && 
        a.canonicalTerm.toLowerCase() === canonicalTerm.toLowerCase() && 
        a.aliasTerm.toLowerCase() === aliasTerm.toLowerCase() &&
        a.isActive
      );
  }

  async createVocabularyAlias(alias: InsertVocabularyAlias): Promise<VocabularyAlias> {
    const id = randomUUID();
    const newAlias: VocabularyAlias = {
      ...alias,
      id,
      occurrenceCount: alias.occurrenceCount ?? 1,
      isActive: alias.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.vocabularyAliases.set(id, newAlias);
    return newAlias;
  }

  async updateVocabularyAlias(id: string, updates: Partial<VocabularyAlias>): Promise<VocabularyAlias | undefined> {
    const alias = this.vocabularyAliases.get(id);
    if (!alias) return undefined;
    
    const updated: VocabularyAlias = {
      ...alias,
      ...updates,
      updatedAt: new Date()
    };
    this.vocabularyAliases.set(id, updated);
    return updated;
  }
}

// Import database storage
import { DbStorage } from "./dbStorage";

// Create and export storage instance - using database storage for persistence
export const storage = new DbStorage();