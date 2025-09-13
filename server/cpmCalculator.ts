import type { Activity, Relationship, Calendar } from "@shared/schema";

// Relationship type definitions
type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';

// Parsed relationship with activity references
interface ParsedRelationship {
  predecessorId: string;
  successorId: string;
  type: RelationshipType;
  lag: number;
}

// Calendar working day definition
interface WorkingDay {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  isWorking: boolean;
  hoursPerDay: number;
}

interface CalendarException {
  date: string;
  isWorking: boolean;
  hoursPerDay?: number;
}

interface WorkingCalendar {
  id: string;
  name: string;
  workingDays: WorkingDay[];
  exceptions: CalendarException[];
  hoursPerDay: number;
}

// Activity with calculated dates
interface CalculatedActivity extends Activity {
  calculatedEarlyStart: Date | null;
  calculatedEarlyFinish: Date | null;
  calculatedLateStart: Date | null;
  calculatedLateFinish: Date | null;
  calculatedTotalFloat: number | null;
  calculatedFreeFloat: number | null;
  calculatedIsCritical: boolean;
  hasConstraintViolation: boolean;
  constraintViolationMessage?: string;
}

/**
 * Advanced CPM Calculator with support for:
 * - All relationship types (FS, SS, FF, SF) with lead/lag
 * - Scheduling constraints (SNET, FNLT, MSO, MFO, etc.)
 * - Work calendars with non-working time
 * - Data date and out-of-sequence progress handling
 */
export class CPMCalculator {
  private activities: Map<string, CalculatedActivity> = new Map();
  private relationships: ParsedRelationship[] = [];
  private calendars: Map<string, WorkingCalendar> = new Map();
  private defaultCalendar: WorkingCalendar;
  private dataDate: Date | null = null;
  private retainedLogic: boolean = true; // vs Progress Override

  constructor(
    activities: Activity[], 
    relationships: Relationship[], 
    calendars: Calendar[] = [],
    dataDate?: Date,
    retainedLogic: boolean = true
  ) {
    this.dataDate = dataDate || null;
    this.retainedLogic = retainedLogic;
    
    // Initialize default 5-day work week calendar
    this.defaultCalendar = {
      id: 'default',
      name: 'Standard 5-Day Work Week',
      workingDays: [
        { dayOfWeek: 0, isWorking: false, hoursPerDay: 0 }, // Sunday
        { dayOfWeek: 1, isWorking: true, hoursPerDay: 8 }, // Monday
        { dayOfWeek: 2, isWorking: true, hoursPerDay: 8 }, // Tuesday
        { dayOfWeek: 3, isWorking: true, hoursPerDay: 8 }, // Wednesday
        { dayOfWeek: 4, isWorking: true, hoursPerDay: 8 }, // Thursday
        { dayOfWeek: 5, isWorking: true, hoursPerDay: 8 }, // Friday
        { dayOfWeek: 6, isWorking: false, hoursPerDay: 0 }, // Saturday
      ],
      exceptions: [],
      hoursPerDay: 8
    };

    this.calendars.set('default', this.defaultCalendar);
    
    // Load project calendars
    calendars.forEach(cal => {
      // Parse calendar data from JSON fields
      const standardWorkweek = cal.standardWorkweek 
        ? (typeof cal.standardWorkweek === 'string' ? JSON.parse(cal.standardWorkweek) : cal.standardWorkweek)
        : this.defaultCalendar.workingDays;
      const exceptions = cal.exceptions
        ? (typeof cal.exceptions === 'string' ? JSON.parse(cal.exceptions) : cal.exceptions)
        : [];
      
      const workingCalendar: WorkingCalendar = {
        id: cal.id,
        name: cal.name,
        workingDays: standardWorkweek,
        exceptions: exceptions,
        hoursPerDay: 8
      };
      this.calendars.set(cal.id, workingCalendar);
    });

    // Initialize activities
    activities.forEach(activity => {
      const calculatedActivity: CalculatedActivity = {
        ...activity,
        calculatedEarlyStart: null,
        calculatedEarlyFinish: null,
        calculatedLateStart: null,
        calculatedLateFinish: null,
        calculatedTotalFloat: null,
        calculatedFreeFloat: null,
        calculatedIsCritical: false,
        hasConstraintViolation: false
      };
      this.activities.set(activity.id, calculatedActivity);
    });

    // Parse relationships from relationship table
    this.parseRelationships(relationships);
  }

