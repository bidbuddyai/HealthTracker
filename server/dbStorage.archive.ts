import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "@shared/schema";
import type {
  Project, InsertProject, Meeting, InsertMeeting, Attendance, InsertAttendance,
  AgendaItem, InsertAgendaItem, ActionItem, InsertActionItem, OpenItem, InsertOpenItem,
  Rfi, InsertRfi, Submittal, InsertSubmittal, Fabrication, InsertFabrication,
  Distribution, InsertDistribution, File, InsertFile, User, InsertUser
} from "@shared/schema";
import type { IStorage } from "./storage";
import * as ws from "ws";

// Configure Neon to use WebSocket for local development
if (process.env.NODE_ENV === 'development' || true) {
  console.log('Configuring WebSocket for Neon database...');
  // @ts-ignore
  neonConfig.webSocketConstructor = ws.WebSocket || ws;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host: string, port: string | number) => `${host}:${port}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Test database connection on initialization
pool.query('SELECT 1').then(() => {
  console.log('Database connected successfully');
}).catch(err => {
  console.error('Database connection error:', err);
});

export class DbStorage implements IStorage {
  // Export database utilities for schedule routes
  public db = db;
  public schema = schema;
  public eq = eq;
  public desc = desc;
  
  // Projects
  async getProjects(): Promise<Project[]> {
    try {
      const result = await db.select().from(schema.projects);
      return result || [];
    } catch (error) {
      console.error('DbStorage.getProjects error:', error);
      throw error;
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const results = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
      return results[0];
    } catch (error) {
      console.error('DbStorage.getProject error:', error);
      throw error;
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    try {
      const results = await db.insert(schema.projects).values({
        ...insertProject,
        colorPrimary: insertProject.colorPrimary || "#03512A",
        colorSecondary: insertProject.colorSecondary || "#1C7850"
      }).returning();
      return results[0];
    } catch (error) {
      console.error('DbStorage.createProject error:', error);
      throw error;
    }
  }

  // Meetings
  async getMeetingsByProject(projectId: string): Promise<Meeting[]> {
    return await db.select()
      .from(schema.meetings)
      .where(eq(schema.meetings.projectId, projectId))
      .orderBy(desc(schema.meetings.seqNum));
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const results = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id));
    return results[0];
  }

  async createMeeting(insertMeeting: InsertMeeting): Promise<Meeting> {
    const results = await db.insert(schema.meetings).values(insertMeeting).returning();
    return results[0];
  }

  // Attendance
  async getAttendanceByMeeting(meetingId: string): Promise<Attendance[]> {
    return await db.select()
      .from(schema.attendance)
      .where(eq(schema.attendance.meetingId, meetingId));
  }

  async createAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    const results = await db.insert(schema.attendance).values({
      ...insertAttendance,
      presentBool: insertAttendance.presentBool ?? false
    }).returning();
    return results[0];
  }

  async updateAttendance(id: string, updates: Partial<Attendance>): Promise<Attendance | undefined> {
    const results = await db.update(schema.attendance)
      .set(updates)
      .where(eq(schema.attendance.id, id))
      .returning();
    return results[0];
  }

  // Agenda Items
  async getAgendaItemsByMeeting(meetingId: string): Promise<AgendaItem[]> {
    return await db.select()
      .from(schema.agendaItems)
      .where(eq(schema.agendaItems.meetingId, meetingId))
      .orderBy(schema.agendaItems.topicOrder);
  }

  async createAgendaItem(insertItem: InsertAgendaItem): Promise<AgendaItem> {
    const results = await db.insert(schema.agendaItems).values({
      ...insertItem,
      discussion: insertItem.discussion ?? null,
      decision: insertItem.decision ?? null
    }).returning();
    return results[0];
  }

  async updateAgendaItem(id: string, updates: Partial<AgendaItem>): Promise<AgendaItem | undefined> {
    const results = await db.update(schema.agendaItems)
      .set(updates)
      .where(eq(schema.agendaItems.id, id))
      .returning();
    return results[0];
  }

  // Action Items
  async getActionItemsByMeeting(meetingId: string): Promise<ActionItem[]> {
    return await db.select()
      .from(schema.actionItems)
      .where(eq(schema.actionItems.meetingId, meetingId));
  }

  async createActionItem(insertItem: InsertActionItem): Promise<ActionItem> {
    const results = await db.insert(schema.actionItems).values({
      ...insertItem,
      status: insertItem.status || "Open",
      agendaItemId: insertItem.agendaItemId ?? null,
      dueDate: insertItem.dueDate ?? null,
      notes: insertItem.notes ?? null,
      sourceMeetingId: insertItem.sourceMeetingId ?? null
    }).returning();
    return results[0];
  }

  async updateActionItem(id: string, updates: Partial<ActionItem>): Promise<ActionItem | undefined> {
    const results = await db.update(schema.actionItems)
      .set(updates)
      .where(eq(schema.actionItems.id, id))
      .returning();
    return results[0];
  }

  // Open Items
  async getOpenItemsByProject(projectId: string): Promise<OpenItem[]> {
    return await db.select()
      .from(schema.openItems)
      .where(eq(schema.openItems.projectId, projectId));
  }

  async createOpenItem(insertItem: InsertOpenItem): Promise<OpenItem> {
    const results = await db.insert(schema.openItems).values({
      ...insertItem,
      status: insertItem.status || "Open",
      notes: insertItem.notes ?? null,
      targetClose: insertItem.targetClose ?? null
    }).returning();
    return results[0];
  }

  async updateOpenItem(id: string, updates: Partial<OpenItem>): Promise<OpenItem | undefined> {
    const results = await db.update(schema.openItems)
      .set(updates)
      .where(eq(schema.openItems.id, id))
      .returning();
    return results[0];
  }

  // RFIs
  async getRfisByMeeting(meetingId: string): Promise<Rfi[]> {
    return await db.select()
      .from(schema.rfis)
      .where(eq(schema.rfis.meetingId, meetingId));
  }

  async createRfi(insertRfi: InsertRfi): Promise<Rfi> {
    const results = await db.insert(schema.rfis).values({
      ...insertRfi,
      submittedDate: insertRfi.submittedDate ?? null,
      responseDue: insertRfi.responseDue ?? null,
      impact: insertRfi.impact ?? null,
      notes: insertRfi.notes ?? null
    }).returning();
    return results[0];
  }

  async updateRfi(id: string, updates: Partial<Rfi>): Promise<Rfi | undefined> {
    const results = await db.update(schema.rfis)
      .set(updates)
      .where(eq(schema.rfis.id, id))
      .returning();
    return results[0];
  }

  // Submittals
  async getSubmittalsByMeeting(meetingId: string): Promise<Submittal[]> {
    return await db.select()
      .from(schema.submittals)
      .where(eq(schema.submittals.meetingId, meetingId));
  }

  async createSubmittal(insertSubmittal: InsertSubmittal): Promise<Submittal> {
    const results = await db.insert(schema.submittals).values({
      ...insertSubmittal,
      specSection: insertSubmittal.specSection ?? null,
      requiredDate: insertSubmittal.requiredDate ?? null,
      submittedDate: insertSubmittal.submittedDate ?? null,
      resubmittalNeededBool: insertSubmittal.resubmittalNeededBool ?? false
    }).returning();
    return results[0];
  }

  async updateSubmittal(id: string, updates: Partial<Submittal>): Promise<Submittal | undefined> {
    const results = await db.update(schema.submittals)
      .set(updates)
      .where(eq(schema.submittals.id, id))
      .returning();
    return results[0];
  }

  // Fabrication
  async getFabricationByMeeting(meetingId: string): Promise<Fabrication[]> {
    return await db.select()
      .from(schema.fabrication)
      .where(eq(schema.fabrication.meetingId, meetingId));
  }

  async createFabrication(insertFabrication: InsertFabrication): Promise<Fabrication> {
    const results = await db.insert(schema.fabrication).values({
      ...insertFabrication,
      fabStart: insertFabrication.fabStart ?? null,
      fabFinish: insertFabrication.fabFinish ?? null,
      shipDate: insertFabrication.shipDate ?? null,
      needBy: insertFabrication.needBy ?? null,
      risks: insertFabrication.risks ?? null
    }).returning();
    return results[0];
  }

  async updateFabrication(id: string, updates: Partial<Fabrication>): Promise<Fabrication | undefined> {
    const results = await db.update(schema.fabrication)
      .set(updates)
      .where(eq(schema.fabrication.id, id))
      .returning();
    return results[0];
  }

  // Distribution
  async getDistributionByMeeting(meetingId: string): Promise<Distribution[]> {
    return await db.select()
      .from(schema.distribution)
      .where(eq(schema.distribution.meetingId, meetingId));
  }

  async createDistribution(insertDistribution: InsertDistribution): Promise<Distribution> {
    const results = await db.insert(schema.distribution).values({
      ...insertDistribution,
      sentBool: insertDistribution.sentBool ?? false
    }).returning();
    return results[0];
  }

  async updateDistribution(id: string, updates: Partial<Distribution>): Promise<Distribution | undefined> {
    const results = await db.update(schema.distribution)
      .set(updates)
      .where(eq(schema.distribution.id, id))
      .returning();
    return results[0];
  }

  // Files
  async getFilesByMeeting(meetingId: string): Promise<File[]> {
    return await db.select()
      .from(schema.files)
      .where(eq(schema.files.meetingId, meetingId));
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const results = await db.insert(schema.files).values({
      ...insertFile,
      transcription: insertFile.transcription ?? null
    }).returning();
    return results[0];
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const results = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return results[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const results = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return results[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const results = await db.insert(schema.users).values({
      ...insertUser,
      role: insertUser.role || "Standard"
    }).returning();
    return results[0];
  }
}