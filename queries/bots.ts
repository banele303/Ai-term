import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"

function getClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || "https://successful-panda-540.convex.cloud"
  return new ConvexHttpClient(url)
}

// The signed-in user's chats, most recent first, each with the bots in it (via Convex)
export async function getChats() {
  const client = getClient()
  const data = await client.query(api.teammates.listWorkspace, {})
  return data.chats.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    lastMessageAt: new Date(c.lastMessageAt),
    lastMessagePreview: c.lastMessagePreview ?? null,
    bots: c.bots.map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      job: b.job,
      instructions: null,
      sandboxId: "",
      userId: "workspace_staff",
      createdAt: new Date(),
    })),
  }))
}

// The signed-in user's bots, oldest first (via Convex)
export async function getBots() {
  const client = getClient()
  const data = await client.query(api.teammates.listWorkspace, {})
  return data.bots.map((b) => ({
    id: b.id,
    name: b.name,
    avatar: b.avatar,
    job: b.job,
    instructions: b.instructions ?? null,
    sandboxId: "",
    userId: "workspace_staff",
    createdAt: new Date(),
  }))
}

export type ChatWithBots = Awaited<ReturnType<typeof getChats>>[number]
