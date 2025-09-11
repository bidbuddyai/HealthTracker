import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import type { IStorage } from "./storage";
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
import {
  users, projects, wbs, activities, relationships, calendars,
  resources, resourceAssignments, baselines, tiaScenarios, tiaFragnets,
  tiaDelays, tiaResults, scheduleUpdates, importExportHistory,
  aiContext, activityCodes, activityComments, attachments,
  auditLogs, projectMembers, scheduleVersions
} from "@shared/schema";

export class DbStorage implements IStorage {
  // User operations (MANDATORY for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const result = await db
        .insert(users)
        .values({
          id: userData.id!,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          createdAt: userData.createdAt || new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date()
          }
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error upserting user:", error);
      throw error;
    }
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    try {
      return await db.select().from(projects);
    } catch (error) {
      console.error("Error getting projects:", error);
      return [];
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting project:", error);
      return undefined;
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    try {
      const result = await db.insert(projects).values(insertProject).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    try {
      const result = await db
        .update(projects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating project:", error);
      return undefined;
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      const result = await db.delete(projects).where(eq(projects.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting project:", error);
      return false;
    }
  }

  // WBS
  async getWbsByProject(projectId: string): Promise<Wbs[]> {
    try {
      return await db.select().from(wbs).where(eq(wbs.projectId, projectId));
    } catch (error) {
      console.error("Error getting WBS by project:", error);
      return [];
    }
  }

  async getWbs(id: string): Promise<Wbs | undefined> {
    try {
      const result = await db.select().from(wbs).where(eq(wbs.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting WBS:", error);
      return undefined;
    }
  }

  async createWbs(insertWbs: InsertWbs): Promise<Wbs> {
    try {
      const result = await db.insert(wbs).values(insertWbs).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating WBS:", error);
      throw error;
    }
  }

  async updateWbs(id: string, updates: Partial<Wbs>): Promise<Wbs | undefined> {
    try {
      const result = await db
        .update(wbs)
        .set(updates)
        .where(eq(wbs.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating WBS:", error);
      return undefined;
    }
  }

  async deleteWbs(id: string): Promise<boolean> {
    try {
      const result = await db.delete(wbs).where(eq(wbs.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting WBS:", error);
      return false;
    }
  }

  // Activities
  async getActivitiesByProject(projectId: string): Promise<Activity[]> {
    try {
      return await db.select().from(activities).where(eq(activities.projectId, projectId));
    } catch (error) {
      console.error("Error getting activities by project:", error);
      return [];
    }
  }

  async getActivity(id: string): Promise<Activity | undefined> {
    try {
      const result = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting activity:", error);
      return undefined;
    }
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    try {
      const result = await db.insert(activities).values(insertActivity).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating activity:", error);
      throw error;
    }
  }

  async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity | undefined> {
    try {
      const result = await db
        .update(activities)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(activities.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating activity:", error);
      return undefined;
    }
  }

  async deleteActivity(id: string): Promise<boolean> {
    try {
      // First delete all relationships where this activity is involved (predecessor or successor)
      await db.delete(relationships).where(eq(relationships.predecessorId, id));
      await db.delete(relationships).where(eq(relationships.successorId, id));
      
      // Then delete the activity itself
      const result = await db.delete(activities).where(eq(activities.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting activity:", error);
      return false;
    }
  }

  async bulkUpdateActivities(updates: { id: string; updates: Partial<Activity> }[]): Promise<void> {
    try {
      const promises = updates.map(update =>
        db.update(activities)
          .set({ ...update.updates, updatedAt: new Date() })
          .where(eq(activities.id, update.id))
      );
      await Promise.all(promises);
    } catch (error) {
      console.error("Error bulk updating activities:", error);
      throw error;
    }
  }

  // Relationships
  async getRelationshipsByProject(projectId: string): Promise<Relationship[]> {
    try {
      return await db.select().from(relationships).where(eq(relationships.projectId, projectId));
    } catch (error) {
      console.error("Error getting relationships by project:", error);
      return [];
    }
  }

  async getRelationshipsForActivity(activityId: string): Promise<{
    predecessors: Relationship[];
    successors: Relationship[];
  }> {
    try {
      const predecessors = await db.select().from(relationships).where(eq(relationships.successorId, activityId));
      const successors = await db.select().from(relationships).where(eq(relationships.predecessorId, activityId));
      
      return { predecessors, successors };
    } catch (error) {
      console.error("Error getting relationships for activity:", error);
      return { predecessors: [], successors: [] };
    }
  }

  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    try {
      const result = await db.insert(relationships).values(insertRelationship).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating relationship:", error);
      throw error;
    }
  }

  async updateRelationship(id: string, updates: Partial<Relationship>): Promise<Relationship | undefined> {
    try {
      const result = await db
        .update(relationships)
        .set(updates)
        .where(eq(relationships.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating relationship:", error);
      return undefined;
    }
  }

  async deleteRelationship(id: string): Promise<boolean> {
    try {
      const result = await db.delete(relationships).where(eq(relationships.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting relationship:", error);
      return false;
    }
  }

  // Calendars
  async getCalendarsByProject(projectId: string | null): Promise<Calendar[]> {
    try {
      if (projectId === null) {
        return await db.select().from(calendars).where(eq(calendars.projectId, null));
      }
      return await db.select().from(calendars).where(eq(calendars.projectId, projectId));
    } catch (error) {
      console.error("Error getting calendars by project:", error);
      return [];
    }
  }

  async getCalendar(id: string): Promise<Calendar | undefined> {
    try {
      const result = await db.select().from(calendars).where(eq(calendars.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting calendar:", error);
      return undefined;
    }
  }

  async createCalendar(insertCalendar: InsertCalendar): Promise<Calendar> {
    try {
      const result = await db.insert(calendars).values(insertCalendar).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating calendar:", error);
      throw error;
    }
  }

  async updateCalendar(id: string, updates: Partial<Calendar>): Promise<Calendar | undefined> {
    try {
      const result = await db
        .update(calendars)
        .set(updates)
        .where(eq(calendars.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating calendar:", error);
      return undefined;
    }
  }

  async deleteCalendar(id: string): Promise<boolean> {
    try {
      const result = await db.delete(calendars).where(eq(calendars.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting calendar:", error);
      return false;
    }
  }

  // Resources
  async getResourcesByProject(projectId: string): Promise<Resource[]> {
    try {
      return await db.select().from(resources).where(eq(resources.projectId, projectId));
    } catch (error) {
      console.error("Error getting resources by project:", error);
      return [];
    }
  }

  async getResource(id: string): Promise<Resource | undefined> {
    try {
      const result = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting resource:", error);
      return undefined;
    }
  }

  async createResource(insertResource: InsertResource): Promise<Resource> {
    try {
      const result = await db.insert(resources).values(insertResource).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating resource:", error);
      throw error;
    }
  }

  async updateResource(id: string, updates: Partial<Resource>): Promise<Resource | undefined> {
    try {
      const result = await db
        .update(resources)
        .set(updates)
        .where(eq(resources.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating resource:", error);
      return undefined;
    }
  }

  async deleteResource(id: string): Promise<boolean> {
    try {
      const result = await db.delete(resources).where(eq(resources.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting resource:", error);
      return false;
    }
  }

  // Resource Assignments
  async getAssignmentsByActivity(activityId: string): Promise<ResourceAssignment[]> {
    try {
      return await db.select().from(resourceAssignments).where(eq(resourceAssignments.activityId, activityId));
    } catch (error) {
      console.error("Error getting assignments by activity:", error);
      return [];
    }
  }

  async getAssignmentsByResource(resourceId: string): Promise<ResourceAssignment[]> {
    try {
      return await db.select().from(resourceAssignments).where(eq(resourceAssignments.resourceId, resourceId));
    } catch (error) {
      console.error("Error getting assignments by resource:", error);
      return [];
    }
  }

  async createAssignment(insertAssignment: InsertResourceAssignment): Promise<ResourceAssignment> {
    try {
      const result = await db.insert(resourceAssignments).values(insertAssignment).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating assignment:", error);
      throw error;
    }
  }

  async updateAssignment(id: string, updates: Partial<ResourceAssignment>): Promise<ResourceAssignment | undefined> {
    try {
      const result = await db
        .update(resourceAssignments)
        .set(updates)
        .where(eq(resourceAssignments.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating assignment:", error);
      return undefined;
    }
  }

  async deleteAssignment(id: string): Promise<boolean> {
    try {
      const result = await db.delete(resourceAssignments).where(eq(resourceAssignments.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting assignment:", error);
      return false;
    }
  }

  // Baselines
  async getBaselinesByProject(projectId: string): Promise<Baseline[]> {
    try {
      return await db.select().from(baselines).where(eq(baselines.projectId, projectId));
    } catch (error) {
      console.error("Error getting baselines by project:", error);
      return [];
    }
  }

  async getBaseline(id: string): Promise<Baseline | undefined> {
    try {
      const result = await db.select().from(baselines).where(eq(baselines.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting baseline:", error);
      return undefined;
    }
  }

  async createBaseline(insertBaseline: InsertBaseline): Promise<Baseline> {
    try {
      const result = await db.insert(baselines).values(insertBaseline).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating baseline:", error);
      throw error;
    }
  }

  async setActiveBaseline(projectId: string, baselineId: string): Promise<void> {
    try {
      // First, set all baselines for this project to inactive
      await db
        .update(baselines)
        .set({ isActive: false })
        .where(eq(baselines.projectId, projectId));

      // Then set the specified baseline to active
      await db
        .update(baselines)
        .set({ isActive: true })
        .where(and(eq(baselines.id, baselineId), eq(baselines.projectId, projectId)));
    } catch (error) {
      console.error("Error setting active baseline:", error);
      throw error;
    }
  }

  async deleteBaseline(id: string): Promise<boolean> {
    try {
      const result = await db.delete(baselines).where(eq(baselines.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting baseline:", error);
      return false;
    }
  }

  async calculateVariance(projectId: string, baselineId?: string): Promise<any[]> {
    try {
      // This would be a complex calculation comparing current activities against baseline
      // For now, return empty array - can be implemented later based on specific requirements
      console.log("Calculating variance for project:", projectId, "baseline:", baselineId);
      return [];
    } catch (error) {
      console.error("Error calculating variance:", error);
      return [];
    }
  }

  // TIA Scenarios
  async getTiaScenariosByProject(projectId: string): Promise<TiaScenario[]> {
    try {
      return await db.select().from(tiaScenarios).where(eq(tiaScenarios.projectId, projectId));
    } catch (error) {
      console.error("Error getting TIA scenarios by project:", error);
      return [];
    }
  }

  async getTiaScenario(id: string): Promise<TiaScenario | undefined> {
    try {
      const result = await db.select().from(tiaScenarios).where(eq(tiaScenarios.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting TIA scenario:", error);
      return undefined;
    }
  }

  async createTiaScenario(insertTiaScenario: InsertTiaScenario): Promise<TiaScenario> {
    try {
      const result = await db.insert(tiaScenarios).values(insertTiaScenario).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating TIA scenario:", error);
      throw error;
    }
  }

  async updateTiaScenario(id: string, updates: Partial<TiaScenario>): Promise<TiaScenario | undefined> {
    try {
      const result = await db
        .update(tiaScenarios)
        .set(updates)
        .where(eq(tiaScenarios.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating TIA scenario:", error);
      return undefined;
    }
  }

  async deleteTiaScenario(id: string): Promise<boolean> {
    try {
      const result = await db.delete(tiaScenarios).where(eq(tiaScenarios.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting TIA scenario:", error);
      return false;
    }
  }

  // Schedule Updates
  async getScheduleUpdatesByProject(projectId: string): Promise<ScheduleUpdate[]> {
    try {
      return await db.select().from(scheduleUpdates).where(eq(scheduleUpdates.projectId, projectId));
    } catch (error) {
      console.error("Error getting schedule updates by project:", error);
      return [];
    }
  }

  async getScheduleUpdate(id: string): Promise<ScheduleUpdate | undefined> {
    try {
      const result = await db.select().from(scheduleUpdates).where(eq(scheduleUpdates.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting schedule update:", error);
      return undefined;
    }
  }

  async createScheduleUpdate(insertScheduleUpdate: InsertScheduleUpdate): Promise<ScheduleUpdate> {
    try {
      const result = await db.insert(scheduleUpdates).values(insertScheduleUpdate).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating schedule update:", error);
      throw error;
    }
  }

  // Activity Comments
  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    try {
      return await db.select().from(activityComments).where(eq(activityComments.activityId, activityId));
    } catch (error) {
      console.error("Error getting activity comments:", error);
      return [];
    }
  }

  async createActivityComment(insertActivityComment: InsertActivityComment): Promise<ActivityComment> {
    try {
      const result = await db.insert(activityComments).values(insertActivityComment).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating activity comment:", error);
      throw error;
    }
  }

  async resolveComment(commentId: string): Promise<ActivityComment | undefined> {
    try {
      const result = await db
        .update(activityComments)
        .set({ isResolved: true, updatedAt: new Date() })
        .where(eq(activityComments.id, commentId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error resolving comment:", error);
      return undefined;
    }
  }

  // Attachments
  async getAttachmentsByActivity(activityId: string): Promise<Attachment[]> {
    try {
      return await db.select().from(attachments).where(eq(attachments.activityId, activityId));
    } catch (error) {
      console.error("Error getting attachments by activity:", error);
      return [];
    }
  }

  async getAttachmentsByProject(projectId: string): Promise<Attachment[]> {
    try {
      return await db.select().from(attachments).where(eq(attachments.projectId, projectId));
    } catch (error) {
      console.error("Error getting attachments by project:", error);
      return [];
    }
  }

  async createAttachment(insertAttachment: InsertAttachment): Promise<Attachment> {
    try {
      const result = await db.insert(attachments).values(insertAttachment).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating attachment:", error);
      throw error;
    }
  }

  // Audit Logs
  async getAuditLogs(projectId: string, entityId?: string, entityType?: string): Promise<AuditLog[]> {
    try {
      let query = db.select().from(auditLogs).where(eq(auditLogs.projectId, projectId));
      
      if (entityId) {
        query = query.where(and(eq(auditLogs.projectId, projectId), eq(auditLogs.entityId, entityId)));
      }
      
      if (entityType) {
        query = query.where(and(
          eq(auditLogs.projectId, projectId), 
          eq(auditLogs.entityType, entityType),
          entityId ? eq(auditLogs.entityId, entityId) : sql`true`
        ));
      }
      
      return await query;
    } catch (error) {
      console.error("Error getting audit logs:", error);
      return [];
    }
  }

  async createAuditLog(insertAuditLog: InsertAuditLog): Promise<AuditLog> {
    try {
      const result = await db.insert(auditLogs).values(insertAuditLog).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating audit log:", error);
      throw error;
    }
  }

  // Project Members
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    try {
      return await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
    } catch (error) {
      console.error("Error getting project members:", error);
      return [];
    }
  }

  async createProjectMember(insertProjectMember: InsertProjectMember): Promise<ProjectMember> {
    try {
      const result = await db.insert(projectMembers).values(insertProjectMember).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating project member:", error);
      throw error;
    }
  }

  async updateProjectMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | undefined> {
    try {
      const result = await db
        .update(projectMembers)
        .set(updates)
        .where(eq(projectMembers.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating project member:", error);
      return undefined;
    }
  }

  // Schedule Versions
  async getScheduleVersions(projectId: string): Promise<ScheduleVersion[]> {
    try {
      return await db.select().from(scheduleVersions).where(eq(scheduleVersions.projectId, projectId));
    } catch (error) {
      console.error("Error getting schedule versions:", error);
      return [];
    }
  }

  async createScheduleVersion(insertScheduleVersion: InsertScheduleVersion): Promise<ScheduleVersion> {
    try {
      const result = await db.insert(scheduleVersions).values(insertScheduleVersion).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating schedule version:", error);
      throw error;
    }
  }

  async restoreScheduleVersion(versionId: string): Promise<boolean> {
    try {
      // This would be a complex operation to restore activities and relationships from a snapshot
      // For now, just return true - can be implemented later based on specific requirements
      console.log("Restoring schedule version:", versionId);
      return true;
    } catch (error) {
      console.error("Error restoring schedule version:", error);
      return false;
    }
  }
}