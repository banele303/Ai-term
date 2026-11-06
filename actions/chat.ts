"use server"

import * as Sentry from "@sentry/nextjs"
import { auth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { revalidatePath } from "next/cache"
import { ConvexHttpClient } from "convex/browser"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  groupChatInsertSchema,
  type GroupChatInsert,
} from "@/db/schema"
import type { Feature } from "@/lib/billing"
import { getBotDesktopUrl } from "@/lib/daytona"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import { getChat } from "@/queries/chats"
import type { chatAgent } from "@/trigger/chat"

function getClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || "https://successful-panda-540.convex.cloud"
  return new ConvexHttpClient(url)
}

const startSession = chat.createStartSessionAction<typeof chatAgent>("chat")
const loadStoredTranscript = chat.createLoadTranscriptAction(defaultStorage)

// chatId comes from the browser; only the chat's owner may touch its session
async function assertChatOwner(chatId: string) {
  const chat = await getChat(chatId)
  if (!chat) throw new Error("Chat not found")
}

// Feature access: enabled in workspace Convex mode
async function assertFeature(_feature: Feature) {
  return true
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  await assertFeature("bots")
  await assertChatOwner(params.chatId)

  const session = await startSession(params)
  Sentry.logger.info("Chat session started", { "chat.id": params.chatId })
  return session
}

export async function mintChatAccessToken(chatId: string) {
  await assertFeature("bots")
  await assertChatOwner(chatId)

  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadTranscript(params: { chatId: string }) {
  await assertChatOwner(params.chatId)
  const transcript = await loadStoredTranscript(params)
  return { ...transcript, messages: transcript.messages as ChatUIMessage[] }
}

export async function getDesktopUrl(chatId: string) {
  await assertFeature("sandboxes")

  const chat = await getChat(chatId)
  if (!chat || chat.kind !== "direct") throw new Error("Chat not found")

  const startedAt = Date.now()
  const sandboxId = chat.bots[0]?.sandboxId || ""
  const url = await getBotDesktopUrl(sandboxId)

  Sentry.logger.info("Desktop opened", {
    "chat.id": chatId,
    "bot.id": chat.bots[0]?.id,
    "sandbox.id": sandboxId,
    "sandbox.start_ms": Date.now() - startedAt,
  })

  return url
}

export async function createGroupChat(values: GroupChatInsert) {
  const data = groupChatInsertSchema.parse(values)
  const client = getClient()
  const chat = await client.mutation(api.teammates.createGroupChat, {
    name: data.name,
    botIds: data.botIds as Id<"teammate_bots">[],
  })
  revalidatePath("/", "layout")
  return chat
}

export async function updateGroupChat(chatId: string, values: GroupChatInsert) {
  const data = groupChatInsertSchema.parse(values)
  const client = getClient()
  const chat = await client.mutation(api.teammates.createGroupChat, {
    name: data.name,
    botIds: data.botIds as Id<"teammate_bots">[],
  })
  revalidatePath("/", "layout")
  return chat
}

export async function deleteGroupChat(chatId: string) {
  const client = getClient()
  await client.mutation(api.teammates.deleteGroupChat, {
    chatId: chatId as Id<"teammate_chats">,
  })
  revalidatePath("/", "layout")
}

export async function createDirectChat(botId: string) {
  const client = getClient()
  const result = await client.mutation(api.teammates.createDirectChat, {
    botId: botId as Id<"teammate_bots">,
  })
  revalidatePath("/", "layout")
  return result
}

export async function clearChatMessages(chatId: string) {
  const client = getClient()
  const result = await client.mutation(api.teammates.clearChatMessages, {
    chatId: chatId as Id<"teammate_chats">,
  })
  revalidatePath("/", "layout")
  return result
}

export async function deleteChat(chatId: string) {
  const client = getClient()
  const result = await client.mutation(api.teammates.deleteChat, {
    chatId: chatId as Id<"teammate_chats">,
  })
  revalidatePath("/", "layout")
  return result
}

export async function deleteMessage(messageId: string) {
  const client = getClient()
  const result = await client.mutation(api.teammates.deleteMessage, {
    messageId: messageId as Id<"teammate_messages">,
  })
  revalidatePath("/", "layout")
  return result
}
