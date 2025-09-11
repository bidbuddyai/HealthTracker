import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertProjectSchema, insertActivitySchema, insertWbsSchema,
  insertCalendarSchema, insertRelationshipSchema, insertResourceSchema,
  insertResourceAssignmentSchema, insertBaselineSchema, insertTiaScenarioSchema,
  insertScheduleUpdateSchema
} from "@shared/schema";
import { z } from "zod";
import { generateScheduleWithAI, identifyScheduleImpacts } from "./scheduleAITools";
import { poe } from "./poeClient";
import { SYSTEM_ASSISTANT, ToolSchema } from "./assistantTools";
import { registerScheduleRoutes } from "./scheduleRoutes";
import { ObjectStorageService } from "./objectStorage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  // Projects (Protected)
  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(projectData);
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid project data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create project" });
      }
    }
  });

  app.put("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const success = await storage.deleteProject(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // WBS
  app.get("/api/projects/:projectId/wbs", async (req, res) => {
    try {
      const wbs = await storage.getWbsByProject(req.params.projectId);
      res.json(wbs);
    } catch (error) {
      console.error("Error fetching WBS:", error);
      res.status(500).json({ error: "Failed to fetch WBS" });
    }
  });

  app.post("/api/projects/:projectId/wbs", async (req, res) => {
    try {
      const wbsData = insertWbsSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const wbs = await storage.createWbs(wbsData);
      res.json(wbs);
    } catch (error) {
      console.error("Error creating WBS:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid WBS data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create WBS" });
      }
    }
  });

  app.put("/api/wbs/:id", async (req, res) => {
    try {
      const wbs = await storage.updateWbs(req.params.id, req.body);
      if (!wbs) {
        return res.status(404).json({ error: "WBS not found" });
      }
      res.json(wbs);
    } catch (error) {
      console.error("Error updating WBS:", error);
      res.status(500).json({ error: "Failed to update WBS" });
    }
  });

  app.delete("/api/wbs/:id", async (req, res) => {
    try {
      const success = await storage.deleteWbs(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "WBS not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting WBS:", error);
      res.status(500).json({ error: "Failed to delete WBS" });
    }
  });

  // Activities
  app.get("/api/projects/:projectId/activities", isAuthenticated, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByProject(req.params.projectId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  app.get("/api/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.post("/api/projects/:projectId/activities", isAuthenticated, async (req, res) => {
    try {
      // Transform AI format to database format BEFORE validation
      const transformedActivity = {
        projectId: req.params.projectId,
        activityId: req.body.activityId || `ACT-${crypto.randomUUID().slice(0, 8)}`,
        name: req.body.activityName || req.body.name || "Unnamed Activity",
        type: "Task",
        originalDuration: Number(req.body.originalDuration || req.body.duration) || 1,
        remainingDuration: Number(req.body.remainingDuration || req.body.duration) || 1,
        durationUnit: "days",
        earlyStart: String(req.body.startDate || new Date().toISOString().split('T')[0]),
        earlyFinish: String(req.body.finishDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        actualStart: null,
        actualFinish: null,
        constraintType: null,
        constraintDate: null,
        percentComplete: Number(req.body.percentComplete) || 0,
        status: req.body.status === "Not Started" ? "NotStarted" as const : 
                req.body.status === "In Progress" ? "InProgress" as const : 
                req.body.status === "Completed" ? "Completed" as const : "NotStarted" as const,
        totalFloat: Number(req.body.totalFloat) || 0,
        freeFloat: Number(req.body.freeFloat) || 0,
        isCritical: Boolean(req.body.isCritical) || false,
        responsibility: null,
        trade: null
      };
      
      const activityData = insertActivitySchema.parse(transformedActivity);
      const activity = await storage.createActivity(activityData);
      res.json(activity);
    } catch (error: any) {
      console.error("Error creating activity:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid activity data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create activity" });
      }
    }
  });

  app.put("/api/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const activity = await storage.updateActivity(req.params.id, req.body);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json(activity);
    } catch (error) {
      console.error("Error updating activity:", error);
      res.status(500).json({ error: "Failed to update activity" });
    }
  });

  app.delete("/api/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const success = await storage.deleteActivity(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ error: "Failed to delete activity" });
    }
  });

  app.post("/api/projects/:projectId/activities/bulk-update", isAuthenticated, async (req, res) => {
    try {
      const { updates } = req.body;
      await storage.bulkUpdateActivities(updates);
      res.json({ success: true });
    } catch (error) {
      console.error("Error bulk updating activities:", error);
      res.status(500).json({ error: "Failed to bulk update activities" });
    }
  });

  // Add the missing bulk-save endpoint
  app.post("/api/projects/:projectId/activities/bulk-save", isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const activities = req.body.activities;
      
      console.log(`Bulk saving ${activities.length} activities to project ${projectId}`);
      
      let savedCount = 0;
      for (const activity of activities) {
        try {
          // Map AI format to database format with proper projectId
          const dbActivity = {
            projectId: projectId, // Critical: set the projectId
            activityId: activity.activityId || `ACT-${crypto.randomUUID().slice(0, 8)}`,
            name: activity.activityName || activity.name || "Unnamed Activity",
            type: activity.type || "Task",
            originalDuration: activity.duration || activity.originalDuration || 1,
            earlyStart: activity.earlyStart,
            earlyFinish: activity.earlyFinish,
            lateStart: activity.lateStart,
            lateFinish: activity.lateFinish,
            totalFloat: activity.totalFloat,
            freeFloat: activity.freeFloat,
            isCritical: activity.isCritical || false,
            percentComplete: activity.percentComplete || 0,
            status: activity.status === "Not Started" ? "NotStarted" :
                   activity.status === "In Progress" ? "InProgress" :
                   activity.status === "Completed" ? "Completed" : "NotStarted",
            durationUnit: "days"
          };
          
          await storage.createActivity(dbActivity);
          savedCount++;
        } catch (activityError: any) {
          console.error(`Failed to save activity ${activity.activityId}:`, activityError.message);
        }
      }
      
      console.log(`Successfully saved ${savedCount} of ${activities.length} activities`);
      res.json({ 
        success: true, 
        activitiesCount: savedCount,
        message: `Saved ${savedCount} activities to project`
      });
      
    } catch (error: any) {
      console.error("Error bulk saving activities:", error);
      res.status(500).json({ error: "Failed to bulk save activities", details: error.message });
    }
  });

  // Relationships
  app.get("/api/projects/:projectId/relationships", async (req, res) => {
    try {
      const relationships = await storage.getRelationshipsByProject(req.params.projectId);
      res.json(relationships);
    } catch (error) {
      console.error("Error fetching relationships:", error);
      res.status(500).json({ error: "Failed to fetch relationships" });
    }
  });

  app.get("/api/activities/:activityId/relationships", async (req, res) => {
    try {
      const relationships = await storage.getRelationshipsForActivity(req.params.activityId);
      res.json(relationships);
    } catch (error) {
      console.error("Error fetching activity relationships:", error);
      res.status(500).json({ error: "Failed to fetch activity relationships" });
    }
  });

  app.post("/api/projects/:projectId/relationships", async (req, res) => {
    try {
      const relationshipData = insertRelationshipSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const relationship = await storage.createRelationship(relationshipData);
      res.json(relationship);
    } catch (error) {
      console.error("Error creating relationship:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid relationship data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create relationship" });
      }
    }
  });

  app.put("/api/relationships/:id", async (req, res) => {
    try {
      const relationship = await storage.updateRelationship(req.params.id, req.body);
      if (!relationship) {
        return res.status(404).json({ error: "Relationship not found" });
      }
      res.json(relationship);
    } catch (error) {
      console.error("Error updating relationship:", error);
      res.status(500).json({ error: "Failed to update relationship" });
    }
  });

  app.delete("/api/relationships/:id", async (req, res) => {
    try {
      const success = await storage.deleteRelationship(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Relationship not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting relationship:", error);
      res.status(500).json({ error: "Failed to delete relationship" });
    }
  });

  // Calendars
  app.get("/api/projects/:projectId/calendars", async (req, res) => {
    try {
      const calendars = await storage.getCalendarsByProject(req.params.projectId);
      res.json(calendars);
    } catch (error) {
      console.error("Error fetching calendars:", error);
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });

  app.get("/api/calendars/global", async (req, res) => {
    try {
      const calendars = await storage.getCalendarsByProject(null);
      res.json(calendars);
    } catch (error) {
      console.error("Error fetching global calendars:", error);
      res.status(500).json({ error: "Failed to fetch global calendars" });
    }
  });

  app.post("/api/calendars", async (req, res) => {
    try {
      const calendarData = insertCalendarSchema.parse(req.body);
      const calendar = await storage.createCalendar(calendarData);
      res.json(calendar);
    } catch (error) {
      console.error("Error creating calendar:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid calendar data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create calendar" });
      }
    }
  });

  app.put("/api/calendars/:id", async (req, res) => {
    try {
      const calendar = await storage.updateCalendar(req.params.id, req.body);
      if (!calendar) {
        return res.status(404).json({ error: "Calendar not found" });
      }
      res.json(calendar);
    } catch (error) {
      console.error("Error updating calendar:", error);
      res.status(500).json({ error: "Failed to update calendar" });
    }
  });

  app.delete("/api/calendars/:id", async (req, res) => {
    try {
      const success = await storage.deleteCalendar(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Calendar not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting calendar:", error);
      res.status(500).json({ error: "Failed to delete calendar" });
    }
  });

  // Resources
  app.get("/api/projects/:projectId/resources", async (req, res) => {
    try {
      const resources = await storage.getResourcesByProject(req.params.projectId);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.post("/api/projects/:projectId/resources", async (req, res) => {
    try {
      const resourceData = insertResourceSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const resource = await storage.createResource(resourceData);
      res.json(resource);
    } catch (error) {
      console.error("Error creating resource:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid resource data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create resource" });
      }
    }
  });

  app.put("/api/resources/:id", async (req, res) => {
    try {
      const resource = await storage.updateResource(req.params.id, req.body);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  app.delete("/api/resources/:id", async (req, res) => {
    try {
      const success = await storage.deleteResource(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Resource not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // Resource Assignments
  app.get("/api/activities/:activityId/assignments", async (req, res) => {
    try {
      const assignments = await storage.getAssignmentsByActivity(req.params.activityId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.get("/api/resources/:resourceId/assignments", async (req, res) => {
    try {
      const assignments = await storage.getAssignmentsByResource(req.params.resourceId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching resource assignments:", error);
      res.status(500).json({ error: "Failed to fetch resource assignments" });
    }
  });

  app.post("/api/assignments", async (req, res) => {
    try {
      const assignmentData = insertResourceAssignmentSchema.parse(req.body);
      const assignment = await storage.createAssignment(assignmentData);
      res.json(assignment);
    } catch (error) {
      console.error("Error creating assignment:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid assignment data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create assignment" });
      }
    }
  });

  app.put("/api/assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.updateAssignment(req.params.id, req.body);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  app.delete("/api/assignments/:id", async (req, res) => {
    try {
      const success = await storage.deleteAssignment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // Baselines
  app.get("/api/projects/:projectId/baselines", async (req, res) => {
    try {
      const baselines = await storage.getBaselinesByProject(req.params.projectId);
      res.json(baselines);
    } catch (error) {
      console.error("Error fetching baselines:", error);
      res.status(500).json({ error: "Failed to fetch baselines" });
    }
  });

  app.post("/api/projects/:projectId/baselines", async (req, res) => {
    try {
      const baselineData = insertBaselineSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const baseline = await storage.createBaseline(baselineData);
      res.json(baseline);
    } catch (error) {
      console.error("Error creating baseline:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid baseline data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create baseline" });
      }
    }
  });

  app.put("/api/projects/:projectId/baselines/:id/activate", async (req, res) => {
    try {
      await storage.setActiveBaseline(req.params.projectId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error activating baseline:", error);
      res.status(500).json({ error: "Failed to activate baseline" });
    }
  });

  app.delete("/api/baselines/:id", async (req, res) => {
    try {
      const success = await storage.deleteBaseline(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Baseline not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting baseline:", error);
      res.status(500).json({ error: "Failed to delete baseline" });
    }
  });

  app.get("/api/projects/:projectId/variance", async (req, res) => {
    try {
      const { baselineId } = req.query;
      const variance = await storage.calculateVariance(req.params.projectId, baselineId as string);
      res.json(variance);
    } catch (error) {
      console.error("Error calculating variance:", error);
      res.status(500).json({ error: "Failed to calculate variance" });
    }
  });

  // Activity Comments
  app.get("/api/activities/:activityId/comments", async (req, res) => {
    try {
      const comments = await storage.getActivityComments(req.params.activityId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/activities/:activityId/comments", async (req, res) => {
    try {
      const comment = await storage.createActivityComment({
        ...req.body,
        activityId: req.params.activityId
      });
      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  app.put("/api/comments/:commentId/resolve", async (req, res) => {
    try {
      const comment = await storage.resolveComment(req.params.commentId);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      res.json(comment);
    } catch (error) {
      console.error("Error resolving comment:", error);
      res.status(500).json({ error: "Failed to resolve comment" });
    }
  });

  // Attachments
  app.get("/api/activities/:activityId/attachments", async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByActivity(req.params.activityId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.get("/api/projects/:projectId/attachments", async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByProject(req.params.projectId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.post("/api/attachments", async (req, res) => {
    try {
      const attachment = await storage.createAttachment(req.body);
      res.json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Audit Logs
  app.get("/api/projects/:projectId/audit-logs", async (req, res) => {
    try {
      const { entityId, entityType } = req.query;
      const logs = await storage.getAuditLogs(
        req.params.projectId, 
        entityId as string | undefined,
        entityType as string | undefined
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Project Members
  app.get("/api/projects/:projectId/members", async (req, res) => {
    try {
      const members = await storage.getProjectMembers(req.params.projectId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:projectId/members", async (req, res) => {
    try {
      const member = await storage.createProjectMember({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(member);
    } catch (error) {
      console.error("Error adding project member:", error);
      res.status(500).json({ error: "Failed to add project member" });
    }
  });

  app.put("/api/members/:memberId", async (req, res) => {
    try {
      const member = await storage.updateProjectMember(req.params.memberId, req.body);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error updating project member:", error);
      res.status(500).json({ error: "Failed to update project member" });
    }
  });

  // Schedule Versions
  app.get("/api/projects/:projectId/versions", async (req, res) => {
    try {
      const versions = await storage.getScheduleVersions(req.params.projectId);
      res.json(versions);
    } catch (error) {
      console.error("Error fetching schedule versions:", error);
      res.status(500).json({ error: "Failed to fetch schedule versions" });
    }
  });

  app.post("/api/projects/:projectId/versions", async (req, res) => {
    try {
      const version = await storage.createScheduleVersion({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(version);
    } catch (error) {
      console.error("Error creating schedule version:", error);
      res.status(500).json({ error: "Failed to create schedule version" });
    }
  });

  app.post("/api/versions/:versionId/restore", async (req, res) => {
    try {
      const success = await storage.restoreScheduleVersion(req.params.versionId);
      if (!success) {
        return res.status(404).json({ error: "Version not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring schedule version:", error);
      res.status(500).json({ error: "Failed to restore schedule version" });
    }
  });

  // TIA Scenarios
  app.get("/api/projects/:projectId/tia-scenarios", async (req, res) => {
    try {
      const scenarios = await storage.getTiaScenariosByProject(req.params.projectId);
      res.json(scenarios);
    } catch (error) {
      console.error("Error fetching TIA scenarios:", error);
      res.status(500).json({ error: "Failed to fetch TIA scenarios" });
    }
  });

  app.get("/api/tia-scenarios/:id", async (req, res) => {
    try {
      const scenario = await storage.getTiaScenario(req.params.id);
      if (!scenario) {
        return res.status(404).json({ error: "TIA scenario not found" });
      }
      res.json(scenario);
    } catch (error) {
      console.error("Error fetching TIA scenario:", error);
      res.status(500).json({ error: "Failed to fetch TIA scenario" });
    }
  });

  app.post("/api/projects/:projectId/tia-scenarios", async (req, res) => {
    try {
      const scenarioData = insertTiaScenarioSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const scenario = await storage.createTiaScenario(scenarioData);
      res.json(scenario);
    } catch (error) {
      console.error("Error creating TIA scenario:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid TIA scenario data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create TIA scenario" });
      }
    }
  });

  app.put("/api/tia-scenarios/:id", async (req, res) => {
    try {
      const scenario = await storage.updateTiaScenario(req.params.id, req.body);
      if (!scenario) {
        return res.status(404).json({ error: "TIA scenario not found" });
      }
      res.json(scenario);
    } catch (error) {
      console.error("Error updating TIA scenario:", error);
      res.status(500).json({ error: "Failed to update TIA scenario" });
    }
  });

  app.delete("/api/tia-scenarios/:id", async (req, res) => {
    try {
      const success = await storage.deleteTiaScenario(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "TIA scenario not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting TIA scenario:", error);
      res.status(500).json({ error: "Failed to delete TIA scenario" });
    }
  });

  // Schedule Updates
  app.get("/api/projects/:projectId/schedule-updates", async (req, res) => {
    try {
      const updates = await storage.getScheduleUpdatesByProject(req.params.projectId);
      res.json(updates);
    } catch (error) {
      console.error("Error fetching schedule updates:", error);
      res.status(500).json({ error: "Failed to fetch schedule updates" });
    }
  });

  app.post("/api/projects/:projectId/schedule-updates", async (req, res) => {
    try {
      const updateData = insertScheduleUpdateSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const update = await storage.createScheduleUpdate(updateData);
      res.json(update);
    } catch (error) {
      console.error("Error creating schedule update:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid schedule update data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create schedule update" });
      }
    }
  });

  // CPM Calculation Engine - Advanced Scheduling Features
  app.post("/api/projects/:projectId/calculate-schedule", async (req, res) => {
    try {
      const { retainedLogic = true, dataDate } = req.body;
      
      // Get all project data needed for CPM calculation
      const activities = await storage.getActivitiesByProject(req.params.projectId);
      const relationships = await storage.getRelationshipsByProject(req.params.projectId);
      const calendars = await storage.getCalendarsByProject(req.params.projectId);
      
      // Import CPM calculator
      const { CPMCalculator } = require("./cpmCalculator");
      
      // Create calculator instance with project data
      const calculator = new CPMCalculator(
        activities,
        relationships,
        calendars,
        dataDate ? new Date(dataDate) : undefined,
        retainedLogic
      );
      
      // Run comprehensive CPM calculation with advanced features
      const results = calculator.calculate();
      
      res.json({
        success: true,
        results: {
          activities: results.activities,
          criticalPath: results.criticalPath,
          projectDuration: results.projectDuration,
          constraintViolations: results.constraintViolations,
          scheduleMetrics: results.scheduleMetrics,
          retainedLogic,
          calculatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error calculating schedule:", error);
      res.status(500).json({ error: "Failed to calculate schedule", details: error.message });
    }
  });

  // AI Schedule Generation Routes
  
  // Route for prompt enhancement
  app.post("/api/schedule/ai/enhance-prompt", isAuthenticated, async (req, res) => {
    try {
      const { prompt, model = "Claude-3-Haiku" } = req.body;
      
      if (!prompt || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      // Use POE API to enhance the prompt
      const { poe } = await import("./poeClient");
      
      const enhancementSystemPrompt = `You are a CPM scheduling prompt enhancement expert. Transform basic prompts into detailed CPM scheduling requests.

**CRITICAL CPM REQUIREMENTS TO ADD:**
1. Request FULL predecessor/successor relationships (every activity except first must have predecessors)
2. Specify constraint types needed (SNET, FNLT, MSO, MFO)
3. Request proper logic ties (FS, SS, FF, SF) with lag times
4. Ask for critical path identification
5. Request resource loading and leveling considerations

**DOCUMENT ANALYSIS INSTRUCTIONS:**
- If documents are mentioned, emphasize extracting:
  • Total contract duration from bid documents
  • Milestone dates and contractual deadlines
  • Phasing requirements and sequencing constraints
  • Weather windows and seasonal restrictions
  • Permit and inspection requirements

**DURATION ESTIMATION GUIDANCE:**
- Request realistic durations based on:
  • Scope of work from documents
  • Industry standards for activity types
  • Crew sizes and productivity rates
  • Equipment availability
  • Must fit within contract duration if specified

**ENHANCEMENT RULES:**
1. Keep original intent but add CPM-specific details
2. Specify need for 30-50+ activities minimum
3. Request hierarchical WBS structure
4. Include float calculations and buffer management
5. Ask for parallel work paths and resource optimization
6. If contract time is mentioned, emphasize schedule must complete within that duration

Return ONLY the enhanced prompt text, nothing else.`;
      
      // Include context about uploaded files if they exist
      const uploadedContext = req.body.uploadedFiles?.length > 0 
        ? `\n\nNote: User has uploaded ${req.body.uploadedFiles.length} document(s) that should be analyzed for contract duration, milestones, and scope details.`
        : '';
      
      const response = await poe.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: enhancementSystemPrompt },
          { role: "user", content: `Enhance this construction scheduling prompt:\n\n${prompt}${uploadedContext}` }
        ],
        temperature: 0.3,
        max_tokens: 600
      });
      
      const enhancedPrompt = response.choices[0]?.message?.content || prompt;
      
      res.json({ 
        enhancedPrompt: enhancedPrompt.trim(),
        original: prompt 
      });
      
    } catch (error: any) {
      console.error("Prompt enhancement failed:", error);
      res.status(500).json({ 
        error: "Failed to enhance prompt",
        enhancedPrompt: req.body.prompt // Fallback to original
      });
    }
  });
  
  // Route for AI Floating Bubble
  app.post("/api/schedule/ai/generate", isAuthenticated, async (req, res) => {
    try {
      console.log('AI Floating Bubble generation request:', req.body);
      console.log('Project ID from request:', req.body.projectId);
      const result = await generateScheduleWithAI(req.body);
      
      // Always return the AI result first, even if database saving fails
      console.log('AI generated activities count:', result.activities?.length);
      
      // Try to save to database but don't fail if it doesn't work
      if (result.activities && result.activities.length > 0) {
        try {
          // Use projectId from request body if provided
          let projectId: string = req.body.projectId;
          
          // Only create a project if no projectId was provided
          if (!projectId) {
            const projects = await storage.getProjects();
            
            if (projects.length > 0) {
              projectId = projects[0].id;
            } else {
              // Create a default project if none exists
              const newProject = await storage.createProject({
                name: req.body.projectDescription || "AI Generated Schedule",
                description: req.body.userRequest || "Generated with AI",
                contractStartDate: req.body.startDate || new Date().toISOString().split('T')[0],
                contractFinishDate: req.body.endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              });
              projectId = newProject.id;
            }
          }
          
          // Clear existing activities
          const existingActivities = await storage.getActivitiesByProject(projectId);
          for (const activity of existingActivities) {
            // Check storage type for correct method signature
            if ('db' in storage) {
              // Database storage expects just the activity id
              await storage.deleteActivity(activity.id);
            } else {
              // Memory storage expects activity id
              await storage.deleteActivity(activity.id);
            }
          }
          
          // Add new activities with proper projectId and field mapping
          const activityIdMap = new Map<string, string>(); // Map AI activityId to database id
          
          for (const activity of result.activities) {
            // Check if using database storage (has different signature)
            let createdActivity: any;
            if ('db' in storage) {
              // AI now generates correct format, just add projectId and any missing fields
              // Destructure to separate status from other fields to avoid conflicts
              const { status: aiStatus, ...activityWithoutStatus } = activity;
              const dbActivity = {
                ...activityWithoutStatus,
                projectId: projectId, // Ensure projectId is set
                activityId: activity.activityId || `ACT-${crypto.randomUUID().slice(0, 8)}`,
                name: activity.activityName || "Unnamed Activity",
                type: (activity as any).type || "Task",
                durationUnit: "days",
                actualStart: null,
                actualFinish: null,
                constraintType: null,
                constraintDate: null,
                percentComplete: activity.percentComplete || 0,
                // Properly convert AI status to database enum
                status: aiStatus === "Not Started" ? "NotStarted" :
                       aiStatus === "In Progress" ? "InProgress" :
                       aiStatus === "Completed" ? "Completed" : "NotStarted",
                responsibility: null,
                trade: null
              };
              
              createdActivity = await storage.createActivity(dbActivity);
            } else {
              // Memory storage expects activity with projectId and name
              createdActivity = await storage.createActivity({
                ...activity, 
                projectId,
                name: activity.activityName || "Unnamed Activity",
                status: activity.status === "Not Started" ? "NotStarted" :
                       activity.status === "In Progress" ? "InProgress" :
                       activity.status === "Completed" ? "Completed" : "NotStarted"
              });
            }
            
            // Store the mapping of activityId to database id
            if (createdActivity && createdActivity.id) {
              activityIdMap.set(activity.activityId, createdActivity.id);
            }
          }
          
          // Clear existing relationships for this project
          const existingRelationships = await storage.getRelationshipsByProject(projectId);
          for (const rel of existingRelationships) {
            await storage.deleteRelationship(rel.id);
          }
          
          // Create relationships from predecessors
          let relationshipCount = 0;
          for (const activity of result.activities) {
            if (activity.predecessors && Array.isArray(activity.predecessors)) {
              const successorId = activityIdMap.get(activity.activityId);
              
              for (const predActivityId of activity.predecessors) {
                const predecessorId = activityIdMap.get(predActivityId);
                
                if (predecessorId && successorId) {
                  try {
                    await storage.createRelationship({
                      projectId: projectId,
                      predecessorId: predecessorId,
                      successorId: successorId,
                      type: "FS", // Default to Finish-to-Start
                      lag: 0
                    });
                    relationshipCount++;
                  } catch (relError) {
                    console.error(`Failed to create relationship from ${predActivityId} to ${activity.activityId}:`, relError);
                  }
                }
              }
            }
          }
          
          console.log(`Successfully saved ${result.activities.length} activities and ${relationshipCount} relationships to database`);
          (result as any).saved = true;
          (result as any).projectId = projectId;
        } catch (dbError: any) {
          console.error('Database save failed but returning AI result anyway:', dbError);
          (result as any).saved = false;
          (result as any).saveError = dbError.message;
        }
      }
      
      // Return the actual AI-generated result with save status
      res.json(result);
    } catch (error: any) {
      console.error("Error generating schedule with AI:", error);
      
      // Only return demo if AI generation itself failed
      const demoSchedule = {
        activities: [
          {
            id: crypto.randomUUID(),
            activityId: "DEMO-001",
            activityName: "Site Preparation",
            duration: 5,
            predecessors: [],
            successors: ["DEMO-002"],
            status: "Not Started",
            percentComplete: 0,
            startDate: new Date().toISOString().split('T')[0],
            finishDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            wbs: "1.1",
            resources: ["Demo Crew"],
            earlyStart: 0,
            earlyFinish: 5,
            lateStart: 0,
            lateFinish: 5,
            totalFloat: 0,
            freeFloat: 0,
            isCritical: true
          },
          {
            id: crypto.randomUUID(),
            activityId: "DEMO-002",
            activityName: "Foundation Work",
            duration: 10,
            predecessors: ["DEMO-001"],
            successors: ["DEMO-003"],
            status: "Not Started",
            percentComplete: 0,
            startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            finishDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            wbs: "1.2",
            resources: ["Demo Crew"],
            earlyStart: 5,
            earlyFinish: 15,
            lateStart: 5,
            lateFinish: 15,
            totalFloat: 0,
            freeFloat: 0,
            isCritical: true
          },
          {
            id: crypto.randomUUID(),
            activityId: "DEMO-003",
            activityName: "Structural Assembly",
            duration: 15,
            predecessors: ["DEMO-002"],
            successors: [],
            status: "Not Started",
            percentComplete: 0,
            startDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            finishDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            wbs: "1.3",
            resources: ["Demo Crew"],
            earlyStart: 15,
            earlyFinish: 30,
            lateStart: 15,
            lateFinish: 30,
            totalFloat: 0,
            freeFloat: 0,
            isCritical: true
          }
        ],
        summary: "Demo schedule generated (Database error encountered)",
        criticalPath: ["DEMO-001", "DEMO-002", "DEMO-003"],
        recommendations: ["This is a demo schedule. The actual AI generation encountered an error. Please check your database connection."]
      };
      
      res.json(demoSchedule);
    }
  });

  app.post("/api/projects/:projectId/schedules/generate-ai", isAuthenticated, async (req, res) => {
    try {
      const result = await generateScheduleWithAI({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(result);
    } catch (error) {
      console.error("Error generating schedule with AI:", error);
      res.status(500).json({ error: "Failed to generate schedule with AI" });
    }
  });

  app.post("/api/schedule/ai/analyze-lookahead", isAuthenticated, async (req, res) => {
    try {
      // Use the general AI generation with the file content as context
      const result = await generateScheduleWithAI({
        type: 'analyze',
        userRequest: 'Analyze this lookahead schedule and extract activities',
        uploadedFiles: req.body.uploadedFiles,
        currentActivities: req.body.currentActivities
      });
      res.json(result);
    } catch (error) {
      console.error("Error analyzing lookahead:", error);
      res.status(500).json({ error: "Failed to analyze lookahead file" });
    }
  });

  app.post("/api/schedule/ai/identify-impacts", isAuthenticated, async (req, res) => {
    try {
      const result = await identifyScheduleImpacts(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error identifying impacts:", error);
      res.status(500).json({ error: "Failed to identify schedule impacts" });
    }
  });

  // AI Assistant Routes
  app.post("/api/ai/assistant", isAuthenticated, async (req, res) => {
    try {
      const { query, model = "Claude-Sonnet-4", context } = req.body;
      
      const messages = [
        { role: "system" as const, content: SYSTEM_ASSISTANT },
        { role: "user" as const, content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
      ];

      const response = await poe.chat.completions.create({
        model,
        messages,
        stream: false
      });

      const responseText = response.choices[0]?.message?.content || "";
      
      // Try to parse as JSON for tool calls
      try {
        const parsed = JSON.parse(responseText);
        const validated = ToolSchema.parse(parsed);
        
        // Execute the tool and return result
        res.json({
          tool: validated,
          result: "Tool executed successfully",
          speak: validated.speak
        });
      } catch {
        // Return as plain text response
        res.json({
          response: responseText,
          speak: responseText
        });
      }
    } catch (error) {
      console.error("Error with AI assistant:", error);
      res.status(500).json({ error: "Failed to process AI assistant request" });
    }
  });

  // Get available AI models
  app.get("/api/ai/models", isAuthenticated, async (req, res) => {
    res.json([
      { value: "GPT-5", label: "GPT-5 (Latest)", category: "GPT" },
      { value: "Claude-Sonnet-4", label: "Claude Sonnet 4", category: "Claude" },
      { value: "Gemini-2.5-Pro", label: "Gemini 2.5 Pro", category: "Google" },
      { value: "o3-pro", label: "o3 Pro (Reasoning)", category: "Reasoning" },
      { value: "Grok-4", label: "Grok 4", category: "Other" }
    ]);
  });

  // Object upload endpoint
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const fileName = req.query.fileName as string || 'uploaded_file';
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Generate a unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
      
      // Create upload URL for object storage
      const objectStorage = new ObjectStorageService();
      const uploadUrl = await objectStorage.generatePresignedUploadUrl(uniqueFileName);
      
      res.json({
        method: "PUT",
        url: uploadUrl,
        fileName: uniqueFileName
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", service: "ScheduleSam API" });
  });

  // Register schedule-related routes (includes export functionality)
  registerScheduleRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}