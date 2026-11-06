"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  Activity,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MessageSquare,
  PlugZap,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Unplug,
  Zap,
} from "lucide-react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import { FALLBACK_AUTOMATIONS } from "@/components/autopulse/fallback-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { ComposioToolkit } from "@/convex/schema"

const MCP_CLI_COMMAND =
  "gemini mcp add --scope user --transport http composio https://connect.composio.dev/mcp"

interface ToolkitCardMeta {
  slug: ComposioToolkit
  name: string
  subtitle: string
  capabilities: string[]
  accent: string
  icon: typeof Mail
}

const TOOLKIT_CARDS: ToolkitCardMeta[] = [
  {
    slug: "gmail",
    name: "Gmail Fleet & Supplier Inbox",
    subtitle: "Email Quotes & Supplier Updates",
    capabilities: [
      "Auto-triage inbound fleet & workshop quote emails",
      "Read CSV/PDF parts lists & send formatted quotes",
      "Process supplier invoice & stock update emails",
    ],
    accent: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    icon: Mail,
  },
  {
    slug: "outlook",
    name: "Microsoft Outlook 365",
    subtitle: "B2B Workshop & Fleet Email",
    capabilities: [
      "Sync workshop purchase orders & procurement emails",
      "Automated invoice & dispatch tracking replies",
    ],
    accent: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    icon: Mail,
  },
  {
    slug: "facebook",
    name: "Facebook Pages & Lead Ads",
    subtitle: "Messenger, Comments & Lead Forms",
    capabilities: [
      "Reply to Page comments & Messenger stock inquiries",
      "Send instant WhatsApp welcome messages to new ad leads",
      "Publish new parts arrivals & bundle promotions",
    ],
    accent: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    icon: Sparkles,
  },
  {
    slug: "instagram",
    name: "Instagram Business & DMs",
    subtitle: "Direct Messages & Product Posts",
    capabilities: [
      "Answer vehicle fitment & stock availability DMs automatically",
      "Publish turbo, suspension & brake bundle posts",
    ],
    accent: "text-pink-400 border-pink-500/30 bg-pink-500/10",
    icon: Share2,
  },
  {
    slug: "tiktok",
    name: "TikTok Ads Manager",
    subtitle: "Ad Campaigns & Lead Forms",
    capabilities: [
      "Track campaign spend, leads, and return on ad spend",
      "Pause zero-lead ad sets & adjust budgets",
      "Follow up new lead form inquiries on WhatsApp",
    ],
    accent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    icon: Zap,
  },
]

interface ConnectionEntry {
  toolkit: ComposioToolkit
  status: "initiated" | "active" | "failed" | "expired" | "disconnected" | "unconnected"
  accountLabel?: string
}

interface WhapiHealthState {
  checked: boolean
  ok: boolean
  status?: string
  linked?: boolean
  phone?: string | null
  name?: string | null
  qrBase64?: string | null
  error?: string
}

interface AutomationRow {
  key: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  lastRunAt?: number
  lastRunStatus?: "success" | "error" | "skipped"
}

export default function IntegrationsPage() {
  const convexReady = useConvexReady()
  return convexReady ? <LiveIntegrations /> : <PreviewIntegrations />
}

