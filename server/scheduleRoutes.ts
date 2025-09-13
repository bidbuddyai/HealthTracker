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
      
      console.log('Generating schedule with AI:', { type, projectDescription, uploadedFiles });
      
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
      
      console.log('AI generation result:', { activitiesCount: result.activities.length });
      
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

      // Use AI to parse the schedule file content
      const parsePrompt = `Parse this construction schedule file and extract activities. For each activity, extract:
- Activity ID
- Activity Name  
- Activity Type (Milestone, Task, etc)
- Duration (original and remaining)
- Start and Finish dates (YYYY-MM-DD format)
- Predecessors and Successors
- Total Float
- Status (Not Started, In Progress, Completed)

Format as JSON with this structure:
{
  "activities": [
    {
      "activityId": "A001",
      "activityName": "Activity Name",
      "duration": 5,
      "startDate": "2024-01-15",
      "finishDate": "2024-01-19",
      "predecessors": ["A000"],
      "totalFloat": 0,
      "status": "Not Started"
    }
  ],
  "projectInfo": {
    "name": "Project Name",
    "startDate": "2024-01-01",
    "finishDate": "2024-12-31",
    "dataDate": "2024-01-01"
  }
}

Here's the schedule file content:
${fileContent}`;

      const parseResponse = await poe.chat.completions.create({
        model: "Claude-Sonnet-4",
        messages: [
          { role: "system", content: "You are a construction schedule parser. Extract structured data from schedule files." },
          { role: "user", content: parsePrompt }
        ]
      });

      let parsedData: ParsedScheduleData = { activities: [], projectInfo: {}, summary: "" };
      try {
        const content = parseResponse.choices[0].message.content || "{}";
        const result = JSON.parse(content);
        parsedData = {
          activities: result.activities || [],
          projectInfo: result.projectInfo || {},
          summary: `Imported ${result.activities?.length || 0} activities from ${filename}`
        };
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        return res.status(400).json({ error: "Failed to parse schedule file content" });
      }

      if (parsedData.activities.length === 0) {
        return res.status(400).json({ error: "No activities found in the file" });
      }

      // Store activities using the storage interface
      let createdCount = 0;
      for (const act of parsedData.activities) {
        try {
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
            notes: act.wbs || null
          };
          
          await storage.createActivity(activityData);
          createdCount++;
        } catch (error) {
          console.error(`Failed to create activity ${act.activityId}:`, error);
        }
      }

      res.json({
        success: true,
        message: `Successfully imported ${createdCount} activities`,
        activitiesCount: createdCount,
        projectInfo: parsedData.projectInfo,
        summary: parsedData.summary
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
      
      console.log('🔍 MSP Export Debug - Activities from storage:', {
        projectId,
        activitiesCount: projectActivities.length,
        relationshipsCount: projectRelationships.length,
        sampleActivity: projectActivities[0] || null
      });
      
      if (projectActivities.length === 0) {
        return res.status(404).json({ error: "No activities found for this project" });
      }
      
      // Build and validate predecessor/successor maps using DependencyValidator
      console.log('🔍 Building validated predecessor/successor maps...');
      
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
      console.log('🔍 Running comprehensive dependency validation with cycle breaking...');
      
      // Step 1: Validate logical sequence first
      const logicalCheck = DependencyValidator.validateLogicalSequence(activitiesForValidation);
      if (logicalCheck.warnings.length > 0) {
        console.warn('⚠️ Logical sequence issues detected:', logicalCheck.warnings.slice(0, 10));
      }
      
      // Step 2: Apply logical validation to activities
      const logicallyValidatedActivities = activitiesForValidation.map(act => ({
        ...act,
        predecessors: (logicalCheck.validatedPredecessors.get(act.activityId) || []).join(',')
      }));
      
      // Step 3: Break circular dependencies on logically validated activities  
      const circularCheck = DependencyValidator.detectAndBreakCircularDependencies(logicallyValidatedActivities);
      
      // CRITICAL: Block export if cycles still exist after breaking attempts
      if (circularCheck.hasCircularDependencies) {
        console.error('❌ CRITICAL: Export blocked due to unresolvable circular dependencies!');
        console.error('❌ Remaining circular nodes:', circularCheck.circularNodes);
        
        return res.status(422).json({ 
          error: "Export blocked due to circular dependencies",
          details: `Circular dependencies detected in activities: ${circularCheck.circularNodes.join(', ')}. These relationships create infinite loops and cannot be exported to a valid schedule file.`,
          circularNodes: circularCheck.circularNodes,
          removedEdges: circularCheck.removedEdges
        });
      }
      
      if (circularCheck.removedEdges.length > 0) {
        console.warn('🔄 Cycle breaking removed', circularCheck.removedEdges.length, 'problematic edges:');
        circularCheck.removedEdges.slice(0, 5).forEach(edge => {
          console.warn(`  ❌ ${edge.from} -> ${edge.to}: ${edge.reason}`);
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
      
      console.log('✅ Validated predecessor/successor maps built with cycle breaking:', {
        activitiesProcessed: activitiesForValidation.length,
        logicalWarnings: logicalCheck.warnings.length,
        cyclesRemoved: circularCheck.removedEdges.length,
        finalValidatedRelationships: Array.from(predMap.values()).reduce((sum, preds) => sum + preds.length, 0),
        guaranteedAcyclic: !circularCheck.hasCircularDependencies
      });
      
      // Convert to ScheduleActivity format for export using validated relationships
      console.log('🔄 MSP Export Debug - Converting to ScheduleActivity format with validated relationships...');
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
      
      console.log('✅ MSP Export Debug - ScheduleActivities created:', {
        count: scheduleActivities.length,
        sampleScheduleActivity: scheduleActivities[0] || null
      });
      
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
      console.log('🚀 MSP Export Debug - Calling exportSchedule with:', {
        format,
        scheduleId: schedule.id,
        activitiesCount: scheduleActivities.length,
        projectName: project.name
      });
      
      const exportResult = await exportSchedule(
        format as 'xer' | 'xml' | 'pdf' | 'csv' | 'json',
        schedule,
        scheduleActivities,
        project.name
      );
      
      console.log('📄 MSP Export Debug - Export result:', {
        contentLength: exportResult.content.length,
        mimeType: exportResult.mimeType,
        filename: exportResult.filename,
        contentPreview: exportResult.content.substring(0, 500) + '...'
      });
      
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