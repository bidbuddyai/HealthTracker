import OpenAI from "openai";

export const poe = new OpenAI({
  apiKey: process.env.POE_API_KEY || process.env.OPENAI_API_KEY || "dummy-key",
  baseURL: "https://api.poe.com/v1",
  timeout: 300000, // 300 seconds (5 minutes) timeout for OpenAI client
});

// Available models from Poe's OpenAI-compatible API
export const POE_MODELS = [
  // GPT Models
  { value: "gpt-5-pro", label: "GPT-5 Pro", category: "GPT", reasoning: false },
  { value: "GPT-5", label: "GPT-5 (Latest Flagship)", category: "GPT", reasoning: false },
  { value: "GPT-5-mini", label: "GPT-5 Mini", category: "GPT", reasoning: false },
  { value: "GPT-4o", label: "GPT-4o", category: "GPT", reasoning: false },
  { value: "GPT-4.1", label: "GPT-4.1", category: "GPT", reasoning: false },
  
  // Claude Models
  { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", category: "Claude", reasoning: true },
  { value: "claude-haiku-4.5", label: "Claude Haiku 4.5", category: "Claude", reasoning: false },
  { value: "Claude-Opus-4.1", label: "Claude Opus 4.1", category: "Claude", reasoning: false },
  { value: "Claude-Sonnet-4", label: "Claude Sonnet 4 (30k thinking)", category: "Claude", reasoning: true },
  { value: "Claude-3.5-Sonnet", label: "Claude 3.5 Sonnet", category: "Claude", reasoning: false },
  
  // Google Models
  { value: "Gemini-2.5-Pro", label: "Gemini 2.5 Pro (1M context)", category: "Google", reasoning: false },
  { value: "Gemini-2.0-Flash", label: "Gemini 2.0 Flash", category: "Google", reasoning: false },
  
  // Reasoning Models
  { value: "o3-pro", label: "o3 Pro (Reasoning)", category: "Reasoning", reasoning: true },
  { value: "DeepSeek-R1-T", label: "DeepSeek R1-T (Reasoning)", category: "Reasoning", reasoning: true },
  { value: "DeepSeek-V3-FW", label: "DeepSeek V3-FW", category: "Reasoning", reasoning: true },
  { value: "Llama-4-Scout-T", label: "Llama 4 Scout-T (Reasoning)", category: "Reasoning", reasoning: true },
  
  // Other Leading Models
  { value: "Grok-4", label: "Grok 4 (xAI)", category: "Other", reasoning: false },
  { value: "GLM-4.5", label: "GLM 4.5", category: "Other", reasoning: false },
  { value: "Kimi-K2", label: "Kimi K2", category: "Other", reasoning: false },
  { value: "Qwen-3-235B-T", label: "Qwen 3 235B-T", category: "Other", reasoning: false },
  { value: "Mistral-Small-3", label: "Mistral Small 3", category: "Other", reasoning: false },
  { value: "Llama-4-Maverick", label: "Llama 4 Maverick", category: "Other", reasoning: false },
];

// Helper function to get model configuration
export function getModelConfig(modelValue: string) {
  return POE_MODELS.find(model => model.value === modelValue) || POE_MODELS[0];
}

// Enhanced function to parse reasoning model responses
function parseReasoningResponse(content: string, isReasoningModel: boolean = false): { finalAnswer: string; reasoning?: string } {
  if (!isReasoningModel) {
    return { finalAnswer: filterBasicPatterns(content) };
  }

  // Handle structured thinking blocks (e.g., <thinking>...</thinking>)
  const thinkingBlockMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>([\s\S]*)/i);
  if (thinkingBlockMatch) {
    const reasoning = thinkingBlockMatch[1].trim();
    const finalAnswer = thinkingBlockMatch[2].trim();
    return { 
      reasoning: reasoning.length > 0 ? reasoning : undefined,
      finalAnswer: finalAnswer || content
    };
  }

  // Handle reasoning models that output structured thinking
  const reasoningPatterns = [
    // Look for common reasoning indicators
    /^(.*?(?:reasoning|analysis|thought process):?)([\s\S]*?)(?:(?:final answer|conclusion|result):?|$)([\s\S]*)$/i,
    /^([\s\S]*?)(?:therefore|thus|in conclusion|final answer:)([\s\S]*)$/i
  ];

  for (const pattern of reasoningPatterns) {
    const match = content.match(pattern);
    if (match && match[2] && match[2].trim().length > 20) {
      return {
        reasoning: match[2].trim(),
        finalAnswer: match[3]?.trim() || match[1]?.trim() || content
      };
    }
  }

  // If no structured reasoning found, return the whole response as final answer
  return { finalAnswer: filterBasicPatterns(content) };
}

// Function to filter only basic filler patterns (preserve meaningful thinking)
function filterBasicPatterns(content: string): string {
  // Only remove truly meaningless filler patterns
  const fillerPatterns = [
    /^\s*\.{3,}\s*/g,  // Leading dots
    /\s*\.{3,}\s*$/g,  // Trailing dots
    /\s*hmm+\.{0,3}\s*/gi,  // Hmm patterns
    /\s*uh+m*\.{0,3}\s*/gi,  // Uhm patterns
    /\s*one moment\.{0,3}\s*/gi,  // "One moment" phrases
  ];
  
  let filtered = content;
  fillerPatterns.forEach(pattern => {
    filtered = filtered.replace(pattern, ' ');
  });
  
  // Clean up multiple spaces but preserve line breaks for readability
  filtered = filtered.replace(/ +/g, ' ').trim();
  
  return filtered;
}

export async function streamLLM(messages: {role:"system"|"user"|"assistant"; content:string}[], model="Claude-Sonnet-4") {
  const stream = await poe.chat.completions.create({ model, messages, stream: true });
  const chunks: string[] = [];
  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content ?? "";
    if (delta) chunks.push(delta);
  }
  const rawResponse = chunks.join("");
  
  // Get model configuration to determine if this is a reasoning model
  const modelConfig = getModelConfig(model);
  
  // Parse response based on model type
  const parsed = parseReasoningResponse(rawResponse, modelConfig.reasoning);
  
  // Return the final answer (reasoning is preserved in the parsed object)
  return parsed.finalAnswer;
}

// Enhanced function that returns both reasoning and final answer
export async function streamLLMWithReasoning(messages: {role:"system"|"user"|"assistant"; content:string}[], model="Claude-Sonnet-4") {
  const stream = await poe.chat.completions.create({ model, messages, stream: true });
  const chunks: string[] = [];
  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content ?? "";
    if (delta) chunks.push(delta);
  }
  const rawResponse = chunks.join("");
  
  // Get model configuration to determine if this is a reasoning model
  const modelConfig = getModelConfig(model);
  
  // Parse response based on model type
  return parseReasoningResponse(rawResponse, modelConfig.reasoning);
}

// Non-streaming version for better control
export async function queryLLM(messages: {role:"system"|"user"|"assistant"; content:string}[], model="Claude-Sonnet-4", preserveReasoning = false) {
  const response = await poe.chat.completions.create({ model, messages, stream: false });
  const rawResponse = response.choices[0]?.message?.content || "";
  
  // Get model configuration to determine if this is a reasoning model
  const modelConfig = getModelConfig(model);
  
  // Parse response based on model type
  const parsed = parseReasoningResponse(rawResponse, modelConfig.reasoning);
  
  // Return full parsed response if reasoning is requested, otherwise just final answer
  return preserveReasoning ? parsed : parsed.finalAnswer;
}