function LiveIntegrations() {
  const connectionsData = useQuery(api.composioTools.listConnections, {})
  const automationsData = useQuery(api.automations.list, {})
  const initiateConnection = useAction(api.composioTools.initiateConnection)
  const syncConnections = useAction(api.composioTools.syncConnections)
  const disconnectToolkit = useAction(api.composioTools.disconnectToolkit)
  const createMcpSession = useAction(api.composioTools.createMcpSession)
  const checkWhapiHealth = useAction(api.whapi.health)
  const toggleAutomation = useMutation(api.automations.toggle)

  const [whapiState, setWhapiState] = useState<WhapiHealthState>({
    checked: false,
    ok: false,
  })
  const [mcpSessionUrl, setMcpSessionUrl] = useState<string | null>(null)

  const entries: ConnectionEntry[] = TOOLKIT_CARDS.map((card) => {
    const found = connectionsData?.toolkits.find(
      (t) => t.toolkit === card.slug
    )?.connection
    return {
      toolkit: card.slug,
      status: found?.status ?? "unconnected",
      accountLabel: found?.accountLabel ?? found?.connectedAccountId,
    }
  })

  const handleConnect = async (toolkit: ComposioToolkit) => {
    const callbackUrl =
      typeof window !== "undefined" ? window.location.href : undefined
    const res = (await initiateConnection({
      toolkit,
      callbackUrl,
    })) as { connectedAccountId: string; redirectUrl: string | null; error?: string }
    if (res.error) {
      toast.add({
        type: "error",
        title: `Composio ${toolkit} Connection Failed`,
        description: res.error,
      })
      return
    }
    if (res.redirectUrl) {
      window.open(res.redirectUrl, "_blank", "noopener,noreferrer")
      toast.add({
        type: "success",
        title: `Opened Composio OAuth for ${toolkit}`,
        description:
          "Complete sign-in in the new tab, then click 'Sync Accounts' to verify.",
      })
    } else {
      toast.add({
        title: `Initiated ${toolkit} connection`,
        description: `Connection ID: ${res.connectedAccountId}`,
      })
    }
  }

  const handleSync = async () => {
    const res = await syncConnections({})
    if (!res.configured) {
      toast.add({
        type: "error",
        title: "COMPOSIO_API_KEY not set on Convex",
        description: "Set COMPOSIO_API_KEY in Convex environment variables first.",
      })
      return
    }
    toast.add({
      type: "success",
      title: `Synced ${res.synced} Composio account(s)`,
    })
  }

  const handleDisconnect = async (toolkit: ComposioToolkit) => {
    await disconnectToolkit({ toolkit })
    toast.add({ title: `Disconnected ${toolkit}` })
  }

  const handleCheckWhapi = async () => {
    const res = await checkWhapiHealth({})
    if (res.ok) {
      setWhapiState({
        checked: true,
        ok: true,
        status: res.status,
        linked: res.linked,
        phone: res.phone,
        name: res.name,
        qrBase64: res.qrBase64,
      })
      toast.add({
        type: "success",
        title: res.linked
          ? `Whapi.cloud linked (${res.phone ?? res.status})`
          : `Whapi status: ${res.status}`,
      })
    } else {
      setWhapiState({ checked: true, ok: false, error: res.error })
      toast.add({
        type: "error",
        title: "Whapi health check failed",
        description: res.error,
      })
    }
  }

  const handleGenerateMcpSession = async () => {
    const res = await createMcpSession({})
    if (res.configured) {
      setMcpSessionUrl(res.mcpUrl)
      toast.add({
        type: "success",
        title: "Composio Connect MCP session created",
        description: `Session ${res.sessionId} active for Gmail, FB, IG & TikTok.`,
      })
    } else {
      setMcpSessionUrl(res.connectMcpUrl)
      toast.add({
        title: "Using default Composio Connect MCP endpoint",
        description: "Add COMPOSIO_API_KEY on Convex to mint scoped session URLs.",
      })
    }
  }

  const handleToggleAutomation = async (key: string, enabled: boolean) => {
    await toggleAutomation({ key, enabled })
    toast.add({
      title: enabled ? "Scheduled workflow enabled" : "Workflow paused",
    })
  }

  return (
    <IntegrationsUI
      liveMode
      composioConfigured={connectionsData?.composioConfigured ?? false}
      whapiConfigured={connectionsData?.whapiConfigured ?? false}
      entries={entries}
      whapiState={whapiState}
      mcpSessionUrl={mcpSessionUrl}
      automations={(automationsData as AutomationRow[] | undefined) ?? []}
      onConnect={handleConnect}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
      onCheckWhapi={handleCheckWhapi}
      onGenerateMcpSession={handleGenerateMcpSession}
      onToggleAutomation={handleToggleAutomation}
    />
  )
}

