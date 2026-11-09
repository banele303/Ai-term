"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useAction, useMutation, useQuery } from "convex/react"
import { formatDistanceToNowStrict } from "date-fns"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Camera,
  CheckCircle2,
  DatabaseZap,
  DollarSign,
  MessageSquare,
  Mic,
  MicOff,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { motion } from "motion/react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import {
  FALLBACK_CORE_RETURNS,
  FALLBACK_OVERVIEW,
  FALLBACK_PRICING_SIGNALS,
} from "@/components/autopulse/fallback-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { streamPuterReply } from "@/lib/puter"
import { cn } from "@/lib/utils"

type OverviewData = typeof FALLBACK_OVERVIEW

function CommandCenterLive() {
  const overview = useQuery(api.dashboard.overview, {})
  const coreReturns = useQuery(api.dashboard.listCoreReturns, {})
  const pricingSignals = useQuery(api.dashboard.listPricingSignals, {})

  const seedDemo = useMutation(api.dashboard.seedDemoWorkspace)
  const updateCore = useMutation(api.dashboard.updateCoreReturnStatus)
  const inspectCore = useAction(api.dashboard.inspectCorePhoto)
  const scanMargins = useMutation(api.dashboard.scanMarginSignals)
  const resolveSignal = useMutation(api.dashboard.resolvePricingSignal)
  const setCampaignStatus = useMutation(api.composioTools.setAdCampaignStatus)
  const runOpsPrompt = useAction(api.composioTools.runOpsPrompt)

  return (
    <CommandCenterUI
      isLive
      overview={(overview as OverviewData | undefined) ?? FALLBACK_OVERVIEW}
      coreReturns={coreReturns ?? FALLBACK_CORE_RETURNS}
      pricingSignals={pricingSignals ?? FALLBACK_PRICING_SIGNALS}
      onSeed={async () => {
        const res = await seedDemo({})
        toast.add({
          title: res.seeded ? "AutoPulse Demo Seeded" : "Already Populated",
          description: res.seeded
            ? `Inserted ${res.skus} OEM & aftermarket SKUs, workshops, deals, core returns, and ad campaigns.`
            : res.message,
        })
      }}
      onQuickCommand={async (prompt) => {
        const res = await runOpsPrompt({ prompt })
        return res
      }}
      onRefundCore={async (coreId) => {
        await updateCore({
          coreId: coreId as Id<"core_returns">,
          status: "refunded",
        })
        toast.add({
          title: "Core Deposit Refunded",
          description: "Workshop notified via Whapi.cloud WhatsApp.",
        })
      }}
      onVisionInspectCore={async (coreId, photoUrl) => {
        const res = await inspectCore({
          coreId: coreId as Id<"core_returns">,
          photoUrl,
        })
        toast.add({
          title: res.passed ? "Vision Inspection Passed" : "Core Rejected",
          description: res.conditionSummary,
        })
      }}
      onScanMargins={async () => {
        const res = await scanMargins({})
        toast.add({
          title: "Margin Guardian Scan Complete",
          description: `Flagged ${res.created} new dynamic pricing signal(s).`,
        })
      }}
      onResolveSignal={async (signalId, decision) => {
        await resolveSignal({
          signalId: signalId as Id<"pricing_signals">,
          decision,
        })
        toast.add({
          title:
            decision === "applied"
              ? "B2B & B2C Prices Updated"
              : "Signal Dismissed",
        })
      }}
      onToggleCampaign={async (id, nextStatus) => {
        await setCampaignStatus({
          id: id as Id<"ad_campaigns">,
          status: nextStatus,
        })
        toast.add({
          title: `Campaign ${nextStatus === "paused" ? "Paused" : "Activated"}`,
        })
      }}
    />
  )
}

export default function AutopulseCommandCenterPage() {
  const convexReady = useConvexReady()
  if (convexReady) {
    return <CommandCenterLive />
  }
  return (
    <CommandCenterUI
      isLive={false}
      overview={FALLBACK_OVERVIEW}
      coreReturns={FALLBACK_CORE_RETURNS}
      pricingSignals={FALLBACK_PRICING_SIGNALS}
    />
  )
}

