import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth (MANDATORY - DO NOT DROP)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth (MANDATORY - DO NOT DROP)  
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Enums
export const activityTypeEnum = pgEnum("activity_type", ["Task", "StartMilestone", "FinishMilestone", "LOE", "Hammock", "WBSSummary"]);
export const activityStatusEnum = pgEnum("activity_status", ["NotStarted", "InProgress", "Completed"]);
export const relationshipTypeEnum = pgEnum("relationship_type", ["FS", "SS", "FF", "SF"]);
export const constraintTypeEnum = pgEnum("constraint_type", ["SNET", "FNET", "SNLT", "FNLT", "MSO", "MFO"]);
export const resourceTypeEnum = pgEnum("resource_type", ["Labor", "Equipment", "Material"]);
export const calendarTypeEnum = pgEnum("calendar_type", ["Global", "Project", "Resource", "Activity"]);
export const delayPartyEnum = pgEnum("delay_party", ["Owner", "Contractor", "ThirdParty", "ForceMajeure"]);
export const delayClassificationEnum = pgEnum("delay_classification", ["Excusable", "NonExcusable", "Compensable", "NonCompensable"]);
export const analysisMethodEnum = pgEnum("analysis_method", ["ImpactedAsPlanned", "TimeSliceWindows", "AsPlannedVsAsBuilt", "CollapsedAsBuilt"]);

// Core Tables
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  contractStartDate: text("contract_start_date"),
  contractFinishDate: text("contract_finish_date"),
  dataDate: text("data_date"),
  colorPrimary: text("color_primary").notNull().default("#10b981"),
  colorSecondary: text("color_secondary").notNull().default("#059669"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// WBS Structure
export const wbs = pgTable("wbs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  parentId: varchar("parent_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  level: integer("level").notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  rollupSettings: jsonb("rollup_settings")
});

// Activity Codes (P6-style)
export const activityCodes = pgTable("activity_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  codeType: text("code_type").notNull(), // Global or Project
  codeName: text("code_name").notNull(),
  codeValue: text("code_value").notNull(),
  description: text("description"),
  color: text("color")
});

// Calendars
export const calendars = pgTable("calendars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id),
  name: text("name").notNull(),
  type: calendarTypeEnum("type").notNull(),
  standardWorkweek: jsonb("standard_workweek"), // Array of working days and hours
  holidays: jsonb("holidays"), // Array of holiday dates
  exceptions: jsonb("exceptions") // Array of exception dates with custom hours
});

// Activities (Main scheduling table)
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  activityId: text("activity_id").notNull(), // User-defined ID (unique per project)
  name: text("name").notNull(),
  wbsId: varchar("wbs_id").references(() => wbs.id),
  type: activityTypeEnum("type").notNull().default("Task"),
  
  // Duration fields
  originalDuration: real("original_duration"),
  remainingDuration: real("remaining_duration"),
  actualDuration: real("actual_duration"),
  durationUnit: text("duration_unit").default("days"),
  
  // Date fields
  earlyStart: text("early_start"),
  earlyFinish: text("early_finish"),
  lateStart: text("late_start"),
  lateFinish: text("late_finish"),
  actualStart: text("actual_start"),
  actualFinish: text("actual_finish"),
  baselineStart: text("baseline_start"),
  baselineFinish: text("baseline_finish"),
  baselineDuration: real("baseline_duration"),
  baselineCost: real("baseline_cost"),
  baselineWork: real("baseline_work"),
  
  // Float and criticality
  totalFloat: real("total_float"),
  freeFloat: real("free_float"),
  isCritical: boolean("is_critical").default(false),
  criticalityIndex: real("criticality_index"), // For near-critical path analysis
  
  // Progress
  percentComplete: real("percent_complete").default(0),
  physicalPercentComplete: real("physical_percent_complete"),
  status: activityStatusEnum("status").notNull().default("NotStarted"),
  
  // Calendar and constraints
  calendarId: varchar("calendar_id").references(() => calendars.id),
  constraintType: constraintTypeEnum("constraint_type"),
  constraintDate: text("constraint_date"),
  deadline: text("deadline"),
  
  // Activity codes and custom fields
  activityCodes: jsonb("activity_codes"), // JSON object of code assignments
  customFields: jsonb("custom_fields"), // JSON object for user-defined fields
  
  // Resources and costs
  budgetedCost: real("budgeted_cost"),
  actualCost: real("actual_cost"),
  earnedValue: real("earned_value"),
  
  // Other fields
  notes: text("notes"),
  trade: text("trade"),
  responsibility: text("responsibility"),
  location: text("location"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  // Composite unique constraint: activity_id must be unique within each project
  projectActivityUnique: uniqueIndex("project_activity_unique").on(table.projectId, table.activityId)
}));