function PreviewIntegrations() {
  const [entries, setEntries] = useState<ConnectionEntry[]>([
    { toolkit: "gmail", status: "active", accountLabel: "parts@autopulse.co.za" },
    { toolkit: "outlook", status: "unconnected" },
    { toolkit: "facebook", status: "active", accountLabel: "AutoPulse Car Parts SA" },
    { toolkit: "instagram", status: "active", accountLabel: "@autopulse.parts" },
    { toolkit: "tiktok", status: "active", accountLabel: "TikTok Ads #884120" },
  ])
  const [whapiState, setWhapiState] = useState<WhapiHealthState>({
    checked: true,
    ok: true,
    status: "AUTH",
    linked: true,
    phone: "27820019940",
    name: "AutoPulse Parts Desk",
  })
  const [mcpSessionUrl, setMcpSessionUrl] = useState<string | null>(
    "https://connect.composio.dev/mcp"
  )
  const [automations, setAutomations] = useState<AutomationRow[]>(
    () => FALLBACK_AUTOMATIONS as AutomationRow[]
  )

  return (
    <IntegrationsUI
      liveMode={false}
      composioConfigured={false}
      whapiConfigured={false}
      entries={entries}
      whapiState={whapiState}
      mcpSessionUrl={mcpSessionUrl}
      automations={automations}
      onConnect={async (toolkit) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.toolkit === toolkit
              ? { ...e, status: "active", accountLabel: `${toolkit}_demo_acct` }
              : e
          )
        )
        toast.add({
          title: `Simulated Composio OAuth (${toolkit})`,
          description:
            "Start `npx convex dev` and set COMPOSIO_API_KEY to launch real OAuth Connect Links.",
        })
      }}
      onSync={async () => {
        toast.add({ title: "Preview accounts synced" })
      }}
      onDisconnect={async (toolkit) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.toolkit === toolkit ? { ...e, status: "disconnected" } : e
          )
        )
      }}
      onCheckWhapi={async () => {
        setWhapiState({
          checked: true,
          ok: true,
          status: "AUTH",
          linked: true,
          phone: "27820019940",
          name: "AutoPulse Parts Desk",
        })
        toast.add({
          title: "Whapi.cloud Gate Check (Preview)",
          description: "Endpoint https://gate.whapi.cloud/health ready.",
        })
      }}
      onGenerateMcpSession={async () => {
        setMcpSessionUrl("https://connect.composio.dev/mcp")
        toast.add({
          type: "success",
          title: "Composio Connect MCP URL ready",
        })
      }}
      onToggleAutomation={async (key, enabled) => {
        setAutomations((prev) =>
          prev.map((a) => (a.key === key ? { ...a, enabled } : a))
        )
        toast.add({
          title: enabled ? "Automation enabled" : "Automation paused",
        })
      }}
    />
  )
}

function CopySnippet({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.add({ title: `Copied ${label}` })
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy
            </>
          )}
        </button>
      </div>
      <code className="mt-1.5 block overflow-x-auto font-mono text-[11px] text-sky-300">
        {value}
      </code>
    </div>
  )
}

