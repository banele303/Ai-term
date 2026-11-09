import { createOpenAI } from "@ai-sdk/openai"
import { embed, embedMany } from "ai"

// DeepSeek is fully compatible with the OpenAI API format at https://api.deepseek.com
const deepseekApiKey =
  process.env.DEEPSEEK_API_KEY || "sk-5d855e080e0b4a8c870a4f9620d579b6"

export const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: deepseekApiKey,
})

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || deepseekApiKey,
})

// Primary chat model: DeepSeek V3 (deepseek-chat)
export const chatModel = () => {
  if (process.env.DEEPSEEK_API_KEY || !process.env.OPENAI_API_KEY) {
    return deepseek("deepseek-chat")
  }
  return openai.chat("gpt-4o")
}

// Vision model: GPT-4o if OpenAI key provided, else DeepSeek-chat
export const visionModel = () => {
  if (process.env.OPENAI_API_KEY) {
    return openai.chat("gpt-4o")
  }
  return deepseek("deepseek-chat")
}

export const embeddingModel = () => openai.embedding("text-embedding-3-small")
export const transcriptionModel = () => openai.transcription("gpt-4o-mini-transcribe")

// Deterministic 1536-dimensional unit vector generator for fallback when embedding provider is offline
function pseudoEmbedding(text: string, dimensions = 1536): number[] {
  const vec = new Float64Array(dimensions)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
    const idx = Math.abs((h + i * 31) % dimensions)
    vec[idx] += 1.0
  }
  // Normalize vector
  let norm = 0
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i]
  }
  norm = Math.sqrt(norm) || 1
  return Array.from(vec, (v) => v / norm)
}

export async function embedText(text: string) {
  if (!process.env.OPENAI_API_KEY) {
    return pseudoEmbedding(text)
  }
  try {
    const { embedding } = await embed({ model: embeddingModel(), value: text })
    return embedding
  } catch (err) {
    console.warn("Embedding error, using fallback pseudo-embedding:", err)
    return pseudoEmbedding(text)
  }
}

export async function embedTexts(values: string[]) {
  if (values.length === 0) return []
  if (!process.env.OPENAI_API_KEY) {
    return values.map((v) => pseudoEmbedding(v))
  }
  try {
    const { embeddings } = await embedMany({ model: embeddingModel(), values })
    return embeddings
  } catch (err) {
    console.warn("Embeddings error, using fallback pseudo-embeddings:", err)
    return values.map((v) => pseudoEmbedding(v))
  }
}
