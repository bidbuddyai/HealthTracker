import { poe } from "./poeClient";

interface JsonRepairResult<T = unknown> {
  success: boolean;
  data: T | null;
  error?: string;
  repairMethod?: "direct" | "markdown_stripped" | "regex_extracted" | "ai_retry";
}

export function stripMarkdownCodeBlocks(text: string): string {
  let cleaned = text.trim();
  
  cleaned = cleaned.replace(/```json\s*/gi, "");
  cleaned = cleaned.replace(/```\s*/g, "");
  
  cleaned = cleaned.replace(/^Here\s+(is|are)\s+(the\s+)?JSON[:\s]*/i, "");
  cleaned = cleaned.replace(/^The\s+JSON\s+(response\s+)?is[:\s]*/i, "");
  cleaned = cleaned.replace(/^Response[:\s]*/i, "");
  
  return cleaned.trim();
}

export function extractJsonFromText(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }
  
  return null;
}

export function tryParseJson<T = unknown>(text: string): JsonRepairResult<T> {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data, repairMethod: "direct" };
  } catch {
    return { success: false, data: null, error: "Direct parse failed" };
  }
}

export function repairAndParseJson<T = unknown>(rawText: string): JsonRepairResult<T> {
  if (!rawText || typeof rawText !== "string") {
    return { success: false, data: null, error: "Input is empty or not a string" };
  }

  const directResult = tryParseJson<T>(rawText);
  if (directResult.success) {
    return directResult;
  }

  const strippedText = stripMarkdownCodeBlocks(rawText);
  const strippedResult = tryParseJson<T>(strippedText);
  if (strippedResult.success) {
    return { ...strippedResult, repairMethod: "markdown_stripped" };
  }

  const extractedJson = extractJsonFromText(strippedText);
  if (extractedJson) {
    const extractedResult = tryParseJson<T>(extractedJson);
    if (extractedResult.success) {
      return { ...extractedResult, repairMethod: "regex_extracted" };
    }
  }

  return { 
    success: false, 
    data: null, 
    error: `Failed to parse JSON after all repair attempts. Original text starts with: "${rawText.slice(0, 100)}..."` 
  };
}

export async function repairAndParseJsonWithRetry<T = unknown>(
  rawText: string,
  model: string = "Gemini-2.5-Pro",
  originalPrompt?: string
): Promise<JsonRepairResult<T>> {
  const initialResult = repairAndParseJson<T>(rawText);
  if (initialResult.success) {
    return initialResult;
  }

  console.log("[JSON Repair] Initial parsing failed, attempting AI retry...");

  const retryPrompt = `You returned invalid JSON that could not be parsed. The error was: ${initialResult.error}

Original response that failed to parse:
\`\`\`
${rawText.slice(0, 2000)}
\`\`\`

Please fix the JSON syntax and return ONLY valid JSON with no extra text, no markdown formatting, and no explanations. Just the raw JSON object.`;

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    
    if (originalPrompt) {
      messages.push({ role: "user", content: originalPrompt });
    }
    messages.push({ role: "assistant", content: rawText });
    messages.push({ role: "user", content: retryPrompt });

    const retryResponse = await poe.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 4000
    });

    const retryText = retryResponse.choices[0]?.message?.content || "";
    const retryResult = repairAndParseJson<T>(retryText);
    
    if (retryResult.success) {
      console.log("[JSON Repair] AI retry successful");
      return { ...retryResult, repairMethod: "ai_retry" };
    }

    return {
      success: false,
      data: null,
      error: `AI retry also failed to produce valid JSON. Last error: ${retryResult.error}`
    };
  } catch (retryError) {
    console.error("[JSON Repair] AI retry request failed:", retryError);
    return {
      success: false,
      data: null,
      error: `AI retry request failed: ${retryError instanceof Error ? retryError.message : "Unknown error"}`
    };
  }
}

export function safeJsonParse<T = unknown>(
  text: string,
  fallback: T
): T {
  const result = repairAndParseJson<T>(text);
  return result.success && result.data !== null ? result.data : fallback;
}