  /**
   * Parse relationships from the relationships table into structured relationships
   */
  private parseRelationships(relationships: Relationship[]) {
    // First, add explicit relationships from the relationships table
    relationships.forEach(rel => {
      this.relationships.push({
        predecessorId: rel.predecessorId,
        successorId: rel.successorId,
        type: rel.type as RelationshipType || 'FS',
        lag: rel.lag || 0
      });
    });

    // All relationships are now handled through the relationships table
  }

  /**
   * Parse a predecessor string like "A001, A002SS+3, A003FF-1"
   */
  private parsePredecessorString(predecessorStr: string, successorId: string, activities: Activity[]): ParsedRelationship[] {
    const relationships: ParsedRelationship[] = [];
    const activityMap = new Map(activities.map(a => [a.activityId, a.id]));
    
    // Split by comma and clean up
    const predecessors = predecessorStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    predecessors.forEach(predStr => {
      // Parse relationship: ActivityID[RelationType][+/-Lag]
      // Examples: A001, A002SS+3, A003FF-1, A004SF, A005FS-2
      const match = predStr.match(/^([A-Za-z0-9]+)(SS|SF|FF|FS)?([+-]\d+)?$/);
      
      if (match) {
        const [, activityId, relType, lagStr] = match;
        const predecessorId = activityMap.get(activityId);
        
        if (predecessorId) {
          relationships.push({
            predecessorId,
            successorId,
            type: (relType as RelationshipType) || 'FS',
            lag: lagStr ? parseInt(lagStr) : 0
          });
        }
      }
    });
    
    return relationships;
  }

  /**
   * Get the working calendar for an activity
   */
  private getCalendarForActivity(activity: CalculatedActivity): WorkingCalendar {
    if (activity.calendarId && this.calendars.has(activity.calendarId)) {
      return this.calendars.get(activity.calendarId)!;
    }
    return this.defaultCalendar;
  }

  /**
   * Check if a date is a working day according to the calendar
   */
  private isWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
    const dateStr = date.toISOString().split('T')[0];
    
    // Check for exceptions first
    const exception = calendar.exceptions.find(ex => ex.date === dateStr);
    if (exception) {
      return exception.isWorking;
    }
    
