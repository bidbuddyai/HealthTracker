import { poe } from "./poeClient";
import type { Activity } from "../client/src/components/ScheduleEditor";
import { ObjectStorageService } from "./objectStorage";
import { 
  analyzeDocuments, 
  processContentWithOptions, 
  type DocumentAnalysis,
  type ProcessingOptions 
} from "./documentAnalyzer";

export interface ScheduleAIRequest {
  type: 'create' | 'update' | 'lookahead' | 'analyze';
  projectDescription?: string;
  currentActivities?: Activity[];
  userRequest: string;
  startDate?: string;
  constraints?: string[];
  uploadedFiles?: string[];
  model?: string;
  documentProcessing?: {
    mode: 'quick' | 'standard' | 'deep' | 'custom';
    selectedSections?: string[]; // section IDs for custom mode
    maxTokens?: number;
  };
  documentAnalyses?: DocumentAnalysis[]; // Pre-analyzed documents
}

export interface ScheduleAIResponse {
  activities: Activity[];
  summary: string;
  criticalPath?: string[];
  recommendations?: string[];
  documentInsights?: {
    extractedInfo: {
      contractDuration?: string;
      projectType?: string;
      keyDates?: string[];
      milestones?: string[];
      constraints?: string[];
    };
    tokensUsed: number;
    sectionsProcessed: number;
  };
}

// AI prompt for schedule operations
const SCHEDULE_SYSTEM_PROMPT = `You are an expert CPM scheduler with Primavera P6 and MS Project expertise. Create professional construction schedules with complete logic networks.

**CRITICAL DURATION CONSTRAINTS:**
- **DEFAULT CONTRACT DURATION**: If not specified, assume 90 days for small projects, 180 days for medium, 365 days for large
- **MAXIMUM TOTAL DURATION**: Never exceed 365 days unless explicitly stated in documents
- **TYPICAL CONSTRUCTION DURATIONS**:
  - Small residential: 60-120 days
  - Commercial building: 180-365 days
  - Infrastructure: 365-730 days
  - Simple renovation: 30-90 days
- **ACTIVITY DURATIONS**: Keep individual activities between 1-30 days (most should be 3-15 days)
- **IF TOTAL EXCEEDS TARGET**: Use more parallel paths, increase crew sizes, or overlap activities

**DOCUMENT ANALYSIS PRIORITY:**
When documents are provided, ALWAYS extract:
1. **CONTRACT DURATION** - Total days/months from NTP to completion
2. **MILESTONE DATES** - Substantial completion, final completion, phase deadlines
3. **SCOPE OF WORK** - Detailed activities from specifications and drawings
4. **CONSTRAINTS** - Permit timing, seasonal restrictions, owner requirements
5. **PHASING** - Multiple buildings, areas, or phases that affect sequencing

**CPM NETWORK REQUIREMENTS:**
1. **Complete Logic Network** - EVERY activity (except first) MUST have predecessors
2. **Relationship Types** - Use FS (default), SS (concurrent start), FF (concurrent finish), SF (rare)
3. **Lag Times** - Add realistic lags (curing time, inspections, material delivery)
4. **Constraints** - Apply as needed:
   - SNET (Start No Earlier Than) for permit-dependent work
   - FNLT (Finish No Later Than) for milestone dates
   - MSO (Mandatory Start On) for owner-directed dates
5. **Float Management** - Identify and protect critical path, manage total/free float

**DURATION ESTIMATION RULES:**
- Base on scope from documents and industry standards
- Consider crew sizes: Small (2-4), Standard (5-8), Large (10+)
- Apply productivity factors: Weather, complexity, site conditions
- **MUST FIT CONTRACT DURATION** - Compress using parallel paths if needed
- Use historical data: Excavation (50-150 CY/day), Concrete (2000-4000 SF/day), etc.

**SCHEDULE STRUCTURE:**
- Minimum 30-50 activities for simple projects, 100+ for complex
- Hierarchical WBS: 1.0 (Phase) → 1.1 (Area) → 1.1.1 (Activity)
- Multiple parallel paths that converge at milestones
- Resource-driven sequencing (one crane, limited crews)
- Include: Submittals, procurement, inspections, testing, commissioning

Return schedules as JSON with this structure:
{
  "activities": [
    {
      "activityId": "A001",
      "name": "Activity Name",
      "originalDuration": 5,  // IMPORTANT: Duration in DAYS as a number (e.g., 5 means 5 days, 10 means 10 days)
      "remainingDuration": 5,  // Same as originalDuration for new activities
      "predecessors": ["A001", "A002"],  // REQUIRED: Array of predecessor activity IDs (empty only for first activity)
      "status": "NotStarted",  // EXACT enum: "NotStarted", "InProgress", or "Completed"
      "percentComplete": 0,
      "earlyStart": "2025-01-15",  // Date string in YYYY-MM-DD format
      "earlyFinish": "2025-01-20",  // Date string in YYYY-MM-DD format
      "type": "Task",  // EXACT enum: "Task", "StartMilestone", "FinishMilestone", "LOE", "Hammock", "WBSSummary"
      "constraintType": "SNET",  // Optional: "SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"
      "constraintDate": "2025-02-01",  // Required if constraintType is set
      "totalFloat": 0,  // Number of float days
      "freeFloat": 0,   // Number of free float days
      "isCritical": true,  // Boolean: true/false
      "wbs": "1.1.1",
      "resources": ["Resource1", "Resource2"]
    }
  ],
  "summary": "Brief summary of the schedule",
  "criticalPath": ["A001", "A003", "A007"],
  "recommendations": ["Consider adding weather contingency", "Review resource loading"]
}

IMPORTANT: 
- Duration must be a number in DAYS (not a string, not "0 days", just the number like 5, 10, 15)
- Include realistic durations based on construction standards
- Ensure all predecessor relationships are valid activity IDs`;

