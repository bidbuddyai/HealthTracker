import { poe } from "./poeClient";
import type { Activity } from "../client/src/components/ScheduleEditor";

interface ParsedScheduleData {
  activities: Activity[];
  projectInfo: {
    name?: string;
    startDate?: string;
    finishDate?: string;
    dataDate?: string;
    calendarName?: string;
  };
  summary: string;
}

// XER Parser for Primavera P6 files
export class XERParser {
  private tables: Map<string, any[]> = new Map();
  private columns: Map<string, string[]> = new Map();
  
  parse(content: string): ParsedScheduleData {
    const lines = content.split('\n');
    let currentTable = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('ERMHDR')) continue;
      
      // Table definition
      if (trimmed.startsWith('%T')) {
        currentTable = trimmed.substring(3);
        this.tables.set(currentTable, []);
      }
      // Column definition
      else if (trimmed.startsWith('%F')) {
        const cols = trimmed.substring(3).split('\t');
        this.columns.set(currentTable, cols);
      }
      // Row data
      else if (trimmed.startsWith('%R') && currentTable) {
        const values = trimmed.substring(3).split('\t');
        const cols = this.columns.get(currentTable) || [];
        const row: any = {};
        cols.forEach((col, idx) => {
          row[col] = values[idx] || '';
        });
        this.tables.get(currentTable)?.push(row);
      }
    }
    
    // Extract activities from TASK table
    const tasks = this.tables.get('TASK') || [];
    const taskpred = this.tables.get('TASKPRED') || [];
    
    // Build predecessor map with relationship type and lag
    const predMap = new Map<string, { predId: string; relType: string; lag: number }[]>();
    taskpred.forEach(pred => {
      const taskId = pred.task_id;
      const predId = pred.pred_task_id;
      const relType = pred.pred_type || 'FS'; // PR_FS, PR_SS, PR_FF, PR_SF
      const lag = parseFloat(pred.lag_hr_cnt) / 8 || 0;
      
      if (!predMap.has(taskId)) {
        predMap.set(taskId, []);
      }
      predMap.get(taskId)?.push({ predId, relType: this.mapRelType(relType), lag });
    });
    
    // Convert to our Activity format with constraint and relationship data
    const activities: Activity[] = tasks.map((task, index) => {
      const preds = predMap.get(task.task_id) || [];
      const firstPred = preds[0];
      
      return {
        id: crypto.randomUUID(),
        activityId: task.task_code || task.task_id || `A${(index + 1).toString().padStart(3, '0')}`,
        activityName: task.task_name || 'Unnamed Activity',
        duration: parseInt(task.target_drtn_hr_cnt) / 8 || parseInt(task.remain_drtn_hr_cnt) / 8 || 1,
        predecessors: preds.map(p => p.predId),
        successors: [],
        status: this.mapStatus(task.status_code),
        percentComplete: parseFloat(task.phys_complete_pct) || 0,
        startDate: this.formatDate(task.target_start_date || task.act_start_date),
        finishDate: this.formatDate(task.target_end_date || task.act_end_date),
        wbs: task.wbs_id || '',
        resources: [],
        totalFloat: parseFloat(task.total_float_hr_cnt) / 8 || 0,
        freeFloat: parseFloat(task.free_float_hr_cnt) / 8 || 0,
        constraintType: this.mapConstraintType(task.cstr_type),
        constraintDate: this.formatDate(task.cstr_date),
        relationshipType: firstPred?.relType || 'FS',
        lag: firstPred?.lag || 0
      } as Activity;
    });
    
    // Extract project info
    const project = this.tables.get('PROJECT')?.[0] || {};
    
    return {
      activities,
      projectInfo: {
        name: project.proj_short_name,
        startDate: this.formatDate(project.plan_start_date),
        finishDate: this.formatDate(project.plan_end_date),
        dataDate: this.formatDate(project.last_recalc_date)
      },
      summary: `Imported P6 schedule with ${activities.length} activities`
    };
  }
  
  private mapStatus(statusCode: string): Activity['status'] {
    switch (statusCode) {
      case 'TK_Complete': return 'Completed';
      case 'TK_Active': return 'In Progress';
      default: return 'Not Started';
    }
  }
  
  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    // P6 date format: YYYY-MM-DD HH:MM
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  }
  
  private mapRelType(p6Type: string): string {
    switch (p6Type) {
      case 'PR_FS': return 'FS';
      case 'PR_SS': return 'SS';
      case 'PR_FF': return 'FF';
      case 'PR_SF': return 'SF';
      default: return 'FS';
    }
  }
  
  private mapConstraintType(p6Constraint: string): Activity['constraintType'] {
    switch (p6Constraint) {
      case 'CS_ASAP': return 'ASAP';
      case 'CS_ALAP': return 'ALAP';
      case 'CS_MSO': return 'MSO';
      case 'CS_MFO': return 'MFO';
      case 'CS_SNET': return 'SNET';
      case 'CS_SNLT': return 'SNLT';
      case 'CS_FNET': return 'FNET';
      case 'CS_FNLT': return 'FNLT';
      default: return undefined;
    }
  }
}