// Relationships (Dependencies)
export const relationships = pgTable("relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  predecessorId: varchar("predecessor_id").references(() => activities.id).notNull(),
  successorId: varchar("successor_id").references(() => activities.id).notNull(),
  type: relationshipTypeEnum("type").notNull().default("FS"),
  lag: real("lag").default(0),
  lagUnit: text("lag_unit").default("days")
});

// Resources
export const resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  resourceId: text("resource_id").notNull(),
  name: text("name").notNull(),
  type: resourceTypeEnum("type").notNull(),
  unit: text("unit"),
  standardRate: real("standard_rate"),
  overtimeRate: real("overtime_rate"),
  maxUnits: real("max_units").default(1),
  calendarId: varchar("calendar_id").references(() => calendars.id),
  notes: text("notes")
});

// Resource Assignments
export const resourceAssignments = pgTable("resource_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id).notNull(),
  resourceId: varchar("resource_id").references(() => resources.id).notNull(),
  units: real("units").default(1),
  plannedUnits: real("planned_units"),
  actualUnits: real("actual_units"),
  remainingUnits: real("remaining_units"),
  cost: real("cost"),
  actualCost: real("actual_cost"),
  remainingCost: real("remaining_cost")
});

// Baselines
export const baselines = pgTable("baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false),
  isLocked: boolean("is_locked").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  snapshotData: jsonb("snapshot_data") // Complete snapshot of activities and relationships
});

// Baseline Activity Snapshots (for easier variance calculations)
export const baselineActivities = pgTable("baseline_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baselineId: varchar("baseline_id").references(() => baselines.id).notNull(),
  originalActivityId: varchar("original_activity_id").references(() => activities.id).notNull(),
  activityId: text("activity_id").notNull(),
  name: text("name").notNull(),
  
  // Snapshot of dates and durations at baseline time
  plannedStart: text("planned_start"),
  plannedFinish: text("planned_finish"),
  plannedDuration: real("planned_duration"),
  plannedCost: real("planned_cost"),
  plannedWork: real("planned_work"),
  
  // Additional baseline metadata
  wbsId: varchar("wbs_id"),
  type: text("type"),
  responsibility: text("responsibility"),
  trade: text("trade")
});

// TIA (Time Impact Analysis) Scenarios
export const tiaScenarios = pgTable("tia_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  analysisMethod: analysisMethodEnum("analysis_method").notNull(),
  dataDate: text("data_date").notNull(),
  impactType: text("impact_type"), // Prospective or Retrospective
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  isActive: boolean("is_active").default(false)
});

// TIA Fragnets
export const tiaFragnets = pgTable("tia_fragnets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").references(() => tiaScenarios.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  insertionPoint: text("insertion_point"), // Where in the schedule to insert
  activities: jsonb("activities"), // Array of fragnet activities
  relationships: jsonb("relationships"), // Array of fragnet relationships
  linkedActivities: jsonb("linked_activities") // Links to existing schedule activities
});

// TIA Delays
export const tiaDelays = pgTable("tia_delays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").references(() => tiaScenarios.id).notNull(),
  fragnetId: varchar("fragnet_id").references(() => tiaFragnets.id),
  delayName: text("delay_name").notNull(),
  delayDays: real("delay_days").notNull(),
  party: delayPartyEnum("party").notNull(),
  classification: delayClassificationEnum("classification").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  description: text("description"),
  evidence: jsonb("evidence") // Links to RFIs, submittals, documents
});

