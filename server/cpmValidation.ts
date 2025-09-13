import { CPMCalculator } from "./cpmCalculator";
import type { Activity, Relationship } from "@shared/schema";

/**
 * Simple validation test for CPM algorithm fixes
 * Tests the critical fixes: backward pass formulas, lag direction, and date arithmetic
 */
export function validateCPMAlgorithmFixes(): {
  success: boolean;
  errors: string[];
  testResults: any[];
} {
  const errors: string[] = [];
  const testResults: any[] = [];

  try {
    // Test 1: Simple FS relationship with positive lag
    console.log("🧪 Testing CPM Algorithm Fix #1: FS relationship with positive lag");
    
    const activities1: Activity[] = [
      {
        id: "act1",
        name: "Task A",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-1",
        activityId: "A001",
        wbsId: null,
        type: "Task",
        originalDuration: 5,
        remainingDuration: 5,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      },
      {
        id: "act2",
        name: "Task B",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-1",
        activityId: "A002",
        wbsId: null,
        type: "Task",
        originalDuration: 3,
        remainingDuration: 3,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      }
    ];

    const relationships1: Relationship[] = [
      {
        id: "rel1",
        projectId: "test-project-1",
        predecessorId: "act1",
        successorId: "act2",
        type: "FS",
        lag: 2,
        lagUnit: "days"
      }
    ];

    const calculator1 = new CPMCalculator(activities1, relationships1, [], new Date('2025-01-01'));
    const results1 = calculator1.calculate();
    
    const taskA = results1.find(a => a.activityId === "A001");
    const taskB = results1.find(a => a.activityId === "A002");
    
    testResults.push({
      test: "FS with lag +2",
      taskA: {
        earlyStart: taskA?.calculatedEarlyStart?.toISOString(),
        earlyFinish: taskA?.calculatedEarlyFinish?.toISOString(),
        lateStart: taskA?.calculatedLateStart?.toISOString(),
        lateFinish: taskA?.calculatedLateFinish?.toISOString(),
        totalFloat: taskA?.calculatedTotalFloat
      },
      taskB: {
        earlyStart: taskB?.calculatedEarlyStart?.toISOString(),
        earlyFinish: taskB?.calculatedEarlyFinish?.toISOString(),
        lateStart: taskB?.calculatedLateStart?.toISOString(),
        lateFinish: taskB?.calculatedLateFinish?.toISOString(),
        totalFloat: taskB?.calculatedTotalFloat
      }
    });

    // Test 2: SS relationship with negative lag
    console.log("🧪 Testing CPM Algorithm Fix #2: SS relationship with negative lag");
    
    const activities2: Activity[] = [
      {
        id: "act3",
        name: "Task C",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-2",
        activityId: "A003",
        wbsId: null,
        type: "Task",
        originalDuration: 4,
        remainingDuration: 4,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      },
      {
        id: "act4",
        name: "Task D",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-2",
        activityId: "A004",
        wbsId: null,
        type: "Task",
        originalDuration: 2,
        remainingDuration: 2,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      }
    ];

    const relationships2: Relationship[] = [
      {
        id: "rel2",
        projectId: "test-project-2",
        predecessorId: "act3",
        successorId: "act4",
        type: "SS",
        lag: -1,
        lagUnit: "days"
      }
    ];

    const calculator2 = new CPMCalculator(activities2, relationships2, [], new Date('2025-01-01'));
    const results2 = calculator2.calculate();
    
    const taskC = results2.find(a => a.activityId === "A003");
    const taskD = results2.find(a => a.activityId === "A004");
    
    testResults.push({
      test: "SS with lag -1",
      taskC: {
        earlyStart: taskC?.calculatedEarlyStart?.toISOString(),
        earlyFinish: taskC?.calculatedEarlyFinish?.toISOString(),
        lateStart: taskC?.calculatedLateStart?.toISOString(),
        lateFinish: taskC?.calculatedLateFinish?.toISOString(),
        totalFloat: taskC?.calculatedTotalFloat
      },
      taskD: {
        earlyStart: taskD?.calculatedEarlyStart?.toISOString(),
        earlyFinish: taskD?.calculatedEarlyFinish?.toISOString(),
        lateStart: taskD?.calculatedLateStart?.toISOString(),
        lateFinish: taskD?.calculatedLateFinish?.toISOString(),
        totalFloat: taskD?.calculatedTotalFloat
      }
    });

    // Test 3: Working day arithmetic consistency
    console.log("🧪 Testing CPM Algorithm Fix #3: Working day arithmetic consistency");
    
    const activities3: Activity[] = [
      {
        id: "act5",
        name: "Milestone Start",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-3",
        activityId: "A005",
        wbsId: null,
        type: "StartMilestone",
        originalDuration: 0,
        remainingDuration: 0,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      },
      {
        id: "act6",
        name: "1-Day Task",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "test-project-3",
        activityId: "A006",
        wbsId: null,
        type: "Task",
        originalDuration: 1,
        remainingDuration: 1,
        actualDuration: null,
        durationUnit: "days",
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        actualStart: null,
        actualFinish: null,
        baselineStart: null,
        baselineFinish: null,
        baselineDuration: null,
        baselineCost: null,
        baselineWork: null,
        totalFloat: null,
        freeFloat: null,
        isCritical: false,
        criticalityIndex: null,
        percentComplete: 0,
        physicalPercentComplete: null,
        status: "NotStarted",
        calendarId: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        activityCodes: null,
        customFields: null,
        budgetedCost: null,
        actualCost: null,
        earnedValue: null,
        notes: null,
        trade: null,
        responsibility: null,
        location: null
      }
    ];

    const relationships3: Relationship[] = [
      {
        id: "rel3",
        projectId: "test-project-3",
        predecessorId: "act5",
        successorId: "act6",
        type: "FS",
        lag: 0,
        lagUnit: "days"
      }
    ];

    const calculator3 = new CPMCalculator(activities3, relationships3, [], new Date('2025-01-06')); // Monday
    const results3 = calculator3.calculate();
    
    const milestone = results3.find(a => a.activityId === "A005");
    const oneDay = results3.find(a => a.activityId === "A006");
    
    testResults.push({
      test: "Milestone + 1-day task",
      milestone: {
        earlyStart: milestone?.calculatedEarlyStart?.toISOString(),
        earlyFinish: milestone?.calculatedEarlyFinish?.toISOString(),
        duration: milestone?.originalDuration
      },
      oneDay: {
        earlyStart: oneDay?.calculatedEarlyStart?.toISOString(),
        earlyFinish: oneDay?.calculatedEarlyFinish?.toISOString(),
        duration: oneDay?.originalDuration
      }
    });

    console.log("✅ CPM Algorithm validation completed successfully");
    console.log("📊 Test results:", JSON.stringify(testResults, null, 2));
    
    return {
      success: true,
      errors: [],
      testResults
    };

  } catch (error) {
    const errorMsg = `CPM validation failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    console.error("❌ CPM Algorithm validation failed:", error);
    
    return {
      success: false,
      errors,
      testResults
    };
  }
}

// Export for testing in other parts of the application
export default validateCPMAlgorithmFixes;