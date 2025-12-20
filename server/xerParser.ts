import { Activity } from '@shared/schema';
import crypto from 'crypto';

export interface ParsedSchedule {
  id: string;
  projectName: string;
  startDate: string;
  finishDate: string;
  dataDate: string;
  status: string;
  sourceFormat: string;
  importDate: string;
}

interface XerTable {
  name: string;
  fields: string[];
  rows: Record<string, string>[];
}

interface P6Task {
  task_id: string;
  task_code: string;
  task_name: string;
  wbs_id: string;
  proj_id: string;
  task_type: string;
  duration_type: string;
  target_drtn_hr_cnt: string;
  remain_drtn_hr_cnt: string;
  target_start_date: string;
  target_end_date: string;
  act_start_date: string;
  act_end_date: string;
  early_start_date: string;
  early_end_date: string;
  late_start_date: string;
  late_end_date: string;
  total_float_hr_cnt: string;
  free_float_hr_cnt: string;
  phys_complete_pct: string;
  status_code: string;
  task_memo?: string;
  constraint_type?: string;
  constraint_date?: string;
}

interface P6TaskPred {
  task_pred_id: string;
  task_id: string;
  pred_task_id: string;
  pred_type: string;
  lag_hr_cnt: string;
  proj_id: string;
}

interface P6WBS {
  wbs_id: string;
  proj_id: string;
  obs_id?: string;
  seq_num: string;
  est_wt: string;
  proj_node_flag: string;
  sum_data_flag: string;
  status_code?: string;
  wbs_short_name: string;
  wbs_name: string;
  parent_wbs_id?: string;
  anticip_start_date?: string;
  anticip_end_date?: string;
}

interface P6Calendar {
  clndr_id: string;
  clndr_name: string;
  default_flag: string;
  proj_id?: string;
  clndr_data?: string;
}

interface P6Project {
  proj_id: string;
  proj_short_name: string;
  name?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  scd_end_date?: string;
}

export class XerParser {
  private tables: Map<string, XerTable> = new Map();
  private projectId: string;
  private projectName: string;

  constructor() {
    this.projectId = '';
    this.projectName = '';
  }

  parse(xerContent: string): { schedule: ParsedSchedule; activities: Activity[] } {
    this.parseXerContent(xerContent);
    
    const project = this.getProject();
    const wbsMap = this.buildWbsHierarchy();
    const activities = this.parseActivities(wbsMap);
    const activitiesWithPredecessors = this.addPredecessors(activities);
    
    const schedule: ParsedSchedule = {
      id: crypto.randomUUID(),
      projectName: project?.proj_short_name || project?.name || 'Imported P6 Project',
      startDate: this.formatP6Date(project?.plan_start_date),
      finishDate: this.formatP6Date(project?.plan_end_date || project?.scd_end_date),
      dataDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      sourceFormat: 'P6_XER',
      importDate: new Date().toISOString()
    };

    return { schedule, activities: activitiesWithPredecessors };
  }

