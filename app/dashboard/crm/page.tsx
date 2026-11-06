"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  GripVertical,
  Layers,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react"
import { motion } from "motion/react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import {
  FALLBACK_PIPELINE,
  FALLBACK_TIMELINE,
} from "@/components/autopulse/fallback-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

export type StageKey =
  | "new_rfq"
  | "fitment_verified"
  | "quoted"
  | "paid"
  | "dispatched"
  | "core_pending"

export const STAGES: {
  key: StageKey
  label: string
  accent: string
  badgeClass: string
}[] = [
  {
    key: "new_rfq",
    label: "New Inquiry",
    accent: "border-t-sky-500/70",
    badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  {
    key: "fitment_verified",
    label: "Fitment Verified",
    accent: "border-t-cyan-500/70",
    badgeClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
  {
    key: "quoted",
    label: "Quoted",
    accent: "border-t-amber-500/70",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  {
    key: "paid",
    label: "Paid",
    accent: "border-t-emerald-500/70",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    key: "dispatched",
    label: "Dispatched",
    accent: "border-t-indigo-500/70",
    badgeClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  },
  {
    key: "core_pending",
    label: "Core Return",
    accent: "border-t-rose-500/70",
    badgeClass: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
]

export interface DealCardItem {
  _id: string
  contactId: string
  channel: string
  requestedParts: {
    sku?: string
    description: string
    quantity: number
    unitPrice?: number
  }[]
  vinNumber?: string
  vehicle?: {
    make?: string
    model?: string
    year?: number
    engineCode?: string
  }
  status: string
  totalAmount: number
  coreDepositTotal?: number
  currency: string
  paymentLink?: string
  updatedAt: number
  notes?: string
  contact: {
    _id: string
    name: string
    companyName?: string
    type: "workshop_b2b" | "retail_b2c" | "supplier"
    phone?: string
    email?: string
    autopilot: boolean
  } | null
}

export interface TimelineEntry {
  _id: string
  channel: string
  direction: "inbound" | "outbound"
  kind: "text" | "image" | "audio" | "document" | "interactive" | "other"
  body: string
  mediaUrl?: string
  extracted?: {
    transcript?: string
    vin?: string
    partNumbers?: string[]
    description?: string
  }
  sentBy: "contact" | "agent" | "staff"
  timestamp: number
}

export default function OmnichannelCrmPage() {
  const convexReady = useConvexReady()
  return convexReady ? <LiveOmnichannelCrm /> : <PreviewOmnichannelCrm />
}

function LiveOmnichannelCrm() {
  const rawColumns = useQuery(api.crm.pipeline, {})
  const moveDealMutation = useMutation(api.crm.moveDeal)
  const setAutopilotMutation = useMutation(api.crm.setAutopilot)
  const createInboundLeadMutation = useMutation(api.crm.createInboundLead)
  const triggerFollowUpMutation = useMutation(api.crm.triggerFollowUpSequence)
  const deleteDealMutation = useMutation(api.crm.deleteDeal)
  const staffSendAction = useAction(api.whapi.staffSend)
  const sendEmailAction = useAction(api.composioTools.sendOutboundEmail)

  const columns = useMemo(() => {
    if (!rawColumns) return null
    const byStatus = new Map<string, DealCardItem[]>()
    for (const col of rawColumns) {
      const target =
        col.status === "awaiting_payment" ? "quoted" : col.status
      const existing = byStatus.get(target) ?? []
      byStatus.set(target, [...existing, ...(col.deals as DealCardItem[])])
    }
    return STAGES.map((s) => ({
      status: s.key,
      deals: byStatus.get(s.key) ?? [],
    }))
  }, [rawColumns])

  const allDeals = useMemo(
    () => (columns ?? []).flatMap((c) => c.deals),
    [columns]
  )
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const activeDeal =
    allDeals.find((d) => d._id === selectedDealId) ?? allDeals[0] ?? null

  const liveTimeline = useQuery(
    api.crm.timeline,
    activeDeal?.contact
      ? { contactId: activeDeal.contact._id as Id<"crm_contacts"> }
      : "skip"
  )

  const timelineSorted: TimelineEntry[] = useMemo(
    () =>
      [...((liveTimeline as TimelineEntry[] | undefined) ?? [])].sort(
        (a, b) => a.timestamp - b.timestamp
      ),
    [liveTimeline]
  )

  const handleMove = async (dealId: string, nextStatus: StageKey) => {
    try {
      await moveDealMutation({
        dealId: dealId as Id<"deals_and_quotes">,
        status: nextStatus,
      })
      toast.add({
        type: "success",
        title: "Deal stage updated",
        description: `Moved deal to ${STAGES.find((s) => s.key === nextStatus)?.label}.`,
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not move deal",
        description: (error as Error).message,
      })
    }
  }

  const handleToggleAutopilot = async (contactId: string, autopilot: boolean) => {
    try {
      await setAutopilotMutation({
        contactId: contactId as Id<"crm_contacts">,
        autopilot,
      })
      toast.add({
        title: autopilot ? "AI Autopilot enabled" : "Manual takeover active",
        description: autopilot
          ? "Whapi & Composio inbound messages will auto-quote again."
          : "Agent paused on this thread so staff can reply directly.",
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not toggle Autopilot",
        description: (error as Error).message,
      })
    }
  }

  const handleSendWhatsApp = async (contactId: string, body: string) => {
    await staffSendAction({
      contactId: contactId as Id<"crm_contacts">,
      body,
    })
    toast.add({
      type: "success",
      title: "WhatsApp message sent via Whapi.cloud",
    })
  }

  const handleSendEmail = async (to: string, subject: string, body: string) => {
    try {
      const res = await sendEmailAction({ to, subject, body })
      if (res.success) {
        toast.add({
          type: "success",
          title: "Email dispatched via Gmail",
          description: `Delivered to ${to}`,
        })
      } else {
        toast.add({
          type: "info",
          title: "Gmail notice",
          description: res.message || "Email queued via AutoPulse router.",
        })
      }
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to send email",
        description: (err as Error).message,
      })
    }
  }

  const handleCreateLead = async (payload: {
    clientName: string
    clientPhone?: string
    clientEmail?: string
    companyName?: string
    channel: any
    customerType?: any
    vehicleMake?: string
    vehicleModel?: string
    vehicleYear?: number
    vinNumber?: string
    partDescription: string
    sku?: string
    quantity?: number
    estimatedAmount: number
    notes?: string
    initialStatus?: StageKey
  }) => {
    try {
      const res = await createInboundLeadMutation(payload)
      toast.add({
        type: "success",
        title: "Inbound Lead Created",
        description: `Logged RFQ for ${payload.clientName} via ${payload.channel.toUpperCase()}.`,
      })
      setSelectedDealId(res.dealId)
      return res
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to create lead",
        description: (err as Error).message,
      })
      throw err
    }
  }

  const handleTriggerFollowUp = async (
    dealId: string,
    sequenceStep: "24h_stock_hold" | "48h_fitment_check" | "72h_price_lock" | "custom",
    channel?: any,
    customMessage?: string
  ) => {
    try {
      const res = await triggerFollowUpMutation({
        dealId: dealId as Id<"deals_and_quotes">,
        sequenceStep,
        channel,
        customMessage,
      })
      toast.add({
        type: "success",
        title: "Follow-Up Sequence Dispatched",
        description: `${res.stepTitle} sent to customer timeline.`,
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Follow-up failed",
        description: (err as Error).message,
      })
    }
  }

  const handleDeleteDeal = async (dealId: string) => {
    if (!confirm("Are you sure you want to permanently delete this deal?")) return
    try {
      await deleteDealMutation({ dealId: dealId as Id<"deals_and_quotes"> })
      toast.add({
        type: "success",
        title: "Deal deleted",
      })
      setSelectedDealId(null)
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to delete deal",
        description: (err as Error).message,
      })
    }
  }

  return (
    <CrmBoardUI
      liveMode
      columns={columns ?? STAGES.map((s) => ({ status: s.key, deals: [] }))}
      loading={!rawColumns}
      activeDeal={activeDeal}
      onSelectDeal={setSelectedDealId}
      timeline={timelineSorted}
      onMoveDeal={handleMove}
      onToggleAutopilot={handleToggleAutopilot}
      onSendWhatsApp={handleSendWhatsApp}
      onSendEmail={handleSendEmail}
      onCreateLead={handleCreateLead}
      onTriggerFollowUp={handleTriggerFollowUp}
      onDeleteDeal={handleDeleteDeal}
    />
  )
}

