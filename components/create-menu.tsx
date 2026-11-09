"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, UsersIcon, MessageSquarePlusIcon } from "lucide-react"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"

function CreateMenu({ bots }: { bots: { id: string; name: string; avatar: string }[] }) {
  const router = useRouter()
  const [botDialogOpen, setBotDialogOpen] = useState(false)
  const [groupChatDialogOpen, setGroupChatDialogOpen] = useState(false)
  const createDirectChatMut = useMutation(api.teammates.createDirectChat)

  const handleStartBotChat = async (botId: string, botName: string) => {
    try {
      const res = await createDirectChatMut({
        botId: botId as Id<"teammate_bots">,
      })
      toast.add({
        type: "success",
        title: "New chat created",
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Create" className="cursor-pointer" />}
        >
          <PlusIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {bots.length > 0 && (
            <>
              {bots.map((bot) => (
                <DropdownMenuItem
                  key={bot.id}
                  className="cursor-pointer gap-2"
                  onClick={() => handleStartBotChat(bot.id, bot.name)}
                >
                  <ChatAvatar seed={bot.avatar} className="size-4 shrink-0" />
                  <span className="truncate">New chat with {bot.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => setBotDialogOpen(true)}
          >
            <PlusIcon className="size-4" />
            <span>Create new bot</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => setGroupChatDialogOpen(true)}
          >
            <UsersIcon className="size-4" />
            <span>Create group chat</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
      <GroupChatDialog
        bots={bots}
        open={groupChatDialogOpen}
        onOpenChange={setGroupChatDialogOpen}
      />
    </>
  )
}

export { CreateMenu }