    // Check regular working days
    const dayOfWeek = date.getDay();
    const workingDay = calendar.workingDays.find(wd => wd.dayOfWeek === dayOfWeek);
    return workingDay ? workingDay.isWorking : false;
  }

  /**
   * Calculate working days between two dates according to calendar
   */
  private getWorkingDaysBetween(startDate: Date, endDate: Date, calendar: WorkingCalendar): number {
    if (startDate >= endDate) return 0;
    
    let currentDate = new Date(startDate);
    let workingDays = 0;
    
    while (currentDate < endDate) {
      if (this.isWorkingDay(currentDate, calendar)) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  }

  /**
   * Add working days to a date according to calendar
   * For duration N, this adds N working days to the start date
   */
  private addWorkingDays(startDate: Date, duration: number, calendar: WorkingCalendar): Date {
    if (duration === 0) return new Date(startDate);
    
    let currentDate = new Date(startDate);
    let daysAdded = 0;
    
    // Move to the next day first, then count working days
    // This ensures consistency with getWorkingDaysBetween
    while (daysAdded < duration) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (this.isWorkingDay(currentDate, calendar)) {
        daysAdded++;
      }
    }
    
    return currentDate;
  }

  /**
   * Subtract working days from a date according to calendar
   * For duration N, this subtracts N working days from the end date
   */
  private subtractWorkingDays(endDate: Date, duration: number, calendar: WorkingCalendar): Date {
    if (duration === 0) return new Date(endDate);
    
    let currentDate = new Date(endDate);
    let daysSubtracted = 0;
    
    // Move backward and count working days
    // This ensures consistency with addWorkingDays
    while (daysSubtracted < duration) {
      currentDate.setDate(currentDate.getDate() - 1);
      if (this.isWorkingDay(currentDate, calendar)) {
        daysSubtracted++;
      }
    }
    
    return currentDate;
  }

  /**
   * Apply relationship logic to calculate dependent date for forward pass
   */
  private applyForwardRelationship(
    predecessorActivity: CalculatedActivity,
    relationship: ParsedRelationship
  ): Date | null {
    const calendar = this.getCalendarForActivity(predecessorActivity);
    
    let baseDate: Date | null = null;
    
    // Forward pass - calculate early dates from predecessor
    switch (relationship.type) {
      case 'FS': // Finish-to-Start
        baseDate = predecessorActivity.calculatedEarlyFinish;
        break;
      case 'SS': // Start-to-Start
        baseDate = predecessorActivity.calculatedEarlyStart;
        break;
      case 'FF': // Finish-to-Finish
        baseDate = predecessorActivity.calculatedEarlyFinish;
        break;
      case 'SF': // Start-to-Finish
        baseDate = predecessorActivity.calculatedEarlyStart;
        break;
    }
    
    if (!baseDate) return null;
    
    // Apply lag (positive lag delays successor, negative lag advances it)
    if (relationship.lag !== 0) {
      if (relationship.lag > 0) {
        baseDate = this.addWorkingDays(baseDate, relationship.lag, calendar);
      } else {
        baseDate = this.subtractWorkingDays(baseDate, Math.abs(relationship.lag), calendar);
      }
    }
    
    return baseDate;
  }

  /**
   * Calculate predecessor's late dates based on successor's late dates (backward pass)
   */
  private calculateBackwardDates(
    successorActivity: CalculatedActivity,
    relationship: ParsedRelationship,
    predecessorActivity: CalculatedActivity
  ): { lateStart: Date | null; lateFinish: Date | null } {
    const calendar = this.getCalendarForActivity(predecessorActivity);
    const duration = predecessorActivity.remainingDuration || predecessorActivity.originalDuration || 0;
    
    let predLateStart: Date | null = null;
    let predLateFinish: Date | null = null;
    
    // Get successor's late dates
    const succLateStart = successorActivity.calculatedLateStart;
    const succLateFinish = successorActivity.calculatedLateFinish;
    
    if (!succLateStart || !succLateFinish) {
      return { lateStart: null, lateFinish: null };
    }
    
    // Calculate based on relationship type using proper CPM formulas
    switch (relationship.type) {
      case 'FS': // Finish-to-Start: pred.LF = succ.LS - lag; pred.LS = pred.LF - duration
        {
          let adjustedSuccLS = succLateStart;
          // In backward pass, subtract lag from successor event
          if (relationship.lag !== 0) {
            if (relationship.lag > 0) {
              adjustedSuccLS = this.subtractWorkingDays(succLateStart, relationship.lag, calendar);
            } else {
              adjustedSuccLS = this.addWorkingDays(succLateStart, Math.abs(relationship.lag), calendar);
            }
          }
          predLateFinish = adjustedSuccLS;
          predLateStart = this.subtractWorkingDays(predLateFinish, duration, calendar);
        }
        break;
        
      case 'SS': // Start-to-Start: pred.LS = succ.LS - lag; pred.LF = pred.LS + duration
        {
          let adjustedSuccLS = succLateStart;
          if (relationship.lag !== 0) {
            if (relationship.lag > 0) {
              adjustedSuccLS = this.subtractWorkingDays(succLateStart, relationship.lag, calendar);
            } else {
              adjustedSuccLS = this.addWorkingDays(succLateStart, Math.abs(relationship.lag), calendar);
            }
          }
          predLateStart = adjustedSuccLS;
          predLateFinish = this.addWorkingDays(predLateStart, duration, calendar);
        }
        break;
        
      case 'FF': // Finish-to-Finish: pred.LF = succ.LF - lag; pred.LS = pred.LF - duration
        {
          let adjustedSuccLF = succLateFinish;
          if (relationship.lag !== 0) {
            if (relationship.lag > 0) {
              adjustedSuccLF = this.subtractWorkingDays(succLateFinish, relationship.lag, calendar);
            } else {
              adjustedSuccLF = this.addWorkingDays(succLateFinish, Math.abs(relationship.lag), calendar);
            }
          }
          predLateFinish = adjustedSuccLF;
          predLateStart = this.subtractWorkingDays(predLateFinish, duration, calendar);
        }
        break;
        
      case 'SF': // Start-to-Finish: pred.LS = succ.LF - lag; pred.LF = pred.LS + duration
        {
          let adjustedSuccLF = succLateFinish;
          if (relationship.lag !== 0) {
            if (relationship.lag > 0) {
              adjustedSuccLF = this.subtractWorkingDays(succLateFinish, relationship.lag, calendar);
            } else {
              adjustedSuccLF = this.addWorkingDays(succLateFinish, Math.abs(relationship.lag), calendar);
            }
          }
          predLateStart = adjustedSuccLF;
          predLateFinish = this.addWorkingDays(predLateStart, duration, calendar);
        }
        break;
    }
    
    return { lateStart: predLateStart, lateFinish: predLateFinish };
  }

  /**
   * Apply scheduling constraints
   */
  private applyConstraints(activity: CalculatedActivity) {
    if (!activity.constraintType || !activity.constraintDate) return;
    
    const constraintDate = new Date(activity.constraintDate);
    const calendar = this.getCalendarForActivity(activity);
    
    switch (activity.constraintType) {
      case 'SNET': // Start No Earlier Than
        if (activity.calculatedEarlyStart && activity.calculatedEarlyStart < constraintDate) {
          activity.calculatedEarlyStart = constraintDate;
          activity.calculatedEarlyFinish = this.addWorkingDays(
            constraintDate, 
            activity.remainingDuration || activity.originalDuration || 0, 
            calendar
          );
        }
        break;
        
      case 'SNLT': // Start No Later Than
        if (activity.calculatedLateStart && activity.calculatedLateStart > constraintDate) {
          activity.calculatedLateStart = constraintDate;
          activity.calculatedLateFinish = this.addWorkingDays(
            constraintDate, 
            activity.remainingDuration || activity.originalDuration || 0, 
            calendar
          );
        }
        break;
        
      case 'FNET': // Finish No Earlier Than
        if (activity.calculatedEarlyFinish && activity.calculatedEarlyFinish < constraintDate) {
          activity.calculatedEarlyFinish = constraintDate;
          activity.calculatedEarlyStart = this.subtractWorkingDays(
            constraintDate, 
            activity.remainingDuration || activity.originalDuration || 0, 
            calendar
          );
        }
        break;
        
      case 'FNLT': // Finish No Later Than
        if (activity.calculatedLateFinish && activity.calculatedLateFinish > constraintDate) {
          activity.calculatedLateFinish = constraintDate;
          activity.calculatedLateStart = this.subtractWorkingDays(
            constraintDate, 
            activity.remainingDuration || activity.originalDuration || 0, 
            calendar
          );
          
          // Check for constraint violation
          if (activity.calculatedEarlyFinish && activity.calculatedEarlyFinish > constraintDate) {
            activity.hasConstraintViolation = true;
            activity.constraintViolationMessage = `Activity cannot finish by ${constraintDate.toLocaleDateString()}`;
          }
        }
        break;
        
      case 'MSO': // Must Start On
        activity.calculatedEarlyStart = constraintDate;
        activity.calculatedLateStart = constraintDate;
        activity.calculatedEarlyFinish = this.addWorkingDays(
          constraintDate, 
          activity.remainingDuration || activity.originalDuration || 0, 
          calendar
        );
        activity.calculatedLateFinish = activity.calculatedEarlyFinish;
        break;
        
      case 'MFO': // Must Finish On
        activity.calculatedEarlyFinish = constraintDate;
        activity.calculatedLateFinish = constraintDate;
        activity.calculatedEarlyStart = this.subtractWorkingDays(
          constraintDate, 
          activity.remainingDuration || activity.originalDuration || 0, 
          calendar
        );
        activity.calculatedLateStart = activity.calculatedEarlyStart;
        break;
    }
  }

  /**
   * Handle actual progress and data date
   */
  private handleProgress(activity: CalculatedActivity) {
    if (!this.dataDate) return;
    
    const calendar = this.getCalendarForActivity(activity);
    
    // If activity has actual start
    if (activity.actualStart) {
      const actualStartDate = new Date(activity.actualStart);
      activity.calculatedEarlyStart = actualStartDate;
      
      // If activity is completed
      if (activity.status === 'Completed' && activity.actualFinish) {
        activity.calculatedEarlyFinish = new Date(activity.actualFinish);
      } 
      // If activity is in progress
      else if (activity.status === 'InProgress') {
        const remainingDuration = activity.remainingDuration || 
          ((activity.originalDuration || 0) * (100 - (activity.percentComplete || 0)) / 100);
        
        // For in-progress activities, the earliest they can finish is data date + remaining duration
        const earliestFinish = this.addWorkingDays(this.dataDate, remainingDuration, calendar);
        
        if (!activity.calculatedEarlyFinish || earliestFinish > activity.calculatedEarlyFinish) {
          activity.calculatedEarlyFinish = earliestFinish;
        }
      }
    }
    
    // Ensure activities don't start before data date (unless already started)
    if (!activity.actualStart && activity.calculatedEarlyStart && activity.calculatedEarlyStart < this.dataDate) {
      activity.calculatedEarlyStart = this.dataDate;
      
      const duration = activity.remainingDuration || activity.originalDuration || 0;
      activity.calculatedEarlyFinish = this.addWorkingDays(this.dataDate, duration, calendar);
    }
  }

  /**
   * Perform forward pass to calculate early dates
   */
  private forwardPass() {
    const processed = new Set<string>();
    const processing = new Set<string>();
    
    const processActivity = (activityId: string): void => {
      if (processed.has(activityId) || processing.has(activityId)) return;
      
      processing.add(activityId);
      const activity = this.activities.get(activityId);
      if (!activity) return;
      
      const calendar = this.getCalendarForActivity(activity);
      
      // Get all predecessors
      const predecessorRelationships = this.relationships.filter(r => r.successorId === activityId);
      
      // Process all predecessors first
      predecessorRelationships.forEach(rel => {
        processActivity(rel.predecessorId);
      });
      
      let earlyStart: Date | null = null;
      let earlyFinish: Date | null = null;
      
      // Handle special activity types
      if (activity.type === 'StartMilestone' || activity.type === 'FinishMilestone') {
        // Milestones have zero duration
        activity.originalDuration = 0;
        activity.remainingDuration = 0;
      }
      
      if (predecessorRelationships.length === 0) {
        // No predecessors - use project start date or constraint
        earlyStart = this.dataDate || new Date();
      } else {
        // Calculate based on predecessors
        predecessorRelationships.forEach(rel => {
          const predecessorActivity = this.activities.get(rel.predecessorId);
          if (!predecessorActivity) return;
          
          const dependentDate = this.applyForwardRelationship(predecessorActivity, rel);
          
          if (dependentDate) {
            if (rel.type === 'FS' || rel.type === 'SS') {
              // These affect start date
              if (!earlyStart || dependentDate > earlyStart) {
                earlyStart = dependentDate;
              }
            } else if (rel.type === 'FF' || rel.type === 'SF') {
              // These affect finish date
              const duration = activity.remainingDuration || activity.originalDuration || 0;
              const calculatedStart = this.subtractWorkingDays(dependentDate, duration, calendar);
              
              if (!earlyStart || calculatedStart > earlyStart) {
                earlyStart = calculatedStart;
              }
            }
          }
        });
      }
      
      if (earlyStart) {
        activity.calculatedEarlyStart = earlyStart;
        
        // Handle special activity type durations
        let duration = activity.remainingDuration || activity.originalDuration || 0;
        
        if (activity.type === 'StartMilestone' || activity.type === 'FinishMilestone') {
          duration = 0; // Milestones have zero duration
        } else if (activity.type === 'WBSSummary') {
          // WBS Summary duration calculated from children (handled in post-processing)
          duration = 0; // Placeholder
        } else if (activity.type === 'LOE' || activity.type === 'Hammock') {
          // LOE/Hammock activities can have custom durations or span between activities
          duration = activity.originalDuration || 1;
        }
        
        activity.calculatedEarlyFinish = this.addWorkingDays(earlyStart, duration, calendar);
      }
      
      // Handle progress and constraints
      this.handleProgress(activity);
      this.applyConstraints(activity);
      
      processing.delete(activityId);
      processed.add(activityId);
    };
    
    // Process all activities
    Array.from(this.activities.keys()).forEach(processActivity);
  }

  /**
   * Perform backward pass to calculate late dates using correct CPM formulas
   */
  private backwardPass() {
    const processed = new Set<string>();
    const processing = new Set<string>();
    
    // Find project end date (latest early finish)
    let projectEndDate = new Date();
    this.activities.forEach(activity => {
      if (activity.calculatedEarlyFinish && activity.calculatedEarlyFinish > projectEndDate) {
        projectEndDate = activity.calculatedEarlyFinish;
      }
    });
    
    const processActivity = (activityId: string): void => {
      if (processed.has(activityId) || processing.has(activityId)) return;
      
      processing.add(activityId);
      const activity = this.activities.get(activityId);
      if (!activity) return;
      
      const calendar = this.getCalendarForActivity(activity);
      
      // Get all successors where this activity is the predecessor
      const successorRelationships = this.relationships.filter(r => r.predecessorId === activityId);
      
      // Process all successors first
      successorRelationships.forEach(rel => {
        processActivity(rel.successorId);
      });
      
      if (successorRelationships.length === 0) {
        // No successors - this is an end activity, use early finish as late finish
        activity.calculatedLateFinish = activity.calculatedEarlyFinish || projectEndDate;
        const duration = activity.remainingDuration || activity.originalDuration || 0;
        activity.calculatedLateStart = this.subtractWorkingDays(activity.calculatedLateFinish, duration, calendar);
      } else {
        // Calculate late dates based on all successors using proper CPM formulas
        let minLateStart: Date | null = null;
        let minLateFinish: Date | null = null;
        
        successorRelationships.forEach(rel => {
          const successorActivity = this.activities.get(rel.successorId);
          if (!successorActivity) return;
          
          // Calculate this activity's late dates based on successor's late dates
          const backwardDates = this.calculateBackwardDates(successorActivity, rel, activity);
          
          if (backwardDates.lateStart && backwardDates.lateFinish) {
            // Take the minimum (most constraining) dates from all successors
            if (!minLateStart || backwardDates.lateStart < minLateStart) {
              minLateStart = backwardDates.lateStart;
            }
            if (!minLateFinish || backwardDates.lateFinish < minLateFinish) {
              minLateFinish = backwardDates.lateFinish;
            }
          }
        });
        
        // Set the calculated late dates
        if (minLateStart && minLateFinish) {
          activity.calculatedLateStart = minLateStart;
          activity.calculatedLateFinish = minLateFinish;
        }
      }
      
      // Apply constraints to late dates
      this.applyConstraints(activity);
      
      processing.delete(activityId);
      processed.add(activityId);
    };
    
    // Process all activities
    Array.from(this.activities.keys()).forEach(processActivity);
  }

  /**
   * Calculate float and identify critical path
   */
  private calculateFloat() {
    this.activities.forEach(activity => {
      if (activity.calculatedEarlyStart && activity.calculatedLateStart && 
          activity.calculatedEarlyFinish && activity.calculatedLateFinish) {
        
        // Total float = late start - early start (or late finish - early finish)
        const totalFloat = Math.round(
          (activity.calculatedLateStart.getTime() - activity.calculatedEarlyStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        activity.calculatedTotalFloat = totalFloat;
        activity.calculatedIsCritical = totalFloat <= 0;
        
        // Calculate free float (minimum float without affecting successors)
        const successors = this.relationships.filter(r => r.predecessorId === activity.id);
        let freeFloat = totalFloat;
        
        successors.forEach(rel => {
          const successor = this.activities.get(rel.successorId);
          if (successor && successor.calculatedEarlyStart) {
            const dependentDate = this.applyRelationship(activity, rel, true);
            if (dependentDate) {
              const availableFloat = Math.round(
                (successor.calculatedEarlyStart.getTime() - dependentDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              freeFloat = Math.min(freeFloat, availableFloat);
            }
          }
        });
        
        activity.calculatedFreeFloat = Math.max(0, freeFloat);
      }
    });
  }

  /**
   * Calculate critical path method
   */
  public calculate(): CalculatedActivity[] {
    // Reset all calculated values
    this.activities.forEach(activity => {
      activity.calculatedEarlyStart = null;
      activity.calculatedEarlyFinish = null;
      activity.calculatedLateStart = null;
      activity.calculatedLateFinish = null;
      activity.calculatedTotalFloat = null;
      activity.calculatedFreeFloat = null;
      activity.calculatedIsCritical = false;
      activity.hasConstraintViolation = false;
      activity.constraintViolationMessage = undefined;
    });
    
    // Perform CPM calculation
    this.forwardPass();
    this.backwardPass();
    this.calculateFloat();
    
    // Post-process special activity types
    this.postProcessSpecialActivities();
    
    return Array.from(this.activities.values());
  }

  /**
   * Get activities with constraint violations
   */
  public getConstraintViolations(): CalculatedActivity[] {
    return Array.from(this.activities.values()).filter(a => a.hasConstraintViolation);
  }

  /**
   * Get critical path activities
   */
  public getCriticalPath(): CalculatedActivity[] {
    return Array.from(this.activities.values()).filter(a => a.calculatedIsCritical);
  }
  
  /**
   * Post-process WBS summary activities and LOE/Hammock spans
   */
  private postProcessSpecialActivities() {
    // Handle WBS Summary rollups
    this.activities.forEach(activity => {
      if (activity.type === 'WBSSummary') {
        this.calculateWBSSummary(activity);
      }
    });
    
    // Handle LOE and Hammock activities spanning
    this.activities.forEach(activity => {
      if (activity.type === 'LOE' || activity.type === 'Hammock') {
        this.calculateSpanningActivity(activity);
      }
    });
  }
  
  /**
   * Calculate WBS Summary activity dates from children
   */
  private calculateWBSSummary(summaryActivity: CalculatedActivity) {
    // Find child activities (activities with this WBS as parent)
    const childActivities = Array.from(this.activities.values()).filter(
      act => act.wbsId === summaryActivity.wbsId && act.id !== summaryActivity.id
    );
    
    if (childActivities.length === 0) return;
    
    // Calculate summary dates from children
    let earliestStart: Date | null = null;
    let latestFinish: Date | null = null;
    let totalOriginalDuration = 0;
    let totalRemainingDuration = 0;
    let totalPercentComplete = 0;
    
    childActivities.forEach(child => {
      if (child.calculatedEarlyStart && (!earliestStart || child.calculatedEarlyStart < earliestStart)) {
        earliestStart = child.calculatedEarlyStart;
      }
      if (child.calculatedEarlyFinish && (!latestFinish || child.calculatedEarlyFinish > latestFinish)) {
        latestFinish = child.calculatedEarlyFinish;
      }
      
      totalOriginalDuration += child.originalDuration || 0;
      totalRemainingDuration += child.remainingDuration || 0;
      totalPercentComplete += (child.percentComplete || 0) * (child.originalDuration || 1);
    });
    
    // Update summary activity
    if (earliestStart) summaryActivity.calculatedEarlyStart = earliestStart;
    if (latestFinish) summaryActivity.calculatedEarlyFinish = latestFinish;
    
    // Calculate weighted average percent complete
    if (totalOriginalDuration > 0) {
      summaryActivity.percentComplete = totalPercentComplete / totalOriginalDuration;
    }
    
    // Update duration to span from earliest start to latest finish
    if (earliestStart && latestFinish) {
      const calendar = this.getCalendarForActivity(summaryActivity);
      summaryActivity.originalDuration = this.getWorkingDaysBetween(earliestStart, latestFinish, calendar);
    }
  }
  
  /**
   * Calculate LOE/Hammock activity spans based on linked activities
   */
  private calculateSpanningActivity(spanActivity: CalculatedActivity) {
    // For now, use the standard calculation
    // In a full implementation, you might:
    // 1. Look for special relationship types that define start/end links
    // 2. Calculate span based on those linked activities
    // 3. Update duration accordingly
    
    // This is a simplified version - in practice you'd have more sophisticated spanning logic
  }
}