import type { Express } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { 
  projects,
  activities,
  relationships
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { exportSchedule } from "./scheduleExporter";

export function registerScheduleRoutes(app: Express) {
  // For now, disable database-specific features until we have proper database storage
  const hasDbStorage = false;
  const dbStorage = null;

  // Import schedule from XER, MPP, PDF, or XML
  app.post("/api/projects/:projectId/schedules/import", async (req, res) => {
    if (!hasDbStorage) {
      return res.status(501).json({ error: "Schedule import requires database storage" });
    }
    try {
      const { fileContent, filename } = req.body;
      
      // Parse the schedule file
      const parsedData = await parseScheduleFile(fileContent, filename);
      
      if (parsedData.activities.length === 0) {
        return res.status(400).json({ error: "No activities found in the file" });
      }
      
      // Create schedule record
      const schedule = await dbStorage!.db.insert(projectSchedules).values({
        projectId: req.params.projectId,
        scheduleType: "CPM",
        dataDate: parsedData.projectInfo.dataDate || new Date().toISOString().split('T')[0],
        startDate: parsedData.projectInfo.startDate || parsedData.activities[0]?.startDate || "",
        finishDate: parsedData.projectInfo.finishDate || parsedData.activities[parsedData.activities.length - 1]?.finishDate || "",
        fileUrl: filename,
        version: 1,
        notes: parsedData.summary
      }).returning();
      
      // Store activities
      const activityRecords = parsedData.activities.map((act: Activity) => ({
        scheduleId: schedule[0].id,
        activityId: act.activityId,
        activityName: act.activityName,
        activityType: "Task",
        originalDuration: act.duration,
        remainingDuration: act.duration * (1 - (act.percentComplete || 0) / 100),
        startDate: act.startDate || "",
        finishDate: act.finishDate || "",
        totalFloat: act.totalFloat || 0,
        status: act.status,
        predecessors: Array.isArray(act.predecessors) ? act.predecessors.join(',') : '',
        successors: Array.isArray(act.successors) ? act.successors.join(',') : '',
        notes: act.wbs || null
      }));
      
      if (activityRecords.length > 0) {
        await dbStorage!.db.insert(scheduleActivities).values(activityRecords);
      }
      
      res.json({
        success: true,
        schedule: schedule[0],
        activitiesCount: parsedData.activities.length,
        projectInfo: parsedData.projectInfo,
        summary: parsedData.summary
      });
    } catch (error) {
      console.error("Error importing schedule:", error);
      res.status(500).json({ error: "Failed to import schedule file" });
    }
  });
  
  // Upload and process schedule file (legacy route for backward compatibility)
  app.post("/api/projects/:projectId/schedules/upload", async (req, res) => {
    if (!hasDbStorage) {
      return res.status(501).json({ error: "Schedule upload requires database storage" });
    }
    try {
      const { scheduleType, fileUrl, fileContent, dataDate } = req.body;
      
      // Parse the schedule content using AI
      const parsePrompt = `Parse this construction schedule and extract activities. For each activity, extract:
- Activity ID
- Activity Name  
- Activity Type (Milestone, Task, etc)
- Duration (original and remaining)
- Start and Finish dates
- Predecessors and Successors
- Total Float
- Status

Format as JSON array with these fields. Here's the schedule content:
${fileContent}`;

      const parseResponse = await poe.chat.completions.create({
        model: "Claude-Sonnet-4",
        messages: [
          { role: "system", content: "You are a construction schedule parser. Extract structured data from schedule files." },
          { role: "user", content: parsePrompt }
        ]
      });

      let activities = [];
      try {
        const content = parseResponse.choices[0].message.content || "[]";
        activities = JSON.parse(content);
      } catch {
        activities = [];
      }

      // Create schedule record
      const schedule = await dbStorage!.db.insert(projectSchedules).values({
        projectId: req.params.projectId,
        scheduleType: scheduleType || "CPM",
        dataDate: dataDate || new Date().toISOString().split('T')[0],
        startDate: activities[0]?.startDate || "",
        finishDate: activities[activities.length - 1]?.finishDate || "",
        fileUrl,
        version: 1,
        notes: `Uploaded ${scheduleType} schedule`
      }).returning();

      // Store activities
      if (activities.length > 0) {
        const activityRecords = activities.map((act: any) => ({
          scheduleId: schedule[0].id,
          activityId: act.activityId || act.id,
          activityName: act.activityName || act.name,
          activityType: act.activityType || act.type,
          originalDuration: parseInt(act.originalDuration) || 0,
          remainingDuration: parseInt(act.remainingDuration) || parseInt(act.originalDuration) || 0,
          startDate: act.startDate,
          finishDate: act.finishDate,
          totalFloat: parseInt(act.totalFloat) || 0,
          status: act.status || "Not Started",
          predecessors: act.predecessors,
          successors: act.successors,
          notes: null
        }));

        await dbStorage!.db.insert(scheduleActivities).values(activityRecords);
      }

      res.json({ 
        success: true, 
        schedule: schedule[0],
        activitiesCount: activities.length
      });
    } catch (error) {
      console.error("Error processing schedule:", error);
      res.status(500).json({ error: "Failed to process schedule" });
    }
  });

  // Generate 3-week lookahead from CPM schedule
  app.post("/api/projects/:projectId/schedules/generate-lookahead", async (req, res) => {
    if (!hasDbStorage) {
      return res.status(501).json({ error: "Lookahead generation requires database storage" });
    }
    try {
      const { baseScheduleId, startDate } = req.body;
      
      // Get base schedule activities
      const activities = await dbStorage!.db
        .select()
        .from(scheduleActivities)
        .where(eq(scheduleActivities.scheduleId, baseScheduleId));

      // Calculate 3-week window
      const start = new Date(startDate || new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 21);

      // Filter activities in 3-week window
      const lookaheadActivities = activities.filter(act => {
        const actStart = new Date(act.startDate || "");
        const actFinish = new Date(act.finishDate || "");
        return (actStart <= end && actFinish >= start);
      });

      // Create lookahead schedule
      const lookahead = await dbStorage!.db.insert(projectSchedules).values({
        projectId: req.params.projectId,
        scheduleType: "3_WEEK_LOOKAHEAD",
        dataDate: start.toISOString().split('T')[0],
        startDate: start.toISOString().split('T')[0],
        finishDate: end.toISOString().split('T')[0],
        version: 1,
        notes: "Generated from CPM schedule"
      }).returning();

      // Store lookahead activities
      if (lookaheadActivities.length > 0) {
        const lookaheadRecords = lookaheadActivities.map(act => ({
          scheduleId: lookahead[0].id,
          activityId: act.activityId,
          activityName: act.activityName,
          activityType: act.activityType,
          originalDuration: act.originalDuration,
          remainingDuration: act.remainingDuration,
          startDate: act.startDate,
          finishDate: act.finishDate,
          totalFloat: act.totalFloat,
          status: act.status,
          predecessors: act.predecessors,
          successors: act.successors,
          notes: act.notes
        }));

        await dbStorage!.db.insert(scheduleActivities).values(lookaheadRecords);
      }

      res.json({
        success: true,
        lookahead: lookahead[0],
        activitiesCount: lookaheadActivities.length
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate lookahead" });
    }
  });

  // AI-powered schedule update based on meeting discussion
  app.post("/api/meetings/:meetingId/update-schedule", async (req, res) => {
    if (!hasDbStorage) {
      return res.status(501).json({ error: "Schedule update requires database storage" });
    }
    try {
      const meeting = await storage.getMeeting(req.params.meetingId);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      // Get meeting agenda and action items
      const [agenda, actions] = await Promise.all([
        storage.getAgendaItemsByMeeting(meeting.id),
        storage.getActionItemsByMeeting(meeting.id)
      ]);

      // Get latest schedule for the project
      const schedules = await dbStorage!.db
        .select()
        .from(projectSchedules)
        .where(eq(projectSchedules.projectId, meeting.projectId))
        .orderBy(desc(projectSchedules.createdAt))
        .limit(1);

      if (schedules.length === 0) {
        return res.status(404).json({ error: "No schedule found for project" });
      }

      const schedule = schedules[0];
      const activities = await dbStorage!.db
        .select()
        .from(scheduleActivities)
        .where(eq(scheduleActivities.scheduleId, schedule.id));

      // Use AI to analyze meeting discussion and suggest schedule updates
      const scheduleAgenda = agenda.find(a => a.title === "Project Schedule");
      const updatePrompt = `Based on this meeting discussion, suggest schedule updates:

Meeting #${meeting.seqNum} - ${meeting.date}

Schedule Discussion:
${scheduleAgenda?.discussion || "No schedule discussion recorded"}

Action Items:
${actions.map(a => `- ${a.action} (Due: ${a.dueDate || 'TBD'})`).join('\n')}

Current Schedule Activities:
${activities.slice(0, 10).map(a => `${a.activityId}: ${a.activityName} (${a.status}, ${a.startDate} to ${a.finishDate})`).join('\n')}

Suggest specific updates to activities including:
- Status changes (Not Started -> In Progress -> Completed)
- Date adjustments based on delays or accelerations mentioned
- New dependencies or constraints
- Activities that need attention

Format as JSON with:
- updates: [{activityId, field, oldValue, newValue, reason}]
- recommendations: [text recommendations]`;

      const updateResponse = await poe.chat.completions.create({
        model: "Claude-Sonnet-4",
        messages: [
          { role: "system", content: "You are a construction schedule analyst. Suggest schedule updates based on meeting discussions." },
          { role: "user", content: updatePrompt }
        ]
      });

      let suggestions: { updates: any[], recommendations: string[] } = { updates: [], recommendations: [] };
      try {
        const content = updateResponse.choices[0].message.content || "{}";
        suggestions = JSON.parse(content);
      } catch {
        suggestions = { 
          updates: [], 
          recommendations: ["Unable to parse AI suggestions"] 
        };
      }

      // Apply suggested updates
      const appliedUpdates: any[] = [];
      for (const update of (suggestions.updates || []) as any[]) {
        const activity = activities.find(a => a.activityId === update.activityId);
        if (activity) {
          // Update the activity
          const updateData: any = {};
          updateData[update.field as string] = update.newValue;
          
          await dbStorage!.db
            .update(scheduleActivities)
            .set(updateData)
            .where(eq(scheduleActivities.id, activity.id));
          
          appliedUpdates.push(update);
        }
      }

      // Record the update
      if (appliedUpdates.length > 0 && dbStorage) {
        await dbStorage.db.insert(scheduleUpdates).values({
          scheduleId: schedule.id,
          meetingId: meeting.id,
          updateType: "AI_GENERATED",
          updateDescription: `Applied ${appliedUpdates.length} updates from Meeting #${meeting.seqNum}`,
          affectedActivities: JSON.stringify(appliedUpdates.map(u => u.activityId)),
          oldValues: JSON.stringify(appliedUpdates.map(u => ({ activityId: u.activityId, field: u.field, value: u.oldValue }))),
          newValues: JSON.stringify(appliedUpdates.map(u => ({ activityId: u.activityId, field: u.field, value: u.newValue }))),
          createdBy: "AI Assistant"
        });
      }

      res.json({
        success: true,
        appliedUpdates: appliedUpdates.length,
        suggestions: suggestions.recommendations,
        updates: appliedUpdates
      });
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // AI-powered schedule generation
  app.post("/api/projects/:projectId/schedules/generate-ai", async (req, res) => {
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
      
      // If creating a new schedule and we have DB storage, save it
      if (type === 'create' && result.activities.length > 0 && hasDbStorage) {
        const schedule = await dbStorage!.db.insert(projectSchedules).values({
          projectId: req.params.projectId,
          scheduleType: "CPM",
          dataDate: startDate || new Date().toISOString().split('T')[0],
          startDate: startDate || new Date().toISOString().split('T')[0],
          finishDate: "", // Will be calculated
          version: 1,
          notes: `AI Generated: ${result.summary}`
        }).returning();
        
        // Store activities
        const activityRecords = result.activities.map((act: Activity) => ({
          scheduleId: schedule[0].id,
          activityId: act.activityId,
          activityName: act.activityName,
          activityType: "Task",
          originalDuration: act.duration,
          remainingDuration: act.duration,
          startDate: act.startDate || "",
          finishDate: act.finishDate || "",
          totalFloat: act.totalFloat || 0,
          status: act.status,
          predecessors: act.predecessors.join(','),
          successors: act.successors.join(','),
          notes: act.wbs || null
        }));
        
        await dbStorage!.db.insert(scheduleActivities).values(activityRecords);
        
        res.json({
          success: true,
          schedule: schedule[0],
          ...result
        });
      } else {
        // Return result without saving to database
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
  
  // Generate interactive 3-week lookahead
  app.post("/api/projects/:projectId/schedules/generate-lookahead-ai", async (req, res) => {
    if (!hasDbStorage) {
      return res.status(501).json({ error: "Lookahead AI generation requires database storage" });
    }
    try {
      const { currentActivities, startDate } = req.body;
      
      const result = await generateScheduleWithAI({
        type: 'lookahead',
        currentActivities,
        userRequest: 'Generate 3-week lookahead',
        startDate: startDate || new Date().toISOString().split('T')[0]
      });
      
      // Create lookahead schedule in database
      const lookahead = await dbStorage!.db.insert(projectSchedules).values({
        projectId: req.params.projectId,
        scheduleType: "3_WEEK_LOOKAHEAD",
        dataDate: startDate || new Date().toISOString().split('T')[0],
        startDate: startDate || new Date().toISOString().split('T')[0],
        finishDate: "", // Will be calculated
        version: 1,
        notes: `AI Generated Lookahead: ${result.summary}`
      }).returning();
      
      // Store lookahead activities
      if (result.activities.length > 0) {
        const activityRecords = result.activities.map((act: Activity) => ({
          scheduleId: lookahead[0].id,
          activityId: act.activityId,
          activityName: act.activityName,
          activityType: "Task",
          originalDuration: act.duration,
          remainingDuration: act.duration,
          startDate: act.startDate || "",
          finishDate: act.finishDate || "",
          totalFloat: act.totalFloat || 0,
          status: act.status,
          predecessors: act.predecessors.join(','),
          successors: act.successors.join(','),
          notes: act.wbs || null
        }));
        
        await dbStorage!.db.insert(scheduleActivities).values(activityRecords);
      }
      
      res.json({
        success: true,
        lookahead: lookahead[0],
        ...result
      });
    } catch (error) {
      console.error("Error generating AI lookahead:", error);
      res.status(500).json({ error: "Failed to generate lookahead" });
    }
  });
  
  // Get schedule activities
  app.get("/api/schedules/:scheduleId/activities", async (req, res) => {
    if (!hasDbStorage) {
      return res.json([]); // Return empty array for in-memory storage
    }
    try {
      const activities = await dbStorage!.db
        .select()
        .from(scheduleActivities)
        .where(eq(scheduleActivities.scheduleId, req.params.scheduleId))
        .orderBy(scheduleActivities.startDate);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });
  
  // Export project activities in various formats (correct route pattern)
  app.get("/api/projects/:projectId/export/:format", isAuthenticated, async (req, res) => {
    try {
      const { projectId, format } = req.params;
      
      // Validate format
      if (!['xer', 'xml', 'pdf', 'csv', 'json'].includes(format)) {
        return res.status(400).json({ error: "Invalid export format. Supported formats: xer, xml, pdf, csv, json" });
      }
      
      let projectName = 'Project';
      let activities: any[] = [];
      
      if (hasDbStorage) {
        // Database storage approach
        
        // Get project name
        const projects = await dbStorage!.db
          .select()
          .from(dbStorage!.schema.projects)
          .where(eq(dbStorage!.schema.projects.id, projectId));
        
        if (projects.length === 0) {
          return res.status(404).json({ error: "Project not found" });
        }
        
        projectName = projects[0]?.name || 'Project';
        
        // Get activities directly from project
        const projectActivities = await dbStorage!.db
          .select()
          .from(dbStorage!.schema.activities)
          .where(eq(dbStorage!.schema.activities.projectId, projectId));
        
        // Map to ScheduleActivity format
        activities = projectActivities.map(act => ({
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
          status: act.status,
          predecessors: '', // Will be calculated from relationships
          successors: '', // Will be calculated from relationships  
          notes: act.notes
        }));
        
        // Get relationships to populate predecessors/successors
        const relationships = await dbStorage!.db
          .select()
          .from(dbStorage!.schema.relationships)
          .where(eq(dbStorage!.schema.relationships.projectId, projectId));
        
        // Build predecessor/successor maps
        const predMap = new Map<string, string[]>();
        const succMap = new Map<string, string[]>();
        
        relationships.forEach(rel => {
          const predAct = projectActivities.find(a => a.id === rel.predecessorActivityId);
          const succAct = projectActivities.find(a => a.id === rel.successorActivityId);
          
          if (predAct && succAct) {
            const predId = predAct.activityId;
            const succId = succAct.activityId;
            
            if (!predMap.has(succId)) predMap.set(succId, []);
            if (!succMap.has(predId)) succMap.set(predId, []);
            
            predMap.get(succId)!.push(predId);
            succMap.get(predId)!.push(succId);
          }
        });
        
        // Update activities with predecessor/successor info
        activities.forEach(act => {
          act.predecessors = (predMap.get(act.activityId) || []).join(',');
          act.successors = (succMap.get(act.activityId) || []).join(',');
        });
        
      } else {
        // MemStorage fallback approach
        const project = await storage.getProject(projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        
        projectName = project.name;
        const projectActivities = await storage.getActivitiesByProject(projectId);
        
        // Get relationships for memory storage
        const projectRelationships = await storage.getRelationshipsByProject(projectId);
        
        // Build predecessor/successor maps for memory storage
        const memPredMap = new Map<string, string[]>();
        const memSuccMap = new Map<string, string[]>();
        
        projectRelationships.forEach(rel => {
          const predAct = projectActivities.find(a => a.id === rel.predecessorId);
          const succAct = projectActivities.find(a => a.id === rel.successorId);
          
          if (predAct && succAct) {
            const predId = predAct.activityId;
            const succId = succAct.activityId;
            
            if (!memPredMap.has(succId)) memPredMap.set(succId, []);
            if (!memSuccMap.has(predId)) memSuccMap.set(predId, []);
            
            memPredMap.get(succId)!.push(predId);
            memSuccMap.get(predId)!.push(succId);
          }
        });
        
        // Map to ScheduleActivity format
        activities = projectActivities.map(act => ({
          id: act.id,
          scheduleId: 'mem-export',
          activityId: act.activityId,
          activityName: act.name,
          activityType: act.type,
          originalDuration: act.originalDuration,
          remainingDuration: act.remainingDuration,
          startDate: act.earlyStart,
          finishDate: act.earlyFinish,
          totalFloat: act.totalFloat,
          status: act.status,
          predecessors: (memPredMap.get(act.activityId) || []).join(','),
          successors: (memSuccMap.get(act.activityId) || []).join(','),
          notes: act.notes
        }));
      }
      
      // Create a mock schedule object for export
      const mockSchedule = {
        id: `export-${projectId}`,
        projectId,
        scheduleType: 'CPM',
        dataDate: new Date().toISOString().split('T')[0],
        startDate: activities.length > 0 ? activities.reduce((earliest, act) => 
          (!earliest || (act.startDate && act.startDate < earliest)) ? act.startDate : earliest, 
        null) || new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        finishDate: activities.length > 0 ? activities.reduce((latest, act) => 
          (!latest || (act.finishDate && act.finishDate > latest)) ? act.finishDate : latest,
        null) || new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        version: 1,
        notes: `Exported from ${projectName}`,
        fileUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Export schedule
      const exportResult = await exportSchedule(
        format as 'xer' | 'xml' | 'pdf' | 'csv' | 'json',
        mockSchedule,
        activities,
        projectName
      );
      
      // Set appropriate headers
      res.setHeader('Content-Type', exportResult.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      
      // Send file content
      res.send(exportResult.content);
    } catch (error) {
      console.error("Error exporting project:", error);
      res.status(500).json({ error: "Failed to export project" });
    }
  });
}