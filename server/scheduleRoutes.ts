import type { Express } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { 
  activities, relationships, projects,
  insertActivitySchema, insertRelationshipSchema,
  type Activity, type Relationship, type Project
} from "@shared/schema";
import { exportSchedule } from "./scheduleExporter";
import type { ProjectSchedule, ScheduleActivity } from "@shared/schema";
import { generateScheduleWithAI } from "./scheduleAITools";
import { poe } from "./poeClient";
import { parseScheduleFile } from "./scheduleParser";
import { embeddingService } from "./embeddingService";
import { analyzeImportedSchedule } from "./patternObserver";
import { SanitationMiddleware, type QualityReport } from "./scheduleSanitizer";

// Background function to generate embeddings for a project
async function generateEmbeddingsForProject(projectId: string): Promise<void> {
  try {
    console.log(`[RAG] Starting embedding generation for project ${projectId}`);
    
    // Fetch all project data
    const activities = await storage.getActivitiesByProject(projectId);
    const wbsItems = await storage.getWbsByProject(projectId);
    const relationships = await storage.getRelationshipsByProject(projectId);
    const calendars = await storage.getCalendarsByProject(projectId);
    const tiaScenarios = await storage.getTiaScenariosByProject(projectId);
    
    // Create WBS lookup map
    const wbsMap = new Map(wbsItems.map(w => [w.id, w]));
    
    // Generate chunks
    const activityChunks = embeddingService.chunkActivities(activities, relationships, wbsMap);
    const wbsChunks = embeddingService.chunkWbs(wbsItems, activities);
    const criticalPathChunks = embeddingService.chunkCriticalPath(activities, relationships);
    const calendarChunks = embeddingService.chunkCalendars(calendars);
    const tiaChunks = embeddingService.chunkTiaScenarios(tiaScenarios);
    
    const allChunks = [
      ...activityChunks,
      ...wbsChunks,
      ...criticalPathChunks,
      ...calendarChunks,
      ...tiaChunks
    ];
    
    if (allChunks.length === 0) {
      console.log(`[RAG] No chunks to embed for project ${projectId}`);
      return;
    }
    
    // Store embeddings
    const storedCount = await embeddingService.storeEmbeddings(projectId, allChunks);
    console.log(`[RAG] Successfully stored ${storedCount} embeddings for project ${projectId}`);
  } catch (error) {
    console.error(`[RAG] Failed to generate embeddings for project ${projectId}:`, error);
    throw error;
  }
}

// Export for use by other modules
export { generateEmbeddingsForProject };

// Export interface for schedule activities used by the AI and parsers
export interface ScheduleActivityData {
  id: string;
  activityId: string;
  activityName: string;
  activityType?: string;
  duration: number;
  predecessors: string[];
  successors: string[];
  status: string;
  percentComplete?: number;
  startDate?: string;
  finishDate?: string;
  wbs?: string;
  resources?: string[];
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;
}

// Interface for parsed schedule data from external files
export interface ParsedScheduleData {
  activities: ScheduleActivityData[];
  projectInfo: {
    name?: string;
    startDate?: string;
    finishDate?: string;
    dataDate?: string;
    calendarName?: string;
  };
  summary: string;
}