  private parseXerContent(content: string): void {
    const lines = content.split('\n');
    let currentTable: XerTable | null = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('%T')) {
        const tableName = trimmedLine.substring(3).trim();
        currentTable = { name: tableName, fields: [], rows: [] };
        this.tables.set(tableName, currentTable);
      } else if (trimmedLine.startsWith('%F') && currentTable) {
        const fieldsStr = trimmedLine.substring(3);
        currentTable.fields = fieldsStr.split('\t').map(f => f.trim().toLowerCase());
      } else if (trimmedLine.startsWith('%R') && currentTable) {
        const valuesStr = trimmedLine.substring(3);
        const values = valuesStr.split('\t');
        
        const row: Record<string, string> = {};
        currentTable.fields.forEach((field, index) => {
          row[field] = values[index]?.trim() || '';
        });
        currentTable.rows.push(row);
      }
    }
  }

  private getProject(): P6Project | null {
    const projectTable = this.tables.get('PROJECT');
    if (!projectTable || projectTable.rows.length === 0) {
      return null;
    }
    
    const row = projectTable.rows[0];
    this.projectId = row.proj_id || '';
    this.projectName = row.proj_short_name || row.name || '';
    
    return row as unknown as P6Project;
  }

  private buildWbsHierarchy(): Map<string, string> {
    const wbsMap = new Map<string, string>();
    const wbsTable = this.tables.get('PROJWBS');
    
    if (!wbsTable) {
      return wbsMap;
    }

    const wbsList: P6WBS[] = wbsTable.rows as unknown as P6WBS[];
    const wbsById = new Map<string, P6WBS>();
    
    wbsList.forEach(wbs => {
      wbsById.set(wbs.wbs_id, wbs);
    });

    const buildFullWbsPath = (wbsId: string): string => {
      const wbs = wbsById.get(wbsId);
      if (!wbs) return '';
      
      const parentPath = wbs.parent_wbs_id ? buildFullWbsPath(wbs.parent_wbs_id) : '';
      const shortName = wbs.wbs_short_name || wbs.wbs_name || '';
      
      return parentPath ? `${parentPath}.${shortName}` : shortName;
    };

    wbsList.forEach(wbs => {
      wbsMap.set(wbs.wbs_id, buildFullWbsPath(wbs.wbs_id));
    });

    return wbsMap;
  }

  private parseActivities(wbsMap: Map<string, string>): Activity[] {
    const taskTable = this.tables.get('TASK');
    if (!taskTable) {
      return [];
    }

    const activities: Activity[] = [];
    const tasks: P6Task[] = taskTable.rows as unknown as P6Task[];

    tasks.forEach((task, index) => {
      const wbsPath = wbsMap.get(task.wbs_id) || '';
      const durationHours = parseFloat(task.target_drtn_hr_cnt) || 0;
      const durationDays = Math.ceil(durationHours / 8);
      const remainingHours = parseFloat(task.remain_drtn_hr_cnt) || 0;
      const remainingDays = Math.ceil(remainingHours / 8);
      const totalFloatHours = parseFloat(task.total_float_hr_cnt) || 0;
      const totalFloatDays = totalFloatHours / 8;
      const percentComplete = parseFloat(task.phys_complete_pct) || 0;

      const activity = {
        id: crypto.randomUUID(),
        projectId: '', // Will be set when importing
        activityId: task.task_code || `A${(index + 1).toString().padStart(3, '0')}`,
        name: task.task_name || 'Unnamed Activity',
        type: this.mapP6ActivityTypeToEnum(task.task_type) as 'Task' | 'StartMilestone' | 'FinishMilestone' | 'LOE' | 'Hammock' | 'WBSSummary',
        wbsId: null,
        originalDuration: durationDays,
        remainingDuration: remainingDays,
        actualDuration: null,
        durationUnit: 'days',
        status: this.mapP6Status(task.status_code, percentComplete) as 'NotStarted' | 'InProgress' | 'Completed',
        percentComplete: percentComplete,
        physicalPercentComplete: null,
        earlyStart: this.formatP6Date(task.early_start_date),
        earlyFinish: this.formatP6Date(task.early_end_date),
        lateStart: this.formatP6Date(task.late_start_date),
        lateFinish: this.formatP6Date(task.late_end_date),
        actualStart: task.act_start_date ? this.formatP6Date(task.act_start_date) : null,
        actualFinish: task.act_end_date ? this.formatP6Date(task.act_end_date) : null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: totalFloatDays,
        freeFloat: parseFloat(task.free_float_hr_cnt) / 8 || 0,
        isCritical: totalFloatDays <= 0,
        criticalityIndex: null,
        calendarId: null,
        constraintType: this.mapP6ConstraintType(task.constraint_type) as 'SNET' | 'FNET' | 'SNLT' | 'FNLT' | 'MSO' | 'MFO' | null,
        constraintDate: task.constraint_date ? this.formatP6Date(task.constraint_date) : null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: task.task_memo || null,
        trade: null,
        responsibility: null,
        location: null,
        externalUid: parseInt(task.task_id) || null,
        externalGuid: null,
        wbsCode: wbsPath,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Extended fields for compatibility with parser
        predecessors: '',
        successors: '',
        wbs: wbsPath,
        p6ActivityType: this.mapP6ActivityType(task.task_type, task.duration_type)
      } as Activity;

      activities.push(activity);
    });

    return activities;
  }

  private addPredecessors(activities: Activity[]): Activity[] {
    const predTable = this.tables.get('TASKPRED');
    if (!predTable) {
      return activities;
    }

    const taskTable = this.tables.get('TASK');
    if (!taskTable) {
      return activities;
    }

    const taskIdToCode = new Map<string, string>();
    const tasks: P6Task[] = taskTable.rows as unknown as P6Task[];
    tasks.forEach(task => {
      taskIdToCode.set(task.task_id, task.task_code);
    });

    const predecessorMap = new Map<string, string[]>();
    const successorMap = new Map<string, string[]>();

    const preds: P6TaskPred[] = predTable.rows as unknown as P6TaskPred[];
    preds.forEach(pred => {
      const taskCode = taskIdToCode.get(pred.task_id);
      const predTaskCode = taskIdToCode.get(pred.pred_task_id);
      
      if (taskCode && predTaskCode) {
        const predType = this.mapP6PredType(pred.pred_type);
        const lag = parseFloat(pred.lag_hr_cnt) / 8 || 0;
        
        let predString = predTaskCode;
        if (predType !== 'FS') {
          predString += predType;
        }
        if (lag !== 0) {
          predString += lag > 0 ? `+${lag}d` : `${lag}d`;
        }

        if (!predecessorMap.has(taskCode)) {
          predecessorMap.set(taskCode, []);
        }
        predecessorMap.get(taskCode)!.push(predString);

        if (!successorMap.has(predTaskCode)) {
          successorMap.set(predTaskCode, []);
        }
        successorMap.get(predTaskCode)!.push(taskCode);
      }
    });

    return activities.map(act => ({
      ...act,
      predecessors: predecessorMap.get(act.activityId)?.join(', ') || '',
      successors: successorMap.get(act.activityId)?.join(', ') || ''
    }));
  }

  private mapP6ActivityType(taskType: string, durationType: string): string {
    const typeMap: Record<string, string> = {
      'TT_Task': 'Task Dependent',
      'TT_Rsrc': 'Resource Dependent',
      'TT_Mile': 'Milestone',
      'TT_FinMile': 'Finish Milestone',
      'TT_LOE': 'Level of Effort',
      'TT_WBS': 'WBS Summary'
    };

    const mappedType = typeMap[taskType];
    if (mappedType) {
      return mappedType;
    }

    console.log(`Unknown P6 activity type: ${taskType}, defaulting to Standard Task`);
    return 'Standard Task';
  }

  private mapP6ActivityTypeToEnum(taskType: string): string {
    const typeMap: Record<string, string> = {
      'TT_Task': 'Task',
      'TT_Rsrc': 'Task',
      'TT_Mile': 'StartMilestone',
      'TT_FinMile': 'FinishMilestone',
      'TT_LOE': 'LOE',
      'TT_WBS': 'WBSSummary'
    };

    return typeMap[taskType] || 'Task';
  }

  private mapP6Status(statusCode: string, percentComplete: number): string {
    if (percentComplete >= 100) {
      return 'Completed';
    }
    if (statusCode === 'TK_Complete') {
      return 'Completed';
    }
    if (statusCode === 'TK_Active' || percentComplete > 0) {
      return 'In Progress';
    }
    return 'Not Started';
  }

  private mapP6PredType(predType: string): string {
    const typeMap: Record<string, string> = {
      'PR_FS': 'FS',
      'PR_SS': 'SS',
      'PR_FF': 'FF',
      'PR_SF': 'SF'
    };
    return typeMap[predType] || 'FS';
  }

  private mapP6ConstraintType(constraintType?: string): string | undefined {
    if (!constraintType) return undefined;
    
    const constraintMap: Record<string, string> = {
      'CS_ALAP': 'As Late As Possible',
      'CS_MEO': 'Must End On',
      'CS_MEOA': 'Must End On or After',
      'CS_MEOB': 'Must End On or Before',
      'CS_MSO': 'Must Start On',
      'CS_MSOA': 'Must Start On or After',
      'CS_MSOB': 'Must Start On or Before',
      'CS_MANDSTART': 'Mandatory Start',
      'CS_MANDEND': 'Mandatory Finish'
    };

    return constraintMap[constraintType] || undefined;
  }

  private formatP6Date(dateStr?: string): string {
    if (!dateStr) {
      return new Date().toISOString().split('T')[0];
    }

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
    }

    return new Date().toISOString().split('T')[0];
  }

  getCalendars(): P6Calendar[] {
    const calendarTable = this.tables.get('CALENDAR');
    if (!calendarTable) {
      return [];
    }
    return calendarTable.rows as unknown as P6Calendar[];
  }

  getWbsElements(): P6WBS[] {
    const wbsTable = this.tables.get('PROJWBS');
    if (!wbsTable) {
      return [];
    }
    return wbsTable.rows as unknown as P6WBS[];
  }
}

export function detectFileType(filename: string): 'mpp' | 'xml' | 'xer' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop();
  
  switch (ext) {
    case 'xer':
      return 'xer';
    case 'xml':
      return 'xml';
    case 'mpp':
      return 'mpp';
    default:
      return 'unknown';
  }
}

export function detectContentType(content: string): 'xml' | 'xer' | 'unknown' {
  const trimmed = content.trim();
  
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<Project')) {
    return 'xml';
  }
  
  if (trimmed.startsWith('ERMHDR') || trimmed.includes('%T\t')) {
    return 'xer';
  }
  
  return 'unknown';
}
