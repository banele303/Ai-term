"use client"

import * as React from "react"
import { useAction, useMutation, useQuery } from "convex/react"

import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { updateComposioApiKey } from "@/actions/composio"

export function formatGoogleAccountLabel(label?: string | null) {
  if (!label) return "Google Account"
  if (label.includes("@")) return label
  if (label.startsWith("ca_") || label.startsWith("gmail_")) {
    return "Google Account"
  }
  return label
}

export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

export function GmailConnectModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const connections = useQuery(api.composioTools.listConnections, {})
  const disconnectGmailMut = useMutation(api.composioTools.disconnectGmailAccount)
  const disconnectToolkitAction = useAction(api.composioTools.disconnectToolkit)
  const initiateConnectionAction = useAction(api.composioTools.initiateConnection)
  const syncConnectionsAction = useAction(api.composioTools.syncConnections)

  const gmailConnection = connections?.toolkits?.find((t) => t.toolkit === "gmail")?.connection
  const isGmailActive = gmailConnection?.status === "active"
  const wasActiveRef = React.useRef(isGmailActive)

  const [isOAuthStarting, setIsOAuthStarting] = React.useState(false)
  const [isAwaitingPopup, setIsAwaitingPopup] = React.useState(false)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [isDisconnecting, setIsDisconnecting] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)
  const [newApiKey, setNewApiKey] = React.useState("")
  const [isSavingKey, setIsSavingKey] = React.useState(false)
  const [showKeyForm, setShowKeyForm] = React.useState(false)
  const popupRef = React.useRef<Window | null>(null)

  const runSync = React.useCallback(async () => {
    try {
      setIsSyncing(true)
      await syncConnectionsAction({})
    } catch {
      // Silent background sync check
    } finally {
      setIsSyncing(false)
    }
  }, [syncConnectionsAction])

  // Sync status whenever modal opens
  React.useEffect(() => {
    if (open) {
      void runSync()
    }
  }, [open, runSync])

  // Clear awaiting popup state when Gmail is active
  React.useEffect(() => {
    if (isGmailActive) {
      setIsAwaitingPopup(false)
    }
    wasActiveRef.current = isGmailActive
  }, [isGmailActive])

  // Listen for OAuth popup completion and poll while popup is open
  React.useEffect(() => {
    if (!open && !isAwaitingPopup) return

    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "COMPOSIO_OAUTH_COMPLETE"
      ) {
        void runSync()
      }
    }

    const handleFocus = () => {
      if (isAwaitingPopup || open) {
        void runSync()
      }
    }

    window.addEventListener("message", handleMessage)
    window.addEventListener("focus", handleFocus)

    let interval: ReturnType<typeof setInterval> | undefined
    if (isAwaitingPopup) {
      interval = setInterval(() => {
        void runSync()
        if (popupRef.current && popupRef.current.closed) {
          popupRef.current = null
          setIsAwaitingPopup(false)
          void runSync()
        }
      }, 2500)
    }

    return () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("focus", handleFocus)
      if (interval) clearInterval(interval)
    }
  }, [open, isAwaitingPopup, runSync])

  const handleGoogleConnect = async () => {
    setIsOAuthStarting(true)
    setAuthError(null)
    try {
      const callbackUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/oauth-callback?toolkit=gmail&returnTo=${encodeURIComponent(
              window.location.pathname + window.location.search
            )}`
          : undefined

      const res = (await initiateConnectionAction({
        toolkit: "gmail",
        callbackUrl,
      })) as { connectedAccountId: string; redirectUrl: string | null; error?: string }

      if (res.error) {
        setAuthError(res.error)
        toast.add({
          type: "error",
          title: "Google connection failed",
          description: res.error,
        })
        return
      }

      if (res.redirectUrl) {
        const popup = window.open(
          res.redirectUrl,
          "google_oauth_popup",
          "width=520,height=660,menubar=no,status=no,toolbar=no"
        )
        if (!popup) {
          window.location.href = res.redirectUrl
        } else {
          popupRef.current = popup
          setIsAwaitingPopup(true)
        }
      } else {
        await runSync()
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setAuthError(errMsg)
      toast.add({
        type: "error",
        title: "Google connection error",
        description: errMsg,
      })
    } finally {
      setIsOAuthStarting(false)
    }
  }

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newApiKey.trim()
    if (!trimmed.startsWith("ak_") && !trimmed.startsWith("ck_")) {
      toast.add({
        type: "error",
        title: "Invalid API key",
        description: "Composio keys must start with 'ak_' or 'ck_'.",
      })
      return
    }

    setIsSavingKey(true)
    try {
      await updateComposioApiKey(trimmed)
      setAuthError(null)
      setNewApiKey("")
      setShowKeyForm(false)
      toast.add({
        type: "success",
        title: "API key updated",
        description: "Starting Google sign-in...",
      })
      await handleGoogleConnect()
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to save key",
        description: err instanceof Error ? err.message : "Error saving key",
      })
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      await disconnectToolkitAction({ toolkit: "gmail" }).catch(() => null)
      await disconnectGmailMut()
      toast.add({
        type: "info",
        title: "Gmail disconnected",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "Could not disconnect account",
      })
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-2xl rounded-xl">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm font-medium tracking-tight text-zinc-100">
            Gmail Integration
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Sign in with Google to read customer inquiries and send quotations from your inbox.
          </DialogDescription>
        </DialogHeader>

        {isGmailActive ? (
          <div className="my-3 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-100 truncate">
                    {formatGoogleAccountLabel(gmailConnection?.accountLabel)}
                  </div>
                  <div className="text-[11px] text-emerald-400">
                    Connected via Google
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="h-7 px-2.5 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 shrink-0"
              >
                {isDisconnecting ? <Spinner data-icon="inline-start" /> : null}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="my-3 flex flex-col gap-3">
            <Button
              type="button"
              onClick={handleGoogleConnect}
              disabled={isOAuthStarting}
              className="h-9 w-full gap-2.5 rounded-lg bg-white text-xs font-medium text-zinc-950 hover:bg-zinc-200"
            >
              {isOAuthStarting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <GoogleMark className="size-4 shrink-0" />
              )}
              {isAwaitingPopup ? "Complete sign-in in Google window..." : "Continue with Google"}
            </Button>

            {isAwaitingPopup && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-400">
                <span>Waiting for Google authorization...</span>
                <button
                  type="button"
                  onClick={() => void runSync()}
                  disabled={isSyncing}
                  className="font-medium text-zinc-200 hover:underline"
                >
                  {isSyncing ? "Checking..." : "Check status"}
                </button>
              </div>
            )}

            {authError && (
              <p className="text-[11px] text-red-400 leading-relaxed">
                {authError}
              </p>
            )}

            {(showKeyForm || (authError && (authError.includes("401") || authError.includes("API")))) && (
              <form onSubmit={handleSaveApiKey} className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <label className="text-[11px] text-zinc-400">
                  Composio API key
                </label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="ak_..."
                    className="h-8 flex-1 border-zinc-800 bg-zinc-950 font-mono text-xs"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={isSavingKey}
                    variant="outline"
                    className="h-8 px-3 text-xs border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  >
                    {isSavingKey ? <Spinner data-icon="inline-start" /> : null}
                    Save
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between border-t border-zinc-800/80 pt-3 sm:justify-between">
          {!isGmailActive ? (
            <button
              type="button"
              onClick={() => setShowKeyForm((prev) => !prev)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {showKeyForm ? "Hide API key" : "Update API key"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={isSyncing}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {isSyncing ? "Syncing..." : "Refresh status"}
            </button>
          )}
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-zinc-400 hover:text-zinc-100"
              />
            }
          >
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
