import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

function getClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || "https://successful-panda-540.convex.cloud"
  return new ConvexHttpClient(url)
}

// One of the signed-in user's chats with the bots in it (via Convex)
export async function getChat(chatId: string) {
  try {
    const client = getClient()
    const data = await client.query(api.teammates.getChat, {
      chatId: chatId as Id<"teammate_chats">,
    })
    if (!data) return null

    return {
      id: data.chat.id,
      name: data.chat.name,
      kind: data.chat.kind,
      lastMessageAt: new Date(data.chat.lastMessageAt),
      lastMessagePreview: data.chat.lastMessagePreview ?? null,
      bots: data.bots.map((b) => ({
        id: b.id,
        name: b.name,
        avatar: b.avatar,
        job: b.job,
        instructions: b.instructions ?? null,
        sandboxId: "",
        userId: "workspace_staff",
        createdAt: new Date(),
      })),
    }
  } catch {
    return null
  }
}
