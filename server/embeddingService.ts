import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";
import type { 
  Activity, 
  Wbs, 
  Calendar, 
  Relationship,
  TiaScenario,
  ScheduleEmbedding 
} from "@shared/schema";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_TOKENS = 750;

interface ChunkData {
  entityType: "ActivityCluster" | "WbsSection" | "CriticalPath" | "CalendarBlock" | "TiaScenario" | "MeetingNotes" | "Relationship";
  entityId?: string;
  chunkText: string;
  chunkSummary?: string;
  metadata: Record<string, unknown>;
  tokenCount: number;
}

interface EmbeddingResult extends ChunkData {
  embedding: number[];
}

export class EmbeddingService {
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.openai !== null;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error("OpenAI API key not configured. Please add OPENAI_API_KEY to secrets.");
    }

    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data.map(d => d.embedding);
  }

  chunkActivities(activities: Activity[], relationships: Relationship[], wbsMap: Map<string, Wbs>): ChunkData[] {
    const chunks: ChunkData[] = [];
    const CLUSTER_SIZE = 12;

    const wbsGroups = new Map<string, Activity[]>();
    for (const activity of activities) {
      const wbsId = activity.wbsId || "no-wbs";
      if (!wbsGroups.has(wbsId)) {
        wbsGroups.set(wbsId, []);
      }
      wbsGroups.get(wbsId)!.push(activity);
    }

    for (const [wbsId, wbsActivities] of Array.from(wbsGroups.entries())) {
      for (let i = 0; i < wbsActivities.length; i += CLUSTER_SIZE) {
        const cluster = wbsActivities.slice(i, i + CLUSTER_SIZE);
        const wbs = wbsMap.get(wbsId);
        
        const relsByActivity = new Map<string, { preds: string[], succs: string[] }>();
        for (const rel of relationships) {
          const predId = rel.predecessorId;
          const succId = rel.successorId;
          if (!relsByActivity.has(predId)) {
            relsByActivity.set(predId, { preds: [], succs: [] });
          }
          if (!relsByActivity.has(succId)) {
            relsByActivity.set(succId, { preds: [], succs: [] });
          }
          relsByActivity.get(predId)!.succs.push(succId);
          relsByActivity.get(succId)!.preds.push(predId);
        }

        let chunkText = wbs 
          ? `WBS: ${wbs.code} - ${wbs.name} (Level ${wbs.level})\n\n`
          : "Activities without WBS:\n\n";
        
        chunkText += `Activities in this cluster:\n`;
        
        for (const act of cluster) {
          const rels = relsByActivity.get(act.id) || { preds: [], succs: [] };
          chunkText += `\n- ${act.activityId}: ${act.name}`;
          chunkText += `\n  Type: ${act.type}, Duration: ${act.originalDuration || 0} days`;
          chunkText += `\n  Status: ${act.status}, Progress: ${act.percentComplete || 0}%`;
          if (act.earlyStart) chunkText += `\n  Early Start: ${act.earlyStart}`;
          if (act.earlyFinish) chunkText += `, Early Finish: ${act.earlyFinish}`;
          if (act.isCritical) chunkText += `\n  ** CRITICAL PATH **`;
          if (act.totalFloat !== null && act.totalFloat !== undefined) {
            chunkText += `\n  Total Float: ${act.totalFloat} days`;
          }
          if (rels.preds.length > 0) {
            chunkText += `\n  Predecessors: ${rels.preds.slice(0, 3).join(", ")}${rels.preds.length > 3 ? "..." : ""}`;
          }
          if (rels.succs.length > 0) {
            chunkText += `\n  Successors: ${rels.succs.slice(0, 3).join(", ")}${rels.succs.length > 3 ? "..." : ""}`;
          }
        }

        const activityIds = cluster.map(a => a.id);
        const criticalCount = cluster.filter(a => a.isCritical).length;
        
        chunks.push({
          entityType: "ActivityCluster",
          entityId: wbsId !== "no-wbs" ? wbsId : undefined,
          chunkText,
          metadata: {
            wbsId: wbsId !== "no-wbs" ? wbsId : null,
            wbsCode: wbs?.code,
            activityIds,
            activityCount: cluster.length,
            criticalCount,
            dateRange: {
              earliest: cluster.reduce((min, a) => 
                a.earlyStart && (!min || a.earlyStart < min) ? a.earlyStart : min, 
                null as string | null
              ),
              latest: cluster.reduce((max, a) => 
                a.earlyFinish && (!max || a.earlyFinish > max) ? a.earlyFinish : max, 
                null as string | null
              )
            }
          },
          tokenCount: this.estimateTokens(chunkText)
        });
      }
    }

    return chunks;
  }

  chunkWbs(wbsItems: Wbs[], activities: Activity[]): ChunkData[] {
    const chunks: ChunkData[] = [];
    
    const activityCounts = new Map<string, number>();
    for (const act of activities) {
      if (act.wbsId) {
        activityCounts.set(act.wbsId, (activityCounts.get(act.wbsId) || 0) + 1);
      }
    }

    for (const wbs of wbsItems) {
      const actCount = activityCounts.get(wbs.id) || 0;
      const childWbs = wbsItems.filter(w => w.parentId === wbs.id);
      
      let chunkText = `WBS Element: ${wbs.code} - ${wbs.name}\n`;
      chunkText += `Level: ${wbs.level}, Sequence: ${wbs.sequenceNumber}\n`;
      chunkText += `Direct Activities: ${actCount}\n`;
      
      if (childWbs.length > 0) {
        chunkText += `Child WBS elements: ${childWbs.map(c => `${c.code} (${c.name})`).join(", ")}\n`;
      }

      chunks.push({
        entityType: "WbsSection",
        entityId: wbs.id,
        chunkText,
        metadata: {
          wbsId: wbs.id,
          wbsCode: wbs.code,
          level: wbs.level,
          activityCount: actCount,
          childCount: childWbs.length
        },
        tokenCount: this.estimateTokens(chunkText)
      });
    }

    return chunks;
  }

  chunkCriticalPath(activities: Activity[], relationships: Relationship[]): ChunkData[] {
    const criticalActivities = activities.filter(a => a.isCritical);
    if (criticalActivities.length === 0) return [];

    const chunks: ChunkData[] = [];
    const SEGMENT_SIZE = 8;

    const sorted = [...criticalActivities].sort((a, b) => {
      if (!a.earlyStart || !b.earlyStart) return 0;
      return a.earlyStart.localeCompare(b.earlyStart);
    });

    for (let i = 0; i < sorted.length; i += SEGMENT_SIZE) {
      const segment = sorted.slice(i, i + SEGMENT_SIZE);
      
      let chunkText = `Critical Path Segment ${Math.floor(i / SEGMENT_SIZE) + 1}:\n\n`;
      
      for (const act of segment) {
        chunkText += `- ${act.activityId}: ${act.name}\n`;
        chunkText += `  Duration: ${act.originalDuration || 0} days`;
        if (act.earlyStart) chunkText += `, Start: ${act.earlyStart}`;
        if (act.earlyFinish) chunkText += `, Finish: ${act.earlyFinish}`;
        chunkText += `\n  Total Float: ${act.totalFloat ?? 0} days\n`;
      }

      chunks.push({
        entityType: "CriticalPath",
        entityId: `critical-segment-${i}`,
        chunkText,
        metadata: {
          segmentIndex: Math.floor(i / SEGMENT_SIZE),
          activityIds: segment.map(a => a.id),
          activityCount: segment.length
        },
        tokenCount: this.estimateTokens(chunkText)
      });
    }

    return chunks;
  }

  chunkCalendars(calendars: Calendar[]): ChunkData[] {
    return calendars.map(cal => {
      let chunkText = `Calendar: ${cal.name}\n`;
      chunkText += `Type: ${cal.type}`;
      if (cal.isDefault) chunkText += ` (Default)`;
      chunkText += `\n`;
      if (cal.workHoursPerDay) {
        chunkText += `Work hours/day: ${cal.workHoursPerDay}\n`;
      }
      if (cal.workDaysPerWeek) {
        chunkText += `Work days/week: ${cal.workDaysPerWeek}\n`;
      }
      if (cal.description) {
        chunkText += `Description: ${cal.description}\n`;
      }

      return {
        entityType: "CalendarBlock" as const,
        entityId: cal.id,
        chunkText,
        metadata: {
          calendarId: cal.id,
          calendarType: cal.type,
          isDefault: cal.isDefault
        },
        tokenCount: this.estimateTokens(chunkText)
      };
    });
  }

  chunkTiaScenarios(scenarios: TiaScenario[]): ChunkData[] {
    return scenarios.map(scenario => {
      let chunkText = `TIA Scenario: ${scenario.name}\n`;
      chunkText += `Analysis Method: ${scenario.analysisMethod}\n`;
      chunkText += `Impact Type: ${scenario.impactType || "Not specified"}\n`;
      chunkText += `Data Date: ${scenario.dataDate}\n`;
      chunkText += `Active: ${scenario.isActive ? "Yes" : "No"}\n`;
      if (scenario.description) {
        chunkText += `Description: ${scenario.description}\n`;
      }

      return {
        entityType: "TiaScenario" as const,
        entityId: scenario.id,
        chunkText,
        metadata: {
          scenarioId: scenario.id,
          analysisMethod: scenario.analysisMethod,
          impactType: scenario.impactType,
          isActive: scenario.isActive
        },
        tokenCount: this.estimateTokens(chunkText)
      };
    });
  }

  async storeEmbeddings(projectId: string, chunks: ChunkData[]): Promise<number> {
    if (chunks.length === 0) return 0;

    const texts = chunks.map(c => c.chunkText);
    const embeddings = await this.generateEmbeddings(texts);

    await db.execute(sql`
      DELETE FROM schedule_embeddings WHERE project_id = ${projectId}
    `);

    let stored = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(",")}]`;

      await db.execute(sql`
        INSERT INTO schedule_embeddings (
          project_id, entity_type, entity_id, chunk_ordinal,
          chunk_text, chunk_summary, metadata, token_count, embedding
        ) VALUES (
          ${projectId},
          ${chunk.entityType}::embedding_entity_type,
          ${chunk.entityId || null},
          ${i},
          ${chunk.chunkText},
          ${chunk.chunkSummary || null},
          ${JSON.stringify(chunk.metadata)},
          ${chunk.tokenCount},
          ${embeddingStr}::vector
        )
      `);
      stored++;
    }

    return stored;
  }

  async searchSimilar(
    projectId: string, 
    queryText: string, 
    topK: number = 5,
    entityTypes?: string[]
  ): Promise<Array<{ chunk: ScheduleEmbedding; distance: number }>> {
    const queryEmbedding = await this.generateEmbedding(queryText);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    let typeFilter = "";
    if (entityTypes && entityTypes.length > 0) {
      const types = entityTypes.map(t => `'${t}'`).join(",");
      typeFilter = `AND entity_type IN (${types})`;
    }

    const result = await db.execute(sql.raw(`
      SELECT 
        id, project_id, entity_type, entity_id, chunk_ordinal,
        chunk_text, chunk_summary, metadata, token_count,
        created_at, updated_at,
        embedding <=> '${embeddingStr}'::vector AS distance
      FROM schedule_embeddings 
      WHERE project_id = '${projectId}' ${typeFilter}
      ORDER BY embedding <=> '${embeddingStr}'::vector
      LIMIT ${topK}
    `));

    return (result.rows as any[]).map(row => ({
      chunk: {
        id: row.id,
        projectId: row.project_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        chunkOrdinal: row.chunk_ordinal,
        chunkText: row.chunk_text,
        chunkSummary: row.chunk_summary,
        metadata: row.metadata,
        tokenCount: row.token_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      distance: parseFloat(row.distance)
    }));
  }

  async getProjectChunkCount(projectId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM schedule_embeddings WHERE project_id = ${projectId}
    `);
    return parseInt((result.rows[0] as any)?.count || "0");
  }

  async deleteProjectEmbeddings(projectId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM schedule_embeddings WHERE project_id = ${projectId}
    `);
  }
}

export const embeddingService = new EmbeddingService();
