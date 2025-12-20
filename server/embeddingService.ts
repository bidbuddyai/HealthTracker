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
  entityType: "ActivityCluster" | "WbsSection" | "CriticalPath" | "CalendarBlock" | "TiaScenario" | "MeetingNotes" | "Relationship" | "LogicPath" | "WbsPhase";
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
    const NEAR_CRITICAL_FLOAT_THRESHOLD = 5;

    const relsByActivity = new Map<string, { preds: string[], succs: string[] }>();
    const activityById = new Map<string, Activity>();
    
    for (const act of activities) {
      activityById.set(act.id, act);
      if (!relsByActivity.has(act.id)) {
        relsByActivity.set(act.id, { preds: [], succs: [] });
      }
    }
    
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

    const getLeafWbs = (wbsId: string | null): Wbs | null => {
      if (!wbsId) return null;
      const wbs = wbsMap.get(wbsId);
      if (!wbs) return null;
      const hasChildren = Array.from(wbsMap.values()).some(w => w.parentId === wbsId);
      if (!hasChildren) return wbs;
      return wbs;
    };

    const wbsParentGroups = new Map<string, Activity[]>();
    for (const activity of activities) {
      const lowestWbs = getLeafWbs(activity.wbsId);
      const groupKey = lowestWbs?.id || "no-wbs";
      if (!wbsParentGroups.has(groupKey)) {
        wbsParentGroups.set(groupKey, []);
      }
      wbsParentGroups.get(groupKey)!.push(activity);
    }

    const formatActivityForChunk = (act: Activity, rels: { preds: string[], succs: string[] }): string => {
      let text = `\n• ${act.activityId}: ${act.name}`;
      text += `\n  Duration: ${act.originalDuration || 0}d | Status: ${act.status} | Progress: ${act.percentComplete || 0}%`;
      if (act.earlyStart) text += `\n  ES: ${act.earlyStart}`;
      if (act.earlyFinish) text += ` → EF: ${act.earlyFinish}`;
      if (act.isCritical) text += ` | ** CRITICAL **`;
      if (act.totalFloat !== null && act.totalFloat !== undefined) {
        text += `\n  Total Float: ${act.totalFloat}d`;
        if (act.totalFloat < NEAR_CRITICAL_FLOAT_THRESHOLD && !act.isCritical) {
          text += ` (NEAR-CRITICAL)`;
        }
      }
      if (rels.preds.length > 0) {
        const predNames = rels.preds.map(id => activityById.get(id)?.activityId || id).slice(0, 5);
        text += `\n  ← Predecessors: ${predNames.join(", ")}${rels.preds.length > 5 ? ` (+${rels.preds.length - 5} more)` : ""}`;
      }
      if (rels.succs.length > 0) {
        const succNames = rels.succs.map(id => activityById.get(id)?.activityId || id).slice(0, 5);
        text += `\n  → Successors: ${succNames.join(", ")}${rels.succs.length > 5 ? ` (+${rels.succs.length - 5} more)` : ""}`;
      }
      return text;
    };

    for (const [wbsId, wbsActivities] of Array.from(wbsParentGroups.entries())) {
      const wbs = wbsMap.get(wbsId);
      const sortedActivities = [...wbsActivities].sort((a, b) => {
        if (!a.earlyStart || !b.earlyStart) return 0;
        return a.earlyStart.localeCompare(b.earlyStart);
      });
      
      const headerText = wbs 
        ? `[WBS Phase: ${wbs.code} - ${wbs.name}]\nLevel: ${wbs.level}\n\n`
        : "[Activities without WBS]\n\n";
      
      let currentChunkActivities: Activity[] = [];
      let currentChunkText = headerText + `Activities in this phase:\n`;
      let partNumber = 1;

      const flushChunk = () => {
        if (currentChunkActivities.length === 0) return;
        
        const activityIds = currentChunkActivities.map(a => a.id);
        const criticalCount = currentChunkActivities.filter(a => a.isCritical).length;
        const nearCriticalCount = currentChunkActivities.filter(a => 
          !a.isCritical && a.totalFloat !== null && a.totalFloat < NEAR_CRITICAL_FLOAT_THRESHOLD
        ).length;
        
        chunks.push({
          entityType: "WbsPhase",
          entityId: wbsId !== "no-wbs" ? `${wbsId}-part${partNumber}` : undefined,
          chunkText: currentChunkText,
          metadata: {
            wbsId: wbsId !== "no-wbs" ? wbsId : null,
            wbsCode: wbs?.code,
            wbsName: wbs?.name,
            wbsLevel: wbs?.level,
            partNumber,
            totalParts: Math.ceil(sortedActivities.length / 15),
            activityIds,
            activityCount: currentChunkActivities.length,
            criticalCount,
            nearCriticalCount,
            dateRange: {
              earliest: currentChunkActivities.reduce((min, a) => 
                a.earlyStart && (!min || a.earlyStart < min) ? a.earlyStart : min, 
                null as string | null
              ),
              latest: currentChunkActivities.reduce((max, a) => 
                a.earlyFinish && (!max || a.earlyFinish > max) ? a.earlyFinish : max, 
                null as string | null
              )
            }
          },
          tokenCount: this.estimateTokens(currentChunkText)
        });
        
        partNumber++;
        currentChunkActivities = [];
        currentChunkText = headerText + `Activities in this phase (continued, part ${partNumber}):\n`;
      };

      for (const act of sortedActivities) {
        const rels = relsByActivity.get(act.id) || { preds: [], succs: [] };
        const activityText = formatActivityForChunk(act, rels);
        
        if (this.estimateTokens(currentChunkText + activityText) > MAX_CHUNK_TOKENS && currentChunkActivities.length > 0) {
          flushChunk();
        }
        
        currentChunkActivities.push(act);
        currentChunkText += activityText;
      }
      
      flushChunk();
    }

    const nearCriticalActivities = activities.filter(a => 
      a.totalFloat !== null && 
      a.totalFloat !== undefined && 
      a.totalFloat < NEAR_CRITICAL_FLOAT_THRESHOLD
    );

    if (nearCriticalActivities.length > 0) {
      const tracedPaths = new Set<string>();
      const logicPathChunks = this.buildLogicPathChunks(
        nearCriticalActivities, 
        activityById, 
        relsByActivity, 
        tracedPaths,
        NEAR_CRITICAL_FLOAT_THRESHOLD,
        relationships
      );
      chunks.push(...logicPathChunks);
    }

    return chunks;
  }

  private buildLogicPathChunks(
    seedActivities: Activity[],
    activityById: Map<string, Activity>,
    relsByActivity: Map<string, { preds: string[], succs: string[] }>,
    tracedPaths: Set<string>,
    floatThreshold: number,
    relationships: Relationship[]
  ): ChunkData[] {
    const chunks: ChunkData[] = [];

    const traceChain = (startId: string, direction: 'forward' | 'backward'): Activity[] => {
      const chain: Activity[] = [];
      const visited = new Set<string>();
      const queue = [startId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const activity = activityById.get(currentId);
        if (!activity) continue;

        if (activity.totalFloat === null || activity.totalFloat >= floatThreshold) {
          continue;
        }

        chain.push(activity);

        const rels = relsByActivity.get(currentId);
        if (rels) {
          const nextIds = direction === 'forward' ? rels.succs : rels.preds;
          for (const nextId of nextIds) {
            if (!visited.has(nextId)) {
              queue.push(nextId);
            }
          }
        }
      }

      return chain;
    };

    for (const seedActivity of seedActivities) {
      if (tracedPaths.has(seedActivity.id)) continue;

      const backwardChain = traceChain(seedActivity.id, 'backward');
      const forwardChain = traceChain(seedActivity.id, 'forward');

      const fullChain = [...new Set([...backwardChain.reverse(), ...forwardChain])];
      
      if (fullChain.length < 2) continue;

      const chainKey = fullChain.map(a => a.id).sort().join('-');
      if (tracedPaths.has(chainKey)) continue;
      tracedPaths.add(chainKey);

      fullChain.forEach(a => tracedPaths.add(a.id));

      const sortedChain = fullChain.sort((a, b) => {
        if (!a.earlyStart || !b.earlyStart) return 0;
        return a.earlyStart.localeCompare(b.earlyStart);
      });

      const isCritical = sortedChain.every(a => a.isCritical);
      const pathType = isCritical ? "Critical" : "Near-Critical";
      const avgFloat = sortedChain.reduce((sum, a) => sum + (a.totalFloat || 0), 0) / sortedChain.length;

      let chunkText = `[${pathType} Logic Path - ${sortedChain.length} Activities]\n`;
      chunkText += `Average Float: ${avgFloat.toFixed(1)} days\n`;
      chunkText += `Path Span: ${sortedChain[0]?.earlyStart || 'N/A'} → ${sortedChain[sortedChain.length - 1]?.earlyFinish || 'N/A'}\n\n`;
      chunkText += `Complete logical sequence:\n`;

      for (let i = 0; i < sortedChain.length; i++) {
        const act = sortedChain[i];
        const rels = relsByActivity.get(act.id) || { preds: [], succs: [] };
        
        chunkText += `\n${i + 1}. ${act.activityId}: ${act.name}`;
        chunkText += `\n   Duration: ${act.originalDuration || 0}d | Float: ${act.totalFloat}d`;
        if (act.earlyStart) chunkText += `\n   ${act.earlyStart} → ${act.earlyFinish}`;
        
        if (i < sortedChain.length - 1) {
          const nextAct = sortedChain[i + 1];
          const relType = relationships.find(r => 
            r.predecessorId === act.id && r.successorId === nextAct.id
          );
          chunkText += `\n   ↓ ${relType?.type || 'FS'}${relType?.lag ? ` +${relType.lag}d` : ''}`;
        }
      }

      chunks.push({
        entityType: "LogicPath",
        entityId: `path-${sortedChain[0]?.activityId}-to-${sortedChain[sortedChain.length - 1]?.activityId}`,
        chunkText,
        metadata: {
          pathType,
          isCritical,
          activityIds: sortedChain.map(a => a.id),
          activityCount: sortedChain.length,
          averageFloat: avgFloat,
          startActivity: sortedChain[0]?.activityId,
          endActivity: sortedChain[sortedChain.length - 1]?.activityId,
          dateRange: {
            start: sortedChain[0]?.earlyStart,
            end: sortedChain[sortedChain.length - 1]?.earlyFinish
          }
        },
        tokenCount: this.estimateTokens(chunkText)
      });
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
