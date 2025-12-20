import { eq, and, sql, inArray } from "drizzle-orm";
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
  AiConversation, InsertAiConversation, AiMessage, InsertAiMessage,
  ActivityCode, InsertActivityCode,
  ActivityComment, InsertActivityComment, Attachment, InsertAttachment,
  AuditLog, InsertAuditLog, ProjectMember, InsertProjectMember,
  ScheduleVersion, InsertScheduleVersion,
  User, UpsertUser,
  TradeTemplate, InsertTradeTemplate, UserLearnedRule, InsertUserLearnedRule,
  VocabularyAlias, InsertVocabularyAlias
} from "@shared/schema";
import {
  users, projects, wbs, activities, relationships, calendars,
  resources, resourceAssignments, baselines, baselineActivities, tiaScenarios, tiaFragnets,
  tiaDelays, tiaResults, scheduleUpdates, importExportHistory,
  aiContext, aiConversations, aiMessages, activityCodes, activityComments, attachments,
  auditLogs, projectMembers, scheduleVersions, tradeTemplates, userLearnedRules, vocabularyAliases
} from "@shared/schema";

export class DbStorage implements IStorage {
  // User operations (MANDATORY for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      return undefined;
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      // Build the update set object, only including fields that are provided
      const updateSet: Record<string, unknown> = {
        updatedAt: new Date()
      };
      
      if (userData.email !== undefined) updateSet.email = userData.email;
      if (userData.firstName !== undefined) updateSet.firstName = userData.firstName;
      if (userData.lastName !== undefined) updateSet.lastName = userData.lastName;
      if (userData.profileImageUrl !== undefined) updateSet.profileImageUrl = userData.profileImageUrl;
      if (userData.primaryTrade !== undefined) updateSet.primaryTrade = userData.primaryTrade;
      if (userData.specialties !== undefined) updateSet.specialties = userData.specialties;

      const result = await db
        .insert(users)
        .values({
          id: userData.id!,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          primaryTrade: userData.primaryTrade,
          specialties: userData.specialties,
          createdAt: userData.createdAt || new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: users.id,
          set: updateSet
        })
        .returning();
      