// MS Project XML Parser (MPX/MSPDI format)
export class MSProjectXMLParser {
  parse(content: string): ParsedScheduleData {
    // Simple XML parsing using regex for Node.js environment
    const activities: Activity[] = [];
    const taskMap = new Map<string, Activity>();
    
    // Extract tasks using regex - look for Task or task elements
    const taskPattern = /<Task[^>]*>[\s\S]*?<\/Task>/gi;
    const taskMatches = content.match(taskPattern) || [];
    
    console.log(`Found ${taskMatches.length} tasks in XML file`);
    
    // First pass: create activities
    taskMatches.forEach((taskXml, index) => {
      const taskId = this.extractXmlValue(taskXml, 'UID');
      const wbs = this.extractXmlValue(taskXml, 'WBS');
      const outlineLevelStr = this.extractXmlValue(taskXml, 'OutlineLevel');
      const outlineLevel = outlineLevelStr ? parseInt(outlineLevelStr) : -1; // Use -1 if not specified
      const isSummary = this.extractXmlValue(taskXml, 'Summary') === '1';
      
      // Skip only if explicitly marked as summary
      if (isSummary) {
        console.log(`Skipping summary task: ${this.extractXmlValue(taskXml, 'Name')}`);
        return;
      }
      
      // Extract original MS Project UID and GUID for round-trip preservation
      const originalUid = parseInt(taskId) || undefined;
      const originalGuid = this.extractXmlValue(taskXml, 'GUID') || undefined;
      const notes = this.extractXmlValue(taskXml, 'Notes') || undefined;
      
      const activity: Activity = {
        id: crypto.randomUUID(),
        activityId: this.extractXmlValue(taskXml, 'ID') || `A${(index + 1).toString().padStart(3, '0')}`,
        activityName: this.extractXmlValue(taskXml, 'Name') || 'Unnamed Activity',
        duration: this.parseDuration(this.extractXmlValue(taskXml, 'Duration')),
        predecessors: [],
        successors: [],
        status: this.mapMSPStatus(parseInt(this.extractXmlValue(taskXml, 'PercentComplete')) || 0),
        percentComplete: parseInt(this.extractXmlValue(taskXml, 'PercentComplete')) || 0,
        startDate: this.formatMSPDate(this.extractXmlValue(taskXml, 'Start')),
        finishDate: this.formatMSPDate(this.extractXmlValue(taskXml, 'Finish')),
        wbs: wbs || '',
        wbsCode: wbs || '', // Explicit WBS code preservation for MS Project
        resources: this.extractResourcesFromXml(taskXml),
        totalFloat: parseInt(this.extractXmlValue(taskXml, 'TotalSlack')) / 480 || 0, // Convert minutes to days
        isCritical: this.extractXmlValue(taskXml, 'Critical') === '1',
        constraintType: this.mapMSPConstraintType(this.extractXmlValue(taskXml, 'ConstraintType')),
        constraintDate: this.formatMSPDate(this.extractXmlValue(taskXml, 'ConstraintDate')),
        // Round-trip fidelity fields
        externalUid: originalUid,
        externalGuid: originalGuid,
        notes: notes
      } as Activity;
      
      activities.push(activity);
      if (taskId) {
        taskMap.set(taskId, activity);
      }
    });
    
    // Second pass: set up predecessors with relationship type and lag
    taskMatches.forEach(taskXml => {
      const taskId = this.extractXmlValue(taskXml, 'UID');
      const activity = taskMap.get(taskId);
      if (!activity) return;
      
      // Extract predecessor links
      const predLinkMatches = taskXml.match(/<PredecessorLink>[\s\S]*?<\/PredecessorLink>/g) || [];
      let firstRelType: string | undefined;
      let firstLag: number | undefined;
      
      predLinkMatches.forEach((predLinkXml, idx) => {
        const predUID = this.extractXmlValue(predLinkXml, 'PredecessorUID');
        const linkType = this.extractXmlValue(predLinkXml, 'Type');
        const lagValue = parseInt(this.extractXmlValue(predLinkXml, 'LinkLag')) / 4800 || 0; // Convert tenths of min to days
        
        if (idx === 0) {
          firstRelType = this.mapMSPRelType(linkType);
          firstLag = lagValue;
        }
        
        const predActivity = taskMap.get(predUID);
        if (predActivity) {
          activity.predecessors.push(predActivity.activityId);
          predActivity.successors.push(activity.activityId);
        }
      });
      
      // Store first predecessor's relationship type and lag for style analysis
      if (firstRelType !== undefined) {
        (activity as any).relationshipType = firstRelType;
        (activity as any).lag = firstLag;
      }
    });
    
    // Extract project info
    const projectName = this.extractXmlValue(content, 'Title') || this.extractXmlValue(content, 'Name') || 'Imported Project';
    const projectInfo = {
      name: projectName,
      startDate: this.formatMSPDate(this.extractXmlValue(content, 'StartDate')),
      finishDate: this.formatMSPDate(this.extractXmlValue(content, 'FinishDate')),
      dataDate: this.formatMSPDate(this.extractXmlValue(content, 'CurrentDate'))
    };
    
    return {
      activities,
      projectInfo,
      summary: `Imported MS Project schedule with ${activities.length} activities`
    };
  }
  
