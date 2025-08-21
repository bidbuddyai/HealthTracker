import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "@shared/schema";
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
import type { IStorage } from "./storage";
import * as ws from "ws";

// Configure Neon to use WebSocket
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export class ScheduleDbStorage implements IStorage {
  // User operations (MANDATORY for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(schema.users)
      .values(userData)
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(schema.projects).values({
      ...project,
      colorPrimary: project.colorPrimary || "#10b981",
      colorSecondary: project.colorSecondary || "#059669",
    }).returning();
    return newProject;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const [updated] = await db
      .update(schema.projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(schema.projects).where(eq(schema.projects.id, id));
    return !!result;
  }

  // WBS
  async getWbsByProject(projectId: string): Promise<Wbs[]> {
    return await db.select().from(schema.wbs).where(eq(schema.wbs.projectId, projectId));
  }

  async getWbs(id: string): Promise<Wbs | undefined> {
    const [wbs] = await db.select().from(schema.wbs).where(eq(schema.wbs.id, id));
    return wbs;
  }

  async createWbs(wbs: InsertWbs): Promise<Wbs> {
    const [newWbs] = await db.insert(schema.wbs).values(wbs).returning();
    return newWbs;
  }

  async updateWbs(id: string, updates: Partial<Wbs>): Promise<Wbs | undefined> {
    const [updated] = await db
      .update(schema.wbs)
      .set(updates)
      .where(eq(schema.wbs.id, id))
      .returning();
    return updated;
  }

  async deleteWbs(id: string): Promise<boolean> {
    const result = await db.delete(schema.wbs).where(eq(schema.wbs.id, id));
    return !!result;
  }

  // Activities
  async getActivitiesByProject(projectId: string): Promise<Activity[]> {
    return await db.select().from(schema.activities).where(eq(schema.activities.projectId, projectId));
  }

  async getActivity(id: string): Promise<Activity | undefined> {
    const [activity] = await db.select().from(schema.activities).where(eq(schema.activities.id, id));
    return activity;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [newActivity] = await db.insert(schema.activities).values(activity).returning();
    return newActivity;
  }

  async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | undefined> {
    const [updated] = await db
      .update(schema.activities)
      .set(updates)
      .where(eq(schema.activities.id, id))
      .returning();
    return updated;
  }

  async deleteActivity(id: string): Promise<boolean> {
    const result = await db.delete(schema.activities).where(eq(schema.activities.id, id));
    return !!result;
  }

  async bulkUpdateActivities(updates: { id: string; updates: Partial<Activity> }[]): Promise<void> {
    for (const { id, updates: activityUpdates } of updates) {
      await this.updateActivity(id, activityUpdates);
    }
  }

  // Relationships
  async getRelationshipsByProject(projectId: string): Promise<Relationship[]> {
    return await db.select().from(schema.relationships)
      .innerJoin(schema.activities, eq(schema.relationships.predecessorId, schema.activities.id))
      .where(eq(schema.activities.projectId, projectId))
      .then(results => results.map(r => r.relationships));
  }

  async getRelationshipsForActivity(activityId: string): Promise<{
    predecessors: Relationship[];
    successors: Relationship[];
  }> {
    const [predecessors, successors] = await Promise.all([
      db.select().from(schema.relationships).where(eq(schema.relationships.successorId, activityId)),
      db.select().from(schema.relationships).where(eq(schema.relationships.predecessorId, activityId)),
    ]);
    return { predecessors, successors };
  }

  async createRelationship(relationship: InsertRelationship): Promise<Relationship> {
    const [newRel] = await db.insert(schema.relationships).values(relationship).returning();
    return newRel;
  }

  async updateRelationship(id: string, updates: Partial<Relationship>): Promise<Relationship | undefined> {
    const [updated] = await db
      .update(schema.relationships)
      .set(updates)
      .where(eq(schema.relationships.id, id))
      .returning();
    return updated;
  }

  async deleteRelationship(id: string): Promise<boolean> {
    const result = await db.delete(schema.relationships).where(eq(schema.relationships.id, id));
    return !!result;
  }

  // Calendars
  async getCalendarsByProject(projectId: string | null): Promise<Calendar[]> {
    if (projectId === null) {
      return await db.select().from(schema.calendars).where(isNull(schema.calendars.projectId));
    }
    return await db.select().from(schema.calendars)
      .where(or(eq(schema.calendars.projectId, projectId), isNull(schema.calendars.projectId)));
  }

  async getCalendar(id: string): Promise<Calendar | undefined> {
    const [calendar] = await db.select().from(schema.calendars).where(eq(schema.calendars.id, id));
    return calendar;
  }

  async createCalendar(calendar: InsertCalendar): Promise<Calendar> {
    const [newCalendar] = await db.insert(schema.calendars).values(calendar).returning();
    return newCalendar;
  }

  async updateCalendar(id: string, updates: Partial<Calendar>): Promise<Calendar | undefined> {
    const [updated] = await db
      .update(schema.calendars)
      .set(updates)
      .where(eq(schema.calendars.id, id))
      .returning();
    return updated;
  }

  async deleteCalendar(id: string): Promise<boolean> {
    const result = await db.delete(schema.calendars).where(eq(schema.calendars.id, id));
    return !!result;
  }

  // Resources
  async getResourcesByProject(projectId: string): Promise<Resource[]> {
    return await db.select().from(schema.resources).where(eq(schema.resources.projectId, projectId));
  }

  async getResource(id: string): Promise<Resource | undefined> {
    const [resource] = await db.select().from(schema.resources).where(eq(schema.resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [newResource] = await db.insert(schema.resources).values(resource).returning();
    return newResource;
  }

  async updateResource(id: string, updates: Partial<Resource>): Promise<Resource | undefined> {
    const [updated] = await db
      .update(schema.resources)
      .set(updates)
      .where(eq(schema.resources.id, id))
      .returning();
    return updated;
  }

  async deleteResource(id: string): Promise<boolean> {
    const result = await db.delete(schema.resources).where(eq(schema.resources.id, id));
    return !!result;
  }

  // Resource Assignments
  async getAssignmentsByActivity(activityId: string): Promise<ResourceAssignment[]> {
    return await db.select().from(schema.resourceAssignments)
      .where(eq(schema.resourceAssignments.activityId, activityId));
  }

  async getAssignmentsByResource(resourceId: string): Promise<ResourceAssignment[]> {
    return await db.select().from(schema.resourceAssignments)
      .where(eq(schema.resourceAssignments.resourceId, resourceId));
  }

  async createAssignment(assignment: InsertResourceAssignment): Promise<ResourceAssignment> {
    const [newAssignment] = await db.insert(schema.resourceAssignments).values(assignment).returning();
    return newAssignment;
  }

  async updateAssignment(id: string, updates: Partial<ResourceAssignment>): Promise<ResourceAssignment | undefined> {
    const [updated] = await db
      .update(schema.resourceAssignments)
      .set(updates)
      .where(eq(schema.resourceAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteAssignment(id: string): Promise<boolean> {
    const result = await db.delete(schema.resourceAssignments).where(eq(schema.resourceAssignments.id, id));
    return !!result;
  }

  // Baselines - stub implementations for now
  async getBaselinesByProject(projectId: string): Promise<Baseline[]> {
    return [];
  }

  async getBaseline(id: string): Promise<Baseline | undefined> {
    return undefined;
  }

  async createBaseline(baseline: InsertBaseline): Promise<Baseline> {
    throw new Error("Baselines not yet implemented");
  }

  async setActiveBaseline(projectId: string, baselineId: string): Promise<void> {
    // Stub implementation
    return;
  }

  async deleteBaseline(id: string): Promise<boolean> {
    return false;
  }

  async calculateVariance(projectId: string, baselineId?: string): Promise<any[]> {
    // Stub implementation
    return [];
  }

  // TIA Scenarios - stub implementations
  async getTiaScenariosByProject(projectId: string): Promise<TiaScenario[]> {
    return [];
  }

  async getTiaScenario(id: string): Promise<TiaScenario | undefined> {
    return undefined;
  }

  async createTiaScenario(scenario: InsertTiaScenario): Promise<TiaScenario> {
    throw new Error("TIA scenarios not yet implemented");
  }

  async updateTiaScenario(id: string, updates: Partial<TiaScenario>): Promise<TiaScenario | undefined> {
    return undefined;
  }

  async deleteTiaScenario(id: string): Promise<boolean> {
    return false;
  }

  // TIA Fragnets - stub implementations
  async getFragnetsByScenario(scenarioId: string): Promise<TiaFragnet[]> {
    return [];
  }

  async createFragnet(fragnet: InsertTiaFragnet): Promise<TiaFragnet> {
    throw new Error("TIA fragnets not yet implemented");
  }

  async deleteFragnet(id: string): Promise<boolean> {
    return false;
  }

  // TIA Delays - stub implementations
  async getDelaysByScenario(scenarioId: string): Promise<TiaDelay[]> {
    return [];
  }

  async createDelay(delay: InsertTiaDelay): Promise<TiaDelay> {
    throw new Error("TIA delays not yet implemented");
  }

  async deleteDelay(id: string): Promise<boolean> {
    return false;
  }

  // TIA Results - stub implementations
  async getTiaResult(scenarioId: string): Promise<TiaResult | undefined> {
    return undefined;
  }

  async saveTiaResult(result: InsertTiaResult): Promise<TiaResult> {
    throw new Error("TIA results not yet implemented");
  }

  // Schedule Updates - stub implementations
  async getScheduleUpdatesByProject(projectId: string): Promise<ScheduleUpdate[]> {
    return [];
  }

  async getScheduleUpdate(id: string): Promise<ScheduleUpdate | undefined> {
    return undefined;
  }

  async createScheduleUpdate(update: InsertScheduleUpdate): Promise<ScheduleUpdate> {
    throw new Error("Schedule updates not yet implemented");
  }

  // Import/Export History - stub implementations
  async getImportExportHistory(projectId: string): Promise<ImportExportHistory[]> {
    return [];
  }

  async createImportExportRecord(record: InsertImportExportHistory): Promise<ImportExportHistory> {
    throw new Error("Import/export history not yet implemented");
  }

  // AI Context - stub implementations
  async getAiContext(projectId: string): Promise<AiContext | undefined> {
    return undefined;
  }

  async saveAiContext(context: InsertAiContext): Promise<AiContext> {
    throw new Error("AI context not yet implemented");
  }

  // Activity Codes - stub implementations
  async getActivityCodesByProject(projectId: string): Promise<ActivityCode[]> {
    return [];
  }

  async getActivityCode(id: string): Promise<ActivityCode | undefined> {
    return undefined;
  }

  async createActivityCode(code: InsertActivityCode): Promise<ActivityCode> {
    throw new Error("Activity codes not yet implemented");
  }

  async updateActivityCode(id: string, updates: Partial<ActivityCode>): Promise<ActivityCode | undefined> {
    return undefined;
  }

  async deleteActivityCode(id: string): Promise<boolean> {
    return false;
  }

  // Activity Comments - stub implementations
  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    return [];
  }

  async createActivityComment(comment: InsertActivityComment): Promise<ActivityComment> {
    throw new Error("Activity comments not yet implemented");
  }

  async resolveComment(commentId: string): Promise<ActivityComment | undefined> {
    return undefined;
  }

  // Attachments - stub implementations
  async getAttachmentsByActivity(activityId: string): Promise<Attachment[]> {
    return [];
  }

  async getAttachmentsByProject(projectId: string): Promise<Attachment[]> {
    return [];
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    throw new Error("Attachments not yet implemented");
  }

  // Audit Logs - stub implementations
  async getAuditLogs(projectId: string, entityId?: string, entityType?: string): Promise<AuditLog[]> {
    return [];
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    throw new Error("Audit logs not yet implemented");
  }

  // Project Members - stub implementations
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return [];
  }

  async createProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    throw new Error("Project members not yet implemented");
  }

  async updateProjectMember(memberId: string, updates: Partial<ProjectMember>): Promise<ProjectMember | undefined> {
    return undefined;
  }

  // Schedule Versions - stub implementations
  async getScheduleVersions(projectId: string): Promise<ScheduleVersion[]> {
    return [];
  }

  async createScheduleVersion(version: InsertScheduleVersion): Promise<ScheduleVersion> {
    throw new Error("Schedule versions not yet implemented");
  }

  async restoreScheduleVersion(versionId: string): Promise<boolean> {
    return false;
  }
}