"use client"

import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { formatDistanceToNowStrict } from "date-fns"
import {
  CarFront,
  Bot as BotIcon,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  MessageSquarePlus,
  Pencil,
  Square,
} from "lucide-react"
import { useQuery, useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useAgentRunner } from "@/components/agent-runner-provider"
import { ChatAvatar } from "@/components/chat-avatar"
import { ChatMenuButton } from "@/components/chat-menu-button"
import { CreateMenu } from "@/components/create-menu"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { SearchCommand, SearchCommandItem } from "@/components/search-command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { UserMenu } from "@/components/user-menu"
import { toast } from "@/components/ui/toast"

type SidebarChat = {
  id: string
  kind: "direct" | "group"
  name: string
  bots: { id: string; name: string; avatar: string }[]
  lastMessagePreview?: string
  lastMessageAt: number
}

function SidebarChatAvatar({ chat }: { chat: SidebarChat }) {
  return chat.kind === "group" ? (
    <GroupChatAvatar seeds={chat.bots.map((bot) => bot.avatar)} />
  ) : (
    <ChatAvatar seed={chat.bots[0]?.avatar ?? "default"} />
  )
}

export function AppSidebar() {
  const router = useRouter()
  const params = useParams<{ chatId?: string }>()
  const runner = useAgentRunner()
  const data = useQuery(api.teammates.listWorkspace, {})
  const chats = (data?.chats ?? []) as SidebarChat[]
  const bots = (data?.bots ?? []) as { id: string; name: string; avatar: string; job?: string }[]

  const createDirectChatMut = useMutation(api.teammates.createDirectChat)
  const clearChatMut = useMutation(api.teammates.clearChatMessages)
  const deleteChatMut = useMutation(api.teammates.deleteChat)

  const handleCreateNewChat = async (botId: string, botName: string) => {
    try {
      const res = await createDirectChatMut({
        botId: botId as Id<"teammate_bots">,
      })
      toast.add({
        type: "success",
        title: "New chat started",
        description: `Started new conversation with ${botName}.`,
      })
      router.push(`/chats/${res.chatId}`)
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to create chat",
        description: err instanceof Error ? err.message : "Error creating chat",
      })
    }
  }

  const handleClearChat = async (chatId: string) => {
    if (!confirm("Clear all messages in this conversation?")) return
    try {
      await clearChatMut({
        chatId: chatId as Id<"teammate_chats">,
      })
      toast.add({
        type: "success",
        title: "Chat cleared",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to clear chat",
        description: err instanceof Error ? err.message : "Error clearing chat",
      })
    }
  }

  const handleDeleteChat = async (chatId: string) => {
    if (!confirm("Are you sure you want to permanently delete this chat?")) return
    try {
      await deleteChatMut({
        chatId: chatId as Id<"teammate_chats">,
      })
      toast.add({
        type: "success",
        title: "Chat deleted",
      })
      if (params.chatId === chatId) {
        router.push("/")
      }
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to delete chat",
        description: err instanceof Error ? err.message : "Error deleting chat",
      })
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 pt-1">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BotIcon className="size-4" />
            </div>
            <span className="truncate">AI Teammates</span>
          </Link>
          <CreateMenu bots={bots} />
        </div>
        <SearchCommand>
          {chats.map((chat) => (
            <SearchCommandItem
              key={chat.id}
              href={`/chats/${chat.id}`}
              value={chat.id}
              keywords={[chat.name]}
            >
              <SidebarChatAvatar chat={chat} />
              <span className="truncate">{chat.name}</span>
            </SearchCommandItem>
          ))}
        </SearchCommand>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:overflow-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => {
                const run = runner.getRun(chat.id)
                const isWorking = runner.isWorking(chat.id)

                return (
                  <SidebarMenuItem key={chat.id}>
                    <ChatMenuButton
                      chatId={chat.id}
                      tooltip={chat.name}
                    >
                      <SidebarChatAvatar chat={chat} />
                      <div className="grid flex-1 text-left leading-tight">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-medium">
                            {chat.name}
                          </span>
                          {isWorking ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 shrink-0">
                              <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Working
                            </span>
                          ) : (
                            <time
                              dateTime={new Date(chat.lastMessageAt).toISOString()}
                              className="ml-auto shrink-0 text-xs text-muted-foreground"
                            >
                              {formatDistanceToNowStrict(new Date(chat.lastMessageAt))}
                            </time>
                          )}
                        </div>
                        {isWorking ? (
                          <span className="truncate text-xs text-emerald-400/90 italic animate-pulse">
                            {run.streamingText ? run.streamingText.slice(-45) : "Processing inquiry..."}
                          </span>
                        ) : chat.lastMessagePreview ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {chat.lastMessagePreview}
                          </span>
                        ) : null}
                      </div>
                    </ChatMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <SidebarMenuAction showOnHover className="cursor-pointer">
                            <MoreHorizontal className="size-3.5" />
                            <span className="sr-only">Options</span>
                          </SidebarMenuAction>
                        }
                      />
                      <DropdownMenuContent side="right" align="start" className="w-48">
                        {chat.kind === "direct" && chat.bots[0] && (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2"
                            onClick={() => handleCreateNewChat(chat.bots[0].id, chat.name)}
                          >
                            <MessageSquarePlus className="size-4 text-sky-400" />
                            <span>New Chat</span>
                          </DropdownMenuItem>
                        )}
                        {chat.kind === "direct" && chat.bots[0] && (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-zinc-300"
                            onClick={() => runner.openRenameModal({ id: chat.bots[0].id, name: chat.name })}
                          >
                            <Pencil className="size-4 text-sky-400" />
                            <span>Rename Agent</span>
                          </DropdownMenuItem>
                        )}
                        {isWorking && (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-amber-400"
                            onClick={() => runner.stopTurn(chat.id)}
                          >
                            <Square className="size-4 text-amber-400" />
                            <span>Stop Working</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-zinc-300"
                          onClick={() => handleClearChat(chat.id)}
                        >
                          <RotateCcw className="size-4 text-amber-400" />
                          <span>Clear Messages</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
                          onClick={() => handleDeleteChat(chat.id)}
                        >
                          <Trash2 className="size-4" />
                          <span>Delete Chat</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )
              })}
              {chats.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No bots yet. Click + to create your first bot!
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard" />}
              tooltip="AutoPulse Command Center"
              className="text-sky-600 dark:text-sky-400 cursor-pointer"
            >
              <CarFront />
              <span>AutoPulse Command</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