  private extractXmlValue(xml: string, tagName: string): string {
    const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : '';
  }
  
  private parseDuration(durationStr: string): number {
    if (!durationStr) return 1;
    // MS Project duration format: PT40H (40 hours) or P5D (5 days)
    const hoursMatch = durationStr.match(/PT(\d+)H/);
    if (hoursMatch) {
      return parseInt(hoursMatch[1]) / 8; // Convert hours to days
    }
    const daysMatch = durationStr.match(/P(\d+)D/);
    if (daysMatch) {
      return parseInt(daysMatch[1]);
    }
    // Fallback: try to extract any number
    const numberMatch = durationStr.match(/\d+/);
    return numberMatch ? parseInt(numberMatch[0]) / 8 : 1;
  }
  
  private extractResourcesFromXml(taskXml: string): string[] {
    const resources: string[] = [];
    const assignmentMatches = taskXml.match(/<Assignment>[\s\S]*?<\/Assignment>/g) || [];
    assignmentMatches.forEach(assignmentXml => {
      const resourceName = this.extractXmlValue(assignmentXml, 'ResourceName');
      if (resourceName) resources.push(resourceName);
    });
    return resources;
  }
  
  private mapMSPStatus(percentComplete: number): Activity['status'] {
    if (percentComplete === 100) return 'Completed';
    if (percentComplete > 0) return 'In Progress';
    return 'Not Started';
  }
  
