"use client"

import React, { createContext, useContext, useRef, useState, useCallback } from "react"
import { useMutation } from "convex/react"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { streamDeepSeekReply } from "@/lib/deepseek"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export interface AgentRunState {
  chatId: string
  botId: string
  botName: string
  status: "idle" | "working" | "error"
  streamingText: string
  startedAt?: number
  error?: string
}

interface AgentRunnerContextValue {
  runs: Record<string, AgentRunState>
  getRun: (chatId: string) => AgentRunState
  isWorking: (chatId: string) => boolean
  startTurn: (params: {
    chatId: string
    bot: { id: string; name: string }
    conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }>
    onSaveReply?: (text: string) => Promise<void>
  }) => Promise<void>
  stopTurn: (chatId: string) => void
  openRenameModal: (bot: { id: string; name: string; job?: string }) => void
}

const AgentRunnerContext = createContext<AgentRunnerContextValue | null>(null)

export function AgentRunnerProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<Record<string, AgentRunState>>({})
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const saveReplyMut = useMutation(api.teammates.saveAssistantReply)
  const renameBotMut = useMutation(api.teammates.renameBot)

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; job?: string } | null>(null)
  const [newName, setNewName] = useState("")
  const [newJob, setNewJob] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)

  const openRenameModal = useCallback((bot: { id: string; name: string; job?: string }) => {
    setRenameTarget(bot)
    setNewName(bot.name)
    setNewJob(bot.job ?? "")
  }, [])

  const handleSaveRename = async () => {
    if (!renameTarget || !newName.trim()) return
    setIsRenaming(true)
    try {
      await renameBotMut({
        botId: renameTarget.id as Id<"teammate_bots">,
        name: newName.trim(),
        job: newJob.trim() || undefined,
      })
      toast.add({
        type: "success",
        title: "Agent renamed",
        description: `Agent name updated to "${newName.trim()}".`,
      })
      setRenameTarget(null)
    } catch (err) {
      toast.add({
        type: "error",
        title: "Could not rename agent",
        description: err instanceof Error ? err.message : "Rename failed",
      })
    } finally {
      setIsRenaming(false)
    }
  }

  const getRun = useCallback(
    (chatId: string): AgentRunState => {
      return (
        runs[chatId] ?? {
          chatId,
          botId: "",
          botName: "",
          status: "idle",
          streamingText: "",
        }
      )
    },
    [runs]
  )

  const isWorking = useCallback(
    (chatId: string): boolean => {
      return runs[chatId]?.status === "working"
    },
    [runs]
  )

  const stopTurn = useCallback((chatId: string) => {
    const ctrl = abortControllersRef.current.get(chatId)
    if (ctrl) {
      ctrl.abort()
      abortControllersRef.current.delete(chatId)
    }
    setRuns((prev) => ({
      ...prev,
      [chatId]: {
        ...(prev[chatId] ?? { chatId, botId: "", botName: "" }),
        status: "idle",
        streamingText: "",
      },
    }))
  }, [])

  const startTurn = useCallback(
    async ({
      chatId,
      bot,
      conversationHistory,
      onSaveReply,
    }: {
      chatId: string
      bot: { id: string; name: string }
      conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }>
      onSaveReply?: (text: string) => Promise<void>
    }) => {
      // Abort any existing turn on THIS specific chat
      const existingCtrl = abortControllersRef.current.get(chatId)
      if (existingCtrl) existingCtrl.abort()

      const ctrl = new AbortController()
      abortControllersRef.current.set(chatId, ctrl)

      setRuns((prev) => ({
        ...prev,
        [chatId]: {
          chatId,
          botId: bot.id,
          botName: bot.name,
          status: "working",
          streamingText: "",
          startedAt: Date.now(),
        },
      }))

      let accumulated = ""

      try {
        await streamDeepSeekReply(
          conversationHistory,
          (chunk) => {
            if (ctrl.signal.aborted) return
            accumulated = chunk
            setRuns((prev) => {
              const current = prev[chatId]
              if (!current || current.status !== "working") return prev
              return {
                ...prev,
                [chatId]: {
                  ...current,
                  streamingText: chunk,
                },
              }
            })
          }
        )

        if (!ctrl.signal.aborted && accumulated.trim()) {
          if (onSaveReply) {
            await onSaveReply(accumulated.trim())
          } else {
            await saveReplyMut({
              chatId: chatId as Id<"teammate_chats">,
              text: accumulated.trim(),
              botId: bot.id as Id<"teammate_bots">,
            })
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Aborted intentionally
        } else {
          console.error(`[AgentRunner] Turn failed for ${bot.name} (${chatId}):`, err)
          toast.add({
            type: "error",
            title: `${bot.name} error`,
            description: err instanceof Error ? err.message : "Agent stream failed",
          })
          setRuns((prev) => ({
            ...prev,
            [chatId]: {
              ...(prev[chatId] ?? { chatId, botId: bot.id, botName: bot.name }),
              status: "error",
              error: err instanceof Error ? err.message : "Failed",
            },
          }))
          return
        }
      } finally {
        abortControllersRef.current.delete(chatId)
        setRuns((prev) => ({
          ...prev,
          [chatId]: {
            ...(prev[chatId] ?? { chatId, botId: bot.id, botName: bot.name }),
            status: "idle",
            streamingText: "",
          },
        }))
      }
    },
    [saveReplyMut]
  )

  return (
    <AgentRunnerContext.Provider
      value={{
        runs,
        getRun,
        isWorking,
        startTurn,
        stopTurn,
        openRenameModal,
      }}
    >
      {children}

      {/* Rename Agent Modal */}
      {renameTarget && (
        <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
          <DialogContent className="sm:max-w-md border-zinc-800 bg-zinc-950 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="text-base text-zinc-100">Rename Agent</DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Update the display name and specialty role for this autonomous agent.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Agent Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. AutoPulse Ops, Quote Agent..."
                  className="h-8 border-zinc-800 bg-zinc-900 text-xs text-zinc-100"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Specialty / Role Title</label>
                <Input
                  value={newJob}
                  onChange={(e) => setNewJob(e.target.value)}
                  placeholder="e.g. Operations Director, PDF Deals Specialist..."
                  className="h-8 border-zinc-800 bg-zinc-900 text-xs text-zinc-100"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRenameTarget(null)}
                className="text-xs text-zinc-400 hover:text-zinc-100"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isRenaming || !newName.trim()}
                onClick={() => void handleSaveRename()}
                className="bg-zinc-100 font-medium text-zinc-950 hover:bg-zinc-200 text-xs"
              >
                {isRenaming ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AgentRunnerContext.Provider>
  )
}

export function useAgentRunner() {
  const ctx = useContext(AgentRunnerContext)
  if (!ctx) {
    throw new Error("useAgentRunner must be used within an AgentRunnerProvider")
  }
  return ctx
}