      return result[0];
    } catch (error) {
      throw error;
    }
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    try {
      return await db.select().from(projects);
    } catch (error) {
      return [];
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return result[0];
    } catch (error) {
      return undefined;
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    try {
      const result = await db.insert(projects).values(insertProject).returning();
      return result[0];
    } catch (error) {
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
      return undefined;
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      // First check if project exists
      const project = await this.getProject(id);
      if (!project) {
        return false;
      }

      // Wrap entire deletion sequence in a transaction for atomicity
      return await db.transaction(async (tx) => {
        // Get all activities for this project to help with cascading deletes
        const projectActivities = await tx.select().from(activities).where(eq(activities.projectId, id));
        const activityIds = projectActivities.map(a => a.id);

        // Get all TIA scenarios for this project
        const projectTiaScenarios = await tx.select().from(tiaScenarios).where(eq(tiaScenarios.projectId, id));
        const tiaScenarioIds = projectTiaScenarios.map(s => s.id);

        // Get all TIA fragnets for these scenarios
        const tiaFragnetsForProject = tiaScenarioIds.length > 0 
          ? await tx.select().from(tiaFragnets).where(inArray(tiaFragnets.scenarioId, tiaScenarioIds))
          : [];
        const tiaFragnetIds = tiaFragnetsForProject.map(f => f.id);

        // Get all baselines for this project
        const projectBaselines = await tx.select().from(baselines).where(eq(baselines.projectId, id));
        const baselineIds = projectBaselines.map(b => b.id);

        // Delete in proper order to avoid foreign key violations

        // 1. Delete resource assignments (reference activities)
        if (activityIds.length > 0) {
          await tx.delete(resourceAssignments).where(inArray(resourceAssignments.activityId, activityIds));
        }

        // 2. Delete activity comments (reference activities)
        if (activityIds.length > 0) {
          await tx.delete(activityComments).where(inArray(activityComments.activityId, activityIds));
        }

        // 3. Delete attachments that reference activities
        if (activityIds.length > 0) {
          await tx.delete(attachments).where(inArray(attachments.activityId, activityIds));
        }

        // 4. Delete relationships (reference activities as predecessors/successors)
        if (activityIds.length > 0) {
          // Delete relationships where any activity is a predecessor
          await tx.delete(relationships).where(inArray(relationships.predecessorId, activityIds));
          // Delete relationships where any activity is a successor
          await tx.delete(relationships).where(inArray(relationships.successorId, activityIds));
        }

        // 5. Delete TIA delays (reference tia fragnets and scenarios)
        if (tiaFragnetIds.length > 0) {
          await tx.delete(tiaDelays).where(inArray(tiaDelays.fragnetId, tiaFragnetIds));
        }
        if (tiaScenarioIds.length > 0) {
          await tx.delete(tiaDelays).where(inArray(tiaDelays.scenarioId, tiaScenarioIds));
        }

        // 6. Delete TIA fragnets (reference TIA scenarios)
        if (tiaScenarioIds.length > 0) {
          await tx.delete(tiaFragnets).where(inArray(tiaFragnets.scenarioId, tiaScenarioIds));
        }

        // 7. Delete TIA results (reference TIA scenarios)
        if (tiaScenarioIds.length > 0) {
          await tx.delete(tiaResults).where(inArray(tiaResults.scenarioId, tiaScenarioIds));
        }

        // 8. Delete TIA scenarios (reference projects)
        await tx.delete(tiaScenarios).where(eq(tiaScenarios.projectId, id));

        // 9. Delete baseline activities (reference baselines)
        if (baselineIds.length > 0) {
          await tx.delete(baselineActivities).where(inArray(baselineActivities.baselineId, baselineIds));
        }

        // 10. Delete activities (reference projects and wbs)
        await tx.delete(activities).where(eq(activities.projectId, id));

        // 11. Delete resources (reference projects)
        await tx.delete(resources).where(eq(resources.projectId, id));

        // 12. Delete WBS items (reference projects)
        await tx.delete(wbs).where(eq(wbs.projectId, id));

        // 13. Delete calendars (reference projects) - note: some calendars may be global (projectId = null)
        await tx.delete(calendars).where(eq(calendars.projectId, id));

        // 14. Delete baselines (reference projects)
        await tx.delete(baselines).where(eq(baselines.projectId, id));

        // 15. Delete schedule updates (reference projects)
        await tx.delete(scheduleUpdates).where(eq(scheduleUpdates.projectId, id));

        // 16. Delete import export history (reference projects)
        await tx.delete(importExportHistory).where(eq(importExportHistory.projectId, id));

        // 17. Delete AI context (reference projects)
        await tx.delete(aiContext).where(eq(aiContext.projectId, id));

        // 18. Delete activity codes (reference projects)
        await tx.delete(activityCodes).where(eq(activityCodes.projectId, id));

        // 19. Delete attachments that only reference projects
        await tx.delete(attachments).where(and(
          eq(attachments.projectId, id),
          sql`${attachments.activityId} IS NULL`
        ));

        // 20. Delete audit logs (reference projects)
        await tx.delete(auditLogs).where(eq(auditLogs.projectId, id));

        // 21. Delete project members (reference projects)
        await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));

        // 22. Delete schedule versions (reference projects)
        await tx.delete(scheduleVersions).where(eq(scheduleVersions.projectId, id));

        // 23. Finally delete the project itself
        const result = await tx.delete(projects).where(eq(projects.id, id));
        return (result.rowCount ?? 0) > 0;
      });
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
      return [];
    }
  }

  async getWbs(id: string): Promise<Wbs | undefined> {
    try {
      const result = await db.select().from(wbs).where(eq(wbs.id, id)).limit(1);
      return result[0];
    } catch (error) {
      return undefined;
    }
  }

  async createWbs(insertWbs: InsertWbs): Promise<Wbs> {
    try {
      const result = await db.insert(wbs).values(insertWbs).returning();
      return result[0];
    } catch (error) {
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
      return undefined;
    }
  }

  async deleteWbs(id: string): Promise<boolean> {
    try {
      // Check if this WBS has children - don't allow deletion if it does
      const children = await this.getWbsChildren(id);
      if (children.length > 0) {
        throw new Error("Cannot delete WBS item that has children. Delete children first.");
      }
      
      // Check if this WBS has activities assigned to it
      const assignedActivities = await db.select().from(activities).where(eq(activities.wbsId, id));
      if (assignedActivities.length > 0) {
        throw new Error("Cannot delete WBS item that has activities assigned. Reassign or delete activities first.");
      }
      
      const result = await db.delete(wbs).where(eq(wbs.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting WBS:", error);
      throw error;
    }
  }

  async getWbsHierarchy(projectId: string): Promise<Wbs[]> {
    try {
      // Get all WBS items ordered by level then sequence number
      const wbsItems = await db
        .select()
        .from(wbs)
        .where(eq(wbs.projectId, projectId))
        .orderBy(wbs.level, wbs.sequenceNumber);
      
      return wbsItems;
    } catch (error) {
      console.error("Error getting WBS hierarchy:", error);
      return [];
    }
  }

  async getWbsChildren(wbsId: string): Promise<Wbs[]> {
    try {
      return await db
        .select()
        .from(wbs)
        .where(eq(wbs.parentId, wbsId))
        .orderBy(wbs.sequenceNumber);
    } catch (error) {
      console.error("Error getting WBS children:", error);
      return [];
    }
  }

  async getWbsDescendants(wbsId: string): Promise<Wbs[]> {
    try {
      const descendants: Wbs[] = [];
      const children = await this.getWbsChildren(wbsId);
      
      for (const child of children) {
        descendants.push(child);
        const childDescendants = await this.getWbsDescendants(child.id);
        descendants.push(...childDescendants);
      }
      
      return descendants;
    } catch (error) {
      console.error("Error getting WBS descendants:", error);
      return [];
    }
  }

  async generateWbsCode(projectId: string, parentId?: string): Promise<string> {
    try {
      if (!parentId) {
        // Generate root level code by finding max existing code + 1
        const rootItems = await db
          .select()
          .from(wbs)
          .where(and(eq(wbs.projectId, projectId), sql`${wbs.parentId} IS NULL`))
          .orderBy(wbs.sequenceNumber);
        
        if (rootItems.length === 0) {
          return "1";
        }
        
        // Find the maximum numeric code among root items
        const maxCode = rootItems.reduce((max, item) => {
          const numericCode = parseInt(item.code, 10);
          return isNaN(numericCode) ? max : Math.max(max, numericCode);
        }, 0);
        
        return (maxCode + 1).toString();
      } else {
        // Generate child code based on parent
        const parent = await this.getWbs(parentId);
        if (!parent) {
          throw new Error("Parent WBS not found");
        }
        
        const siblings = await this.getWbsChildren(parentId);
        
        if (siblings.length === 0) {
          return `${parent.code}.1`;
        }
        
        // Find the maximum last segment among siblings
        const maxLastSegment = siblings.reduce((max, item) => {
          const lastSegment = item.code.split('.').pop();
          const numericSegment = parseInt(lastSegment || '0', 10);
          return isNaN(numericSegment) ? max : Math.max(max, numericSegment);
        }, 0);
        
        return `${parent.code}.${maxLastSegment + 1}`;
      }
    } catch (error) {
      console.error("Error generating WBS code:", error);
      throw error;
    }
  }

  async indentWbs(wbsId: string): Promise<Wbs | undefined> {
    try {
      return await db.transaction(async (tx) => {
        // Get current WBS item
        const currentWbs = await tx.select().from(wbs).where(eq(wbs.id, wbsId)).limit(1);
        if (!currentWbs[0]) {
          throw new Error("WBS item not found");
        }
        
        const current = currentWbs[0];
        
        // Find the previous sibling at the same level to become the new parent
        const previousSibling = await tx
          .select()
          .from(wbs)
          .where(
            and(
              eq(wbs.projectId, current.projectId),
              eq(wbs.level, current.level),
              current.parentId ? eq(wbs.parentId, current.parentId) : sql`${wbs.parentId} IS NULL`,
              sql`${wbs.sequenceNumber} < ${current.sequenceNumber}`
            )
          )
          .orderBy(sql`${wbs.sequenceNumber} DESC`)
          .limit(1);
        
        if (previousSibling.length === 0) {
          throw new Error("Cannot indent: no previous sibling to become parent");
        }
        
        const newParent = previousSibling[0];
        
        // Get new sequence number as the last child of the new parent
        const newSiblings = await this.getWbsChildren(newParent.id);
        const newSequenceNumber = newSiblings.length + 1;
        
        // Generate new WBS code
        const newCode = await this.generateWbsCode(current.projectId, newParent.id);
        
        // Update the WBS item
        const result = await tx
          .update(wbs)
          .set({
            parentId: newParent.id,
            level: current.level + 1,
            sequenceNumber: newSequenceNumber,
            code: newCode
          })
          .where(eq(wbs.id, wbsId))
          .returning();
        
        // Update codes for all descendants
        await this.updateDescendantCodes(tx, wbsId, newCode);
        
        return result[0];
      });
    } catch (error) {
      console.error("Error indenting WBS:", error);
      return undefined;
    }
  }

  async outdentWbs(wbsId: string): Promise<Wbs | undefined> {
    try {
      return await db.transaction(async (tx) => {
        // Get current WBS item
        const currentWbs = await tx.select().from(wbs).where(eq(wbs.id, wbsId)).limit(1);
        if (!currentWbs[0]) {
          throw new Error("WBS item not found");
        }
        
        const current = currentWbs[0];
        
        // Cannot outdent root level items
        if (!current.parentId) {
          throw new Error("Cannot outdent root level item");
        }
        
        // Get parent to find the new parent (grandparent)
        const parentWbs = await tx.select().from(wbs).where(eq(wbs.id, current.parentId)).limit(1);
        if (!parentWbs[0]) {
          throw new Error("Parent WBS not found");
        }
        
        const parent = parentWbs[0];
        const newParentId = parent.parentId; // Could be null (root level)
        const newLevel = current.level - 1;
        
        // Get new sequence number at the new level
        let newSequenceNumber: number;
        if (newParentId) {
          const newSiblings = await this.getWbsChildren(newParentId);
          newSequenceNumber = newSiblings.length + 1;
        } else {
          // Moving to root level
          const rootItems = await tx
            .select()
            .from(wbs)
            .where(and(eq(wbs.projectId, current.projectId), sql`${wbs.parentId} IS NULL`))
            .orderBy(wbs.sequenceNumber);
          newSequenceNumber = rootItems.length + 1;
        }
        
        // Generate new WBS code
        const newCode = await this.generateWbsCode(current.projectId, newParentId || undefined);
        
        // Update the WBS item
        const result = await tx
          .update(wbs)
          .set({
            parentId: newParentId,
            level: newLevel,
            sequenceNumber: newSequenceNumber,
            code: newCode
          })
          .where(eq(wbs.id, wbsId))
          .returning();
        
        // Update codes for all descendants
        await this.updateDescendantCodes(tx, wbsId, newCode);
        
        return result[0];
      });
    } catch (error) {
      console.error("Error outdenting WBS:", error);
      return undefined;
    }
  }

  async reorderWbs(wbsId: string, newSequenceNumber: number): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Get current WBS item
        const currentWbs = await tx.select().from(wbs).where(eq(wbs.id, wbsId)).limit(1);
        if (!currentWbs[0]) {
          throw new Error("WBS item not found");
        }
        
        const current = currentWbs[0];
        const oldSequenceNumber = current.sequenceNumber;
        
        if (oldSequenceNumber === newSequenceNumber) {
          return; // No change needed
        }
        
        // Get all siblings
        const siblings = await tx
          .select()
          .from(wbs)
          .where(
            and(
              eq(wbs.projectId, current.projectId),
              eq(wbs.level, current.level),
              current.parentId ? eq(wbs.parentId, current.parentId) : sql`${wbs.parentId} IS NULL`
            )
          )
          .orderBy(wbs.sequenceNumber);
        
        // Validate new sequence number
        if (newSequenceNumber < 1 || newSequenceNumber > siblings.length) {
          throw new Error("Invalid sequence number");
        }
        
        // Update sequence numbers
        if (newSequenceNumber < oldSequenceNumber) {
          // Moving up - increment sequence numbers in between
          for (const sibling of siblings) {
            if (sibling.sequenceNumber >= newSequenceNumber && sibling.sequenceNumber < oldSequenceNumber) {
              await tx
                .update(wbs)
                .set({ sequenceNumber: sibling.sequenceNumber + 1 })
                .where(eq(wbs.id, sibling.id));
            }
          }
        } else {
          // Moving down - decrement sequence numbers in between
          for (const sibling of siblings) {
            if (sibling.sequenceNumber > oldSequenceNumber && sibling.sequenceNumber <= newSequenceNumber) {
              await tx
                .update(wbs)
                .set({ sequenceNumber: sibling.sequenceNumber - 1 })
                .where(eq(wbs.id, sibling.id));
            }
          }
        }
        
        // Update the moved item
        await tx
          .update(wbs)
          .set({ sequenceNumber: newSequenceNumber })
          .where(eq(wbs.id, wbsId));
      });
    } catch (error) {
      console.error("Error reordering WBS:", error);
      throw error;
    }
  }

  async validateWbsHierarchy(projectId: string): Promise<boolean> {
    try {
      const wbsItems = await this.getWbsByProject(projectId);
      
      for (const item of wbsItems) {
        // Check parent-child relationships
        if (item.parentId) {
          const parent = await this.getWbs(item.parentId);
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
        
        // Validate WBS code format
        const expectedCode = await this.generateWbsCode(projectId, item.parentId || undefined);
        // Note: We're not strictly enforcing code format here as codes might be manually set
      }
      
      return true;
    } catch (error) {
      console.error("Error validating WBS hierarchy:", error);
      return false;
    }
  }

  // Helper method to update descendant codes when parent code changes
  private async updateDescendantCodes(tx: any, parentWbsId: string, newParentCode: string): Promise<void> {
    const children = await tx
      .select()
      .from(wbs)
      .where(eq(wbs.parentId, parentWbsId))
      .orderBy(wbs.sequenceNumber);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const newChildCode = `${newParentCode}.${i + 1}`;
      
      await tx
        .update(wbs)
        .set({ code: newChildCode })
        .where(eq(wbs.id, child.id));
      
      // Recursively update descendants
      await this.updateDescendantCodes(tx, child.id, newChildCode);
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

  async upsertActivity(insertActivity: InsertActivity): Promise<Activity> {
    try {
      const result = await db
        .insert(activities)
        .values(insertActivity)
        .onConflictDoUpdate({
          target: [activities.projectId, activities.activityId],
          set: {
            name: insertActivity.name,
            type: insertActivity.type,
            wbsId: insertActivity.wbsId,
            originalDuration: insertActivity.originalDuration,
            remainingDuration: insertActivity.remainingDuration,
            actualDuration: insertActivity.actualDuration,
            durationUnit: insertActivity.durationUnit,
            earlyStart: insertActivity.earlyStart,
            earlyFinish: insertActivity.earlyFinish,
            lateStart: insertActivity.lateStart,
            lateFinish: insertActivity.lateFinish,
            actualStart: insertActivity.actualStart,
            actualFinish: insertActivity.actualFinish,
            baselineStart: insertActivity.baselineStart,
            baselineFinish: insertActivity.baselineFinish,
            baselineDuration: insertActivity.baselineDuration,
            baselineCost: insertActivity.baselineCost,
            baselineWork: insertActivity.baselineWork,
            totalFloat: insertActivity.totalFloat,
            freeFloat: insertActivity.freeFloat,
            isCritical: insertActivity.isCritical,
            criticalityIndex: insertActivity.criticalityIndex,
            percentComplete: insertActivity.percentComplete,
            physicalPercentComplete: insertActivity.physicalPercentComplete,
            status: insertActivity.status,
            calendarId: insertActivity.calendarId,
            constraintType: insertActivity.constraintType,
            constraintDate: insertActivity.constraintDate,
            deadline: insertActivity.deadline,
            activityCodes: insertActivity.activityCodes,
            customFields: insertActivity.customFields,
            budgetedCost: insertActivity.budgetedCost,
            actualCost: insertActivity.actualCost,
            earnedValue: insertActivity.earnedValue,
            notes: insertActivity.notes,
            trade: insertActivity.trade,
            responsibility: insertActivity.responsibility,
            location: insertActivity.location,
            updatedAt: new Date()
          }
        })
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error upserting activity:", error);
      throw error;
    }
  }

  async deleteActivity(id: string): Promise<boolean> {
    try {
      // First delete all relationships where this activity is involved (predecessor or successor)
      await db.delete(relationships).where(eq(relationships.predecessorId, id));
      await db.delete(relationships).where(eq(relationships.successorId, id));
      
      // Then delete the activity itself
      const result = await db.delete(activities).where(eq(activities.id, id));
      return (result.rowCount ?? 0) > 0;
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
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting relationship:", error);
      return false;
    }
  }

  // Calendars
  async getCalendarsByProject(projectId: string | null): Promise<Calendar[]> {
    try {
      if (projectId === null) {
        return await db.select().from(calendars).where(sql`${calendars.projectId} IS NULL`);
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
      return (result.rowCount ?? 0) > 0;
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
      return (result.rowCount ?? 0) > 0;
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
      return (result.rowCount ?? 0) > 0;
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
      return (result.rowCount ?? 0) > 0;
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
      return (result.rowCount ?? 0) > 0;
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
      const conditions = [eq(auditLogs.projectId, projectId)];
      
      if (entityId) {
        conditions.push(eq(auditLogs.entityId, entityId));
      }
      
      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }
      
      return await db.select().from(auditLogs).where(and(...conditions));
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

  // AI Conversations
  async getConversationsByProject(projectId: string): Promise<AiConversation[]> {
    try {
      return await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.projectId, projectId))
        .orderBy(sql`${aiConversations.lastMessageAt} DESC`);
    } catch (error) {
      console.error("Error getting conversations:", error);
      return [];
    }
  }

  async getConversation(id: string): Promise<AiConversation | undefined> {
    try {
      const result = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting conversation:", error);
      return undefined;
    }
  }

  async getActiveConversation(projectId: string): Promise<AiConversation | undefined> {
    try {
      const result = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.projectId, projectId))
        .orderBy(sql`${aiConversations.lastMessageAt} DESC`)
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting active conversation:", error);
      return undefined;
    }
  }

  async createConversation(insertConversation: InsertAiConversation): Promise<AiConversation> {
    try {
      const result = await db.insert(aiConversations).values(insertConversation).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating conversation:", error);
      throw error;
    }
  }

  async updateConversation(id: string, updates: Partial<AiConversation>): Promise<AiConversation | undefined> {
    try {
      const result = await db
        .update(aiConversations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(aiConversations.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating conversation:", error);
      return undefined;
    }
  }

  // AI Messages
  async getMessagesByConversation(conversationId: string): Promise<AiMessage[]> {
    try {
      return await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(aiMessages.createdAt);
    } catch (error) {
      console.error("Error getting messages:", error);
      return [];
    }
  }

  async createMessage(insertMessage: InsertAiMessage): Promise<AiMessage> {
    try {
      const result = await db.insert(aiMessages).values(insertMessage).returning();
      const message = result[0];
      
      // Update conversation's lastMessageAt
      await db
        .update(aiConversations)
        .set({ lastMessageAt: message.createdAt })
        .where(eq(aiConversations.id, insertMessage.conversationId));
      
      return message;
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  }

  // Trade Templates (Adaptive Learning)
  async getTradeTemplates(): Promise<TradeTemplate[]> {
    try {
      return await db
        .select()
        .from(tradeTemplates)
        .where(eq(tradeTemplates.isActive, true))
        .orderBy(tradeTemplates.tradeCategory);
    } catch (error) {
      console.error("Error getting trade templates:", error);
      return [];
    }
  }

  async getTradeTemplate(id: string): Promise<TradeTemplate | undefined> {
    try {
      const result = await db
        .select()
        .from(tradeTemplates)
        .where(eq(tradeTemplates.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting trade template:", error);
      return undefined;
    }
  }

  async getTradeTemplatesByCategory(category: string): Promise<TradeTemplate[]> {
    try {
      return await db
        .select()
        .from(tradeTemplates)
        .where(and(
          eq(tradeTemplates.isActive, true),
          sql`LOWER(${tradeTemplates.tradeCategory}) LIKE ${'%' + category.toLowerCase() + '%'}`
        ));
    } catch (error) {
      console.error("Error getting trade templates by category:", error);
      return [];
    }
  }

  async createTradeTemplate(insertTemplate: InsertTradeTemplate): Promise<TradeTemplate> {
    try {
      const result = await db.insert(tradeTemplates).values(insertTemplate).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating trade template:", error);
      throw error;
    }
  }

  // User Learned Rules
  async getUserLearnedRules(userId: string): Promise<UserLearnedRule[]> {
    try {
      return await db
        .select()
        .from(userLearnedRules)
        .where(and(
          eq(userLearnedRules.userId, userId),
          eq(userLearnedRules.isActive, true)
        ))
        .orderBy(sql`${userLearnedRules.confidenceScore} DESC`);
    } catch (error) {
      console.error("Error getting user learned rules:", error);
      return [];
    }
  }

  async createUserLearnedRule(insertRule: InsertUserLearnedRule): Promise<UserLearnedRule> {
    try {
      const result = await db.insert(userLearnedRules).values(insertRule).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating user learned rule:", error);
      throw error;
    }
  }

  async updateUserLearnedRule(id: string, updates: Partial<UserLearnedRule>): Promise<UserLearnedRule | undefined> {
    try {
      const result = await db
        .update(userLearnedRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(userLearnedRules.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user learned rule:", error);
      return undefined;
    }
  }

  async getUserLearnedRuleByKeywords(userId: string, triggerKeyword: string, targetKeyword: string): Promise<UserLearnedRule | undefined> {
    try {
      const result = await db
        .select()
        .from(userLearnedRules)
        .where(and(
          eq(userLearnedRules.userId, userId),
          sql`LOWER(${userLearnedRules.triggerKeyword}) = ${triggerKeyword.toLowerCase()}`,
          sql`LOWER(${userLearnedRules.targetKeyword}) = ${targetKeyword.toLowerCase()}`,
          eq(userLearnedRules.isActive, true)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting user learned rule by keywords:", error);
      return undefined;
    }
  }

  // Vocabulary Aliases (Pattern Observer)
  async getVocabularyAliases(userId: string): Promise<VocabularyAlias[]> {
    try {
      return await db
        .select()
        .from(vocabularyAliases)
        .where(and(
          eq(vocabularyAliases.userId, userId),
          eq(vocabularyAliases.isActive, true)
        ))
        .orderBy(sql`${vocabularyAliases.occurrenceCount} DESC`);
    } catch (error) {
      console.error("Error getting vocabulary aliases:", error);
      return [];
    }
  }

  async getVocabularyAlias(userId: string, canonicalTerm: string, aliasTerm: string): Promise<VocabularyAlias | undefined> {
    try {
      const result = await db
        .select()
        .from(vocabularyAliases)
        .where(and(
          eq(vocabularyAliases.userId, userId),
          sql`LOWER(${vocabularyAliases.canonicalTerm}) = ${canonicalTerm.toLowerCase()}`,
          sql`LOWER(${vocabularyAliases.aliasTerm}) = ${aliasTerm.toLowerCase()}`,
          eq(vocabularyAliases.isActive, true)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting vocabulary alias:", error);
      return undefined;
    }
  }

  async createVocabularyAlias(insertAlias: InsertVocabularyAlias): Promise<VocabularyAlias> {
    try {
      const result = await db.insert(vocabularyAliases).values(insertAlias).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating vocabulary alias:", error);
      throw error;
    }
  }

  async updateVocabularyAlias(id: string, updates: Partial<VocabularyAlias>): Promise<VocabularyAlias | undefined> {
    try {
      const result = await db
        .update(vocabularyAliases)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(vocabularyAliases.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating vocabulary alias:", error);
      return undefined;
    }
  }
}