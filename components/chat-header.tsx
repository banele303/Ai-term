"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  PanelRightIcon,
  PlusIcon,
  MoreVerticalIcon,
  Trash2Icon,
  RotateCcwIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  SquareIcon,
} from "lucide-react"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useAgentRunner } from "@/components/agent-runner-provider"
import { BotDialog, type TeammateBotRecord } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { useDesktopPanel } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"

// Only rendered in direct chats, inside DesktopPanelProvider
function DesktopButton() {
  const desktopPanel = useDesktopPanel()
  if (!desktopPanel) return null

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={
        desktopPanel.open
          ? "cursor-pointer bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          : "cursor-pointer text-zinc-400 hover:text-zinc-100"
      }
      aria-label="Toggle workspace panel"
      aria-pressed={desktopPanel.open}
      onClick={desktopPanel.toggle}
    >
      <PanelRightIcon className="size-4" />
    </Button>
  )
}

function ChatHeader({
  chat,
  bots = [],
}: {
  chat: {
    id: string
    kind: "direct" | "group"
    name: string
    bots: TeammateBotRecord[]
  }
  bots?: TeammateBotRecord[]
}) {
  const router = useRouter()
  const runner = useAgentRunner()
  const isWorking = runner.isWorking(chat.id)
  const createDirectChatMut = useMutation(api.teammates.createDirectChat)
  const clearChatMut = useMutation(api.teammates.clearChatMessages)
  const deleteChatMut = useMutation(api.teammates.deleteChat)

  const [isProcessing, setIsProcessing] = React.useState(false)

  const targetBot = chat.bots[0]

  const handleStartNewChat = async () => {
    if (!targetBot) return
    setIsProcessing(true)
    try {
      const res = await createDirectChatMut({
        botId: targetBot.id as Id<"teammate_bots">,
      })
      toast.add({
        type: "success",
        title: "New chat created",
        description: `Started a fresh conversation with ${targetBot.name}.`,
      })
      router.push(`/chats/${res.chatId}`)
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to create chat",
        description: err instanceof Error ? err.message : "Error starting new chat",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClearMessages = async () => {
    if (!confirm("Are you sure you want to clear all messages in this conversation?")) {
      return
    }
    setIsProcessing(true)
    try {
      await clearChatMut({
        chatId: chat.id as Id<"teammate_chats">,
      })
      toast.add({
        type: "success",
        title: "Chat cleared",
        description: "All messages in this conversation have been wiped.",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to clear chat",
        description: err instanceof Error ? err.message : "Error clearing messages",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteChat = async () => {
    if (!confirm("Are you sure you want to delete this chat permanently?")) {
      return
    }
    setIsProcessing(true)
    try {
      await deleteChatMut({
        chatId: chat.id as Id<"teammate_chats">,
      })
      toast.add({
        type: "success",
        title: "Chat deleted",
        description: "This conversation has been removed.",
      })
      router.push("/")
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to delete chat",
        description: err instanceof Error ? err.message : "Error deleting chat",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <header
      data-slot="chat-header"
      className="flex h-12 shrink-0 items-center justify-between border-b px-4 bg-background/50 backdrop-blur"
    >
      <div className="flex items-center gap-2 min-w-0">
        {chat.kind === "group" ? (
          <h1 className="-ml-2 flex min-w-0">
            <GroupChatDialog
              chat={chat}
              bots={bots}
              trigger={
                <Button variant="ghost" className="min-w-0 shrink gap-2 px-2 cursor-pointer" />
              }
            >
              <GroupChatAvatar
                seeds={chat.bots.map((bot) => bot.avatar)}
                className="size-6"
              />
              <span className="truncate font-semibold">{chat.name}</span>
            </GroupChatDialog>
          </h1>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="-ml-2 flex min-w-0">
              <BotDialog
                bot={targetBot}
                trigger={
                  <Button variant="ghost" className="min-w-0 shrink gap-2 px-2 cursor-pointer" />
                }
              >
                <ChatAvatar seed={targetBot?.avatar ?? "default"} className="size-6" />
                <span className="truncate font-semibold">{chat.name ?? targetBot?.name}</span>
              </BotDialog>
            </h1>
            {isWorking ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 shrink-0">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Working
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium text-zinc-400 shrink-0">
                <span className="size-1.5 rounded-full bg-emerald-500/60" />
                Ready
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Quick New Chat Button */}
        {chat.kind === "direct" && targetBot && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartNewChat}
            disabled={isProcessing}
            className="h-8 gap-1.5 px-2.5 text-xs font-medium cursor-pointer border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200"
          >
            {isProcessing ? (
              <Skeleton className="size-3 rounded-full bg-sky-400/80" />
            ) : (
              <PlusIcon className="size-3.5 text-sky-400" />
            )}
            New Chat
          </Button>
        )}

        {/* Options Dropdown: Clear / Delete */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Chat options"
                className="cursor-pointer text-zinc-400 hover:text-zinc-100"
              />
            }
          >
            <MoreVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {chat.kind === "direct" && targetBot && (
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={handleStartNewChat}
              >
                <MessageSquarePlusIcon className="size-4 text-sky-400" />
                <span>New chat with {targetBot.name}</span>
              </DropdownMenuItem>
            )}
            {chat.kind === "direct" && targetBot && (
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-zinc-300"
                onClick={() => runner.openRenameModal({ id: targetBot.id, name: targetBot.name, job: targetBot.job })}
              >
                <PencilIcon className="size-4 text-sky-400" />
                <span>Rename agent</span>
              </DropdownMenuItem>
            )}
            {isWorking && (
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-amber-400"
                onClick={() => runner.stopTurn(chat.id)}
              >
                <SquareIcon className="size-4 text-amber-400" />
                <span>Stop generation</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-zinc-300"
              onClick={handleClearMessages}
            >
              <RotateCcwIcon className="size-4 text-amber-400" />
              <span>Clear conversation</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              onClick={handleDeleteChat}
            >
              <Trash2Icon className="size-4" />
              <span>Delete chat</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {chat.kind === "direct" && <DesktopButton />}
      </div>
    </header>
  )
}

export { ChatHeader }