// TIA Results
export const tiaResults = pgTable("tia_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").references(() => tiaScenarios.id).notNull(),
  impactedFinishDate: text("impacted_finish_date"),
  unimpactedFinishDate: text("unimpacted_finish_date"),
  netImpactDays: real("net_impact_days"),
  criticalPathChanges: jsonb("critical_path_changes"),
  floatErosion: jsonb("float_erosion"),
  affectedMilestones: jsonb("affected_milestones"),
  analysisDate: timestamp("analysis_date").defaultNow().notNull()
});

// Schedule Updates/Revisions
export const scheduleUpdates = pgTable("schedule_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  updateNumber: integer("update_number").notNull(),
  dataDate: text("data_date").notNull(),
  narrative: text("narrative"),
  changesFromPrevious: jsonb("changes_from_previous"), // Delta from previous update
  progressData: jsonb("progress_data"), // Progress since last update
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  approvalDate: text("approval_date")
});

// Import/Export History
export const importExportHistory = pgTable("import_export_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  type: text("type").notNull(), // Import or Export
  format: text("format").notNull(), // MPP, XER, XML, CSV, etc.
  filename: text("filename").notNull(),
  fileUrl: text("file_url"),
  mappingRules: jsonb("mapping_rules"), // Field mapping configuration
  conversionReport: jsonb("conversion_report"), // What was mapped/unmapped
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by")
});

// AI Assistant Context
export const aiContext = pgTable("ai_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  contextType: text("context_type").notNull(), // Specs, Drawings, Requirements, etc.
  documentName: text("document_name"),
  documentUrl: text("document_url"),
  extractedContent: text("extracted_content"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// Activity Comments for collaboration
export const activityComments = pgTable("activity_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id).notNull(),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  parentId: varchar("parent_id"), // For threaded discussions
  content: text("content").notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isResolved: boolean("is_resolved").default(false),
  mentionedUsers: text("mentioned_users").array(), // Array of user IDs/names
  attachmentIds: text("attachment_ids").array() // Array of attachment IDs
});

// File Attachments for activities and projects
export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  activityId: varchar("activity_id").references(() => activities.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  storageUrl: text("storage_url").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  description: text("description"),
  category: text("category").default("Document"), // Document, Image, Drawing, RFI, Submittal, Report, Other
  tags: text("tags").array()
});

// Audit Trail for all schedule changes
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  entityType: text("entity_type").notNull(), // "activity", "relationship", "project", etc.
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // Create, Update, Delete, Import, Export, Calculate, BaselineSet
  changes: jsonb("changes"), // JSON object with old and new values
  performedBy: text("performed_by").notNull(),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  notes: text("notes")
});

// Project Members and Roles
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  email: text("email"),
  role: text("role").notNull(), // Owner, Scheduler, Manager, Viewer, Contributor
  permissions: jsonb("permissions"), // Detailed permissions object
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at"),
  isActive: boolean("is_active").default(true)
});

// Schedule Versions for version history
export const scheduleVersions = pgTable("schedule_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  versionName: text("version_name"),
  description: text("description"),
  snapshotData: jsonb("snapshot_data").notNull(), // Complete schedule snapshot
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isAutoSave: boolean("is_auto_save").default(false),
  changesSummary: jsonb("changes_summary") // Summary of what changed
});

// Insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWbsSchema = createInsertSchema(wbs).omit({ id: true });
export const insertActivityCodeSchema = createInsertSchema(activityCodes).omit({ id: true });
export const insertCalendarSchema = createInsertSchema(calendars).omit({ id: true });
export const insertActivitySchema = createInsertSchema(activities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRelationshipSchema = createInsertSchema(relationships).omit({ id: true });
export const insertResourceSchema = createInsertSchema(resources).omit({ id: true });
export const insertResourceAssignmentSchema = createInsertSchema(resourceAssignments).omit({ id: true });
export const insertBaselineSchema = createInsertSchema(baselines).omit({ id: true, createdAt: true });
export const insertTiaScenarioSchema = createInsertSchema(tiaScenarios).omit({ id: true, createdAt: true });
export const insertTiaFragnetSchema = createInsertSchema(tiaFragnets).omit({ id: true });
export const insertTiaDelaySchema = createInsertSchema(tiaDelays).omit({ id: true });
export const insertTiaResultSchema = createInsertSchema(tiaResults).omit({ id: true, analysisDate: true });
export const insertScheduleUpdateSchema = createInsertSchema(scheduleUpdates).omit({ id: true, createdAt: true });
export const insertImportExportHistorySchema = createInsertSchema(importExportHistory).omit({ id: true, createdAt: true });
export const insertAiContextSchema = createInsertSchema(aiContext).omit({ id: true, createdAt: true });
export const insertActivityCommentSchema = createInsertSchema(activityComments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, uploadedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, performedAt: true });
export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ id: true, joinedAt: true });
export const insertScheduleVersionSchema = createInsertSchema(scheduleVersions).omit({ id: true, createdAt: true });

// Types
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Wbs = typeof wbs.$inferSelect;
export type InsertWbs = z.infer<typeof insertWbsSchema>;
export type ActivityCode = typeof activityCodes.$inferSelect;
export type InsertActivityCode = z.infer<typeof insertActivityCodeSchema>;
export type Calendar = typeof calendars.$inferSelect;
export type InsertCalendar = z.infer<typeof insertCalendarSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Relationship = typeof relationships.$inferSelect;
export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type ResourceAssignment = typeof resourceAssignments.$inferSelect;
export type InsertResourceAssignment = z.infer<typeof insertResourceAssignmentSchema>;
export type Baseline = typeof baselines.$inferSelect;
export type InsertBaseline = z.infer<typeof insertBaselineSchema>;
export type TiaScenario = typeof tiaScenarios.$inferSelect;
export type InsertTiaScenario = z.infer<typeof insertTiaScenarioSchema>;
export type TiaFragnet = typeof tiaFragnets.$inferSelect;
export type InsertTiaFragnet = z.infer<typeof insertTiaFragnetSchema>;
export type TiaDelay = typeof tiaDelays.$inferSelect;
export type InsertTiaDelay = z.infer<typeof insertTiaDelaySchema>;
export type TiaResult = typeof tiaResults.$inferSelect;
export type InsertTiaResult = z.infer<typeof insertTiaResultSchema>;
export type ScheduleUpdate = typeof scheduleUpdates.$inferSelect;
export type InsertScheduleUpdate = z.infer<typeof insertScheduleUpdateSchema>;
export type ImportExportHistory = typeof importExportHistory.$inferSelect;
export type InsertImportExportHistory = z.infer<typeof insertImportExportHistorySchema>;
export type AiContext = typeof aiContext.$inferSelect;
export type InsertAiContext = z.infer<typeof insertAiContextSchema>;
export type ActivityComment = typeof activityComments.$inferSelect;
export type InsertActivityComment = z.infer<typeof insertActivityCommentSchema>;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ScheduleVersion = typeof scheduleVersions.$inferSelect;
export type InsertScheduleVersion = z.infer<typeof insertScheduleVersionSchema>;

// Export-specific types for schedule export functionality
export interface ProjectSchedule {
  id: string;
  projectId: string;
  scheduleType: string;
  dataDate: string;
  startDate: string;
  finishDate: string;
  version: number;
  notes?: string | null;
}

export interface ScheduleActivity {
  id: string;
  scheduleId: string;
  activityId: string;
  activityName: string;
  activityType?: string;
  originalDuration?: number | null;
  remainingDuration?: number | null;
  startDate?: string | null;
  finishDate?: string | null;
  totalFloat?: number | null;
  status?: string | null;
  predecessors?: string | null;
  successors?: string | null;
  notes?: string | null;
}