function CommandCenterUI({
  isLive,
  overview,
  coreReturns,
  pricingSignals,
  onSeed,
  onQuickCommand,
  onRefundCore,
  onVisionInspectCore,
  onScanMargins,
  onResolveSignal,
  onToggleCampaign,
}: {
  isLive: boolean
  overview: OverviewData
  coreReturns: Array<{
    _id: string
    partName: string
    depositAmount: number
    status: string
    dueAt: number
    inspectionNotes?: string
    contact?: { name?: string; companyName?: string } | null
  }>
  pricingSignals: Array<{
    _id: string
    reason: string
    previousCost?: number
    newCost?: number
    suggestedB2BPrice: number
    suggestedB2CPrice: number
    rationale: string
    part?: {
      sku?: string
      name?: string
      tradePrice?: number
      price?: number
    } | null
  }>
  onSeed?: () => Promise<void>
  onQuickCommand?: (
    prompt: string
  ) => Promise<{ threadId: string; text: string; toolCallsCount: number }>
  onRefundCore?: (coreId: string) => Promise<void>
  onVisionInspectCore?: (coreId: string, photoUrl: string) => Promise<void>
  onScanMargins?: () => Promise<void>
  onResolveSignal?: (
    signalId: string,
    decision: "applied" | "dismissed"
  ) => Promise<void>
  onToggleCampaign?: (
    id: string,
    nextStatus: "active" | "paused"
  ) => Promise<void>
}) {
  const router = useRouter()
  const [command, setCommand] = React.useState("")
  const [commandReply, setCommandReply] = React.useState<string | null>(null)
  const [runningCmd, setRunningCmd] = React.useState(false)
  const [seeding, setSeeding] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const [inspectUrls, setInspectUrls] = React.useState<Record<string, string>>(
    {}
  )

  const toggleVoiceDictation = () => {
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string
            interimResults: boolean
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>
            }) => void
            onend: () => void
            start: () => void
          }
          webkitSpeechRecognition?: new () => {
            lang: string
            interimResults: boolean
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>
            }) => void
            onend: () => void
            start: () => void
          }
        }
      ).SpeechRecognition ??
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string
            interimResults: boolean
            onresult: (e: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>
            }) => void
            onend: () => void
            start: () => void
          }
        }
      ).webkitSpeechRecognition

    if (!SpeechRec) {
      toast.add({
        title: "Voice Input Unsupported",
        description: "Use Chrome or Edge for Web Speech voice dictation.",
      })
      return
    }
    const rec = new SpeechRec()
    rec.lang = "en-US"
    rec.interimResults = false
    setListening(true)
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? ""
      setCommand((prev) => (prev ? `${prev} ${text}` : text))
    }
    rec.onend = () => setListening(false)
    rec.start()
  }

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return
    setRunningCmd(true)
    setCommandReply("")
    try {
      const campaignsList = overview.campaigns
        .map(
          (c) =>
            `- ${c.name} (${c.platform}, status=${c.status}): Spend ${overview.currency} ${c.spend}, Leads ${c.leadsGenerated}, ROAS ${c.roas.toFixed(2)}x`
        )
        .join("\n")

      await streamPuterReply(
        [
          {
            role: "system",
            content: [
              "You are AutoPulse, an automotive parts and sales assistant.",
              `Store KPIs: Today's revenue ${overview.currency} ${overview.kpis.todaysRevenue}, Active WhatsApp RFQs ${overview.kpis.activeWhatsappRfqs}, Pending core returns ${overview.kpis.pendingCoreCount} (${overview.currency} ${overview.kpis.pendingCoreDepositValue}), Low-stock SKUs ${overview.kpis.lowStockCount}.`,
              "Active Ad Campaigns:",
              campaignsList || "None",
              "Reply concisely and practically without mentioning SDKs or backend databases.",
            ].join("\n"),
          },
          { role: "user", content: command.trim() },
        ],
        (partial) => setCommandReply(partial)
      )
    } catch (error) {
      setCommandReply(null)
      toast.add({
        title: "Command Failed",
        description: (error as Error).message,
      })
    } finally {
      setRunningCmd(false)
    }
  }

  const { kpis, currency } = overview

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header + Seed Action */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
              Command Center
            </h1>
            <Badge className="border-sky-500/30 bg-sky-500/15 font-mono text-[11px] text-sky-300">
              B2B &amp; B2C Store
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Daily parts revenue, workshop quotes, core returns, pricing alerts,
            and ad performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLive && onSeed && (
            <Button
              variant="outline"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true)
                try {
                  await onSeed()
                } finally {
                  setSeeding(false)
                }
              }}
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            >
              {seeding ? (
                <Skeleton className="mr-1.5 size-4 rounded-full bg-emerald-400/60" />
              ) : (
                <DatabaseZap className="mr-1.5 size-4 text-emerald-400" />
              )}
              Load Sample Store Data
            </Button>
          )}
          <Button
            onClick={() => router.push("/dashboard/chat")}
            className="bg-sky-500 text-zinc-950 hover:bg-sky-400"
          >
            <Bot className="mr-1.5 size-4" />
            Open Assistant
          </Button>
        </div>
      </div>

      {/* Quick Command Bar (Voice + Text) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-zinc-900/95 via-zinc-900 to-emerald-950/30 p-4 shadow-[0_0_40px_-15px_rgba(14,165,233,0.45)]"
      >
        <form
          onSubmit={handleQuickSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="flex flex-1 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-300">
              <Sparkles className="size-4" />
            </div>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='Command AutoPulse: "Check TikTok Ads today and pause any ad with zero leads" or "Check Hilux GD6 front pad stock"'
              className="border-zinc-800 bg-zinc-950/80 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={toggleVoiceDictation}
              className={cn(
                "border-zinc-700 bg-zinc-900 text-zinc-300",
                listening && "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
              )}
            >
              {listening ? (
                <MicOff className="mr-1.5 size-4 text-emerald-400" />
              ) : (
                <Mic className="mr-1.5 size-4 text-sky-400" />
              )}
              {listening ? "Listening..." : "Voice"}
            </Button>
            <Button
              type="submit"
              disabled={runningCmd || !command.trim()}
              className="bg-emerald-500 font-medium text-zinc-950 hover:bg-emerald-400"
            >
              {runningCmd ? (
                <Skeleton className="mr-1.5 size-4 rounded-full bg-zinc-950/60" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Execute
            </Button>
          </div>
        </form>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[
            "Check how our TikTok Ads are performing today and pause any ad with zero leads.",
            "Search live Hilux 2.8 GD-6 OEM vs aftermarket front brake pads and compare prices.",
            "List all low-stock parts below reorder threshold.",
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setCommand(preset)}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-left text-[11px] text-zinc-400 transition-colors hover:border-sky-500/40 hover:text-sky-200"
            >
              {preset}
            </button>
          ))}
        </div>

        {commandReply !== null && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-zinc-950/90 p-3.5 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
            {commandReply || (
              <div className="space-y-2 py-1 select-none">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-2 rounded-full bg-emerald-400" />
                  <Skeleton className="h-3.5 w-44 bg-zinc-700/60" />
                </div>
                <Skeleton className="h-3.5 w-full bg-zinc-700/40" />
                <Skeleton className="h-3.5 w-4/5 bg-zinc-700/40" />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 4 Live KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Active WhatsApp RFQs"
          value={String(kpis.activeWhatsappRfqs)}
          subtitle={`${kpis.totalContacts} workshops & buyers in CRM`}
          accent="sky"
          icon={MessageSquare}
        />
        <KpiCard
          title="Today's Parts Revenue"
          value={`${currency} ${kpis.todaysRevenue.toLocaleString()}`}
          subtitle={`Open pipeline: ${currency} ${kpis.pipelineValue.toLocaleString()}`}
          accent="emerald"
          icon={DollarSign}
        />
        <KpiCard
          title="Blended Ad ROAS (TikTok / Meta)"
          value={`${kpis.blendedRoas.toFixed(2)}x`}
          subtitle={`${kpis.totalAdLeads} leads · ${currency} ${kpis.totalAdSpend.toLocaleString()} spend`}
          accent="sky"
          icon={TrendingUp}
        />
        <KpiCard
          title="Pending Core Returns"
          value={`${kpis.pendingCoreCount} units`}
          subtitle={`${currency} ${kpis.pendingCoreDepositValue.toLocaleString()} deposits held`}
          accent="amber"
          icon={RotateCcw}
        />
      </div>

      {/* Differentiator Tabs + Live Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="cores" className="space-y-4">
            <TabsList className="border border-zinc-800 bg-zinc-900/90">
              <TabsTrigger value="cores">
                Core Return &amp; Deposit Tracker ({coreReturns.length})
              </TabsTrigger>
              <TabsTrigger value="margins">
                Margin Guardian ({pricingSignals.length})
              </TabsTrigger>
              <TabsTrigger value="ads">
                TikTok &amp; Meta Ads ({overview.campaigns.length})
              </TabsTrigger>
            </TabsList>

            {/* Module D.1: Core Return & Deposit Tracker */}
            <TabsContent value="cores">
              <Card className="border-zinc-800/90 bg-zinc-900/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-zinc-100">
                    Old-Unit Core Returns &amp; Deposit Refunds
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    Track alternators, turbos, calipers &amp; mechatronics owed
                    back by workshops, review return photos, and release refunds.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coreReturns.map((core) => (
                    <div
                      key={core._id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-zinc-100">
                            {core.partName}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-400">
                            {core.contact?.companyName ?? core.contact?.name ?? "Workshop"}{" "}
                            · Deposit:{" "}
                            <span className="font-mono font-semibold text-emerald-300">
                              {currency} {core.depositAmount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[11px] uppercase",
                            core.status === "inspection_passed" ||
                              core.status === "refunded"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : core.status === "photo_submitted"
                                ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          )}
                        >
                          {core.status.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      {core.inspectionNotes && (
                        <p className="mt-2 text-xs text-zinc-400">
                          {core.inspectionNotes}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Input
                          value={inspectUrls[core._id] ?? ""}
                          onChange={(e) =>
                            setInspectUrls((prev) => ({
                              ...prev,
                              [core._id]: e.target.value,
                            }))
                          }
                          placeholder="Paste core return photo URL to inspect..."
                          className="h-8 flex-1 border-zinc-800 bg-zinc-900 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !isLive ||
                            !onVisionInspectCore ||
                            !inspectUrls[core._id]?.trim()
                          }
                          onClick={() =>
                            onVisionInspectCore?.(
                              core._id,
                              inspectUrls[core._id].trim()
                            )
                          }
                          className="border-sky-500/30 bg-sky-500/10 text-xs text-sky-200"
                        >
                          <Camera className="mr-1.5 size-3.5" />
                          Inspect Photo
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            !isLive ||
                            !onRefundCore ||
                            core.status === "refunded"
                          }
                          onClick={() => onRefundCore?.(core._id)}
                          className="bg-emerald-500 text-xs text-zinc-950 hover:bg-emerald-400"
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" />
                          Release Refund
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Module D.2: Margin Guardian */}
            <TabsContent value="margins">
              <Card className="border-zinc-800/90 bg-zinc-900/60">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                  <div>
                    <CardTitle className="text-base text-zinc-100">
                      Margin Guardian &amp; Dynamic Markup Tiers
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                      Flags SKUs where supplier landed costs rose or fast-moving
                      service kits hit scarcity thresholds.
                    </CardDescription>
                  </div>
                  {isLive && onScanMargins && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onScanMargins()}
                      className="border-zinc-700 bg-zinc-900 text-xs"
                    >
                      <RefreshCw className="mr-1.5 size-3.5" />
                      Scan Catalog
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {pricingSignals.map((sig) => (
                    <div
                      key={sig._id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="size-4 text-amber-400" />
                            <span className="font-medium text-zinc-100">
                              {sig.part?.name ?? "Catalog SKU"}
                            </span>
                            <span className="font-mono text-xs text-zinc-500">
                              {sig.part?.sku}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                            {sig.rationale}
                          </p>
                        </div>
                        <Badge className="border-amber-500/30 bg-amber-500/15 font-mono text-[10px] text-amber-300 uppercase">
                          {sig.reason.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                        <div className="flex flex-wrap gap-4 font-mono text-xs">
                          <div>
                            <span className="text-zinc-500">Suggested B2B: </span>
                            <span className="font-semibold text-sky-300">
                              {currency} {sig.suggestedB2BPrice.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Suggested B2C: </span>
                            <span className="font-semibold text-emerald-300">
                              {currency} {sig.suggestedB2CPrice.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isLive || !onResolveSignal}
                            onClick={() => onResolveSignal?.(sig._id, "dismissed")}
                            className="border-zinc-800 bg-zinc-900 text-xs text-zinc-400"
                          >
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            disabled={!isLive || !onResolveSignal}
                            onClick={() => onResolveSignal?.(sig._id, "applied")}
                            className="bg-sky-500 text-xs text-zinc-950 hover:bg-sky-400"
                          >
                            <ArrowUpRight className="mr-1 size-3.5" />
                            Apply Pricing
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TikTok & Meta Ad Campaigns */}
            <TabsContent value="ads">
              <Card className="border-zinc-800/90 bg-zinc-900/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-zinc-100">
                    Ad Campaigns (TikTok &amp; Meta)
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    Monitor spend, incoming leads, and return on ad spend across
                    active promotions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview.campaigns.map((cmp) => (
                    <div
                      key={cmp._id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-sky-500/30 bg-sky-500/10 font-mono text-[10px] text-sky-300 uppercase"
                          >
                            {cmp.platform.replace("_", " ")}
                          </Badge>
                          <span className="truncate font-medium text-zinc-100">
                            {cmp.name}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-4 font-mono text-xs text-zinc-400">
                          <span>
                            Spend: {currency} {cmp.spend.toLocaleString()}
                          </span>
                          <span>Leads: {cmp.leadsGenerated}</span>
                          <span
                            className={cn(
                              cmp.roas >= 3
                                ? "text-emerald-400"
                                : cmp.roas === 0
                                  ? "text-rose-400"
                                  : "text-amber-300"
                            )}
                          >
                            ROAS: {cmp.roas.toFixed(2)}x
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isLive || !onToggleCampaign}
                        onClick={() =>
                          onToggleCampaign?.(
                            cmp._id,
                            cmp.status === "active" ? "paused" : "active"
                          )
                        }
                        className={cn(
                          "border-zinc-700 text-xs",
                          cmp.status === "active"
                            ? "bg-zinc-900 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        )}
                      >
                        {cmp.status === "active" ? (
                          <>
                            <PauseCircle className="mr-1.5 size-3.5" />
                            Pause Ad
                          </>
                        ) : (
                          <>
                            <PlayCircle className="mr-1.5 size-3.5" />
                            Resume
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Live Agent Activity Feed */}
        <Card className="border-zinc-800/90 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Activity className="size-4 text-emerald-400" />
                Recent Activity
              </CardTitle>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                LIVE
              </span>
            </div>
            <CardDescription className="text-zinc-400">
              Latest customer quotes, messages, and store updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {overview.recentLogs
              .map((log) => formatStoreActivity(log, currency))
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", item.badgeClass)}
                    >
                      {item.channel}
                    </Badge>
                    <span className="text-[11px] text-zinc-500">
                      {formatDistanceToNowStrict(item.timestamp)} ago
                    </span>
                  </div>
                  <div className="mt-1.5 font-medium text-zinc-100">
                    {item.title}
                  </div>
                  {item.detail && (
                    <div className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {item.detail}
                    </div>
                  )}
                </div>
              ))}
            {kpis.lowStockCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                <span>
                  {kpis.lowStockCount} catalog SKU(s) are at or below reorder
                  threshold.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function formatStoreActivity(
  log: {
    _id: string
    app: string
    actionName: string
    status?: string
    error?: string
    payload?: unknown
    timestamp: number
  },
  currency: string
): {
  id: string
  channel: string
  badgeClass: string
  title: string
  detail?: string
  timestamp: number
} | null {
  if (log.status && log.status !== "success") return null
  if (log.error) return null

  const p =
    log.payload && typeof log.payload === "object"
      ? (log.payload as Record<string, unknown>)
      : undefined

  if (p && "error" in p && p.error) return null

  const action = log.actionName.toLowerCase()

  if (action.includes("vin_plate") || action.includes("quoted")) {
    const vin = typeof p?.vin === "string" ? p.vin : undefined
    const total = typeof p?.total === "number" ? p.total : undefined
    return {
      id: log._id,
      channel: "WhatsApp",
      badgeClass: "border-emerald-500/40 text-emerald-300",
      title: "Instant VIN fitment quote sent",
      detail: [
        vin ? `VIN ${vin}` : null,
        total !== undefined ? `${currency} ${total.toLocaleString()}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      timestamp: log.timestamp,
    }
  }

  if (action.includes("tiktok_lead") || action.includes("whatsapp_welcome")) {
    const campaign = typeof p?.campaign === "string" ? p.campaign : undefined
    return {
      id: log._id,
      channel: "Lead Ads",
      badgeClass: "border-sky-500/40 text-sky-300",
      title: "New ad lead welcomed on WhatsApp",
      detail: campaign ? `Campaign: ${campaign}` : undefined,
      timestamp: log.timestamp,
    }
  }

  if (action.includes("gmail") || action.includes("email")) {
    const subject = typeof p?.subject === "string" ? p.subject : undefined
    return {
      id: log._id,
      channel: "Email",
      badgeClass: "border-sky-500/40 text-sky-300",
      title: "Workshop quote email received",
      detail: subject,
      timestamp: log.timestamp,
    }
  }

  if (action.includes("workshop_reengagement")) {
    const sent = typeof p?.sent === "number" ? p.sent : 0
    if (sent <= 0) return null
    return {
      id: log._id,
      channel: "WhatsApp",
      badgeClass: "border-emerald-500/40 text-emerald-300",
      title: `Checked in with ${sent} workshop(s) due for service kits`,
      timestamp: log.timestamp,
    }
  }

  if (action.includes("ad_metrics_sync")) {
    const synced = typeof p?.synced === "number" ? p.synced : 0
    if (synced <= 0) return null
    return {
      id: log._id,
      channel: "Campaigns",
      badgeClass: "border-sky-500/40 text-sky-300",
      title: `Updated metrics for ${synced} ad campaign(s)`,
      timestamp: log.timestamp,
    }
  }

  if (action.includes("core")) {
    return {
      id: log._id,
      channel: "Core Returns",
      badgeClass: "border-amber-500/40 text-amber-300",
      title: action.includes("refund")
        ? "Core deposit refund released"
        : "Core return updated",
      timestamp: log.timestamp,
    }
  }

  if (action.includes("pricing") || action.includes("margin")) {
    return {
      id: log._id,
      channel: "Pricing",
      badgeClass: "border-amber-500/40 text-amber-300",
      title: "Catalog trade & retail pricing updated",
      timestamp: log.timestamp,
    }
  }

  if (action.includes("seed")) {
    return {
      id: log._id,
      channel: "Store",
      badgeClass: "border-zinc-700 text-zinc-300",
      title: "Sample store catalog & pipeline loaded",
      timestamp: log.timestamp,
    }
  }

  if (log.app === "cron") return null

  const friendlyTitle = log.actionName
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    id: log._id,
    channel:
      log.app === "whapi"
        ? "WhatsApp"
        : log.app === "composio"
          ? "Channels"
          : "Store",
    badgeClass:
      log.app === "whapi"
        ? "border-emerald-500/40 text-emerald-300"
        : "border-zinc-700 text-zinc-300",
    title: friendlyTitle,
    timestamp: log.timestamp,
  }
}

function KpiCard({
  title,
  value,
  subtitle,
  accent,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  accent: "sky" | "emerald" | "amber"
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="border-zinc-800/90 bg-zinc-900/70">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">{title}</span>
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border",
                accent === "sky" &&
                  "border-sky-500/30 bg-sky-500/15 text-sky-300",
                accent === "emerald" &&
                  "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
                accent === "amber" &&
                  "border-amber-500/30 bg-amber-500/15 text-amber-300"
              )}
            >
              <Icon className="size-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-zinc-50">
            {value}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