function IntegrationsUI({
  liveMode,
  composioConfigured,
  whapiConfigured,
  entries,
  whapiState,
  mcpSessionUrl,
  automations,
  onConnect,
  onSync,
  onDisconnect,
  onCheckWhapi,
  onGenerateMcpSession,
  onToggleAutomation,
}: {
  liveMode: boolean
  composioConfigured: boolean
  whapiConfigured: boolean
  entries: ConnectionEntry[]
  whapiState: WhapiHealthState
  mcpSessionUrl: string | null
  automations: AutomationRow[]
  onConnect: (toolkit: ComposioToolkit) => Promise<void>
  onSync: () => Promise<void>
  onDisconnect: (toolkit: ComposioToolkit) => Promise<void>
  onCheckWhapi: () => Promise<void>
  onGenerateMcpSession: () => Promise<void>
  onToggleAutomation: (key: string, enabled: boolean) => Promise<void>
}) {
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null)
  const [checkingWhapi, setCheckingWhapi] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [creatingMcp, setCreatingMcp] = useState(false)

  const convexSite = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(
    /\/$/,
    ""
  )
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-autopulse-domain.up.railway.app"
  const composioWebhookUrl = convexSite
    ? `${convexSite}/webhooks/composio`
    : `${origin}/api/webhooks/composio`
  const whapiWebhookUrl = convexSite
    ? `${convexSite}/webhooks/whapi?secret=YOUR_WHAPI_WEBHOOK_SECRET`
    : `${origin}/api/webhooks/whapi?secret=YOUR_WHAPI_WEBHOOK_SECRET`

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Channels &amp; Automated Schedules
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Connect WhatsApp, Email, Social &amp; Ad accounts, and manage
            automated store follow-ups.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true)
            try {
              await onSync()
            } finally {
              setSyncing(false)
            }
          }}
          className="border-slate-700 bg-slate-900 text-xs text-slate-200 hover:bg-slate-800"
        >
          {syncing ? (
            <Skeleton className="mr-1.5 size-3.5 rounded-full bg-slate-300/70" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          Refresh Accounts
        </Button>
      </div>

      {/* WhatsApp Business Connection Card */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-emerald-950/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                WhatsApp Business
              </h2>
              <p className="text-[11px] text-slate-400">
                Customer chats, voice notes, VIN &amp; part photos, and quote
                replies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                whapiState.linked
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }
            >
              {whapiState.checked
                ? whapiState.linked
                  ? `Connected · +${whapiState.phone ?? "Linked"}`
                  : (whapiState.status ?? "Unlinked")
                : whapiConfigured
                  ? "Configured"
                  : "Not Checked"}
            </Badge>

            <Button
              type="button"
              size="sm"
              disabled={checkingWhapi}
              onClick={async () => {
                setCheckingWhapi(true)
                try {
                  await onCheckWhapi()
                } finally {
                  setCheckingWhapi(false)
                }
              }}
              className="bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            >
              {checkingWhapi ? (
                <Skeleton className="mr-1.5 size-3.5 rounded-full bg-white/70" />
              ) : (
                <QrCode className="mr-1.5 size-3.5" />
              )}
              Check Connection &amp; QR
            </Button>
          </div>
        </div>

        {whapiState.checked && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
            {whapiState.ok ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-emerald-300">
                    Status: {whapiState.status}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {whapiState.name
                      ? `${whapiState.name} (+${whapiState.phone})`
                      : "Ready to receive customer messages"}
                  </div>
                </div>
                <ShieldCheck className="size-5 text-emerald-400" />
              </div>
            ) : (
              <div className="text-rose-300">{whapiState.error}</div>
            )}

            {whapiState.qrBase64 && !whapiState.linked && (
              <div className="mt-3 flex flex-col items-center rounded-lg bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    whapiState.qrBase64.startsWith("data:")
                      ? whapiState.qrBase64
                      : `data:image/png;base64,${whapiState.qrBase64}`
                  }
                  alt="WhatsApp Login QR"
                  className="size-40"
                />
                <span className="mt-1 text-[11px] font-medium text-slate-900">
                  Scan in WhatsApp Business → Linked Devices
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connected Apps */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Email, Social &amp; Ad Accounts
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLKIT_CARDS.map((card) => {
            const Icon = card.icon
            const entry = entries.find((e) => e.toolkit === card.slug)
            const isConnected = entry?.status === "active"
            const isInitiated = entry?.status === "initiated"
            const busy = busyToolkit === card.slug

            return (
              <div
                key={card.slug}
                className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/55 p-4 transition hover:border-slate-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`rounded-lg border p-2 ${card.accent}`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-100">
                          {card.name}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {card.subtitle}
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={
                        isConnected
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : isInitiated
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-slate-700 bg-slate-900 text-slate-400"
                      }
                    >
                      {isConnected
                        ? "Connected"
                        : isInitiated
                          ? "Pending OAuth"
                          : "Not Linked"}
                    </Badge>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-[11px] text-slate-300">
                    {card.capabilities.map((cap) => (
                      <li key={cap} className="flex items-start gap-1.5">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-sky-400" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
                  <span className="truncate font-mono text-[10px] text-slate-500">
                    {entry?.accountLabel ?? "OAuth 2.0 Managed"}
                  </span>

                  {isConnected ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusyToolkit(card.slug)
                        try {
                          await onDisconnect(card.slug)
                        } finally {
                          setBusyToolkit(null)
                        }
                      }}
                      className="h-7 border-slate-700 text-[11px] text-slate-300 hover:text-rose-300"
                    >
                      {busy ? (
                        <Skeleton className="mr-1 size-3 rounded-full bg-slate-300/70" />
                      ) : (
                        <Unplug className="mr-1 size-3" />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        setBusyToolkit(card.slug)
                        try {
                          await onConnect(card.slug)
                        } catch (error) {
                          toast.add({
                            type: "error",
                            title: `Could not connect ${card.name}`,
                            description: (error as Error).message,
                          })
                        } finally {
                          setBusyToolkit(null)
                        }
                      }}
                      className="h-7 bg-sky-600 text-[11px] text-white hover:bg-sky-500"
                    >
                      {busy ? (
                        <Skeleton className="mr-1 size-3 rounded-full bg-white/70" />
                      ) : (
                        <Link2 className="mr-1 size-3" />
                      )}
                      Connect
                      <ExternalLink className="ml-1 size-2.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Row 3: Scheduled Task & Automation Library */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Automated Store Schedules
            </h2>
            <p className="text-[11px] text-slate-400">
              Toggle recurring workshop check-ins, unanswered quote sweeps,
              dead-stock promotions, and low-stock reorder alerts.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            {automations.filter((a) => a.enabled).length} / {automations.length}{" "}
            Active
          </Badge>
        </div>

        <div className="mt-4 divide-y divide-slate-800/80">
          {automations.map((auto) => (
            <div
              key={auto.key}
              className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-100">
                    {auto.name}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                    <Clock className="size-2.5" />
                    {auto.schedule}
                  </span>
                  {auto.lastRunStatus && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        auto.lastRunStatus === "success"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      Last run: {auto.lastRunStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{auto.description}</p>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-slate-400">
                  {auto.enabled ? "Enabled" : "Paused"}
                </span>
                <Switch
                  checked={auto.enabled}
                  onCheckedChange={(checked) =>
                    onToggleAutomation(auto.key, checked)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
