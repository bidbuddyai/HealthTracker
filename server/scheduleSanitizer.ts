import type { Activity } from "../client/src/components/ScheduleEditor";

export interface QualityReport {
  openEnds: number;
  loops: number;
  calendarsFixed: number;
  warnings: WarningItem[];
  inactivatedLinks: InactivatedLink[];
}

export interface WarningItem {
  activityId: string;
  activityName: string;
  warningType: 'open_ended' | 'loop_participant' | 'missing_calendar' | 'invalid_date';
  message: string;
}

export interface InactivatedLink {
  predecessorId: string;
  successorId: string;
  relationshipType: string;
  reason: string;
}

export interface SanitizedActivity extends Activity {
  warningType?: 'open_ended' | 'loop_participant';
  sanitizationNotes?: string;
}

export interface SanitizationResult {
  activities: SanitizedActivity[];
  qualityReport: QualityReport;
}

export class SanitationMiddleware {
  private activities: SanitizedActivity[];
  private activityMap: Map<string, SanitizedActivity>;
  private qualityReport: QualityReport;

  constructor(activities: Activity[]) {
    this.activities = activities.map(act => ({ ...act } as SanitizedActivity));
    this.activityMap = new Map();
    this.qualityReport = {
      openEnds: 0,
      loops: 0,
      calendarsFixed: 0,
      warnings: [],
      inactivatedLinks: []
    };

    for (const act of this.activities) {
      this.activityMap.set(act.activityId, act);
    }
  }

  sanitize(): SanitizationResult {
    this.buildSuccessors();
    this.detectOrphans();
    this.detectAndBreakLoops();
    this.validateCalendars();

    return {
      activities: this.activities,
      qualityReport: this.qualityReport
    };
  }

  private buildSuccessors(): void {
    const successorMap = new Map<string, string[]>();

    for (const act of this.activities) {
      if (!successorMap.has(act.activityId)) {
        successorMap.set(act.activityId, []);
      }
    }

    for (const act of this.activities) {
      const preds = act.predecessors || [];
      for (const predId of preds) {
        if (!successorMap.has(predId)) {
          successorMap.set(predId, []);
        }
        successorMap.get(predId)!.push(act.activityId);
      }
    }

    for (const act of this.activities) {
      act.successors = successorMap.get(act.activityId) || [];
    }
  }

  private detectOrphans(): void {
    for (const act of this.activities) {
      const isMilestone = this.isMilestone(act);
      const hasNoPredecessors = !act.predecessors || act.predecessors.length === 0;
      const hasNoSuccessors = !act.successors || act.successors.length === 0;

      if (!isMilestone && (hasNoPredecessors || hasNoSuccessors)) {
        act.warningType = 'open_ended';
        
        let message = '';
        if (hasNoPredecessors && hasNoSuccessors) {
          message = 'Activity has no predecessors or successors (completely disconnected)';
        } else if (hasNoPredecessors) {
          message = 'Activity has no predecessors (open start)';
        } else {
          message = 'Activity has no successors (open end)';
        }

        act.sanitizationNotes = message;
        this.qualityReport.openEnds++;
        this.qualityReport.warnings.push({
          activityId: act.activityId,
          activityName: act.activityName,
          warningType: 'open_ended',
          message
        });
      }
    }
  }

  private isMilestone(act: SanitizedActivity): boolean {
    const name = act.activityName.toLowerCase();
    const isStartMilestone = name.includes('start') && (act.duration === 0 || name === 'project start' || name === 'start milestone');
    const isEndMilestone = name.includes('end') || name.includes('finish') || name.includes('complete');
    const isZeroDuration = act.duration === 0;
    
    return isZeroDuration || isStartMilestone || (isEndMilestone && isZeroDuration);
  }

