import type { ProjectSchedule, ScheduleActivity, Activity } from "@shared/schema";

interface ExportData {
  schedule: ProjectSchedule;
  activities: ScheduleActivity[];
  projectName?: string;
}

// Dependency validation utilities
interface ActivityNode {
  activityId: string;
  activityName: string;
  startDate: string;
  finishDate: string;
  predecessors: string[];
}

export class DependencyValidator {
  /**
   * CRITICAL FIX: Breaks circular dependencies using deterministic cycle breaking algorithm
   * Instead of just detecting cycles, this method actively removes problematic edges to create a DAG
   */
  static detectAndBreakCircularDependencies(activities: ScheduleActivity[]): {
    hasCircularDependencies: boolean;
    circularNodes: string[];
    validPredecessorMap: Map<string, string[]>;
    removedEdges: Array<{ from: string, to: string, reason: string }>;
  } {
    
    const activityMap = new Map<string, ScheduleActivity>();
    const removedEdges: Array<{ from: string, to: string, reason: string }> = [];
    const validPredecessorMap = new Map<string, string[]>();
    
    // Initialize activity map
    activities.forEach(act => {
      activityMap.set(act.activityId, act);
      validPredecessorMap.set(act.activityId, []);
    });
    
    // Step 1: Remove self-references and invalid predecessors
    activities.forEach(act => {
      if (act.predecessors) {
        const predList = act.predecessors.split(',').filter(p => p.trim());
        const cleanPreds: string[] = [];
        
        predList.forEach(predId => {
          const cleanPredId = predId.trim();
          
          // CRITICAL: Remove self-references
          if (cleanPredId === act.activityId) {
            removedEdges.push({ 
              from: cleanPredId, 
              to: act.activityId, 
              reason: 'Self-reference removed' 
            });
            return;
          }
          
          // Remove invalid predecessors (not found in activity map)
          if (!activityMap.has(cleanPredId)) {
            removedEdges.push({ 
              from: cleanPredId, 
              to: act.activityId, 
              reason: 'Invalid predecessor not found' 
            });
            return;
          }
          
          cleanPreds.push(cleanPredId);
        });
        
        validPredecessorMap.set(act.activityId, cleanPreds);
      }
    });
    
    // Step 2: Iteratively break cycles using Kahn's algorithm with edge removal
    let iterationCount = 0;
    const maxIterations = activities.length * 2; // Prevent infinite loops
    
    while (iterationCount < maxIterations) {
      iterationCount++;
      
      // Build current graph state
      const graph = new Map<string, string[]>();
      const inDegree = new Map<string, number>();
      
      // Initialize
      activities.forEach(act => {
        graph.set(act.activityId, []);
        inDegree.set(act.activityId, 0);
      });
      
      // Build graph from current valid predecessors
      Array.from(validPredecessorMap.entries()).forEach(([actId, preds]) => {
        preds.forEach(predId => {
          if (graph.has(predId) && inDegree.has(actId)) {
            graph.get(predId)!.push(actId);
            inDegree.set(actId, (inDegree.get(actId) || 0) + 1);
          }
        });
      });
      
      // Run Kahn's algorithm
      const queue: string[] = [];
      const sortedNodes: string[] = [];
      const tempInDegree = new Map(inDegree);
      
      // Find nodes with no incoming edges
      Array.from(tempInDegree.entries()).forEach(([nodeId, degree]) => {
        if (degree === 0) {
          queue.push(nodeId);
        }
      });
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        sortedNodes.push(current);
        
        const neighbors = graph.get(current) || [];
        for (const neighbor of neighbors) {
          tempInDegree.set(neighbor, (tempInDegree.get(neighbor) || 0) - 1);
          if (tempInDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }
      
      // Check if we have a DAG (no cycles)
      if (sortedNodes.length === activities.length) {
        break;
      }
      
      // Still have cycles - deterministically remove edges
      const remainingNodes = activities.filter(act => !sortedNodes.includes(act.activityId));
      
      if (remainingNodes.length === 0) {
        break;
      }
      
      // Find the edge to remove using deterministic priority:
      // 1. Edges that violate date constraints
      // 2. Edges from activities with later start dates
      // 3. Lexicographic fallback for determinism
      
      let edgeToRemove: { from: string, to: string, reason: string } | null = null;
      
      // Priority 1: Date constraint violations
      for (const node of remainingNodes) {
        const activity = activityMap.get(node.activityId)!;
        const preds = validPredecessorMap.get(node.activityId) || [];
        
        for (const predId of preds) {
          const predActivity = activityMap.get(predId);
          if (!predActivity) continue;
          
          const actStartDate = new Date(activity.startDate || '1900-01-01');
          const predFinishDate = new Date(predActivity.finishDate || '1900-01-01');
          
          if (predFinishDate > actStartDate) {
            edgeToRemove = {
              from: predId,
              to: node.activityId,
              reason: 'Date constraint violation - predecessor finishes after successor starts'
            };
            break;
          }
        }
        if (edgeToRemove) break;
      }
      
      // Priority 2: Later-starting predecessor edges
      if (!edgeToRemove) {
        for (const node of remainingNodes) {
          const activity = activityMap.get(node.activityId)!;
          const preds = validPredecessorMap.get(node.activityId) || [];
          
          for (const predId of preds) {
            const predActivity = activityMap.get(predId);
            if (!predActivity) continue;
            
            const actStartDate = new Date(activity.startDate || '1900-01-01');
            const predStartDate = new Date(predActivity.startDate || '1900-01-01');
            
            if (predStartDate >= actStartDate) {
              edgeToRemove = {
                from: predId,
                to: node.activityId,
                reason: 'Illogical sequence - predecessor starts same or later than successor'
              };
              break;
            }
          }
          if (edgeToRemove) break;
        }
      }
      
      // Priority 3: Lexicographic fallback (deterministic)
      if (!edgeToRemove) {
        // Sort remaining nodes and their predecessors lexicographically
        const sortedRemainingNodes = remainingNodes.sort((a, b) => a.activityId.localeCompare(b.activityId));
        
        for (const node of sortedRemainingNodes) {
          const preds = validPredecessorMap.get(node.activityId) || [];
          if (preds.length > 0) {
            const sortedPreds = preds.sort();
            edgeToRemove = {
              from: sortedPreds[0],
              to: node.activityId,
              reason: 'Lexicographic cycle breaking (deterministic fallback)'
            };
            break;
          }
        }
      }
      
      // Remove the identified edge
      if (edgeToRemove) {
        const currentPreds = validPredecessorMap.get(edgeToRemove.to) || [];
        const filteredPreds = currentPreds.filter(p => p !== edgeToRemove!.from);
        validPredecessorMap.set(edgeToRemove.to, filteredPreds);
        removedEdges.push(edgeToRemove);
        
      } else {
        break;
      }
    }
    
    // Final validation
    const finalGraph = new Map<string, string[]>();
    const finalInDegree = new Map<string, number>();
    
    activities.forEach(act => {
      finalGraph.set(act.activityId, []);
      finalInDegree.set(act.activityId, 0);
    });
    
    Array.from(validPredecessorMap.entries()).forEach(([actId, preds]) => {
      preds.forEach(predId => {
        if (finalGraph.has(predId)) {
          finalGraph.get(predId)!.push(actId);
          finalInDegree.set(actId, (finalInDegree.get(actId) || 0) + 1);
        }
      });
    });
    
    // Final Kahn's algorithm to verify DAG
    const finalQueue: string[] = [];
    const finalSorted: string[] = [];
    const finalTempInDegree = new Map(finalInDegree);
    
    Array.from(finalTempInDegree.entries()).forEach(([nodeId, degree]) => {
      if (degree === 0) {
        finalQueue.push(nodeId);
      }
    });
    
    while (finalQueue.length > 0) {
      const current = finalQueue.shift()!;
      finalSorted.push(current);
      
      const neighbors = finalGraph.get(current) || [];
      for (const neighbor of neighbors) {
        finalTempInDegree.set(neighbor, (finalTempInDegree.get(neighbor) || 0) - 1);
        if (finalTempInDegree.get(neighbor) === 0) {
          finalQueue.push(neighbor);
        }
      }
    }
    
    const finalHasCircularDependencies = finalSorted.length !== activities.length;
    const finalCircularNodes = activities
      .filter(act => !finalSorted.includes(act.activityId))
      .map(act => act.activityId);
    
    
    
    return {
      hasCircularDependencies: finalHasCircularDependencies,
      circularNodes: finalCircularNodes,
      validPredecessorMap,
      removedEdges
    };
  }
  
  /**
   * Validates logical sequence based on dates and activity names
   */
  static validateLogicalSequence(activities: ScheduleActivity[]): {
    validatedPredecessors: Map<string, string[]>;
    warnings: string[];
  } {
    
    const validatedPredecessors = new Map<string, string[]>();
    const warnings: string[] = [];
    const activityMap = new Map<string, ScheduleActivity>();
    
    activities.forEach(act => activityMap.set(act.activityId, act));
    
    // Sort activities by start date for logical ordering
    const sortedActivities = [...activities].sort((a, b) => {
      const dateA = new Date(a.startDate || '1900-01-01');
      const dateB = new Date(b.startDate || '1900-01-01');
      return dateA.getTime() - dateB.getTime();
    });
    
    activities.forEach(act => {
      const validPreds: string[] = [];
      
      if (act.predecessors) {
        const predList = act.predecessors.split(',').filter(p => p.trim());
        
        for (const predId of predList) {
          const cleanPredId = predId.trim();
          const predActivity = activityMap.get(cleanPredId);
          
          if (!predActivity) {
            warnings.push(`Activity ${act.activityId} has invalid predecessor ${cleanPredId} - predecessor not found`);
            continue;
          }
          
          // Date-based validation
          const actStartDate = new Date(act.startDate || '1900-01-01');
          const predFinishDate = new Date(predActivity.finishDate || '1900-01-01');
          
          if (predFinishDate > actStartDate) {
            warnings.push(`Activity ${act.activityId} (${act.activityName}) has predecessor ${cleanPredId} (${predActivity.activityName}) that finishes after it starts - removing invalid predecessor`);
            continue;
          }
          
          // Logical name-based validation for construction sequences
          const logicalIssue = this.checkConstructionLogic(act, predActivity);
          if (logicalIssue) {
            warnings.push(`Activity ${act.activityId} has illogical predecessor ${cleanPredId}: ${logicalIssue} - removing invalid predecessor`);
            continue;
          }
          
          validPreds.push(cleanPredId);
        }
      }
      
      validatedPredecessors.set(act.activityId, validPreds);
    });
    
    
    return { validatedPredecessors, warnings };
  }
  
  /**
   * Check construction-specific logic violations
   */
  private static checkConstructionLogic(activity: ScheduleActivity, predecessor: ScheduleActivity): string | null {
    const actName = activity.activityName?.toLowerCase() || '';
    const predName = predecessor.activityName?.toLowerCase() || '';
    
    // Air quality testing should not depend on remediation that happens after it
    if (actName.includes('air quality') && predName.includes('abatement')) {
      return 'Air quality testing should not depend on abatement work';
    }
    
    // Testing activities should generally not depend on later construction phases
    if (actName.includes('testing') && (predName.includes('completion') || predName.includes('final'))) {
      return 'Testing should not depend on final completion activities';
    }
    
    // Clearances should not depend on work that requires the clearance
    if (actName.includes('clearance') && predName.includes('construction')) {
      return 'Clearances should not depend on construction work';
    }
    
    return null; // No logical issue found
  }
}

// XER Exporter for Primavera P6
export class XERExporter {
  private tables: Map<string, any[]> = new Map();
  private currentDate = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  export(data: ExportData): string {
    const { schedule, activities, projectName } = data;
    let output = '';
    
    // XER Header
    output += 'ERMHDR\t1.0\tProject\t' + this.currentDate + '\tPrimavera\tP6\n';
    output += '%T\tCURRENCY\n';
    output += '%F\tcurr_id\tcurr_symbol\tcurr_type\n';
    output += '%R\t1\t$\tUS Dollar\n';
    
    // Project table
    output += '%T\tPROJECT\n';
    output += '%F\tproj_id\tproj_short_name\tplan_start_date\tplan_end_date\tlast_recalc_date\n';
    output += '%R\t1\t' + (projectName || 'Project') + '\t' + schedule.startDate + '\t' + schedule.finishDate + '\t' + schedule.dataDate + '\n';
    
    // Calendar table
    output += '%T\tCALENDAR\n';
    output += '%F\tcalendar_id\tcalendar_name\tdefault_flag\n';
    output += '%R\t1\tStandard\tY\n';
    
    // Task table
    output += '%T\tTASK\n';
    output += '%F\ttask_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\tphys_complete_pct\ttotal_float_hr_cnt\tfree_float_hr_cnt\twbs_id\n';
    
    activities.forEach((act, index) => {
      const statusCode = this.mapStatusToP6(act.status || 'Not Started');
      const duration = (act.originalDuration || 0) * 8; // Convert days to hours
      const remainingDuration = (act.remainingDuration || 0) * 8;
      const percentComplete = act.status === 'Completed' ? 100 : 
                             act.status === 'In Progress' ? 50 : 0;
      const totalFloat = (act.totalFloat || 0) * 8;
      
      output += '%R\t' + (index + 1) + '\t' + act.activityId + '\t' + act.activityName + '\tTask Activity\t' + 
                statusCode + '\t' + act.startDate + '\t' + act.finishDate + '\t' + 
                duration + '\t' + remainingDuration + '\t' + percentComplete + '\t' + 
                totalFloat + '\t0\t' + (act.notes || '') + '\n';
    });
    
    // Task predecessors table
    output += '%T\tTASKPRED\n';
    output += '%F\ttaskpred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt\n';
    
    let predId = 1;
    activities.forEach((act, index) => {
      if (act.predecessors) {
        const predList = act.predecessors.split(',').filter(p => p);
        predList.forEach(pred => {
          const predIndex = activities.findIndex(a => a.activityId === pred.trim());
          if (predIndex >= 0) {
            output += '%R\t' + predId + '\t' + (index + 1) + '\t' + (predIndex + 1) + '\tFS\t0\n';
            predId++;
          }
        });
      }
    });
    
    output += '%E\n'; // End of file marker
    return output;
  }
  
