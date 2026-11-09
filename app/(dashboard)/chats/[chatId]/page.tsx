"use client"

import { use, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useQuery, useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { DesktopPanel, DesktopPanelProvider } from "@/components/desktop-panel"
import { Button } from "@/components/ui/button"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Skeleton, ChatPageSkeleton } from "@/components/ui/skeleton"

export default function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatId: string }>
  searchParams?: Promise<{ prompt?: string }>
}) {
  const { chatId } = use(params)
  const resolvedSearchParams = searchParams ? use(searchParams) : undefined
  const initialPrompt = resolvedSearchParams?.prompt

  const data = useQuery(api.teammates.getChat, {
    chatId: chatId as Id<"teammate_chats">,
  })
  const ensureFleetMut = useMutation(api.teammates.ensureWorkspaceFleet)

  useEffect(() => {
    if (data) {
      const hasWaBot = data.allUserBots?.some(
        (b) => b.name.includes("WhatsApp") || b.name.includes("Fame")
      )
      if (!hasWaBot || (data.allUserBots?.length ?? 0) < 6) {
        ensureFleetMut({}).catch(() => {})
      }
    }
  }, [data, ensureFleetMut])

  if (data === undefined) {
    return <ChatPageSkeleton />
  }

  if (data === null) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">This chat does not exist or was removed.</p>
        <Button variant="outline" render={<Link href="/" className="cursor-pointer" />}>
          <ArrowLeft data-icon="inline-start" /> Return to bots
        </Button>
      </div>
    )
  }

  const { chat, bots, allUserBots } = data

  if (chat.kind === "group") {
    return (
      <div className="flex h-svh flex-col">
        <ChatHeader chat={chat} bots={allUserBots} />
        <Chat chatId={chat.id} bots={bots} initialPrompt={initialPrompt} />
      </div>
    )
  }

  return (
    <DesktopPanelProvider key={chat.id} chatId={chat.id}>
      <div className="h-svh overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="chat" minSize="38%">
            <div className="flex h-full min-w-0 flex-col">
              <ChatHeader chat={chat} />
              <Chat chatId={chat.id} bots={bots} initialPrompt={initialPrompt} />
            </div>
          </ResizablePanel>
          <DesktopPanel
            name={bots[0]?.name ?? "Bot"}
            job={bots[0]?.job}
            instructions={bots[0]?.instructions}
          />
        </ResizablePanelGroup>
      </div>
    </DesktopPanelProvider>
  )
}