  private detectAndBreakLoops(): void {
    let maxIterations = 100;
    
    while (maxIterations > 0) {
      maxIterations--;
      
      const loopLink = this.findOneLoop();
      if (!loopLink) {
        break;
      }

      const successorAct = this.activityMap.get(loopLink.to);
      if (successorAct) {
        successorAct.predecessors = (successorAct.predecessors || [])
          .filter(predId => predId !== loopLink.from);
        
        successorAct.warningType = 'loop_participant';
        const existingNotes = successorAct.sanitizationNotes || '';
        successorAct.sanitizationNotes = existingNotes 
          ? `${existingNotes}; Link from ${loopLink.from} inactivated`
          : `Circular dependency broken. Link from ${loopLink.from} was inactivated.`;
        
        const predecessorAct = this.activityMap.get(loopLink.from);
        if (predecessorAct) {
          predecessorAct.successors = (predecessorAct.successors || [])
            .filter(succId => succId !== loopLink.to);
        }
      }

      this.qualityReport.loops++;
      this.qualityReport.inactivatedLinks.push({
        predecessorId: loopLink.from,
        successorId: loopLink.to,
        relationshipType: loopLink.relType,
        reason: `Circular dependency broken (${loopLink.relType} link with ${loopLink.float} days float)`
      });

      this.qualityReport.warnings.push({
        activityId: loopLink.to,
        activityName: this.activityMap.get(loopLink.to)?.activityName || 'Unknown',
        warningType: 'loop_participant',
        message: `Circular dependency detected. Link from ${loopLink.from} was inactivated.`
      });

      this.buildSuccessors();
    }
    
    if (maxIterations === 0) {
      console.warn('[Sanitation] Maximum loop breaking iterations reached - some cycles may remain');
    }
  }

  private findOneLoop(): { from: string; to: string; float: number; relType: string } | null {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    let result: { from: string; to: string; float: number; relType: string } | null = null;

    const dfs = (actId: string, path: string[]): boolean => {
      if (inStack.has(actId)) {
        const loopStartIdx = path.indexOf(actId);
        const loopPath = path.slice(loopStartIdx);
        
        const loopLinks: { from: string; to: string; float: number; relType: string }[] = [];
        for (let i = 0; i < loopPath.length; i++) {
          const fromId = loopPath[i];
          const toId = loopPath[(i + 1) % loopPath.length];
          const fromAct = this.activityMap.get(fromId);
          const toAct = this.activityMap.get(toId);
          
          if (fromAct && toAct) {
            const relType = this.getEdgeRelationshipType(fromId, toId);
            loopLinks.push({
              from: fromId,
              to: toId,
              float: fromAct.totalFloat || 0,
              relType
            });
          }
        }
        
        loopLinks.sort((a, b) => {
          if (a.relType !== 'FS' && b.relType === 'FS') return -1;
          if (a.relType === 'FS' && b.relType !== 'FS') return 1;
          return b.float - a.float;
        });
        
        if (loopLinks.length > 0) {
          result = loopLinks[0];
        }
        return true;
      }

      if (visited.has(actId)) {
        return false;
      }

      visited.add(actId);
      inStack.add(actId);

      const act = this.activityMap.get(actId);
      if (act?.successors) {
        for (const succId of act.successors) {
          if (dfs(succId, [...path, actId])) {
            return true;
          }
        }
      }

      inStack.delete(actId);
      return false;
    };

    for (const act of this.activities) {
      if (!visited.has(act.activityId)) {
        if (dfs(act.activityId, [])) {
          break;
        }
      }
    }

    return result;
  }

  private getEdgeRelationshipType(predId: string, succId: string): string {
    const succAct = this.activityMap.get(succId);
    if (!succAct) return 'FS';
    
    const anyAct = succAct as any;
    if (anyAct.predecessorRelationships && anyAct.predecessorRelationships[predId]) {
      return anyAct.predecessorRelationships[predId].relType || 'FS';
    }
    
    return anyAct.relationshipType || 'FS';
  }

  private validateCalendars(): void {
    for (const act of this.activities) {
      const anyAct = act as any;
      if (anyAct.calendarId === undefined || anyAct.calendarId === null || anyAct.calendarId === '') {
        anyAct.calendarId = 'default';
        this.qualityReport.calendarsFixed++;
      }
    }
  }

  static sanitizeActivities(activities: Activity[]): SanitizationResult {
    const middleware = new SanitationMiddleware(activities);
    return middleware.sanitize();
  }
}