  private mapStatusToP6(status: string): string {
    switch (status) {
      case 'Completed': return 'TK_Complete';
      case 'In Progress': return 'TK_Active';
      default: return 'TK_NotStart';
    }
  }
}

// MS Project XML Exporter (MSPDI format)
export class MSProjectXMLExporter {
  private generateGUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  /**
   * UTC-only working days calculation to avoid timezone issues
   * Calculates finish date based on working days (Mon-Fri)
   */
  private calculateWorkingDaysUTC(startDate: string, durationDays: number): string {
    if (durationDays <= 0) {
      return startDate; // For zero duration (milestones), return same date
    }
    
    // Parse date in UTC to avoid timezone issues
    const [year, month, day] = startDate.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    let workingDaysAdded = 0;
    const current = new Date(start);
    
    while (workingDaysAdded < durationDays) {
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
        workingDaysAdded++;
      }
      // Only advance to next day if we haven't reached the target duration
      if (workingDaysAdded < durationDays) {
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }
    
    return current.toISOString().split('T')[0];
  }
  
  private formatDateForMSP(dateStr: string, time: string = '08:00:00'): string {
    // MS Project expects dates in strict ISO 8601 format
    // Format: YYYY-MM-DDTHH:MM:SS (no timezone to prevent drift)
    // This ensures tasks don't shift from 8 AM to 5 PM due to timezone conversion
    
    if (!dateStr) {
      const now = new Date();
      return `${now.toISOString().split('T')[0]}T${time}`;
    }
    
    // Parse just the date part to avoid timezone issues
    const datePart = dateStr.split('T')[0];
    const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    
    if (!dateMatch) {
      // Try to parse and reformat
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}T${time}`;
      }
      return `${dateStr}T${time}`;
    }
    
    // Return strict ISO 8601 format without timezone (prevents drift)
    return `${datePart}T${time}`;
  }
  
  /**
   * Calculate working hours between two dates (Mon-Fri, 8-hour days)
   * Used for summary task duration calculations
   */
  private calculateWorkingHoursBetweenDates(startDate: string, finishDate: string): number {
    const start = new Date(startDate);
    const finish = new Date(finishDate);
    
    // If same date, return 8 hours (minimum 1 working day)
    if (start.toISOString().split('T')[0] === finish.toISOString().split('T')[0]) {
      return 8;
    }
    
    let workingDays = 0;
    const current = new Date(start);
    
    while (current <= finish) {
      // Count working days (Mon-Fri)
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        workingDays++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    // Convert working days to hours (8 hours per day)
    const workingHours = Math.max(8, workingDays * 8); // Minimum 8 hours
    
    
    return workingHours;
  }
  
  /**
   * Calculate the actual project date span from all activities
   */
  private calculateProjectDateSpan(activities: ScheduleActivity[], fallbackStartDate: string): { 
    projectStart: string, 
    projectFinish: string 
  } {
    if (activities.length === 0) {
      const fallbackFinish = this.calculateWorkingDaysUTC(fallbackStartDate, 1);
      return { 
        projectStart: fallbackStartDate, 
        projectFinish: fallbackFinish 
      };
    }
    
    let earliestStart: Date | null = null;
    let latestFinish: Date | null = null;
    
    activities.forEach(act => {
      const actStartDate = act.startDate || fallbackStartDate;
      const actFinishDate = act.finishDate || this.calculateWorkingDaysUTC(actStartDate, act.originalDuration || 1);
      
      const startDate = new Date(actStartDate);
      const finishDate = new Date(actFinishDate);
      
      if (!earliestStart || startDate < earliestStart) {
        earliestStart = startDate;
      }
      
      if (!latestFinish || finishDate > latestFinish) {
        latestFinish = finishDate;
      }
    });
    
    const projectStart = earliestStart ? (earliestStart as Date).toISOString().split('T')[0] : fallbackStartDate;
    const projectFinish = latestFinish ? (latestFinish as Date).toISOString().split('T')[0] : this.calculateWorkingDaysUTC(fallbackStartDate, 1);
    
    
    return { projectStart, projectFinish };
  }
  
  /**
   * Validate that finish date is not before start date
   * Special handling for milestones (duration 0) to preserve start == finish
   */
  private validateDateRange(startDate: string, finishDate: string, durationDays: number = 1): { 
    validStartDate: string, 
    validFinishDate: string 
  } {
    const start = new Date(startDate);
    const finish = new Date(finishDate);
    
    // For milestones (duration 0), allow finish == start
    if (durationDays === 0) {
      return {
        validStartDate: startDate,
        validFinishDate: startDate  // Milestones have same start and finish
      };
    }
    
    if (finish < start) {
      
      // If finish is before start, calculate a proper finish date based on start + duration
      const correctedFinish = this.calculateWorkingDaysUTC(startDate, durationDays);
      return { 
        validStartDate: startDate, 
        validFinishDate: correctedFinish 
      };
    }
    
    return { 
      validStartDate: startDate, 
      validFinishDate: finishDate 
    };
  }
  
  
  export(data: ExportData): string {
    const { schedule, activities, projectName } = data;
    const projectGUID = this.generateGUID();
    
    // Validate dependencies before export to prevent circular dependencies
    // Step 1: Validate logical sequence first
    const logicalCheck = DependencyValidator.validateLogicalSequence(activities);
    
    // Step 2: Apply logical validation results to activities
    const logicallyValidatedActivities = activities.map(act => ({
      ...act,
      predecessors: (logicalCheck.validatedPredecessors.get(act.activityId) || []).join(',')
    }));
    
    // Step 3: Break circular dependencies on logically validated activities
    const circularCheck = DependencyValidator.detectAndBreakCircularDependencies(logicallyValidatedActivities);
    if (circularCheck.hasCircularDependencies) {
      throw new Error(`Export blocked: Circular dependencies detected in activities: ${circularCheck.circularNodes.join(', ')}. Cannot create valid Microsoft Project file.`);
    }
    
    // Step 4: Use cycle-broken predecessors for export (CRITICAL FIX)
    const validatedActivities = activities.map(act => ({
      ...act,
      predecessors: (circularCheck.validPredecessorMap.get(act.activityId) || []).join(',')
    }));
    
    // Calculate proper project date span from all activities
    const fallbackStartDate = schedule.startDate || new Date().toISOString().split('T')[0];
    const { projectStart, projectFinish } = this.calculateProjectDateSpan(validatedActivities, fallbackStartDate);
    
    // Validate project date range
    const { validStartDate: validProjectStart, validFinishDate: validProjectFinish } = 
      this.validateDateRange(projectStart, projectFinish);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<Project xmlns="http://schemas.microsoft.com/project/2003">\n';
    
    // Essential Project properties with all required metadata
    xml += '  <GUID>' + projectGUID + '</GUID>\n';
    xml += '  <Name>' + this.escapeXml(projectName || 'Project') + '</Name>\n';
    xml += '  <Title>' + this.escapeXml(projectName || 'Project') + '</Title>\n';
    xml += '  <CreationDate>' + new Date().toISOString() + '</CreationDate>\n';
    xml += '  <LastSaved>' + new Date().toISOString() + '</LastSaved>\n';
    xml += '  <ScheduleFromStart>1</ScheduleFromStart>\n';
    xml += '  <StartDate>' + this.formatDateForMSP(validProjectStart) + '</StartDate>\n';
    xml += '  <FinishDate>' + this.formatDateForMSP(validProjectFinish, '17:00:00') + '</FinishDate>\n';
    xml += '  <CurrentDate>' + this.formatDateForMSP(schedule.dataDate || validProjectStart) + '</CurrentDate>\n';
    xml += '  <CalendarUID>1</CalendarUID>\n';
    xml += '  <DefaultStartTime>08:00:00</DefaultStartTime>\n';
    xml += '  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n';
    xml += '  <MinutesPerDay>480</MinutesPerDay>\n';
    xml += '  <MinutesPerWeek>2400</MinutesPerWeek>\n';
    xml += '  <DaysPerMonth>20</DaysPerMonth>\n';
    xml += '  <DefaultTaskType>0</DefaultTaskType>\n';
    xml += '  <DefaultFixedCostAccrual>3</DefaultFixedCostAccrual>\n';
    xml += '  <DefaultStandardRate>0</DefaultStandardRate>\n';
    xml += '  <DefaultOvertimeRate>0</DefaultOvertimeRate>\n';
    xml += '  <DurationFormat>7</DurationFormat>\n';
    xml += '  <WorkFormat>2</WorkFormat>\n';
    xml += '  <EditableActualCosts>0</EditableActualCosts>\n';
    xml += '  <HonorConstraints>1</HonorConstraints>\n';
    xml += '  <InsertedProjectsLikeSummary>0</InsertedProjectsLikeSummary>\n';
    xml += '  <MultipleCriticalPaths>0</MultipleCriticalPaths>\n';
    xml += '  <NewTasksEffortDriven>1</NewTasksEffortDriven>\n';
    xml += '  <NewTasksEstimated>1</NewTasksEstimated>\n';
    xml += '  <SplitsInProgressTasks>1</SplitsInProgressTasks>\n';
    xml += '  <SpreadActualCost>0</SpreadActualCost>\n';
    xml += '  <SpreadPercentComplete>0</SpreadPercentComplete>\n';
    xml += '  <TaskUpdatesResource>0</TaskUpdatesResource>\n';
    xml += '  <FiscalYearStart>0</FiscalYearStart>\n';
    xml += '  <WeekStartDay>1</WeekStartDay>\n';
    xml += '  <MoveCompletedEndsBack>0</MoveCompletedEndsBack>\n';
    xml += '  <MoveRemainingStartsBack>0</MoveRemainingStartsBack>\n';
    xml += '  <MoveRemainingStartsForward>0</MoveRemainingStartsForward>\n';
    xml += '  <MoveCompletedEndsForward>0</MoveCompletedEndsForward>\n';
    xml += '  <BaselineForEarnedValue>0</BaselineForEarnedValue>\n';
    xml += '  <AutoAddNewResourcesAndTasks>1</AutoAddNewResourcesAndTasks>\n';
    xml += '  <StatusDate>' + this.formatDateForMSP(schedule.dataDate || validProjectStart) + '</StatusDate>\n';
    xml += '  <ActualsInSync>0</ActualsInSync>\n';
    xml += '  <RemoveFileProperties>0</RemoveFileProperties>\n';
    xml += '  <AdminProject>0</AdminProject>\n';
    
    // Complete Calendar definition with working times
    xml += '  <Calendars>\n';
    xml += '    <Calendar>\n';
    xml += '      <UID>1</UID>\n';
    xml += '      <Name>Standard</Name>\n';
    xml += '      <IsBaseCalendar>1</IsBaseCalendar>\n';
    xml += '      <BaseCalendarUID>-1</BaseCalendarUID>\n';
    xml += '      <WeekDays>\n';
    
    // Sunday (non-working)
    xml += '        <WeekDay>\n';
    xml += '          <DayType>1</DayType>\n';
    xml += '          <DayWorking>0</DayWorking>\n';
    xml += '        </WeekDay>\n';
    
    // Monday through Friday (working days 8am-12pm, 1pm-5pm)
    for (let day = 2; day <= 6; day++) {
      xml += '        <WeekDay>\n';
      xml += '          <DayType>' + day + '</DayType>\n';
      xml += '          <DayWorking>1</DayWorking>\n';
      xml += '          <WorkingTimes>\n';
      // Morning session: 8am-12pm
      xml += '            <WorkingTime>\n';
      xml += '              <FromTime>08:00:00</FromTime>\n';
      xml += '              <ToTime>12:00:00</ToTime>\n';
      xml += '            </WorkingTime>\n';
      // Afternoon session: 1pm-5pm (after lunch)
      xml += '            <WorkingTime>\n';
      xml += '              <FromTime>13:00:00</FromTime>\n';
      xml += '              <ToTime>17:00:00</ToTime>\n';
      xml += '            </WorkingTime>\n';
      xml += '          </WorkingTimes>\n';
      xml += '        </WeekDay>\n';
    }
    
    // Saturday (non-working)
    xml += '        <WeekDay>\n';
    xml += '          <DayType>7</DayType>\n';
    xml += '          <DayWorking>0</DayWorking>\n';
    xml += '        </WeekDay>\n';
    
    xml += '      </WeekDays>\n';
    xml += '    </Calendar>\n';
    xml += '  </Calendars>\n';
    
    // Tasks section
    xml += '  <Tasks>\n';
    
    // Calculate summary task duration based on project span
    const summaryDurationHours = this.calculateWorkingHoursBetweenDates(validProjectStart, validProjectFinish);
    const summaryDurationFormat = `PT${summaryDurationHours}H0M0S`;
    
    // Root summary task with validated project dates that span all activities
    xml += '    <Task>\n';
    xml += '      <UID>1</UID>\n';
    xml += '      <ID>1</ID>\n';
    xml += '      <Name>' + this.escapeXml(projectName || 'Project') + '</Name>\n';
    xml += '      <Type>1</Type>\n';
    xml += '      <IsNull>0</IsNull>\n';
    xml += '      <CreateDate>' + new Date().toISOString() + '</CreateDate>\n';
    xml += '      <WBS>0</WBS>\n';
    xml += '      <OutlineNumber>0</OutlineNumber>\n';
    xml += '      <OutlineLevel>0</OutlineLevel>\n';
    xml += '      <Priority>500</Priority>\n';
    xml += '      <Start>' + this.formatDateForMSP(validProjectStart) + '</Start>\n';
    xml += '      <Finish>' + this.formatDateForMSP(validProjectFinish, '17:00:00') + '</Finish>\n';
    xml += '      <Duration>' + summaryDurationFormat + '</Duration>\n';
    xml += '      <DurationFormat>7</DurationFormat>\n';
    xml += '      <Work>' + summaryDurationFormat + '</Work>\n';
    xml += '      <ResumeValid>0</ResumeValid>\n';
    xml += '      <EffortDriven>1</EffortDriven>\n';
    xml += '      <Recurring>0</Recurring>\n';
    xml += '      <OverAllocated>0</OverAllocated>\n';
    xml += '      <Estimated>1</Estimated>\n';
    xml += '      <Milestone>0</Milestone>\n';
    xml += '      <Summary>1</Summary>\n';
    xml += '      <Critical>0</Critical>\n';
    xml += '      <IsSubproject>0</IsSubproject>\n';
    xml += '      <IsSubprojectReadOnly>0</IsSubprojectReadOnly>\n';
    xml += '      <ExternalTask>0</ExternalTask>\n';
    xml += '      <EarlyStart>' + this.formatDateForMSP(validProjectStart) + '</EarlyStart>\n';
    xml += '      <EarlyFinish>' + this.formatDateForMSP(validProjectFinish, '17:00:00') + '</EarlyFinish>\n';
    xml += '      <LateStart>' + this.formatDateForMSP(validProjectStart) + '</LateStart>\n';
    xml += '      <LateFinish>' + this.formatDateForMSP(validProjectFinish, '17:00:00') + '</LateFinish>\n';
    xml += '      <StartVariance>0</StartVariance>\n';
    xml += '      <FinishVariance>0</FinishVariance>\n';
    xml += '      <WorkVariance>0</WorkVariance>\n';
    xml += '      <FreeSlack>0</FreeSlack>\n';
    xml += '      <TotalSlack>0</TotalSlack>\n';
    xml += '      <FixedCost>0</FixedCost>\n';
    xml += '      <FixedCostAccrual>3</FixedCostAccrual>\n';
    xml += '      <PercentComplete>0</PercentComplete>\n';
    xml += '      <PercentWorkComplete>0</PercentWorkComplete>\n';
    xml += '      <Cost>0</Cost>\n';
    xml += '      <OvertimeCost>0</OvertimeCost>\n';
    xml += '      <OvertimeWork>PT0H0M0S</OvertimeWork>\n';
    xml += '      <ActualStart>' + this.formatDateForMSP(validProjectStart) + '</ActualStart>\n';
    xml += '      <ActualDuration>PT0H0M0S</ActualDuration>\n';
    xml += '      <ActualCost>0</ActualCost>\n';
    xml += '      <ActualOvertimeCost>0</ActualOvertimeCost>\n';
    xml += '      <ActualWork>PT0H0M0S</ActualWork>\n';
    xml += '      <ActualOvertimeWork>PT0H0M0S</ActualOvertimeWork>\n';
    xml += '      <RegularWork>PT0H0M0S</RegularWork>\n';
    xml += '      <RemainingDuration>PT0H0M0S</RemainingDuration>\n';
    xml += '      <RemainingCost>0</RemainingCost>\n';
    xml += '      <RemainingWork>PT0H0M0S</RemainingWork>\n';
    xml += '      <RemainingOvertimeCost>0</RemainingOvertimeCost>\n';
    xml += '      <RemainingOvertimeWork>PT0H0M0S</RemainingOvertimeWork>\n';
    xml += '      <ACWP>0</ACWP>\n';
    xml += '      <CV>0</CV>\n';
    xml += '      <ConstraintType>0</ConstraintType>\n';
    xml += '      <CalendarUID>-1</CalendarUID>\n';
    xml += '      <LevelAssignments>1</LevelAssignments>\n';
    xml += '      <LevelingCanSplit>1</LevelingCanSplit>\n';
    xml += '      <LevelingDelay>0</LevelingDelay>\n';
    xml += '      <IgnoreResourceCalendar>0</IgnoreResourceCalendar>\n';
    xml += '      <HideBar>0</HideBar>\n';
    xml += '      <Rollup>1</Rollup>\n';
    xml += '      <BCWS>0</BCWS>\n';
    xml += '      <BCWP>0</BCWP>\n';
    xml += '      <PhysicalPercentComplete>0</PhysicalPercentComplete>\n';
    xml += '      <EarnedValueMethod>0</EarnedValueMethod>\n';
    xml += '      <Active>1</Active>\n';
    xml += '      <ManualStart>' + this.formatDateForMSP(validProjectStart) + '</ManualStart>\n';
    xml += '      <ManualFinish>' + this.formatDateForMSP(validProjectFinish, '17:00:00') + '</ManualFinish>\n';
    xml += '      <ManualDuration>' + summaryDurationFormat + '</ManualDuration>\n';
    xml += '    </Task>\n';
    
    // Build UID map for round-trip fidelity - preserve original UIDs where available
    const uidMap = new Map<string, number>();
    let nextAutoUid = 2; // Start from 2 since summary task is UID 1
    
    // First pass: assign UIDs preserving originals
    validatedActivities.forEach((act) => {
      const anyAct = act as any;
      if (anyAct.externalUid && typeof anyAct.externalUid === 'number') {
        uidMap.set(act.activityId, anyAct.externalUid);
        if (anyAct.externalUid >= nextAutoUid) {
          nextAutoUid = anyAct.externalUid + 1;
        }
      }
    });
    
    // Second pass: assign new UIDs to activities without preserved ones
    validatedActivities.forEach((act) => {
      if (!uidMap.has(act.activityId)) {
        uidMap.set(act.activityId, nextAutoUid);
        nextAutoUid++;
      }
    });
    
    // Individual activity tasks using validated dependencies
    validatedActivities.forEach((act, index) => {
      const uid = uidMap.get(act.activityId) || (index + 2);
      const anyAct = act as any;
      const durationDays = act.originalDuration || 0; // Use 0 for undefined duration
      const isMilestone = durationDays === 0;
      const durationHours = isMilestone ? 0 : (durationDays * 8); // 0 hours for milestones, 8 hours per working day for tasks
      
      // Calculate and validate activity dates
      const rawStartDate = act.startDate || validProjectStart;
      const rawFinishDate = act.finishDate || this.calculateWorkingDaysUTC(rawStartDate, durationDays);
      
      // Validate activity date range with duration context for milestone handling
      const { validStartDate: activityStartDate, validFinishDate: activityFinishDate } = 
        this.validateDateRange(rawStartDate, rawFinishDate, durationDays);
      
      const remainingDuration = act.remainingDuration || durationDays;
      const percentComplete = this.getPercentComplete(act.status || 'Not Started');
      
      // Preserve original GUID if available, otherwise generate new one
      const taskGUID = anyAct.externalGuid || this.generateGUID();
      
      // Use explicit WBS code if available, otherwise use activity ID
      const wbsCode = anyAct.wbsCode || act.activityId || uid.toString();
      
      xml += '    <Task>\n';
      xml += '      <UID>' + uid + '</UID>\n';
      xml += '      <ID>' + uid + '</ID>\n';
      xml += '      <Name>' + this.escapeXml(act.activityName || 'Untitled Activity') + '</Name>\n';
      xml += '      <GUID>' + taskGUID + '</GUID>\n';
      xml += '      <Type>0</Type>\n';
      xml += '      <IsNull>0</IsNull>\n';
      xml += '      <CreateDate>' + new Date().toISOString() + '</CreateDate>\n';
      // Use explicit WBS code to prevent MS Project from auto-calculating
      xml += '      <WBS>' + this.escapeXml(wbsCode) + '</WBS>\n';
      xml += '      <OutlineNumber>' + uid + '</OutlineNumber>\n';
      xml += '      <OutlineLevel>1</OutlineLevel>\n';
      xml += '      <Priority>500</Priority>\n';
      xml += '      <Start>' + this.formatDateForMSP(activityStartDate) + '</Start>\n';
      xml += '      <Finish>' + this.formatDateForMSP(activityFinishDate, '17:00:00') + '</Finish>\n';
      xml += '      <Duration>PT' + durationHours + 'H0M0S</Duration>\n';
      xml += '      <DurationFormat>7</DurationFormat>\n';
      xml += '      <Work>PT' + durationHours + 'H0M0S</Work>\n';
      xml += '      <ResumeValid>0</ResumeValid>\n';
      xml += '      <EffortDriven>1</EffortDriven>\n';
      xml += '      <Recurring>0</Recurring>\n';
      xml += '      <OverAllocated>0</OverAllocated>\n';
      xml += '      <Estimated>1</Estimated>\n';
      xml += '      <Milestone>' + (isMilestone ? '1' : '0') + '</Milestone>\n';
      xml += '      <Summary>0</Summary>\n';
      xml += '      <Critical>' + ((act.totalFloat || 0) === 0 ? '1' : '0') + '</Critical>\n';
      xml += '      <IsSubproject>0</IsSubproject>\n';
      xml += '      <IsSubprojectReadOnly>0</IsSubprojectReadOnly>\n';
      xml += '      <ExternalTask>0</ExternalTask>\n';
      xml += '      <EarlyStart>' + this.formatDateForMSP(activityStartDate) + '</EarlyStart>\n';
      xml += '      <EarlyFinish>' + this.formatDateForMSP(activityFinishDate, '17:00:00') + '</EarlyFinish>\n';
      xml += '      <LateStart>' + this.formatDateForMSP(activityStartDate) + '</LateStart>\n';
      xml += '      <LateFinish>' + this.formatDateForMSP(activityFinishDate, '17:00:00') + '</LateFinish>\n';
      xml += '      <StartVariance>0</StartVariance>\n';
      xml += '      <FinishVariance>0</FinishVariance>\n';
      xml += '      <WorkVariance>0</WorkVariance>\n';
      xml += '      <FreeSlack>' + ((act.totalFloat || 0) * 480) + '</FreeSlack>\n'; // Convert days to minutes
      xml += '      <TotalSlack>' + ((act.totalFloat || 0) * 480) + '</TotalSlack>\n';
      xml += '      <FixedCost>0</FixedCost>\n';
      xml += '      <FixedCostAccrual>3</FixedCostAccrual>\n';
      xml += '      <PercentComplete>' + percentComplete + '</PercentComplete>\n';
      xml += '      <PercentWorkComplete>' + percentComplete + '</PercentWorkComplete>\n';
      xml += '      <Cost>0</Cost>\n';
      xml += '      <OvertimeCost>0</OvertimeCost>\n';
      xml += '      <OvertimeWork>PT0H0M0S</OvertimeWork>\n';
      
      if (act.status === 'In Progress' || act.status === 'Completed') {
        xml += '      <ActualStart>' + this.formatDateForMSP(activityStartDate) + '</ActualStart>\n';
        const actualDurationHours = act.status === 'Completed' ? durationHours : Math.floor(durationHours * percentComplete / 100);
        xml += '      <ActualDuration>PT' + actualDurationHours + 'H0M0S</ActualDuration>\n';
        xml += '      <ActualWork>PT' + actualDurationHours + 'H0M0S</ActualWork>\n';
      } else {
        xml += '      <ActualDuration>PT0H0M0S</ActualDuration>\n';
        xml += '      <ActualWork>PT0H0M0S</ActualWork>\n';
      }
      
      xml += '      <ActualCost>0</ActualCost>\n';
      xml += '      <ActualOvertimeCost>0</ActualOvertimeCost>\n';
      xml += '      <ActualOvertimeWork>PT0H0M0S</ActualOvertimeWork>\n';
      xml += '      <RegularWork>PT' + durationHours + 'H0M0S</RegularWork>\n';
      xml += '      <RemainingDuration>PT' + (remainingDuration * 8) + 'H0M0S</RemainingDuration>\n';
      xml += '      <RemainingCost>0</RemainingCost>\n';
      xml += '      <RemainingWork>PT' + (remainingDuration * 8) + 'H0M0S</RemainingWork>\n';
      xml += '      <RemainingOvertimeCost>0</RemainingOvertimeCost>\n';
      xml += '      <RemainingOvertimeWork>PT0H0M0S</RemainingOvertimeWork>\n';
      xml += '      <ACWP>0</ACWP>\n';
      xml += '      <CV>0</CV>\n';
      
      // Constraint type (0 = As Soon As Possible, 2 = Must Start On, 4 = Must Finish On)
      const constraintType = '0'; // Default to ASAP, could be enhanced based on activity requirements
      xml += '      <ConstraintType>' + constraintType + '</ConstraintType>\n';
      xml += '      <CalendarUID>-1</CalendarUID>\n';
      xml += '      <LevelAssignments>1</LevelAssignments>\n';
      xml += '      <LevelingCanSplit>1</LevelingCanSplit>\n';
      xml += '      <LevelingDelay>0</LevelingDelay>\n';
      xml += '      <IgnoreResourceCalendar>0</IgnoreResourceCalendar>\n';
      xml += '      <HideBar>0</HideBar>\n';
      xml += '      <Rollup>0</Rollup>\n';
      xml += '      <BCWS>0</BCWS>\n';
      xml += '      <BCWP>0</BCWP>\n';
      xml += '      <PhysicalPercentComplete>' + percentComplete + '</PhysicalPercentComplete>\n';
      xml += '      <EarnedValueMethod>0</EarnedValueMethod>\n';
      xml += '      <Active>1</Active>\n';
      xml += '      <ManualStart>' + this.formatDateForMSP(activityStartDate) + '</ManualStart>\n';
      xml += '      <ManualFinish>' + this.formatDateForMSP(activityFinishDate, '17:00:00') + '</ManualFinish>\n';
      xml += '      <ManualDuration>PT' + durationHours + 'H0M0S</ManualDuration>\n';
      
      if (act.notes) {
        xml += '      <Notes>' + this.escapeXml(act.notes) + '</Notes>\n';
      }
      
      // Add validated predecessor links (circular dependencies have been removed)
      // Use UID map for proper round-trip fidelity
      if (act.predecessors && act.predecessors.trim()) {
        const predList = act.predecessors.split(',').filter(p => p.trim());
        
        predList.forEach(pred => {
          const predActId = pred.trim();
          const predUid = uidMap.get(predActId);
          if (predUid && predActId !== act.activityId) { // Prevent self-reference
            xml += '      <PredecessorLink>\n';
            xml += '        <PredecessorUID>' + predUid + '</PredecessorUID>\n';
            xml += '        <Type>1</Type>\n'; // 1 = Finish-to-Start
            xml += '        <CrossProject>0</CrossProject>\n';
            xml += '        <LinkLag>0</LinkLag>\n';
            xml += '        <LagFormat>7</LagFormat>\n';
            xml += '      </PredecessorLink>\n';
          }
          // Silently skip self-references and not-found predecessors
        });
      }
      
      xml += '    </Task>\n';
    });
    
    xml += '  </Tasks>\n';
    xml += '</Project>\n';
    
    return xml;
  }
  
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  private getPercentComplete(status: string): number {
    switch (status) {
      case 'Completed': return 100;
      case 'In Progress': return 50;
      default: return 0;
    }
  }
}

// PDF Schedule Report Generator
export class PDFScheduleExporter {
  export(data: ExportData): string {
    const { schedule, activities, projectName } = data;
    
    // Generate HTML that can be converted to PDF
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${projectName || 'Project'} Schedule Report</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      margin: 20px;
      font-size: 12px;
    }
    h1 { 
      color: #03512A; 
      border-bottom: 2px solid #1C7850;
      padding-bottom: 10px;
    }
    h2 { 
      color: #1C7850; 
      margin-top: 30px;
    }
    .header-info {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .info-row {
      display: flex;
      margin: 5px 0;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-top: 20px;
      font-size: 11px;
    }
    th { 
      background: #03512A; 
      color: white; 
      padding: 8px;
      text-align: left;
      font-weight: normal;
    }
    td { 
      border: 1px solid #ddd; 
      padding: 6px;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    .critical {
      background: #ffe4e4 !important;
    }
    .completed {
      background: #e4ffe4 !important;
    }
    .in-progress {
      background: #fff9e4 !important;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <h1>${projectName || 'Project'} - CPM Schedule Report</h1>
  
  <div class="header-info">
    <div class="info-row">
      <span class="info-label">Schedule Type:</span>
      <span>${schedule.scheduleType}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Data Date:</span>
      <span>${schedule.dataDate}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Start Date:</span>
      <span>${schedule.startDate}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Finish Date:</span>
      <span>${schedule.finishDate}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Total Activities:</span>
      <span>${activities.length}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Critical Activities:</span>
      <span>${activities.filter(a => a.totalFloat === 0).length}</span>
    </div>
  </div>
  
  <h2>Activity Schedule</h2>
  <table>
    <thead>
      <tr>
        <th>Activity ID</th>
        <th>Activity Name</th>
        <th>Duration</th>
        <th>Start Date</th>
        <th>Finish Date</th>
        <th>Total Float</th>
        <th>Status</th>
        <th>Predecessors</th>
        <th>WBS</th>
      </tr>
    </thead>
    <tbody>`;
    
    activities.forEach(act => {
      const rowClass = act.status === 'Completed' ? 'completed' : 
                      act.status === 'In Progress' ? 'in-progress' :
                      act.totalFloat === 0 ? 'critical' : '';
      
      html += `
      <tr class="${rowClass}">
        <td>${act.activityId}</td>
        <td>${act.activityName}</td>
        <td>${act.originalDuration}d</td>
        <td>${act.startDate}</td>
        <td>${act.finishDate}</td>
        <td>${act.totalFloat || 0}d</td>
        <td>${act.status}</td>
        <td>${act.predecessors || '-'}</td>
        <td>${act.notes || '-'}</td>
      </tr>`;
    });
    
    html += `
    </tbody>
  </table>
  
  <h2>Schedule Summary</h2>
  <div class="header-info">
    <div class="info-row">
      <span class="info-label">Completed Activities:</span>
      <span>${activities.filter(a => a.status === 'Completed').length} (${Math.round(activities.filter(a => a.status === 'Completed').length / activities.length * 100)}%)</span>
    </div>
    <div class="info-row">
      <span class="info-label">In Progress:</span>
      <span>${activities.filter(a => a.status === 'In Progress').length}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Not Started:</span>
      <span>${activities.filter(a => a.status === 'Not Started').length}</span>
    </div>
  </div>
  
  <div class="footer">
    <p>Generated on ${new Date().toLocaleString()}</p>
    <p>MeetBud - Construction Schedule Management System</p>
  </div>
</body>
</html>`;
    
    return html;
  }
}

// CSV Exporter
export class CSVExporter {
  export(data: ExportData): string {
    const { activities } = data;
    
    // CSV Headers
    const headers = [
      'Activity ID',
      'Activity Name', 
      'Activity Type',
      'Start Date',
      'Finish Date',
      'Original Duration',
      'Remaining Duration',
      'Total Float',
      'Status',
      'Predecessors',
      'WBS'
    ];
    
    let csv = headers.join(',') + '\n';
    
    // CSV Rows
    activities.forEach(act => {
      const row = [
        this.escapeCsv(act.activityId || ''),
        this.escapeCsv(act.activityName || ''),
        this.escapeCsv(act.activityType || 'Task'),
        this.escapeCsv(act.startDate || ''),
        this.escapeCsv(act.finishDate || ''),
        (act.originalDuration || 0).toString(),
        (act.remainingDuration || 0).toString(),
        (act.totalFloat || 0).toString(),
        this.escapeCsv(act.status || 'Not Started'),
        this.escapeCsv(act.predecessors || ''),
        this.escapeCsv(act.notes || '')
      ];
      csv += row.join(',') + '\n';
    });
    
    return csv;
  }
  
