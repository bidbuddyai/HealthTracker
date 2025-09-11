import OpenAI from "openai";

export const poe = new OpenAI({
  apiKey: process.env.POE_API_KEY || process.env.OPENAI_API_KEY || "dummy-key",
  baseURL: "https://api.poe.com/v1",
  timeout: 300000, // 5 minutes timeout for complex document processing with AI models
});

export async function streamLLM(messages: {role:"system"|"user"|"assistant"; content:string}[], model="Claude-Sonnet-4") {
  const stream = await poe.chat.completions.create({ model, messages, stream: true });
  const chunks: string[] = [];
  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content ?? "";
    if (delta) chunks.push(delta);
  }
  return chunks.join("");
}
