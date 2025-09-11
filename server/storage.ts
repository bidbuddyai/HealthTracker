import { randomUUID } from "crypto";
import type {
  Project, InsertProject, Activity, InsertActivity, Wbs, InsertWbs,
  Calendar, InsertCalendar, Relationship, InsertRelationship,
  Resource, InsertResource, ResourceAssignment, InsertResourceAssignment,
  Baseline, InsertBaseline, TiaScenario, InsertTiaScenario,
  TiaFragnet, InsertTiaFragnet, TiaDelay, InsertTiaDelay,
  TiaResult, InsertTiaResult, ScheduleUpdate, InsertScheduleUpdate,
  ImportExportHistory, InsertImportExportHistory, AiContext, InsertAiContext,
  ActivityCode, InsertActivityCode,
  ActivityComment, InsertActivityComment, Attachment, InsertAttachment,
  AuditLog, InsertAuditLog, ProjectMember, InsertProjectMember,
  ScheduleVersion, InsertScheduleVersion,
  User, UpsertUser
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
  getWbs(id: string): Promise<Wbs | undefined>;
  createWbs(wbs: InsertWbs): Promise<Wbs>;
  updateWbs(id: string, updates: Partial<Wbs>): Promise<Wbs | undefined>;
  deleteWbs(id: string): Promise<boolean>;
  
  // Activities
  getActivitiesByProject(projectId: string): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | undefined>;
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
}

export class MemStorage implements IStorage {
  private projects = new Map<string, Project>();
  private wbs = new Map<string, Wbs>();
  private activities = new Map<string, Activity>();
  private relationships = new Map<string, Relationship>();
  private calendars = new Map<string, Calendar>();
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
  private activityCodes = new Map<string, ActivityCode>();
  private activityComments = new Map<string, ActivityComment>();
  private attachments = new Map<string, Attachment>();
  private auditLogs = new Map<string, AuditLog>();
  private projectMembers = new Map<string, ProjectMember>();
  private scheduleVersions = new Map<string, ScheduleVersion>();
  private users = new Map<string, User>();

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
    return this.wbs.delete(id);
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
      wbsId: insertActivity.wbsId ?? null,
      originalDuration: insertActivity.originalDuration ?? null,
      remainingDuration: insertActivity.remainingDuration ?? null,
      actualDuration: insertActivity.actualDuration ?? null,
      earlyStart: insertActivity.earlyStart ?? null,
      earlyFinish: insertActivity.earlyFinish ?? null,
      lateStart: insertActivity.lateStart ?? null,
      lateFinish: insertActivity.lateFinish ?? null,
      actualStart: insertActivity.actualStart ?? null,
      actualFinish: insertActivity.actualFinish ?? null,
      baselineStart: insertActivity.baselineStart ?? null,
      baselineFinish: insertActivity.baselineFinish ?? null,
      totalFloat: insertActivity.totalFloat ?? null,
      freeFloat: insertActivity.freeFloat ?? null,
      criticalityIndex: insertActivity.criticalityIndex ?? null,
      physicalPercentComplete: insertActivity.physicalPercentComplete ?? null,
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
      id
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
      standardWorkweek: insertCalendar.standardWorkweek ?? null,
      holidays: insertCalendar.holidays ?? null,
      exceptions: insertCalendar.exceptions ?? null
    };
    this.calendars.set(id, calendar);
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
    return this.calendars.delete(id);
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
}

// Create and export storage instance - using in-memory storage
export const storage = new MemStorage();