  private escapeCsv(text: string): string {
    // Escape CSV special characters
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }
}

// JSON Exporter
export class JSONExporter {
  export(data: ExportData): string {
    const { schedule, activities, projectName } = data;
    
    const exportObject = {
      project: {
        name: projectName || 'Project',
        scheduleId: schedule.id,
        scheduleType: schedule.scheduleType,
        dataDate: schedule.dataDate,
        startDate: schedule.startDate,
        finishDate: schedule.finishDate,
        version: schedule.version,
        notes: schedule.notes
      },
      statistics: {
        totalActivities: activities.length,
        completedActivities: activities.filter(a => a.status === 'Completed').length,
        inProgressActivities: activities.filter(a => a.status === 'In Progress').length,
        notStartedActivities: activities.filter(a => a.status === 'Not Started').length,
        criticalActivities: activities.filter(a => (a.totalFloat || 0) === 0).length
      },
      activities: activities.map(act => ({
        activityId: act.activityId,
        activityName: act.activityName,
        activityType: act.activityType,
        originalDuration: act.originalDuration,
        remainingDuration: act.remainingDuration,
        startDate: act.startDate,
        finishDate: act.finishDate,
        totalFloat: act.totalFloat,
        status: act.status,
        predecessors: act.predecessors ? act.predecessors.split(',').map(p => p.trim()).filter(p => p) : [],
        successors: act.successors ? act.successors.split(',').map(s => s.trim()).filter(s => s) : [],
        notes: act.notes,
        isCritical: (act.totalFloat || 0) === 0
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: 'ScheduleSam'
    };
    
    return JSON.stringify(exportObject, null, 2);
  }
}

// Main export function
export async function exportSchedule(
  format: 'xer' | 'xml' | 'pdf' | 'csv' | 'json',
  schedule: ProjectSchedule,
  activities: ScheduleActivity[],
  projectName?: string
): Promise<{ content: string; mimeType: string; filename: string }> {
  const exportData: ExportData = { schedule, activities, projectName };
  const datePrefix = new Date().toISOString().split('T')[0];
  const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
  
  switch (format) {
    case 'xer': {
      const exporter = new XERExporter();
      return {
        content: exporter.export(exportData),
        mimeType: 'text/plain',
        filename: `${safeProjectName}_schedule_${datePrefix}.xer`
      };
    }
    
    case 'xml': {
      const exporter = new MSProjectXMLExporter();
      return {
        content: exporter.export(exportData),
        mimeType: 'application/xml',
        filename: `${safeProjectName}_schedule_${datePrefix}.xml`
      };
    }
    
    case 'pdf': {
      const exporter = new PDFScheduleExporter();
      return {
        content: exporter.export(exportData),
        mimeType: 'text/html', // Will be converted to PDF on client
        filename: `${safeProjectName}_schedule_${datePrefix}.pdf`
      };
    }
    
    case 'csv': {
      const exporter = new CSVExporter();
      return {
        content: exporter.export(exportData),
        mimeType: 'text/csv',
        filename: `${safeProjectName}_activities_${datePrefix}.csv`
      };
    }
    
    case 'json': {
      const exporter = new JSONExporter();
      return {
        content: exporter.export(exportData),
        mimeType: 'application/json',
        filename: `${safeProjectName}_schedule_${datePrefix}.json`
      };
    }
    
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}