  private formatMSPDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  }
  
  private mapMSPRelType(mspType: string): string {
    // MS Project Type values: 0=FF, 1=FS, 2=SF, 3=SS
    switch (mspType) {
      case '0': return 'FF';
      case '1': return 'FS';
      case '2': return 'SF';
      case '3': return 'SS';
      default: return 'FS';
    }
  }
  
  private mapMSPConstraintType(mspConstraint: string): Activity['constraintType'] {
    // MS Project ConstraintType values: 0=ASAP, 1=ALAP, 2=MSO, 3=MFO, 4=SNET, 5=SNLT, 6=FNET, 7=FNLT
    switch (mspConstraint) {
      case '0': return 'ASAP';
      case '1': return 'ALAP';
      case '2': return 'MSO';
      case '3': return 'MFO';
      case '4': return 'SNET';
      case '5': return 'SNLT';
      case '6': return 'FNET';
      case '7': return 'FNLT';
      default: return undefined;
    }
  }
}

// PDF Schedule Parser using AI
export class PDFScheduleParser {
  async parse(content: string): Promise<ParsedScheduleData> {
    const prompt = `Parse this construction schedule from a PDF export. Extract all activities with the following information:
- Activity ID
- Activity Name/Description
- Duration (in days)
- Start Date
- Finish Date
- Predecessors (list of activity IDs)
- % Complete
- Total Float
- Resources
- WBS Code

The PDF content may be from MS Project, Primavera P6, or another scheduling tool.
Look for tables, activity lists, or Gantt chart data.

PDF Content:
${content}

Return as JSON:
{
  "activities": [
    {
      "activityId": "A001",
      "activityName": "Activity Name",
      "duration": 5,
      "startDate": "2024-01-15",
      "finishDate": "2024-01-19",
      "predecessors": ["A000"],
      "percentComplete": 0,
      "totalFloat": 0,
      "wbs": "1.1",
      "resources": ["Resource1"],
      "status": "Not Started"
    }
  ],
  "projectInfo": {
    "name": "Project Name",
    "startDate": "2024-01-01",
    "finishDate": "2024-12-31",
    "dataDate": "2024-01-01"
  },
  "summary": "Description of the schedule"
}`;

    try {
      const response = await poe.chat.completions.create({
        model: "Claude-Sonnet-4",  // Better for complex document analysis
        messages: [
          { 
            role: "system", 
            content: "You are a construction schedule parser. Extract structured schedule data from PDF content. Ensure dates are in YYYY-MM-DD format."
          },
          { role: "user", content: prompt }
        ]
      });
      
      // Clean the response in case it's wrapped in markdown code fences
      let content = response.choices[0].message.content || "{}";
      // Remove markdown code fences if present
      content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      const result = JSON.parse(content);
      
      // Convert to our Activity format
      const activities: Activity[] = result.activities.map((act: any, index: number) => ({
        id: crypto.randomUUID(),
        activityId: act.activityId || `A${(index + 1).toString().padStart(3, '0')}`,
        activityName: act.activityName || 'Unnamed Activity',
        duration: act.duration || 1,
        predecessors: act.predecessors || [],
        successors: [],
        status: act.status || 'Not Started',
        percentComplete: act.percentComplete || 0,
        startDate: act.startDate || '',
        finishDate: act.finishDate || '',
        wbs: act.wbs || '',
        resources: act.resources || [],
        totalFloat: act.totalFloat || 0,
        isCritical: act.totalFloat === 0
      }));
      
      return {
        activities,
        projectInfo: result.projectInfo || {},
        summary: result.summary || `Imported PDF schedule with ${activities.length} activities`
      };
    } catch (error) {
      console.error("Error parsing PDF schedule:", error);
      throw new Error("Failed to parse PDF schedule");
    }
  }
}

