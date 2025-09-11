import OpenAI from "openai";

export const poe = new OpenAI({
  apiKey: process.env.POE_API_KEY || process.env.OPENAI_API_KEY || "dummy-key",
  baseURL: "https://api.poe.com/v1",
  timeout: 300000, // 300 seconds (5 minutes) timeout for OpenAI client
});

// Function to filter out "thinking..." patterns from AI responses
function filterThinkingPatterns(content: string): string {
  // Remove various "thinking..." patterns that AI models might return
  const thinkingPatterns = [
    /thinking\.{3,}/gi,
    /let me think\.{0,3}/gi,
    /i'm thinking\.{0,3}/gi,
    /i am thinking\.{0,3}/gi,
    /hmm\.{3,}/gi,
    /\.{3,}thinking\.{0,3}/gi,
    /one moment\.{0,3}/gi,
    /analyzing\.{3,}/gi,
    /processing\.{3,}/gi,
  ];
  
  let filtered = content;
  thinkingPatterns.forEach(pattern => {
    filtered = filtered.replace(pattern, '');
  });
  
  // Clean up any resulting double spaces or line breaks
  filtered = filtered.replace(/\s+/g, ' ').trim();
  
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
  
  // Filter out thinking patterns before returning
  return filterThinkingPatterns(rawResponse);
}