export function registerScheduleRoutes(app: Express) {
  // AI-powered schedule generation
  app.post("/api/projects/:projectId/schedules/generate-ai", isAuthenticated, async (req, res) => {
    try {
      const { type, projectDescription, currentActivities, userRequest, startDate, constraints, uploadedFiles, model } = req.body;
      
      
      const result = await generateScheduleWithAI({
        type,
        projectDescription,
        currentActivities,
        userRequest: userRequest || '',
        startDate,
        constraints,
        uploadedFiles,
        model: model || 'Claude-3-Haiku'
      });
      
      
      // Store activities in memory storage
      if (type === 'create' && result.activities.length > 0) {
        const project = await storage.getProject(req.params.projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        // Create activities using the storage interface
        for (const act of result.activities) {
          const activityData = {
            projectId: req.params.projectId,
            activityId: act.activityId,
            name: act.activityName,
            type: "Task" as const,
            originalDuration: act.duration,
            remainingDuration: act.duration,
            earlyStart: act.startDate || "",
            earlyFinish: act.finishDate || "",
            totalFloat: act.totalFloat || 0,
            status: "NotStarted" as const,
            notes: act.wbs || null
          };
          
          await storage.createActivity(activityData);
        }

        // Create relationships
        for (const act of result.activities) {
          if (act.predecessors && act.predecessors.length > 0) {
            const currentActivity = await storage.getActivitiesByProject(req.params.projectId);
            const thisAct = currentActivity.find(a => a.activityId === act.activityId);
            
            if (thisAct) {
              for (const predId of act.predecessors) {
                const predActivity = currentActivity.find(a => a.activityId === predId);
                if (predActivity) {
                  await storage.createRelationship({
                    projectId: req.params.projectId,
                    predecessorId: predActivity.id,
                    successorId: thisAct.id,
                    type: "FS",
                    lag: 0
                  });
                }
              }
            }
          }
        }
        
        res.json({
          success: true,
          message: "Schedule created successfully",
          activitiesCount: result.activities.length,
          ...result
        });
      } else {
        // Return result without saving to storage
        res.json({
          success: true,
          ...result
        });
      }
    } catch (error) {
      console.error("Error generating AI schedule:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: "Failed to generate schedule",
        details: errorMessage 
      });
    }
  });

  // Generate 3-week lookahead from current activities
  app.post("/api/projects/:projectId/schedules/generate-lookahead", isAuthenticated, async (req, res) => {
    try {
      const { startDate } = req.body;
      
      // Get current activities from storage
      const currentActivities = await storage.getActivitiesByProject(req.params.projectId);
      
      // Calculate 3-week window
      const start = new Date(startDate || new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 21);

      // Filter activities in 3-week window
      const lookaheadActivities = currentActivities.filter(act => {
        const actStart = new Date(act.earlyStart || "");
        const actFinish = new Date(act.earlyFinish || "");
        return (actStart <= end && actFinish >= start);
      });

      res.json({
        success: true,
        activities: lookaheadActivities,
        activitiesCount: lookaheadActivities.length,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      });
    } catch (error) {
      console.error("Error generating lookahead:", error);
      res.status(500).json({ error: "Failed to generate lookahead" });
    }
  });

  // Import schedule from XER, MPP, PDF, or XML
  app.post("/api/projects/:projectId/schedules/import", isAuthenticated, async (req, res) => {
    try {
      const { fileContent, filename } = req.body;
      
      if (!fileContent || !filename) {
        return res.status(400).json({ error: "File content and filename are required" });
      }

      // Use the dedicated parser for the file format
      let parsedData: ParsedScheduleData;
      try {
        parsedData = await parseScheduleFile(fileContent, filename);
      } catch (parseError) {
        console.error("Failed to parse schedule file:", parseError);
        return res.status(400).json({ error: "Failed to parse schedule file content. Please ensure the file is a valid schedule format." });
      }

      if (parsedData.activities.length === 0) {
        return res.status(400).json({ error: "No activities found in the file" });
      }

      // Run Sanitation Middleware before saving to database
      // This detects orphans, breaks loops, and validates calendars
      const sanitizationResult = SanitationMiddleware.sanitizeActivities(parsedData.activities);
      const sanitizedActivities = sanitizationResult.activities;
      const qualityReport = sanitizationResult.qualityReport;
      
      console.log(`[Import] Sanitation complete: ${qualityReport.openEnds} open ends, ${qualityReport.loops} loops broken, ${qualityReport.calendarsFixed} calendars fixed`);

      // Store activities using the storage interface
      let createdCount = 0;
      let skippedCount = 0;
      let updatedCount = 0;
      
      for (const act of sanitizedActivities) {
        try {
          // Include warning type in notes if activity was flagged
          let notes = act.wbs || null;
          if (act.warningType) {
            notes = `[${act.warningType.toUpperCase()}] ${act.sanitizationNotes || ''} | ${notes || ''}`;
          }
          
          const activityData = {
            projectId: req.params.projectId,
            activityId: act.activityId,
            name: act.activityName,
            type: "Task" as const,
            originalDuration: act.duration,
            remainingDuration: act.duration * (1 - (act.percentComplete || 0) / 100),
            earlyStart: act.startDate || "",
            earlyFinish: act.finishDate || "",
            totalFloat: act.totalFloat || 0,
            status: act.status === "Completed" ? "Completed" as const : 
                    act.status === "In Progress" ? "InProgress" as const : "NotStarted" as const,
            notes
          };
          
          // Check if activity already exists
          const existingActivities = await storage.getActivitiesByProject(req.params.projectId);
          const existingActivity = existingActivities.find(a => a.activityId === act.activityId);
          
          if (existingActivity) {
            // Update existing activity
            await storage.updateActivity(existingActivity.id, {
              name: activityData.name,
              type: activityData.type,
              originalDuration: activityData.originalDuration,
              remainingDuration: activityData.remainingDuration,
              earlyStart: activityData.earlyStart,
              earlyFinish: activityData.earlyFinish,
              totalFloat: activityData.totalFloat,
              status: activityData.status,
              notes: activityData.notes
            });
            updatedCount++;
          } else {
            // Create new activity
            await storage.createActivity(activityData);
            createdCount++;
          }
        } catch (error: any) {
          // Check for duplicate key error
          if (error.message?.includes('duplicate key') || error.code === '23505') {
            skippedCount++;
            console.log(`Skipped duplicate activity ${act.activityId}`);
          } else {
            console.error(`Failed to create activity ${act.activityId}:`, error);
            skippedCount++;
          }
        }
      }

      const totalProcessed = createdCount + updatedCount;
      let message = `Import complete: ${createdCount} new`;
      if (updatedCount > 0) message += `, ${updatedCount} updated`;
      if (skippedCount > 0) message += `, ${skippedCount} skipped`;
      
      // Trigger embedding generation in background (non-blocking)
      if (embeddingService.isConfigured()) {
        generateEmbeddingsForProject(req.params.projectId).catch(err => {
          console.error("Background embedding generation failed:", err);
        });
      }
      
      // Trigger style extraction and learning in background (non-blocking)
      // This analyzes the user's scheduling style from the imported data
      const userId = (req.user as any)?.claims?.sub;
      if (userId) {
        // Map parser fields to analyzer expected fields
        // constraintType -> constraint (for constraint usage analysis)
        analyzeImportedSchedule(userId, req.params.projectId, sanitizedActivities.map(act => {
          const anyAct = act as any;
          return {
            activityId: act.activityId,
            activityName: act.activityName,
            duration: act.duration,
            predecessors: act.predecessors || [],
            wbs: act.wbs,
            constraint: anyAct.constraintType || anyAct.constraint,
            constraintDate: anyAct.constraintDate,
            lag: anyAct.lag || 0,
            relationshipType: anyAct.relationshipType || 'FS'
          };
        })).then(metrics => {
          console.log(`[Import] Style analysis complete for user ${userId}:`, metrics.summaryText);
        }).catch(err => {
          console.error("Background style analysis failed:", err);
        });
      }
      
      // Build enhanced message with quality report summary
      if (qualityReport.openEnds > 0 || qualityReport.loops > 0) {
        message += ` | Quality issues: ${qualityReport.openEnds} open ends`;
        if (qualityReport.loops > 0) message += `, ${qualityReport.loops} loops fixed`;
      }
      
      res.json({
        success: true,
        message,
        activitiesCount: totalProcessed,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        projectInfo: parsedData.projectInfo,
        summary: parsedData.summary,
        qualityReport: {
          openEnds: qualityReport.openEnds,
          loops: qualityReport.loops,
          calendarsFixed: qualityReport.calendarsFixed,
          warnings: qualityReport.warnings,
          inactivatedLinks: qualityReport.inactivatedLinks
        }
      });
    } catch (error) {
      console.error("Error importing schedule:", error);
      res.status(500).json({ error: "Failed to import schedule file" });
    }
  });

  // Export project activities in various formats (CRITICAL ROUTE)
  app.get("/api/projects/:projectId/export/:format", isAuthenticated, async (req, res) => {
    try {
      const { projectId, format } = req.params;
      
      // Validate format
      if (!['xer', 'xml', 'pdf', 'csv', 'json'].includes(format)) {
        return res.status(400).json({ error: "Invalid export format. Supported formats: xer, xml, pdf, csv, json" });
      }
      
      // Get project
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Get activities and relationships from storage
      const projectActivities = await storage.getActivitiesByProject(projectId);
      const projectRelationships = await storage.getRelationshipsByProject(projectId);
      
      if (projectActivities.length === 0) {
        return res.status(404).json({ error: "No activities found for this project" });
      }
      
      // Build and validate predecessor/successor maps using DependencyValidator
      // First convert storage activities to ScheduleActivity format for validation
      const activitiesForValidation: ScheduleActivity[] = projectActivities.map(act => {
        // Build initial predecessor list from relationships
        const relationshipPreds = projectRelationships
          .filter(rel => rel.successorId === act.id)
          .map(rel => {
            const predAct = projectActivities.find(a => a.id === rel.predecessorId);
            return predAct?.activityId;
          })
          .filter((predId): predId is string => predId !== undefined);
        
        return {
          id: act.id,
          scheduleId: 'validation',
          activityId: act.activityId,
          activityName: act.name,
          activityType: act.type,
          originalDuration: act.originalDuration,
          remainingDuration: act.remainingDuration,
          startDate: act.earlyStart,
          finishDate: act.earlyFinish,
          totalFloat: act.totalFloat,
          status: act.status === "NotStarted" ? "Not Started" : 
                  act.status === "InProgress" ? "In Progress" : "Completed",
          predecessors: relationshipPreds.join(','),
          successors: '', // Will be built from relationships
          notes: act.notes
        };
      });
      
      // Import DependencyValidator from scheduleExporter
      const { DependencyValidator } = await import('./scheduleExporter');
      
      // CRITICAL FIX: Validate dependencies and break cycles completely
      // Step 1: Validate logical sequence first
      const logicalCheck = DependencyValidator.validateLogicalSequence(activitiesForValidation);
      
      // Step 2: Apply logical validation to activities
      const logicallyValidatedActivities = activitiesForValidation.map(act => ({
        ...act,
        predecessors: (logicalCheck.validatedPredecessors.get(act.activityId) || []).join(',')
      }));
      
      // Step 3: Break circular dependencies on logically validated activities  
      const circularCheck = DependencyValidator.detectAndBreakCircularDependencies(logicallyValidatedActivities);
      
      // CRITICAL: Block export if cycles still exist after breaking attempts
      if (circularCheck.hasCircularDependencies) {
        return res.status(422).json({ 
          error: "Export blocked due to circular dependencies",
          details: `Circular dependencies detected in activities: ${circularCheck.circularNodes.join(', ')}. These relationships create infinite loops and cannot be exported to a valid schedule file.`,
          circularNodes: circularCheck.circularNodes,
          removedEdges: circularCheck.removedEdges
        });
      }
      
      // Step 4: Build validated predecessor/successor maps using cycle-broken results
      const predMap = new Map<string, string[]>();
      const succMap = new Map<string, string[]>();
      
      // Use cycle-broken predecessors for final export (CRITICAL FIX)
      activitiesForValidation.forEach(act => {
        const validatedPreds = circularCheck.validPredecessorMap.get(act.activityId) || [];
        predMap.set(act.activityId, validatedPreds);
        
        // Build successor map from cycle-broken predecessors
        validatedPreds.forEach(predId => {
          if (!succMap.has(predId)) succMap.set(predId, []);
          succMap.get(predId)!.push(act.activityId);
        });
      });
      
      // Convert to ScheduleActivity format for export using validated relationships
      const scheduleActivities: ScheduleActivity[] = projectActivities.map(act => ({
        id: act.id,
        scheduleId: 'direct-export',
        activityId: act.activityId,
        activityName: act.name,
        activityType: act.type,
        originalDuration: act.originalDuration,
        remainingDuration: act.remainingDuration,
        startDate: act.earlyStart,
        finishDate: act.earlyFinish,
        totalFloat: act.totalFloat,
        status: act.status === "NotStarted" ? "Not Started" : 
                act.status === "InProgress" ? "In Progress" : "Completed",
        predecessors: (predMap.get(act.activityId) || []).join(','),
        successors: (succMap.get(act.activityId) || []).join(','),
        notes: act.notes
      }));
      
      // Create ProjectSchedule for export
      const schedule: ProjectSchedule = {
        id: 'export-schedule',
        projectId: projectId,
        scheduleType: 'CPM',
        dataDate: project.dataDate || new Date().toISOString().split('T')[0],
        startDate: project.contractStartDate || projectActivities[0]?.earlyStart || new Date().toISOString().split('T')[0],
        finishDate: project.contractFinishDate || projectActivities[projectActivities.length - 1]?.earlyFinish || new Date().toISOString().split('T')[0],
        version: 1,
        notes: `Exported from ${project.name}`
      };
      
      // Export using the schedule exporter
      const exportResult = await exportSchedule(
        format as 'xer' | 'xml' | 'pdf' | 'csv' | 'json',
        schedule,
        scheduleActivities,
        project.name
      );
      
      // Set appropriate headers
      res.setHeader('Content-Type', exportResult.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      
      // For XML format, ensure proper content type
      if (format === 'xml') {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      }
      
      res.send(exportResult.content);
      
    } catch (error) {
      console.error("Error exporting project:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: "Failed to export project",
        details: errorMessage 
      });
    }
  });

  // Get activities for a project
  app.get("/api/projects/:projectId/activities", isAuthenticated, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByProject(req.params.projectId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Update schedule based on meeting discussion (simplified version)
  app.post("/api/projects/:projectId/schedules/update", isAuthenticated, async (req, res) => {
    try {
      const { updates, reason } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates array is required" });
      }
      
      let updatedCount = 0;
      const appliedUpdates = [];
      
      for (const update of updates) {
        try {
          const { activityId, field, newValue } = update;
          
          // Find the activity
          const activities = await storage.getActivitiesByProject(req.params.projectId);
          const activity = activities.find(a => a.activityId === activityId);
          
          if (activity) {
            // Build update object
            const updateData: any = {};
            updateData[field] = newValue;
            
            await storage.updateActivity(activity.id, updateData);
            updatedCount++;
            appliedUpdates.push(update);
          }
        } catch (error) {
          console.error(`Failed to update activity ${update.activityId}:`, error);
        }
      }
      
      res.json({
        success: true,
        appliedUpdates: updatedCount,
        updates: appliedUpdates,
        reason: reason || "Manual schedule update"
      });
      
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });
}