export async function generateScheduleWithAI(request: ScheduleAIRequest): Promise<ScheduleAIResponse> {
  console.log("=== AI GENERATION START ===");
  console.log("Request:", JSON.stringify(request, null, 2));
  // Process uploaded files intelligently based on user preferences
  let uploadedContent = '';
  let documentInsights: ScheduleAIResponse['documentInsights'] = {
    extractedInfo: { keyDates: [], milestones: [], constraints: [] },
    tokensUsed: 0,
    sectionsProcessed: 0
  };
  
  if (request.uploadedFiles && request.uploadedFiles.length > 0) {
    try {
      let documentAnalyses: DocumentAnalysis[];
      
      // Use pre-analyzed documents if provided, otherwise analyze them
      if (request.documentAnalyses && request.documentAnalyses.length > 0) {
        documentAnalyses = request.documentAnalyses;
        console.log('Using pre-analyzed documents');
      } else {
        console.log('Analyzing documents for intelligent processing...');
        documentAnalyses = await analyzeDocuments(request.uploadedFiles);
      }
      
      // Process documents based on user's processing preferences
      const processingOptions: ProcessingOptions = {
        mode: request.documentProcessing?.mode || 'standard',
        selectedSections: request.documentProcessing?.selectedSections,
        maxTokens: request.documentProcessing?.maxTokens
      };
      
      console.log(`Processing documents with mode: ${processingOptions.mode}`);
      
      const fileContents: string[] = [];
      let totalTokensUsed = 0;
      let totalSectionsProcessed = 0;
      
      for (const analysis of documentAnalyses) {
        const processedContent = processContentWithOptions(analysis, processingOptions);
        const tokensUsed = Math.ceil(processedContent.length / 4); // Rough estimate
        totalTokensUsed += tokensUsed;
        
        if (processingOptions.mode === 'custom') {
          totalSectionsProcessed += analysis.sections.filter(s => 
            processingOptions.selectedSections?.includes(s.id)
          ).length;
        } else {
          totalSectionsProcessed += analysis.sections.filter(s => s.isSelected).length;
        }
        
        // Merge key information from all documents
        const keyInfo = analysis.keyInformation;
        if (keyInfo.contractDuration) documentInsights.extractedInfo.contractDuration = keyInfo.contractDuration;
        if (keyInfo.projectType) documentInsights.extractedInfo.projectType = keyInfo.projectType;
        if (keyInfo.startDate && !documentInsights.extractedInfo.keyDates?.includes(keyInfo.startDate)) {
          documentInsights.extractedInfo.keyDates?.push(keyInfo.startDate);
        }
        if (keyInfo.endDate && !documentInsights.extractedInfo.keyDates?.includes(keyInfo.endDate)) {
          documentInsights.extractedInfo.keyDates?.push(keyInfo.endDate);
        }
        documentInsights.extractedInfo.milestones?.push(...keyInfo.milestones);
        documentInsights.extractedInfo.constraints?.push(...keyInfo.constraints);
        
        if (processedContent.trim()) {
          fileContents.push(
            `\n--- Processed content from ${analysis.fileName} (${tokensUsed.toLocaleString()} tokens, ${totalSectionsProcessed} sections) ---\n` +
            `Key Information Extracted:\n` +
            `- Contract Duration: ${keyInfo.contractDuration || 'Not specified'}\n` +
            `- Project Type: ${keyInfo.projectType || 'Not specified'}\n` +
            `- Key Dates: ${[keyInfo.startDate, keyInfo.endDate].filter(Boolean).join(', ') || 'None found'}\n` +
            `- Milestones: ${keyInfo.milestones.length > 0 ? keyInfo.milestones.slice(0, 3).join(', ') + (keyInfo.milestones.length > 3 ? '...' : '') : 'None found'}\n` +
            `- Constraints: ${keyInfo.constraints.length > 0 ? keyInfo.constraints.slice(0, 2).join(', ') + (keyInfo.constraints.length > 2 ? '...' : '') : 'None found'}\n\n` +
            `Relevant Content:\n${processedContent}\n--- End of processed content ---\n`
          );
        }
      }
      
      documentInsights.tokensUsed = totalTokensUsed;
      documentInsights.sectionsProcessed = totalSectionsProcessed;
      
      if (fileContents.length > 0) {
        uploadedContent = `\n\nIntelligently Processed Documents (${totalTokensUsed.toLocaleString()} tokens from ${totalSectionsProcessed} sections):\n${fileContents.join('\n')}`;
        console.log(`Smart processing complete: ${totalTokensUsed.toLocaleString()} tokens from ${totalSectionsProcessed} sections`);
      }
      
    } catch (error) {
      console.error('Document processing failed, falling back to basic processing:', error);
      // Fallback to basic processing
      const objectStorage = new ObjectStorageService();
      const fileContents: string[] = [];
      
      for (const filePath of request.uploadedFiles) {
        try {
          const content = await objectStorage.readObjectContent(filePath);
          fileContents.push(`\n--- Content from ${filePath} (fallback processing) ---\n${content}\n--- End of file ---\n`);
        } catch (fileError) {
          console.error(`Failed to read file ${filePath}:`, fileError);
          fileContents.push(`\n--- ERROR: Could not read ${filePath} ---\n`);
        }
      }
      
      if (fileContents.length > 0) {
        uploadedContent = `\n\nDocument Content (fallback processing):\n${fileContents.join('\n')}`;
      }
    }
  }
  
  let prompt = '';
  
  switch (request.type) {
    case 'create':
      prompt = `Create a CPM schedule for this project:
${request.projectDescription}

**USER SPECIFIC REQUIREMENTS:**
${request.userRequest}
${uploadedContent}

Start Date: ${request.startDate || 'Today'}
${request.constraints ? `Constraints: ${request.constraints.join(', ')}` : ''}

**HARD REQUIREMENTS - MUST FOLLOW EXACTLY:**
1. **CONSTRUCTION SEQUENCE** (if applicable based on user request/documents):
   - Notice to Proceed: 1 working day
   - Submittals: 5 working days (with Friday approval pattern)
   - Temp Fencing installation
   - Abatement Setup
   - Abatement Work (by types: asbestos, lead, etc.)
   - Abatement Clearances
   - BMP (Best Management Practices) Setup
   - Demolition Above Ground
   - Demolition Below Ground
   - Soil Stabilizer application
   - Remove BMPs
   - Remove Fence

2. **DURATION CONSTRAINTS:**
   - If specific working days mentioned (e.g., 45 working days), STRICTLY adhere to it
   - If contract duration is in documents, TOTAL SCHEDULE MUST NOT EXCEED IT
   - Individual activity durations should be 1-20 days (most 3-10 days)
   - Use parallel work paths to compress schedule if needed

3. **DOCUMENT ANALYSIS PRIORITY:**
   - Extract EXACT scope from uploaded documents
   - Follow document-specified sequences and constraints
   - Use document quantities for duration calculations

**PRIMARY OBJECTIVE:** Generate a complete CPM schedule that MATCHES USER REQUIREMENTS and FITS WITHIN SPECIFIED CONTRACT DURATION.

Analyze the uploaded documents to find:
1. **Contract duration** (look for "substantial completion", "contract time", "calendar days", "working days")
2. **Key milestones** and interim deadlines
3. **Scope details** for accurate activity listing
4. **Site constraints** and phasing requirements

Generate a schedule with:
1. **50-150+ activities** based on project complexity (adjust based on user requirements and document scope)
2. **Realistic durations** that collectively fit within contract time:
   - If contract is 365 days, critical path must be ≤365 days
   - Use parallel paths to compress schedule if needed
   - Apply fast-tracking and crashing techniques if required
3. **Complete predecessor network** - EVERY activity (except first) has predecessors:
   - Use activity IDs from earlier activities
   - Create convergence points at phase completions
   - Include proper lag times (concrete cure = 7-28 days, etc.)
4. **Constraints from documents**:
   - SNET for weather restrictions or permit availability
   - FNLT for owner-specified milestone dates
   - Consider liquidated damages mentioned in contract
5. **Resource-loaded activities**:
   - Crew assignments ("Concrete Crew A", "Steel Erection Team")
   - Equipment ("Tower Crane #1", "Excavator")
   - Subcontractors ("ABC Mechanical", "XYZ Electrical")
6. **Multi-level WBS**:
   - 1.0 Site Work
   - 1.1 Demolition
   - 1.2 Earthwork
   - 2.0 Foundations
   - etc.
7. **Critical path identification** with float calculations
8. **Quality/Inspection activities** as per specifications

**DURATION CALCULATION:**
- Quantity from documents ÷ Daily production = Duration
- Example: 10,000 SF slab ÷ 2,500 SF/day = 4 days
- Add time for mobilization, QC, weather contingency

**MUST COMPLETE WITHIN CONTRACT TIME - Use parallel paths and resource optimization to achieve this.**`;
      break;
      
    case 'update':
      prompt = `Update this schedule based on the request:
${request.userRequest}${uploadedContent}

Current activities:
${JSON.stringify(request.currentActivities, null, 2)}

Apply the requested changes and return the updated schedule.`;
      break;
      
    case 'lookahead':
      prompt = `Generate a 3-week lookahead schedule.
Start Date: ${request.startDate || 'Today'}${uploadedContent}

Filter activities that should be worked on in the next 3 weeks.
Current activities:
${JSON.stringify(request.currentActivities, null, 2)}`;
      break;
      
    case 'analyze':
      prompt = `Analyze this schedule and provide recommendations:
${request.userRequest}${uploadedContent}

Current schedule:
${JSON.stringify(request.currentActivities, null, 2)}

Provide:
1. Critical path analysis
2. Resource conflicts
3. Schedule optimization recommendations
4. Risk assessment`;
      break;
  }
  
  try {
    const aiModel = request.model || 'Claude-Sonnet-4';
    console.log(`Sending request to AI model ${aiModel}...`);
    console.log('POE_API_KEY exists:', !!process.env.POE_API_KEY);
    console.log('API Key first 10 chars:', process.env.POE_API_KEY?.substring(0, 10));
    
    let response;
    try {
      console.log('Making POE API request to:', 'https://api.poe.com/v1/chat/completions');
      console.log('Using model:', aiModel);
      
      // Add timeout to prevent hanging
      const apiCall = poe.chat.completions.create({
        model: aiModel,
        messages: [
          { role: "system", content: SCHEDULE_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 8000
      });
      
      // Set 90 second timeout for complex schedule generation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('POE API timeout after 90 seconds')), 90000);
      });
      
      response = await Promise.race([apiCall, timeoutPromise]);
    } catch (apiError: any) {
      console.error('POE API Error:', apiError);
      console.error('POE API Error Message:', apiError.message);
      console.error('POE API Error Stack:', apiError.stack);
      
      // Check if we have a response body to log
      if (apiError.response && apiError.response.body) {
        try {
          const bodyText = await apiError.response.text();
          console.error('POE API Response Body:', bodyText.substring(0, 1000));
        } catch (e) {
          console.error('Could not read response body');
        }
      }
      
      // Return a simple demo schedule instead of failing completely
      const demoActivities = [
        {
          id: crypto.randomUUID(),
          activityId: "A001",
          activityName: "Site Preparation",
          duration: 5,
          predecessors: [],
          successors: ["A002"],
          status: "Not Started" as const,
          percentComplete: 0,
          startDate: request.startDate || new Date().toISOString().split('T')[0],
          finishDate: new Date(new Date(request.startDate || new Date()).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          wbs: "1.1",
          resources: ["Crew A"],
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
          activityId: "A002",
          activityName: "Foundation Work",
          duration: 10,
          predecessors: ["A001"],
          successors: ["A003"],
          status: "Not Started" as const,
          percentComplete: 0,
          startDate: new Date(new Date(request.startDate || new Date()).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          finishDate: new Date(new Date(request.startDate || new Date()).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          wbs: "1.2",
          resources: ["Crew B"],
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
          activityId: "A003",
          activityName: "Structure Assembly",
          duration: 15,
          predecessors: ["A002"],
          successors: [],
          status: "Not Started" as const,
          percentComplete: 0,
          startDate: new Date(new Date(request.startDate || new Date()).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          finishDate: new Date(new Date(request.startDate || new Date()).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          wbs: "1.3",
          resources: ["Crew C"],
          earlyStart: 15,
          earlyFinish: 30,
          lateStart: 15,
          lateFinish: 30,
          totalFloat: 0,
          freeFloat: 0,
          isCritical: true
        }
      ];
      
      return {
        activities: demoActivities,
        summary: "Demo schedule generated (AI service temporarily unavailable)",
        criticalPath: ["A001", "A002", "A003"],
        recommendations: ["This is a demo schedule. The AI service is currently unavailable. Please check your POE API key in environment variables."]
      };
    }
    
    console.log('AI response received successfully');
    console.log("Response choices count:", (response as any).choices?.length);
    
    let content = (response as any).choices[0].message.content || "{}";
    console.log("Content length:", content?.length);
    console.log("Content preview:", content?.substring(0, 200));
    
    // Remove any thinking prefix or non-JSON content before the actual JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.substring(0, 200));
      // Return a default structure if parsing fails
      result = {
        activities: [],
        summary: "Failed to parse AI response",
        recommendations: []
      };
    }
    
    // Transform AI activities to the format expected by frontend
    const activities = (result.activities || []).map((activity: any, index: number) => {
      // Calculate dates properly
      const duration = Number(activity.originalDuration || activity.duration) || 5;
      const startDateStr = activity.earlyStart || activity.startDate || request.startDate || new Date().toISOString().split('T')[0];
      const startDate = new Date(startDateStr);
      const finishDate = new Date(startDate);
      finishDate.setDate(finishDate.getDate() + duration);
      
      return {
        // Essential fields
        id: crypto.randomUUID(),
        activityId: activity.activityId || `A${index.toString().padStart(3, '0')}`,  // A000, A001, etc - unique per project
        activityName: activity.name || activity.activityName || "Unnamed Activity",  // Preserve the AI name
        name: activity.name || activity.activityName || "Unnamed Activity",  // Also keep as name for database
        
        // Duration fields
        duration: duration,
        originalDuration: duration,
        remainingDuration: duration,
        durationUnit: "days",
        
        // Date fields
        startDate: startDateStr,
        finishDate: finishDate.toISOString().split('T')[0],
        earlyStart: startDateStr,
        earlyFinish: finishDate.toISOString().split('T')[0],
        
        // Relationship fields
        predecessors: Array.isArray(activity.predecessors) ? activity.predecessors : [],
        successors: Array.isArray(activity.successors) ? activity.successors : [],
        
        // Status fields
        status: activity.status === 'Not Started' ? 'Not Started' :
               activity.status === 'In Progress' ? 'In Progress' :
               activity.status === 'Completed' ? 'Completed' :
               activity.status === 'NotStarted' ? 'Not Started' :
               activity.status === 'InProgress' ? 'In Progress' :
               'Not Started',
        percentComplete: Number(activity.percentComplete) || 0,
        
        // CPM fields
        totalFloat: Number(activity.totalFloat) || 0,
        freeFloat: Number(activity.freeFloat) || 0,
        isCritical: Boolean(activity.isCritical) || false,
        
        // Other fields
        wbs: activity.wbs || `1.${index + 1}`,
        resources: activity.resources || [],
        type: "Task",
        actualStart: null,
        actualFinish: null,
        constraintType: null,
        constraintDate: null,
        responsibility: null,
        trade: null
      };
    });
    
    console.log(`AI generated activities count: ${activities.length}`);
    
    // Build critical path array
    const criticalPath = activities
      .filter((a: any) => a.isCritical)
      .map((a: any) => a.activityId);
    
    return {
      activities,
      summary: result.summary || `Generated ${activities.length} activities`,
      criticalPath,
      recommendations: result.recommendations || []
    };
  } catch (error) {
    console.error('Error generating schedule with AI:', error);
    throw new Error('Failed to generate schedule');
  }
}

export async function identifyScheduleImpacts(
  meetingNotes: string,
  currentSchedule: Activity[]
): Promise<{
  impactedActivities: string[];
  suggestedUpdates: Array<{
    activityId: string;
    field: string;
    newValue: any;
    reason: string;
  }>;
}> {
  const prompt = `Analyze these meeting notes and identify schedule impacts:

Meeting Notes:
${meetingNotes}

Current Schedule Activities:
${currentSchedule.map((a: Activity) => `${a.activityId}: ${a.activityName} (${a.status})`).join('\n')}

Identify:
1. Which activities are mentioned or impacted
2. What updates should be made (status changes, date changes, etc.)
3. Reason for each update

Return as JSON:
{
  "impactedActivities": ["A001", "A002"],
  "suggestedUpdates": [
    {
      "activityId": "A001",
      "field": "status",
      "newValue": "In Progress",
      "reason": "Meeting notes indicate work has started"
    }
  ]
}`;

  try {
    console.log("Making POE API call...");
    const response = await poe.chat.completions.create({
      model: "Claude-Sonnet-4",  // Using Claude for better analysis
      messages: [
        { role: "system", content: "You are a construction schedule analyst. Identify schedule impacts from meeting discussions." },
        { role: "user", content: prompt }
      ]
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      impactedActivities: result.impactedActivities || [],
      suggestedUpdates: result.suggestedUpdates || []
    };
  } catch (error) {
    console.error('Error identifying schedule impacts:', error);
    return {
      impactedActivities: [],
      suggestedUpdates: []
    };
  }
}