function PreviewOmnichannelCrm() {
  const [columns, setColumns] = useState<
    { status: StageKey; deals: DealCardItem[] }[]
  >(() =>
    STAGES.map((s) => ({
      status: s.key,
      deals:
        (FALLBACK_PIPELINE.find((p) => p.status === s.key)
          ?.deals as DealCardItem[]) ?? [],
    }))
  )
  const [timeline, setTimeline] = useState<TimelineEntry[]>(
    () => FALLBACK_TIMELINE as TimelineEntry[]
  )
  const allDeals = useMemo(
    () => columns.flatMap((c) => c.deals),
    [columns]
  )
  const [selectedDealId, setSelectedDealId] = useState<string | null>(
    "deal_quote_1"
  )
  const activeDeal =
    allDeals.find((d) => d._id === selectedDealId) ?? allDeals[0] ?? null

  const handleMove = async (dealId: string, nextStatus: StageKey) => {
    setColumns((prev) => {
      let moved: DealCardItem | null = null
      const stripped = prev.map((col) => ({
        ...col,
        deals: col.deals.filter((d) => {
          if (d._id === dealId) {
            moved = { ...d, status: nextStatus, updatedAt: Date.now() }
            return false
          }
          return true
        }),
      }))
      if (!moved) return prev
      return stripped.map((col) =>
        col.status === nextStatus
          ? { ...col, deals: [moved!, ...col.deals] }
          : col
      )
    })
    toast.add({
      type: "success",
      title: "Stage updated (Preview)",
      description: `Moved deal to ${STAGES.find((s) => s.key === nextStatus)?.label}.`,
    })
  }

  const handleToggleAutopilot = async (contactId: string, autopilot: boolean) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        deals: col.deals.map((d) =>
          d.contact?._id === contactId && d.contact
            ? { ...d, contact: { ...d.contact, autopilot } }
            : d
        ),
      }))
    )
    toast.add({
      title: autopilot ? "AI Autopilot enabled" : "Staff takeover active",
    })
  }

  const handleSendWhatsApp = async (_contactId: string, body: string) => {
    setTimeline((prev) => [
      ...prev,
      {
        _id: `preview_${Date.now()}`,
        channel: "whatsapp",
        direction: "outbound",
        kind: "text",
        body,
        sentBy: "staff",
        timestamp: Date.now(),
      },
    ])
    toast.add({
      title: "Simulated Whapi reply recorded",
      description: "Connect NEXT_PUBLIC_CONVEX_URL + WHAPI_API_TOKEN to send live WhatsApp messages.",
    })
  }

  const handleSendEmail = async (to: string, subject: string, body: string) => {
    setTimeline((prev) => [
      ...prev,
      {
        _id: `preview_${Date.now()}`,
        channel: "email",
        direction: "outbound",
        kind: "text",
        body: `Subject: ${subject}\n\n${body}`,
        sentBy: "staff",
        timestamp: Date.now(),
      },
    ])
    toast.add({
      title: "Simulated Email Dispatched",
      description: `Draft sent to ${to}`,
    })
  }

  const handleCreateLead = async (payload: any) => {
    const newDealId = `preview_deal_${Date.now()}`
    const newDeal: DealCardItem = {
      _id: newDealId,
      contactId: `contact_${Date.now()}`,
      channel: payload.channel,
      status: payload.initialStatus || "new_rfq",
      vinNumber: payload.vinNumber,
      totalAmount: payload.estimatedAmount,
      currency: "ZAR",
      updatedAt: Date.now(),
      vehicle: payload.vehicleMake
        ? {
            make: payload.vehicleMake,
            model: payload.vehicleModel,
            year: payload.vehicleYear,
          }
        : undefined,
      requestedParts: [
        {
          description: payload.partDescription,
          quantity: payload.quantity || 1,
          unitPrice: payload.estimatedAmount,
        },
      ],
      notes: payload.notes,
      contact: {
        _id: `contact_${Date.now()}`,
        name: payload.clientName,
        companyName: payload.companyName,
        phone: payload.clientPhone,
        email: payload.clientEmail,
        type: payload.companyName ? "workshop_b2b" : "retail_b2c",
        autopilot: true,
      },
    }

    setColumns((prev) =>
      prev.map((col) =>
        col.status === newDeal.status
          ? { ...col, deals: [newDeal, ...col.deals] }
          : col
      )
    )

    toast.add({
      type: "success",
      title: "Lead Created (Preview)",
      description: `Added ${payload.clientName} to pipeline.`,
    })
    setSelectedDealId(newDealId)
    return { dealId: newDealId }
  }

  const handleTriggerFollowUp = async (
    dealId: string,
    sequenceStep: string,
    channel?: string,
    customMessage?: string
  ) => {
    setTimeline((prev) => [
      ...prev,
      {
        _id: `preview_${Date.now()}`,
        channel: channel || "whatsapp",
        direction: "outbound",
        kind: "text",
        body: `[Automated Cadence: ${sequenceStep}]\n${customMessage || "Automated follow up sent."}`,
        sentBy: "agent",
        timestamp: Date.now(),
      },
    ])
    toast.add({
      type: "success",
      title: "Follow-Up Triggered (Preview)",
      description: `Sequence ${sequenceStep} dispatched.`,
    })
  }

  const handleDeleteDeal = async (dealId: string) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        deals: col.deals.filter((d) => d._id !== dealId),
      }))
    )
    toast.add({
      type: "success",
      title: "Deal removed (Preview)",
    })
    setSelectedDealId(null)
  }

  return (
    <CrmBoardUI
      liveMode={false}
      columns={columns}
      loading={false}
      activeDeal={activeDeal}
      onSelectDeal={setSelectedDealId}
      timeline={timeline}
      onMoveDeal={handleMove}
      onToggleAutopilot={handleToggleAutopilot}
      onSendWhatsApp={handleSendWhatsApp}
      onSendEmail={handleSendEmail}
      onCreateLead={handleCreateLead}
      onTriggerFollowUp={handleTriggerFollowUp}
      onDeleteDeal={handleDeleteDeal}
    />
  )
}

