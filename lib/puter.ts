/**
 * DeepSeek AI Engine wrapper
 * Puter JS has been removed and replaced with direct DeepSeek API integration.
 */
import { streamDeepSeekReply, type ChatMessage } from "./deepseek"

export type PuterChatMessage = ChatMessage

export const PUTER_SCRIPT_SRC = ""

export async function ensurePuterLoaded(): Promise<any> {
  return { ai: { chat: async () => "" } }
}

export async function streamPuterReply(
  messages: PuterChatMessage[],
  onProgress: (accumulatedText: string) => void,
  model = "deepseek-chat"
): Promise<string> {
  return streamDeepSeekReply(messages, onProgress, model)
}
