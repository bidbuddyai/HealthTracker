import { embeddingService } from "./embeddingService";
import { poe } from "./poeClient";
import type { ScheduleEmbedding } from "@shared/schema";

interface RetrievalResult {
  chunks: Array<{ chunk: ScheduleEmbedding; distance: number }>;
  summary?: string;
  tokensSaved?: number;
}

interface EnrichedContext {
  originalContext: any;
  retrievedChunks: string[];
  chunkSummary?: string;
  embeddingsAvailable: boolean;
}

export class RAGService {
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
      return chunksText.slice(0, 2000);
    }
  };

  async retrieveRelevantContext(
    projectId: string,
    userQuery: string,
    options: {
      topK?: number;
      entityTypes?: string[];
      summarize?: boolean;
    } = {}
  ): Promise<RetrievalResult> {
    const { topK = 5, entityTypes, summarize = false } = options;

    if (!embeddingService.isConfigured()) {
      return { chunks: [], summary: undefined };
    }

    try {
      const chunks = await embeddingService.searchSimilar(
        projectId,
        userQuery,
        topK,
        entityTypes
      );

      let summary: string | undefined;
      if (summarize && chunks.length > 0) {
        const chunkTexts = chunks.map(c => c.chunk.chunkText);
        summary = await this.summarizeChunks(chunkTexts, userQuery);
      }

      return { chunks, summary };
    } catch (error) {
      console.error("[RAG] Error retrieving context:", error);
      return { chunks: [], summary: undefined };
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
        embeddingsAvailable: false
      };
    }

    const retrieval = await this.retrieveRelevantContext(projectId, userQuery, {
      topK: 5,
      summarize: true
    });

    const retrievedChunks = retrieval.chunks.map(c => c.chunk.chunkText);

    return {
      originalContext,
      retrievedChunks,
      chunkSummary: retrieval.summary,
      embeddingsAvailable: true
    };
  }

  formatContextForPrompt(enrichedContext: EnrichedContext): string {
    const { originalContext, retrievedChunks, chunkSummary, embeddingsAvailable } = enrichedContext;

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

    if (embeddingsAvailable && chunkSummary) {
      contextStr += `Relevant Schedule Context (from semantic search):\n${chunkSummary}\n\n`;
    } else if (retrievedChunks.length > 0) {
      contextStr += `Relevant Schedule Details:\n${retrievedChunks.slice(0, 3).join("\n\n")}\n\n`;
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