export function channelMeta(channel?: string | null) {
  switch (channel) {
    case "whatsapp":
      return {
        label: "WhatsApp",
        icon: MessageSquare,
        cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      }
    case "email":
      return {
        label: "Gmail",
        icon: Mail,
        cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      }
    case "instagram":
      return {
        label: "Instagram",
        icon: Share2,
        cls: "border-pink-500/30 bg-pink-500/10 text-pink-300",
      }
    case "facebook":
      return {
        label: "Facebook",
        icon: Sparkles,
        cls: "border-blue-500/30 bg-blue-500/10 text-blue-300",
      }
    case "tiktok":
    case "tiktok_lead":
      return {
        label: "TikTok Lead",
        icon: Sparkles,
        cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
      }
    case "meta_lead":
      return {
        label: "Meta Lead",
        icon: Sparkles,
        cls: "border-purple-500/30 bg-purple-500/10 text-purple-300",
      }
    case "dashboard":
    case "web":
      return {
        label: "Website RFQ",
        icon: Building2,
        cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
      }
    case "cars_co_za":
      return {
        label: "Cars.co.za",
        icon: Car,
        cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      }
    default:
      return {
        label: channel ? String(channel).replace(/_/g, " ") : "Inquiry",
        icon: MessageSquare,
        cls: "border-slate-500/30 bg-slate-500/10 text-slate-300",
      }
  }
}