// MPP Binary Parser (using AI to parse text representation)
export class MPPParser {
  async parse(content: string): Promise<ParsedScheduleData> {
    // For binary MPP files, we'll need to convert to text first
    // This would typically require a library like mpxj
    // For now, we'll use AI to parse any text representation
    
    const prompt = `Parse this MS Project schedule data. This may be a text export or representation of an MPP file.
Extract all tasks/activities with their properties.

Content:
${content}

Return as JSON with activities array containing:
- activityId (or ID)
- activityName (task name)
- duration (in days)
- startDate (YYYY-MM-DD)
- finishDate (YYYY-MM-DD)
- predecessors (array of IDs)
- percentComplete
- wbs
- resources (array)
- totalFloat (in days)
- isCritical (boolean)

Include projectInfo with name, startDate, finishDate, dataDate.`;

    try {
      const response = await poe.chat.completions.create({
        model: "Claude-Sonnet-4",  // Better for complex document analysis
        messages: [
          { 
            role: "system", 
            content: "You are an MS Project schedule parser. Extract structured data from MPP file content."
          },
          { role: "user", content: prompt }
        ]
      });
      
      // Clean the response in case it's wrapped in markdown code fences
      let content = response.choices[0].message.content || "{}";
      // Remove markdown code fences if present
      content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      const result = JSON.parse(content);
      
      const activities: Activity[] = result.activities.map((act: any, index: number) => ({
        id: crypto.randomUUID(),
        activityId: act.activityId || act.ID || `A${(index + 1).toString().padStart(3, '0')}`,
        activityName: act.activityName || act.name || 'Unnamed Activity',
        duration: act.duration || 1,
        predecessors: act.predecessors || [],
        successors: [],
        status: act.percentComplete === 100 ? 'Completed' : 
                act.percentComplete > 0 ? 'In Progress' : 'Not Started',
        percentComplete: act.percentComplete || 0,
        startDate: act.startDate || '',
        finishDate: act.finishDate || '',
        wbs: act.wbs || '',
        resources: act.resources || [],
        totalFloat: act.totalFloat || 0,
        isCritical: act.isCritical || act.totalFloat === 0
      }));
      
      return {
        activities,
        projectInfo: result.projectInfo || {},
        summary: `Imported MS Project schedule with ${activities.length} activities`
      };
    } catch (error) {
      console.error("Error parsing MPP file:", error);
      throw new Error("Failed to parse MPP file");
    }
  }
}

// Main parser that detects format and delegates
export async function parseScheduleFile(
  content: string, 
  filename: string
): Promise<ParsedScheduleData> {
  const extension = filename.toLowerCase().split('.').pop();
  
  try {
    switch (extension) {
      case 'xer':
        const xerParser = new XERParser();
        return xerParser.parse(content);
        
      case 'xml':
      case 'mspdi':
      case 'mpx':
        const xmlParser = new MSProjectXMLParser();
        return xmlParser.parse(content);
        
      case 'pdf':
        const pdfParser = new PDFScheduleParser();
        return await pdfParser.parse(content);
        
      case 'mpp':
        const mppParser = new MPPParser();
        return await mppParser.parse(content);
        
      default:
        // Try to detect format from content
        if (content.includes('ERMHDR') || content.includes('%T\tTASK')) {
          const xerParser = new XERParser();
          return xerParser.parse(content);
        } else if (content.includes('<?xml') && content.includes('<Project')) {
          const xmlParser = new MSProjectXMLParser();
          return xmlParser.parse(content);
        } else {
          // Use AI to parse unknown format
          const pdfParser = new PDFScheduleParser();
          return await pdfParser.parse(content);
        }
    }
  } catch (error) {
    console.error(`Error parsing ${extension} file:`, error);
    // Fallback to AI parsing
    const pdfParser = new PDFScheduleParser();
    return await pdfParser.parse(content);
  }
}