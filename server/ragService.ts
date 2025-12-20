import { embeddingService } from "./embeddingService";
import { poe } from "./poeClient";
import type { ScheduleEmbedding } from "@shared/schema";

const SUMMARIZATION_TOKEN_THRESHOLD = 20000;

interface ChunkWithDistance {
  chunk: ScheduleEmbedding;
  distance: number;
}

interface RetrievalResult {
  chunks: ChunkWithDistance[];
  summary?: string;
  totalTokens: number;
  wasSummarized: boolean;
}

interface EnrichedContext {
  originalContext: any;
  retrievedChunks: ChunkWithDistance[];
  chunkSummary?: string;
  embeddingsAvailable: boolean;
  totalTokens: number;
  wasSummarized: boolean;
}

export class RAGService {
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private summarizeChunks = async (chunks: string[], query: string): Promise<string> => {
    if (chunks.length === 0) return "";
    
    const chunksText = chunks.join("\n\n---\n\n");
    
    const messages = [
      {
        role: "system" as const,
        content: `You are a schedule data summarizer. Given retrieved schedule context chunks, create a concise summary focused on answering the user's query. Keep the summary under 500 tokens. Preserve key dates, durations, and relationships.`
      },
      {
        role: "user" as const,
        content: `User Query: ${query}\n\nRetrieved Schedule Context:\n${chunksText}\n\nProvide a focused summary of the relevant information:`
      }
    ];

    try {
      const response = await poe.chat.completions.create({
        model: "Claude-3-Haiku",
        messages,
        stream: false
      });
      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("[RAG] Failed to summarize chunks:", error);
      return chunksText.slice(0, 8000);
    }
  };

  private formatChunksForPrompt(chunks: ChunkWithDistance[]): string {
    if (chunks.length === 0) return "";

    const formattedChunks: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const { chunk, distance } = chunks[i];
      const relevanceScore = Math.round((1 - distance) * 100);
      
      let chunkHeader = `[${chunk.entityType}]`;
      if (chunk.entityId) {
        chunkHeader += ` (${chunk.entityId})`;
      }
      chunkHeader += ` - Relevance: ${relevanceScore}%`;
      
      formattedChunks.push(`--- Chunk ${i + 1} ${chunkHeader} ---\n${chunk.chunkText}`);
    }

    return formattedChunks.join("\n\n");
  }

  async retrieveRelevantContext(
    projectId: string,
    userQuery: string,
    options: {
      topK?: number;
      entityTypes?: string[];
      forceSummarize?: boolean;
    } = {}
  ): Promise<RetrievalResult> {
    const { topK = 8, entityTypes, forceSummarize = false } = options;

    if (!embeddingService.isConfigured()) {
      return { chunks: [], summary: undefined, totalTokens: 0, wasSummarized: false };
    }

    try {
      const chunks = await embeddingService.searchSimilar(
        projectId,
        userQuery,
        topK,
        entityTypes
      );

      const totalTokens = chunks.reduce((sum, c) => {
        const tokenCount = c.chunk.tokenCount || this.estimateTokens(c.chunk.chunkText);
        if (!c.chunk.tokenCount) {
          console.log(`[RAG] Estimated tokens for chunk: ${tokenCount}`);
        }
        return sum + tokenCount;
      }, 0);
      
      let summary: string | undefined;
      let wasSummarized = false;

      if (forceSummarize || totalTokens > SUMMARIZATION_TOKEN_THRESHOLD) {
        console.log(`[RAG] Token count ${totalTokens} exceeds threshold ${SUMMARIZATION_TOKEN_THRESHOLD}, summarizing...`);
        const chunkTexts = chunks.map(c => c.chunk.chunkText);
        summary = await this.summarizeChunks(chunkTexts, userQuery);
        wasSummarized = true;
      } else {
        console.log(`[RAG] Retrieved ${chunks.length} chunks, ${totalTokens} tokens (below ${SUMMARIZATION_TOKEN_THRESHOLD} threshold, skipping summarization)`);
      }

      return { chunks, summary, totalTokens, wasSummarized };
    } catch (error) {
      console.error("[RAG] Error retrieving context:", error);
      return { chunks: [], summary: undefined, totalTokens: 0, wasSummarized: false };
    }
  }

  async enrichContext(
    projectId: string,
    userQuery: string,
    originalContext: any
  ): Promise<EnrichedContext> {
    const chunkCount = await embeddingService.getProjectChunkCount(projectId);
    
    if (chunkCount === 0 || !embeddingService.isConfigured()) {
      return {
        originalContext,
        retrievedChunks: [],
        embeddingsAvailable: false,
        totalTokens: 0,
        wasSummarized: false
      };
    }

    const retrieval = await this.retrieveRelevantContext(projectId, userQuery, {
      topK: 8,
      forceSummarize: false
    });

    return {
      originalContext,
      retrievedChunks: retrieval.chunks,
      chunkSummary: retrieval.wasSummarized ? retrieval.summary : undefined,
      embeddingsAvailable: true,
      totalTokens: retrieval.totalTokens,
      wasSummarized: retrieval.wasSummarized
    };
  }

  formatContextForPrompt(enrichedContext: EnrichedContext): string {
    const { originalContext, retrievedChunks, chunkSummary, embeddingsAvailable, wasSummarized, totalTokens } = enrichedContext;

    let contextStr = "";

    if (originalContext) {
      if (typeof originalContext === 'string') {
        contextStr += `Base Context:\n${originalContext}\n\n`;
      } else {
        const contextSummary = {
          projectName: originalContext.project?.name,
          activityCount: originalContext.activities?.length,
          wbsCount: originalContext.wbs?.length,
          calendarCount: originalContext.calendars?.length
        };
        contextStr += `Project Overview:\n${JSON.stringify(contextSummary, null, 2)}\n\n`;
      }
    }

    if (embeddingsAvailable) {
      if (wasSummarized && chunkSummary) {
        contextStr += `Relevant Schedule Context (summarized from ${totalTokens} tokens):\n${chunkSummary}\n\n`;
      } else if (retrievedChunks.length > 0) {
        contextStr += `Relevant Schedule Details (${retrievedChunks.length} chunks, ~${totalTokens} tokens):\n\n`;
        contextStr += this.formatChunksForPrompt(retrievedChunks);
        contextStr += "\n\n";
      }
    }

    return contextStr;
  }

  async getEmbeddingStats(projectId: string): Promise<{
    chunkCount: number;
    isConfigured: boolean;
  }> {
    return {
      chunkCount: await embeddingService.getProjectChunkCount(projectId),
      isConfigured: embeddingService.isConfigured()
    };
  }
}

export const ragService = new RAGService();