function CrmBoardUI({
  liveMode,
  columns,
  loading,
  activeDeal,
  onSelectDeal,
  timeline,
  onMoveDeal,
  onToggleAutopilot,
  onSendWhatsApp,
  onSendEmail,
  onCreateLead,
  onTriggerFollowUp,
  onDeleteDeal,
}: {
  liveMode: boolean
  columns: { status: StageKey; deals: DealCardItem[] }[]
  loading: boolean
  activeDeal: DealCardItem | null
  onSelectDeal: (dealId: string) => void
  timeline: TimelineEntry[]
  onMoveDeal: (dealId: string, nextStatus: StageKey) => Promise<void>
  onToggleAutopilot: (contactId: string, autopilot: boolean) => Promise<void>
  onSendWhatsApp: (contactId: string, body: string) => Promise<void>
  onSendEmail: (to: string, subject: string, body: string) => Promise<void>
  onCreateLead: (payload: any) => Promise<any>
  onTriggerFollowUp: (
    dealId: string,
    sequenceStep: "24h_stock_hold" | "48h_fitment_check" | "72h_price_lock" | "custom",
    channel?: any,
    customMessage?: string
  ) => Promise<void>
  onDeleteDeal: (dealId: string) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<"kanban" | "cadence" | "integrations">("kanban")
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [searchFilter, setSearchFilter] = useState("")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)

  // Drag and drop state & fallback ref for 100% reliable HTML5 drag transfer
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null)
  const draggedDealIdRef = useRef<string | null>(null)

  // Filtered columns by search & channel
  const filteredColumns = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    return columns.map((col) => ({
      ...col,
      deals: col.deals.filter((d) => {
        if (channelFilter !== "all" && d.channel !== channelFilter) return false
        if (!q) return true
        const hay = [
          d.contact?.name,
          d.contact?.companyName,
          d.vinNumber,
          d.vehicle?.make,
          d.vehicle?.model,
          d.notes,
          ...d.requestedParts.map((p) => `${p.sku ?? ""} ${p.description}`),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      }),
    }))
  }, [columns, searchFilter, channelFilter])

  const allDeals = useMemo(() => columns.flatMap((c) => c.deals), [columns])

  const totalPipeline = useMemo(
    () => allDeals.reduce((sum, d) => sum + d.totalAmount, 0),
    [allDeals]
  )

  const dealsNeedingFollowUp = useMemo(() => {
    return allDeals.filter(
      (d) => d.status === "new_rfq" || d.status === "fitment_verified" || d.status === "quoted"
    )
  }, [allDeals])

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeDeal?.contact || !replyText.trim()) return
    setSending(true)
    try {
      if (activeDeal.channel === "email" && activeDeal.contact.email) {
        await onSendEmail(
          activeDeal.contact.email,
          `AutoPulse Follow-up • Quote ${activeDeal._id.slice(-6)}`,
          replyText.trim()
        )
      } else {
        await onSendWhatsApp(activeDeal.contact._id, replyText.trim())
      }
      setReplyText("")
    } catch (error) {
      toast.add({
        type: "error",
        title: "Failed to send message",
        description: (error as Error).message,
      })
    } finally {
      setSending(false)
    }
  }

  const handleGenerateAiFollowUp = () => {
    if (!activeDeal) return
    const firstName = activeDeal.contact?.name?.split(" ")[0] || "Customer"
    const vehicle = [
      activeDeal.vehicle?.year,
      activeDeal.vehicle?.make,
      activeDeal.vehicle?.model,
    ]
      .filter(Boolean)
      .join(" ")
    const parts = activeDeal.requestedParts.map((p) => p.description).join(", ")
    const quoteUrl = activeDeal.paymentLink || `/pay/${activeDeal._id}`

    const draft =
      `Hi ${firstName}! Marco from AutoPulse Commercial Parts following up.\n\n` +
      `We've checked warehouse stock for your ${vehicle || "vehicle"} (${parts}). OEM & aftermarket units are confirmed and ready for dispatch.\n\n` +
      `You can review your formal quotation and lock this pricing here: ${quoteUrl}\n\n` +
      `Would you like us to arrange same-day courier delivery to your workshop?`

    setReplyText(draft)
    toast.add({
      type: "success",
      title: "AI Co-Pilot Draft Generated",
      description: "Auto-drafted personalized follow-up based on vehicle specs and quote.",
    })
  }

  return (
    <div className="flex min-h-screen flex-col gap-5 bg-[#090D15] p-5 text-zinc-100">
      {/* Top Header Bar — Gemini Minimalist Aesthetic with Dashboard Navigator */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
          >
            <ChevronLeft className="size-3.5" />
            Dashboard
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Sparkles className="size-4" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Agentic Automotive CRM
              </h1>
              <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px] font-mono">
                Omnichannel • Whapi + Composio
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Autonomous pipeline with drag &amp; drop Kanban, automated follow-up sequences &amp; live multi-channel dispatch.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Active Pipeline Metric */}
          <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-1.5 text-right backdrop-blur-md">
            <div className="text-[10px] tracking-wider text-zinc-400 uppercase font-mono">
              Total Pipeline Value
            </div>
            <div className="font-mono text-sm font-semibold text-emerald-400">
              ZAR {totalPipeline.toLocaleString()}
            </div>
          </div>

          {/* New Lead / RFQ Button */}
          <Button
            size="sm"
            onClick={() => setIsLeadModalOpen(true)}
            className="h-9 gap-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-md cursor-pointer rounded-xl"
          >
            <Plus className="size-4" />
            New Deal / RFQ
          </Button>
        </div>
      </div>

      {/* Main Navigation Tabs & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-zinc-900/70 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveTab("kanban")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "kanban"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="size-3.5" />
            Kanban Board
            <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.2 text-[10px] font-mono">
              {allDeals.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cadence")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "cadence"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="size-3.5 text-amber-400" />
            Follow-Up Cadence
            <span className="rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.2 text-[10px] font-mono">
              {dealsNeedingFollowUp.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("integrations")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "integrations"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Radio className="size-3.5 text-cyan-400" />
            Lead Capture &amp; Integrations
          </button>
        </div>

        {/* Search & Channel Selector */}
        <div className="flex items-center gap-2.5">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="h-8 rounded-lg border border-white/[0.08] bg-zinc-900/90 px-2.5 text-xs text-zinc-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Gmail / Email</option>
            <option value="tiktok_lead">TikTok Lead</option>
            <option value="facebook">Facebook / Meta</option>
            <option value="instagram">Instagram</option>
            <option value="dashboard">Website RFQ</option>
          </select>

          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search buyer, VIN, vehicle, SKU..."
            className="h-8 w-60 border-white/[0.08] bg-zinc-900/80 text-xs text-zinc-100 placeholder:text-zinc-500 rounded-lg"
          />
        </div>
      </div>

      {/* VIEW 1: FULL-WIDTH KANBAN PIPELINE (EXPANDED PRO CARDS) */}
      {activeTab === "kanban" && (
        <div className="w-full overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-zinc-800">
          <div className="flex gap-4 min-w-[1500px] xl:grid xl:grid-cols-6 xl:min-w-0">
            {filteredColumns.map((col) => {
              const stageMeta = STAGES.find((s) => s.key === col.status)!
              const stageIndex = STAGES.findIndex((s) => s.key === col.status)
              const colValue = col.deals.reduce((s, d) => s + d.totalAmount, 0)
              const isOver = dragOverStage === col.status

              return (
                <div
                  key={col.status}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                    if (dragOverStage !== col.status) {
                      setDragOverStage(col.status)
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setDragOverStage(col.status)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dragOverStage === col.status) setDragOverStage(null)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const dealId = e.dataTransfer.getData("text/plain") || draggedDealIdRef.current
                    if (dealId) {
                      void onMoveDeal(dealId, col.status)
                    }
                    draggedDealIdRef.current = null
                    setDragOverStage(null)
                    setDraggingDealId(null)
                  }}
                  className={`flex min-w-[280px] xl:min-w-0 min-h-[660px] flex-col rounded-2xl border transition-all duration-200 p-3 backdrop-blur-md ${
                    isOver
                      ? "border-sky-400/90 bg-sky-950/25 ring-2 ring-sky-500/40 shadow-[0_0_25px_-5px_rgba(56,189,248,0.35)]"
                      : "border-white/[0.08] bg-zinc-900/45 hover:border-zinc-800"
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 pt-1 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-100">
                        {stageMeta.label}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                        {col.deals.length}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-zinc-400">
                      R{colValue.toLocaleString()}
                    </span>
                  </div>

                  {/* Column Dropzone / Cards List */}
                  <div className="mt-3 flex flex-1 flex-col gap-3">
                    {loading && (
                      <div className="space-y-3 p-1">
                        <Skeleton className="h-28 w-full rounded-2xl bg-zinc-800/60" />
                        <Skeleton className="h-28 w-full rounded-2xl bg-zinc-800/40" />
                      </div>
                    )}

                    {!loading && col.deals.length === 0 && (
                      <div
                        className={`pointer-events-none flex flex-1 items-center justify-center rounded-2xl border border-dashed p-6 text-center text-xs transition-colors ${
                          isOver
                            ? "border-sky-400/80 bg-sky-500/10 text-sky-200"
                            : "border-zinc-800/80 text-zinc-600"
                        }`}
                      >
                        {isOver ? `Drop deal in ${stageMeta.label}` : `No deals in ${stageMeta.label}`}
                      </div>
                    )}

                    {col.deals.map((deal) => {
                      const ch = channelMeta(deal.channel)
                      const ChIcon = ch.icon
                      const isSelected = activeDeal?._id === deal._id
                      const isDraggingThis = draggingDealId === deal._id
                      const prevStage = stageIndex > 0 ? STAGES[stageIndex - 1] : null
                      const nextStage = stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null

                      return (
                        <div
                          key={deal._id}
                          draggable={true}
                          onDragStart={(e) => {
                            draggedDealIdRef.current = deal._id
                            e.dataTransfer.setData("text/plain", deal._id)
                            e.dataTransfer.effectAllowed = "move"
                            setDraggingDealId(deal._id)
                          }}
                          onDragEnd={() => {
                            draggedDealIdRef.current = null
                            setDraggingDealId(null)
                            setDragOverStage(null)
                          }}
                          onClick={() => {
                            onSelectDeal(deal._id)
                            setIsDetailDrawerOpen(true)
                          }}
                          className={`group relative cursor-grab active:cursor-grabbing rounded-2xl border p-3.5 transition-all select-none space-y-2.5 ${
                            isDraggingThis
                              ? "opacity-30 border-sky-400 scale-95 ring-2 ring-sky-400/40"
                              : isSelected
                                ? "border-sky-500/80 bg-zinc-900/95 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)] ring-1 ring-sky-500/50"
                                : "border-white/[0.08] bg-zinc-900/80 hover:bg-zinc-800/90 hover:border-zinc-700 hover:shadow-lg"
                          }`}
                        >
                          {/* Row 1: Name, Channel Badge & B2B Badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm text-zinc-100 truncate tracking-tight">
                                {deal.contact?.companyName || deal.contact?.name || "Unknown Buyer"}
                              </div>
                              {deal.contact?.companyName && deal.contact?.name && (
                                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                  Attn: {deal.contact.name}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${ch.cls}`}
                              >
                                <ChIcon className="size-3" />
                                {ch.label}
                              </span>
                              {deal.contact?.type === "workshop_b2b" ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                                  <Building2 className="size-2.5" />
                                  B2B Trade
                                </span>
                              ) : (
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
                                  Retail B2C
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Vehicle Specs & VIN Tag */}
                          {(deal.vehicle?.make || deal.vinNumber) && (
                            <div className="rounded-xl border border-white/[0.05] bg-zinc-950/70 p-2 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                                <Car className="size-3.5 text-sky-400 shrink-0" />
                                <span className="truncate">
                                  {[
                                    deal.vehicle?.year,
                                    deal.vehicle?.make,
                                    deal.vehicle?.model,
                                    deal.vehicle?.engineCode && `(${deal.vehicle.engineCode})`,
                                  ]
                                    .filter(Boolean)
                                    .join(" ") || "Vehicle on File"}
                                </span>
                              </div>
                              {deal.vinNumber && (
                                <div className="text-[10px] font-mono text-sky-400/90 tracking-wider">
                                  VIN: {deal.vinNumber}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Row 3: Requested Parts Lines */}
                          {deal.requestedParts && deal.requestedParts.length > 0 && (
                            <div className="space-y-1 text-xs text-zinc-300">
                              {deal.requestedParts.slice(0, 2).map((part, i) => (
                                <div key={i} className="flex items-center justify-between truncate">
                                  <span className="truncate">
                                    <span className="text-zinc-500 font-mono">{part.quantity}×</span> {part.description}
                                  </span>
                                </div>
                              ))}
                              {deal.requestedParts.length > 2 && (
                                <div className="text-[10px] text-zinc-500">
                                  +{deal.requestedParts.length - 2} more items
                                </div>
                              )}
                            </div>
                          )}

                          {/* Row 4: Pricing & Stage Jump Buttons */}
                          <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                            <div>
                              <div className="font-mono text-sm font-bold text-emerald-400">
                                {deal.totalAmount > 0
                                  ? `ZAR ${deal.totalAmount.toLocaleString()}`
                                  : "Awaiting Quote"}
                              </div>
                              {(deal.coreDepositTotal ?? 0) > 0 && (
                                <div className="text-[10px] text-amber-300 font-mono">
                                  Incl. R{deal.coreDepositTotal} core
                                </div>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {prevStage && (
                                <button
                                  type="button"
                                  title={`Move back to ${prevStage.label}`}
                                  onClick={() => void onMoveDeal(deal._id, prevStage.key)}
                                  className="flex items-center rounded-lg border border-white/[0.08] bg-zinc-800/80 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white transition cursor-pointer"
                                >
                                  <ChevronLeft className="size-3.5" />
                                </button>
                              )}
                              {nextStage && (
                                <button
                                  type="button"
                                  title={`Advance to ${nextStage.label}`}
                                  onClick={() => void onMoveDeal(deal._id, nextStage.key)}
                                  className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25 transition cursor-pointer"
                                >
                                  <span>Next</span>
                                  <ChevronRight className="size-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Active Drag Dropzone Indicator */}
                    {isOver && col.deals.length > 0 && (
                      <div className="pointer-events-none rounded-2xl border-2 border-dashed border-sky-400/80 bg-sky-500/10 py-4 text-center text-xs font-medium text-sky-300 animate-pulse">
                        Drop into {stageMeta.label}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: FOLLOW-UP CADENCE ENGINE */}
      {activeTab === "cadence" && (
        <CadenceSection
          deals={dealsNeedingFollowUp}
          onSelectDeal={(dealId) => {
            onSelectDeal(dealId)
            setIsDetailDrawerOpen(true)
          }}
          onTriggerFollowUp={onTriggerFollowUp}
          onMoveDeal={onMoveDeal}
        />
      )}

      {/* VIEW 3: LEAD CAPTURE & INTEGRATIONS */}
      {activeTab === "integrations" && (
        <IntegrationsSection onOpenLeadModal={() => setIsLeadModalOpen(true)} />
      )}

      {/* SLIDE-OVER OMNICHANNEL CONTACT & TIMELINE DRAWER (OPENS ON DEMAND ONLY) */}
      {isDetailDrawerOpen && activeDeal && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setIsDetailDrawerOpen(false)}
        >
          <div
            className="relative flex h-full w-full max-w-xl flex-col border-l border-white/[0.08] bg-zinc-950 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <OmnichannelDetailDrawer
              activeDeal={activeDeal}
              timeline={timeline}
              replyText={replyText}
              setReplyText={setReplyText}
              sending={sending}
              submitReply={submitReply}
              onToggleAutopilot={onToggleAutopilot}
              onMoveDeal={onMoveDeal}
              onDeleteDeal={onDeleteDeal}
              onTriggerFollowUp={onTriggerFollowUp}
              onGenerateAiFollowUp={handleGenerateAiFollowUp}
              onClose={() => setIsDetailDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW INBOUND LEAD / RFQ */}
      <CreateLeadModal
        open={isLeadModalOpen}
        onOpenChange={setIsLeadModalOpen}
        onCreateLead={onCreateLead}
      />
    </div>
  )
}

function OmnichannelDetailDrawer({
  activeDeal,
  timeline,
  replyText,
  setReplyText,
  sending,
  submitReply,
  onToggleAutopilot,
  onMoveDeal,
  onDeleteDeal,
  onTriggerFollowUp,
  onGenerateAiFollowUp,
  onClose,
}: {
  activeDeal: DealCardItem | null
  timeline: TimelineEntry[]
  replyText: string
  setReplyText: (text: string) => void
  sending: boolean
  submitReply: (e: React.FormEvent) => Promise<void>
  onToggleAutopilot: (contactId: string, autopilot: boolean) => Promise<void>
  onMoveDeal: (dealId: string, nextStatus: StageKey) => Promise<void>
  onDeleteDeal: (dealId: string) => Promise<void>
  onTriggerFollowUp: (
    dealId: string,
    sequenceStep: "24h_stock_hold" | "48h_fitment_check" | "72h_price_lock" | "custom",
    channel?: any,
    customMessage?: string
  ) => Promise<void>
  onGenerateAiFollowUp: () => void
  onClose?: () => void
}) {
  if (!activeDeal) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-zinc-500">
        <MessageSquare className="size-8 text-zinc-600 mb-2" />
        Select any deal card to inspect unified messages, trigger follow-up sequences, or draft automated replies.
      </div>
    )
  }

  const currentStageIndex = STAGES.findIndex((s) => s.key === activeDeal.status)

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Contact Header + Autopilot Switch + Close Button */}
      <div className="border-b border-white/[0.08] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                {activeDeal.contact?.companyName ??
                  activeDeal.contact?.name ??
                  "Customer Thread"}
              </h2>
              {activeDeal.vinNumber && (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                  {activeDeal.vinNumber}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
              {activeDeal.contact?.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3 text-emerald-400" />+
                  {activeDeal.contact.phone}
                </span>
              )}
              {activeDeal.contact?.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3 text-sky-400" />
                  {activeDeal.contact.email}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeDeal.contact && (
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-2 py-1">
                <Bot className="size-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-zinc-300">
                  Autopilot
                </span>
                <Switch
                  size="sm"
                  checked={activeDeal.contact.autopilot}
                  onCheckedChange={(checked) =>
                    onToggleAutopilot(activeDeal.contact!._id, checked)
                  }
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => onDeleteDeal(activeDeal._id)}
              title="Delete deal"
              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition cursor-pointer"
            >
              <Trash2 className="size-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close drawer"
                className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Stage Progression Pills */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {STAGES.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onMoveDeal(activeDeal._id, s.key)}
              className={`rounded-lg px-2 py-0.5 text-[10px] font-medium transition cursor-pointer shrink-0 ${
                activeDeal.status === s.key
                  ? "bg-sky-500/20 border border-sky-500/40 text-sky-300 font-semibold"
                  : idx <= currentStageIndex
                    ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Quick Checkout Link Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 py-1.5 text-[11px]">
          <span className="text-zinc-400">
            Quote Value:{" "}
            <strong className="font-mono text-zinc-200">
              {activeDeal.currency} {activeDeal.totalAmount.toLocaleString()}
            </strong>
          </span>
          <a
            href={activeDeal.paymentLink || `/pay/${activeDeal._id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300"
          >
            Invoice Link
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {/* Unified Message Timeline */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-slate-500">
            No omnichannel communications logged yet for this contact.
          </div>
        ) : (
          timeline.map((msg) => {
            const ch = channelMeta(msg.channel)
            const ChIcon = ch.icon
            const isOutbound = msg.direction === "outbound"

            return (
              <div
                key={msg._id}
                className={`flex flex-col ${
                  isOutbound ? "items-end" : "items-start"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <ChIcon className="size-3" />
                  <span>{ch.label}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    {msg.sentBy === "agent" ? (
                      <>
                        <Bot className="size-2.5 text-emerald-400" /> AutoPulse Agent
                      </>
                    ) : msg.sentBy === "staff" ? (
                      <>
                        <User className="size-2.5 text-sky-400" /> Parts Desk
                      </>
                    ) : (
                      "Buyer"
                    )}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] rounded-xl border px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    isOutbound
                      ? "border-sky-500/30 bg-sky-950/40 text-slate-100"
                      : "border-slate-800 bg-slate-950/90 text-slate-200"
                  }`}
                >
                  {msg.kind === "image" && (
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      <Camera className="size-3" />
                      Vision Photo Analyzed
                    </div>
                  )}
                  {msg.kind === "audio" && (
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                      <Mic className="size-3" />
                      Voice Note Transcribed
                    </div>
                  )}

                  <div>{msg.body || msg.extracted?.transcript}</div>

                  {msg.extracted &&
                    (msg.extracted.vin ||
                      (msg.extracted.partNumbers?.length ?? 0) > 0) && (
                      <div className="mt-2 space-y-1 rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-2 text-[10px]">
                        {msg.extracted.vin && (
                          <div className="font-mono text-emerald-300">
                            VIN Extracted: {msg.extracted.vin}
                          </div>
                        )}
                        {msg.extracted.partNumbers &&
                          msg.extracted.partNumbers.length > 0 && (
                            <div className="font-mono text-sky-300">
                              OEM #: {msg.extracted.partNumbers.join(", ")}
                            </div>
                          )}
                        {msg.extracted.description && (
                          <div className="text-slate-300">
                            {msg.extracted.description}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* AI Cadence Bar & Reply Composer */}
      <div className="border-t border-slate-800/90 p-3 bg-slate-950/40">
        {/* Quick Follow-Up Generators */}
        <div className="mb-2 flex items-center justify-between gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onGenerateAiFollowUp}
            className="h-7 gap-1 border border-sky-500/20 bg-sky-500/10 px-2 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 cursor-pointer"
          >
            <Sparkles className="size-3 text-sky-400" />
            AI Co-Pilot Draft
          </Button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTriggerFollowUp(activeDeal._id, "24h_stock_hold")}
              title="Send 24h Stock Hold alert"
              className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              24h Alert
            </button>
            <button
              type="button"
              onClick={() => onTriggerFollowUp(activeDeal._id, "48h_fitment_check")}
              title="Send 48h Fitment Check"
              className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-1 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
            >
              48h Fitment
            </button>
          </div>
        </div>

        <form onSubmit={submitReply}>
          <div className="flex items-center gap-2">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={
                activeDeal.channel === "email"
                  ? `Email ${activeDeal.contact?.email ?? "buyer"} via Gmail...`
                  : activeDeal.contact?.phone
                    ? `WhatsApp +${activeDeal.contact.phone} directly...`
                    : "Type outbound message..."
              }
              disabled={sending}
              className="border-slate-800 bg-slate-950 text-xs text-slate-100 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!replyText.trim() || sending}
              className="bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
            >
              {sending ? (
                <Skeleton className="size-3.5 rounded-full bg-white/70" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CadenceSection({
  deals,
  onSelectDeal,
  onTriggerFollowUp,
  onMoveDeal,
}: {
  deals: DealCardItem[]
  onSelectDeal: (dealId: string) => void
  onTriggerFollowUp: (
    dealId: string,
    sequenceStep: "24h_stock_hold" | "48h_fitment_check" | "72h_price_lock" | "custom",
    channel?: any,
    customMessage?: string
  ) => Promise<void>
  onMoveDeal: (dealId: string, nextStatus: StageKey) => Promise<void>
}) {
  return (
    <div className="space-y-6">
      {/* Sequences Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Sequence A • 24h Stock Hold
            </span>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
              High Urgency
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Notifies buyer that warehouse parts reservation is held for 24 hours. Includes direct quote payment URL.
          </p>
          <div className="mt-3 text-[11px] font-mono text-slate-400">
            Average conversion lift: <span className="text-emerald-400 font-semibold">+28%</span>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Sequence B • 48h Fitment Check
            </span>
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
              Technical
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Reassures technician or workshop with 100% VIN fitment guarantee and 12-month manufacturer replacement warranty.
          </p>
          <div className="mt-3 text-[11px] font-mono text-slate-400">
            Trust rating impact: <span className="text-cyan-400 font-semibold">99.4%</span>
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <Zap className="size-3.5" />
              Sequence C • 72h Price Lock
            </span>
            <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]">
              Final Notice
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Alerts buyer that quote tariff pricing expires in 24 hours. Offers promo code <strong className="text-rose-200">AUTOPULSE5</strong> for 5% trade discount.
          </p>
          <div className="mt-3 text-[11px] font-mono text-slate-400">
            Re-engagement rate: <span className="text-emerald-400 font-semibold">41.2%</span>
          </div>
        </div>
      </div>

      {/* Cadence Queue Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Active Follow-Up Pipeline Queue
            </h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
              {deals.length} deals queued
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Automated via WhatsApp (Whapi) &amp; Gmail (Composio)
          </span>
        </div>

        {deals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No deals currently pending follow-up cadence.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {deals.map((deal) => {
              const ch = channelMeta(deal.channel)
              const ChIcon = ch.icon
              const daysOld = Math.max(
                0,
                Math.floor((Date.now() - deal.updatedAt) / (1000 * 60 * 60 * 24))
              )

              return (
                <div
                  key={deal._id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-slate-900/90 transition"
                >
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => onSelectDeal(deal._id)}
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950">
                      <ChIcon className="size-4 text-sky-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100">
                          {deal.contact?.companyName ?? deal.contact?.name ?? "Customer"}
                        </span>
                        <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-medium ${ch.cls}`}>
                          {ch.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {deal.vehicle?.make
                          ? `${deal.vehicle.year ?? ""} ${deal.vehicle.make} ${deal.vehicle.model ?? ""}`
                          : deal.vinNumber || "Parts RFQ"}
                        {" · "}
                        <span className="text-slate-300">
                          {deal.requestedParts.map((p) => p.description).join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-emerald-400">
                        {deal.currency} {deal.totalAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Last activity {daysOld === 0 ? "today" : `${daysOld}d ago`}
                      </div>
                    </div>

                    {/* Cadence Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onTriggerFollowUp(deal._id, "24h_stock_hold", deal.channel)
                        }
                        className="h-7 border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[10px] cursor-pointer"
                      >
                        ⚡ 24h Stock Hold
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onTriggerFollowUp(deal._id, "48h_fitment_check", deal.channel)
                        }
                        className="h-7 border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-[10px] cursor-pointer"
                      >
                        ⚡ 48h Fitment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onTriggerFollowUp(deal._id, "72h_price_lock", deal.channel)
                        }
                        className="h-7 border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-[10px] cursor-pointer"
                      >
                        ⚡ 72h Price Lock
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function IntegrationsSection({ onOpenLeadModal }: { onOpenLeadModal: () => void }) {
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [copiedApi, setCopiedApi] = useState(false)

  const embedSnippet = `<script src="https://autopulse.co.za/sdk/rfq-widget.js" data-hub="johannesburg" async></script>\n<div id="autopulse-rfq-container"></div>`
  const apiEndpoint = `POST https://successful-panda-540.convex.cloud/api/crm/createInboundLead`

  const handleCopy = (text: string, type: "snippet" | "api") => {
    navigator.clipboard.writeText(text)
    if (type === "snippet") setCopiedSnippet(true)
    else setCopiedApi(true)
    setTimeout(() => {
      setCopiedSnippet(false)
      setCopiedApi(false)
    }, 2000)
    toast.add({
      type: "success",
      title: "Copied to clipboard",
    })
  }

  return (
    <div className="space-y-6">
      {/* Active Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <MessageSquare className="size-4" />
              </div>
              <span className="text-xs font-semibold text-slate-100">WhatsApp</span>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
              Whapi.cloud Active
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Instant quote delivery &amp; voice note transcription for South African mechanics.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Mail className="size-4" />
              </div>
              <span className="text-xs font-semibold text-slate-100">Gmail / Email</span>
            </div>
            <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px]">
              Composio Active
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Connected via Google OAuth to banelesouthflow@gmail.com for commercial RFQs.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Sparkles className="size-4" />
              </div>
              <span className="text-xs font-semibold text-slate-100">TikTok Lead Ads</span>
            </div>
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
              @autopulse_za
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Viral mechanic videos &amp; inbound DM auto-reply directly into pipeline.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Share2 className="size-4" />
              </div>
              <span className="text-xs font-semibold text-slate-100">Meta / Facebook</span>
            </div>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
              Lead Webhook
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Instant lead ingestion from Facebook Parts Specials &amp; Instagram Ads.
          </p>
        </div>
      </div>

      {/* Embed RFQ Form & Chrome Extension Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Web Form Embed Widget */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Website RFQ Lead Form Widget
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCopy(embedSnippet, "snippet")}
              className="h-7 gap-1 text-[11px] cursor-pointer border-slate-700 bg-slate-800 text-slate-200"
            >
              {copiedSnippet ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              {copiedSnippet ? "Copied" : "Copy Widget Script"}
            </Button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Embed this widget on your dealership or workshop website. Incoming buyer RFQs automatically land in your AutoPulse CRM Kanban board with instant WhatsApp confirmation.
          </p>
          <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
            {embedSnippet}
          </pre>
        </div>

        {/* Chrome Extension & Webhook API */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Chrome Extension &amp; Webhook API
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCopy(apiEndpoint, "api")}
              className="h-7 gap-1 text-[11px] cursor-pointer border-slate-700 bg-slate-800 text-slate-200"
            >
              {copiedApi ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              {copiedApi ? "Copied" : "Copy Endpoint"}
            </Button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Clip parts &amp; VINs directly from supplier portals (Goldwagen, Midas, Cars.co.za) into this CRM using our Chrome Extension or POST directly to our Convex endpoint.
          </p>
          <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto">
            {apiEndpoint}
          </pre>
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={onOpenLeadModal}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs cursor-pointer"
            >
              <Plus className="size-3.5 mr-1" />
              Test Inbound Form Manually
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateLeadModal({
  open,
  onOpenChange,
  onCreateLead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateLead: (payload: any) => Promise<any>
}) {
  const [clientName, setClientName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [clientPhone, setClientPhone] = useState("+27 ")
  const [clientEmail, setClientEmail] = useState("")
  const [channel, setChannel] = useState("whatsapp")
  const [vehicleMake, setVehicleMake] = useState("Volkswagen")
  const [vehicleModel, setVehicleModel] = useState("Golf 7 GTI")
  const [vehicleYear, setVehicleYear] = useState(2017)
  const [vinNumber, setVinNumber] = useState("")
  const [partDescription, setPartDescription] = useState("")
  const [estimatedAmount, setEstimatedAmount] = useState(3850)
  const [initialStatus, setInitialStatus] = useState<StageKey>("new_rfq")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientName.trim() || !partDescription.trim()) {
      toast.add({
        type: "error",
        title: "Missing details",
        description: "Please specify client name and requested part.",
      })
      return
    }

    setSubmitting(true)
    try {
      await onCreateLead({
        clientName: clientName.trim(),
        companyName: companyName.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        channel,
        vehicleMake: vehicleMake.trim() || undefined,
        vehicleModel: vehicleModel.trim() || undefined,
        vehicleYear: vehicleYear || undefined,
        vinNumber: vinNumber.trim().toUpperCase() || undefined,
        partDescription: partDescription.trim(),
        estimatedAmount: Number(estimatedAmount) || 0,
        initialStatus,
        notes: notes.trim() || undefined,
      })
      onOpenChange(false)
      // reset form
      setClientName("")
      setCompanyName("")
      setPartDescription("")
      setVinNumber("")
      setNotes("")
    } catch {
      // toast already handled
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-slate-800 bg-slate-950 p-6 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Plus className="size-4 text-sky-400" />
            Create Inbound RFQ / Customer Deal
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Log a new inquiry from WhatsApp, Facebook, TikTok, Website Form, or Parts Desk walk-in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Channel & Initial Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Inbound Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-slate-800 bg-slate-900 px-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                <option value="whatsapp">WhatsApp (Whapi)</option>
                <option value="email">Gmail / Email</option>
                <option value="tiktok_lead">TikTok Lead (@autopulse_za)</option>
                <option value="facebook">Facebook / Meta Ads</option>
                <option value="instagram">Instagram DM</option>
                <option value="dashboard">Website RFQ Form</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Initial Pipeline Stage
              </label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as StageKey)}
                className="mt-1 w-full h-8 rounded-md border border-slate-800 bg-slate-900 px-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                <option value="new_rfq">New Inquiry (Unverified)</option>
                <option value="fitment_verified">Fitment Verified</option>
                <option value="quoted">Direct Quote</option>
              </select>
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Customer Name *
              </label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Marco van Wyk"
                required
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Company / Workshop (Optional)
              </label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Apex Autos"
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300">
                WhatsApp / Mobile Number
              </label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+27 82 450 1928"
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Email Address
              </label>
              <Input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="marco@apexautos.co.za"
                type="email"
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs"
              />
            </div>
          </div>

          {/* Vehicle Specs */}
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3 space-y-3">
            <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1">
              <Car className="size-3" />
              Vehicle Specifications
            </span>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400">Make</label>
                <Input
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="Volkswagen"
                  className="mt-0.5 h-7 border-slate-800 bg-slate-950 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Model</label>
                <Input
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="Golf 7 GTI"
                  className="mt-0.5 h-7 border-slate-800 bg-slate-950 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Year</label>
                <Input
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(Number(e.target.value))}
                  type="number"
                  className="mt-0.5 h-7 border-slate-800 bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400">
                VIN Number (17 digits)
              </label>
              <Input
                value={vinNumber}
                onChange={(e) => setVinNumber(e.target.value.toUpperCase())}
                placeholder="WVWZZZAUZHP104829"
                maxLength={17}
                className="mt-0.5 h-7 border-slate-800 bg-slate-950 text-xs font-mono tracking-wider"
              />
            </div>
          </div>

          {/* Parts & Value */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] font-medium text-slate-300">
                Requested Part Description *
              </label>
              <Input
                value={partDescription}
                onChange={(e) => setPartDescription(e.target.value)}
                placeholder="e.g. Bosch 140A Smart Alternator (06L903021E)"
                required
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300">
                Estimated ZAR *
              </label>
              <Input
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(Number(e.target.value))}
                type="number"
                required
                className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300">
              Inquiry Notes
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer bay 4 urgent, wants courier to Sandton."
              className="mt-1 h-8 border-slate-800 bg-slate-900 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
            <DialogClose render={<Button variant="ghost" size="sm" type="button" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
            >
              {submitting ? "Saving..." : "Add Deal to Pipeline"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
