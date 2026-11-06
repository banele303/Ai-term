"use server"

import { revalidatePath } from "next/cache"
import { ConvexHttpClient } from "convex/browser"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { botInsertSchema, type BotInsert } from "@/db/schema"

function getClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || "https://successful-panda-540.convex.cloud"
  return new ConvexHttpClient(url)
}

export async function createBot(values: BotInsert) {
  const data = botInsertSchema.parse(values)
  const client = getClient()
  const result = await client.mutation(api.teammates.createBot, {
    name: data.name,
    avatar: data.avatar ?? data.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    job: data.job,
    instructions: data.instructions ?? undefined,
  })
  revalidatePath("/")
  return result
}

export async function updateBot(botId: string, values: BotInsert) {
  const data = botInsertSchema.parse(values)
  const client = getClient()
  const result = await client.mutation(api.teammates.updateBot, {
    botId: botId as Id<"teammate_bots">,
    name: data.name,
    avatar: data.avatar ?? data.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    job: data.job,
    instructions: data.instructions ?? undefined,
  })
  revalidatePath("/")
  return result
}

export async function deleteBot(botId: string) {
  const client = getClient()
  await client.mutation(api.teammates.deleteBot, {
    botId: botId as Id<"teammate_bots">,
  })
  revalidatePath("/")
}
