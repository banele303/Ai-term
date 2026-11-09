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
import { Skeleton } from "@/components/ui/skeleton"

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
    return (
      <div className="flex h-svh bg-zinc-950 text-zinc-100 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-full bg-zinc-800" />
              <Skeleton className="h-4 w-28 bg-zinc-800" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded bg-zinc-800" />
              <Skeleton className="size-8 rounded bg-zinc-800" />
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-6 p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 rounded-full bg-zinc-800 shrink-0" />
              <div className="flex flex-col gap-2 max-w-lg">
                <Skeleton className="h-4 w-32 bg-zinc-800" />
                <Skeleton className="h-14 w-80 rounded-xl bg-zinc-900" />
              </div>
            </div>
          </div>

          <div className="p-4">
            <Skeleton className="mx-auto h-12 max-w-3xl rounded-xl bg-zinc-900" />
          </div>
        </div>
      </div>
    )
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
