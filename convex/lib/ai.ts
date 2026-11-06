import { createOpenAI } from "@ai-sdk/openai"
import { embed, embedMany } from "ai"

// One provider instance, configured from the Convex deployment env
export const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

// gpt-4o: tool calling + vision (VIN discs, part photos)
export const chatModel = () => openai.chat("gpt-4o")
export const visionModel = () => openai.chat("gpt-4o")
export const embeddingModel = () => openai.embedding("text-embedding-3-small")
export const transcriptionModel = () => openai.transcription("gpt-4o-mini-transcribe")

export async function embedText(text: string) {
  const { embedding } = await embed({ model: embeddingModel(), value: text })
  return embedding
}

export async function embedTexts(values: string[]) {
  if (values.length === 0) return []
  const { embeddings } = await embedMany({ model: embeddingModel(), values })
  return embeddings
}
