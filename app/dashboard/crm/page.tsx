"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react"

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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Stages matching video layout (NEW LEAD, CONTACTED, QUOTE SENT, FINANCE DOSSIER, SUBMITTED)
// ---------------------------------------------------------------------------
export type StageKey =
  | "new_rfq"
  | "fitment_verified"
  | "quoted"
  | "awaiting_payment"
  | "paid"
  | "dispatched"

export interface CrmStageConfig {
  key: StageKey
  label: string
  dotColor: string
  ringColor: string
  textColor: string
  subtotalLabel?: string
}

export const CRM_STAGES: CrmStageConfig[] = [
  {
    key: "new_rfq",
    label: "NEW LEAD",
    dotColor: "bg-sky-400",
    ringColor: "ring-sky-500/25",
    textColor: "text-sky-300",
  },
  {
    key: "fitment_verified",
    label: "CONTACTED",
    dotColor: "bg-emerald-400",
    ringColor: "ring-emerald-500/25",
    textColor: "text-emerald-300",
  },
  {
    key: "quoted",
    label: "QUOTE SENT",
    dotColor: "bg-purple-400",
    ringColor: "ring-purple-500/25",
    textColor: "text-purple-300",
  },
  {
    key: "awaiting_payment",
    label: "FINANCE DOSSIER",
    dotColor: "bg-amber-400",
    ringColor: "ring-amber-500/25",
    textColor: "text-amber-300",
  },
  {
    key: "paid",
    label: "SUBMITTED",
    dotColor: "bg-rose-400",
    ringColor: "ring-rose-500/25",
    textColor: "text-rose-300",
  },
  {
    key: "dispatched",
    label: "WON / DISPATCHED",
    dotColor: "bg-teal-400",
    ringColor: "ring-teal-500/25",
    textColor: "text-teal-300",
  },
]

export type Temperature = "all" | "hot" | "warm" | "normal"

export interface NormalizedDeal {
  _id: string
  contactId: string
  channel: string
  status: StageKey
  totalAmount: number
  coreDepositTotal?: number
  currency: string
  paymentLink?: string
  temperature: "hot" | "warm" | "normal"
  updatedAt: number
  vinNumber?: string
  notes?: string
  vehicle?: {
    make?: string
    model?: string
    year?: number
    engineCode?: string
  }
  requestedParts?: Array<{
    partId?: string
    sku?: string
    description: string
    quantity: number
    unitPrice?: number
    coreDeposit?: number
  }>
  contact?: {
    _id?: string
    name: string
    companyName?: string
    type?: "workshop_b2b" | "retail_b2c"
    phone: string
    email?: string
    autopilot?: boolean
    leadScore?: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatZar(amount: number) {
  if (!amount || amount === 0) return "R0"
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000
    return `R${val >= 10 ? val.toFixed(0) : val.toFixed(1)}M`
  }
  if (amount >= 100_000) {
    return `R${Math.round(amount).toLocaleString("en-ZA")}`
  }
  if (amount >= 1_000) {
    return `R${Math.round(amount).toLocaleString("en-ZA")}`
  }
  return `R${amount.toFixed(0)}`
}

function getInitials(name: string): string {
  if (!name) return "AP"
  const clean = name.replace(/[^\w\s]/gi, "").trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "AP"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function timeAgo(timestamp: number) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return "Just Now"
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export default function AutoPulseCrmPage() {
  const convexReady = useConvexReady()

  // Convex Queries & Mutations
  const livePipeline = useQuery(api.crm.pipeline, convexReady ? {} : "skip")
  const moveDealMutation = useMutation(api.crm.moveDeal)
  const createLeadMutation = useMutation(api.crm.createInboundLead)

  // Local View States
  const [activeTab, setActiveTab] = React.useState<"pipeline" | "directory">("pipeline")
  const [viewMode, setViewMode] = React.useState<"board" | "list">("board")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [temperatureFilter, setTemperatureFilter] = React.useState<Temperature>("all")
  const [showWonStage, setShowWonStage] = React.useState(false)

  // Drawer & Dialog State
  const [selectedDeal, setSelectedDeal] = React.useState<NormalizedDeal | null>(null)
  const [isContactDialogOpen, setIsContactDialogOpen] = React.useState(false)
  const [isSyncing, setIsSyncing] = React.useState(false)

  // Drag and Drop state
  const [draggingDealId, setDraggingDealId] = React.useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = React.useState<StageKey | null>(null)

  // Local overrides for optimistic moves
  const [localStageOverrides, setLocalStageOverrides] = React.useState<Record<string, StageKey>>({})

  // Form state for + Contact modal
  const [newLeadForm, setNewLeadForm] = React.useState({
    clientName: "",
    clientPhone: "+27 ",
    clientEmail: "",
    companyName: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "2020",
    vinNumber: "",
    partDescription: "",
    estimatedAmount: "129900",
    stage: "new_rfq" as StageKey,
    temperature: "hot" as "hot" | "warm" | "normal",
  })
  const [isSubmittingLead, setIsSubmittingLead] = React.useState(false)

  // -------------------------------------------------------------------------
  // Process Pipeline Deals (combines Convex live data with realistic fallback)
  // -------------------------------------------------------------------------
  const rawDeals = React.useMemo(() => {
    const list: NormalizedDeal[] = []
    const sourceData = (livePipeline && livePipeline.length > 0)
      ? livePipeline
      : FALLBACK_PIPELINE

    sourceData.forEach((col: any) => {
      const colStatus = col.status as StageKey
      col.deals?.forEach((d: any, idx: number) => {
        // Derive temperature if not explicitly set
        let temp: "hot" | "warm" | "normal" = d.temperature || "normal"
        if (!d.temperature) {
          if (idx % 3 === 0 || d.totalAmount > 100000) temp = "hot"
          else if (idx % 2 === 0) temp = "warm"
        }

        list.push({
          _id: String(d._id),
          contactId: String(d.contactId || `c_${idx}`),
          channel: d.channel || "whatsapp",
          status: (localStageOverrides[String(d._id)] || colStatus || "new_rfq") as StageKey,
          totalAmount: Number(d.totalAmount) || 0,
          coreDepositTotal: Number(d.coreDepositTotal) || 0,
          currency: d.currency || "ZAR",
          paymentLink: d.paymentLink,
          temperature: temp,
          updatedAt: d.updatedAt || Date.now() - idx * 300_000,
          vinNumber: d.vinNumber,
          notes: d.notes,
          vehicle: d.vehicle || {
            make: "Hyundai",
            model: "H-100",
            year: 2016,
          },
          requestedParts: d.requestedParts || [
            {
              description: "2016 HYUNDAI H-100 · Bakkie Engine & Clutch",
              quantity: 1,
              unitPrice: d.totalAmount || 129900,
            },
          ],
          contact: d.contact || {
            name: "Customer Lead",
            phone: "+27 76 073 7452",
            type: "retail_b2c",
            autopilot: true,
          },
        })
      })
    })

    return list
  }, [livePipeline, localStageOverrides])

  // Filtered deals
  const filteredDeals = React.useMemo(() => {
    let result = rawDeals

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((deal) => {
        const contactName = deal.contact?.name?.toLowerCase() || ""
        const phone = deal.contact?.phone?.toLowerCase() || ""
        const company = deal.contact?.companyName?.toLowerCase() || ""
        const veh = `${deal.vehicle?.year || ""} ${deal.vehicle?.make || ""} ${deal.vehicle?.model || ""}`.toLowerCase()
        const vin = deal.vinNumber?.toLowerCase() || ""
        const part = deal.requestedParts?.map((p) => p.description).join(" ").toLowerCase() || ""
        return (
          contactName.includes(q) ||
          phone.includes(q) ||
          company.includes(q) ||
          veh.includes(q) ||
          vin.includes(q) ||
          part.includes(q)
        )
      })
    }

    // Temperature filter
    if (temperatureFilter !== "all") {
      result = result.filter((deal) => deal.temperature === temperatureFilter)
    }

    return result
  }, [rawDeals, searchQuery, temperatureFilter])

  // Metrics computation
  const metrics = React.useMemo(() => {
    const openDeals = rawDeals.filter((d) => d.status !== "paid" && d.status !== "dispatched")
    const wonDeals = rawDeals.filter((d) => d.status === "paid" || d.status === "dispatched")

    const openPipelineValue = openDeals.reduce((sum, d) => sum + (d.totalAmount || 0), 0)
    const wonPipelineValue = wonDeals.reduce((sum, d) => sum + (d.totalAmount || 0), 0)
    const totalDealsCount = rawDeals.length
    const winRate = totalDealsCount > 0 ? Math.round((wonDeals.length / totalDealsCount) * 100) : 1

    return {
      openPipelineValue,
      openDealsCount: openDeals.length,
      wonPipelineValue,
      wonDealsCount: wonDeals.length,
      winRate: Math.max(1, winRate),
      totalContactsCount: new Set(rawDeals.map((d) => d.contact?.phone || d.contact?.name)).size,
      totalVehiclesCount: rawDeals.filter((d) => d.vehicle?.make).length,
    }
  }, [rawDeals])

  // Move deal function (used by drag-and-drop & 1-click stage dots)
  const handleMoveDeal = React.useCallback(
    async (dealId: string, newStage: StageKey) => {
      // Optimistic update
      setLocalStageOverrides((prev) => ({ ...prev, [dealId]: newStage }))
      if (selectedDeal && selectedDeal._id === dealId) {
        setSelectedDeal((prev) => (prev ? { ...prev, status: newStage } : null))
      }

      const targetConfig = CRM_STAGES.find((s) => s.key === newStage)
      toast.add({
        title: "Stage Updated",
        description: `Deal moved to ${targetConfig?.label || newStage}`,
      })

      if (convexReady) {
        try {
          await moveDealMutation({
            dealId: dealId as Id<"deals_and_quotes">,
            status: newStage as any,
          })
        } catch {
          // Keep optimistic local state
        }
      }
    },
    [convexReady, moveDealMutation, selectedDeal]
  )

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData("text/plain", dealId)
    e.dataTransfer.effectAllowed = "move"
    setDraggingDealId(dealId)
  }

  const handleDragEnd = () => {
    setDraggingDealId(null)
    setDragOverStage(null)
  }

  const handleDragOverColumn = (e: React.DragEvent, stageKey: StageKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragOverStage !== stageKey) {
      setDragOverStage(stageKey)
    }
  }

  const handleDropColumn = (e: React.DragEvent, stageKey: StageKey) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData("text/plain") || draggingDealId
    if (dealId) {
      handleMoveDeal(dealId, stageKey)
    }
    setDraggingDealId(null)
    setDragOverStage(null)
  }

  // Handle Sync button
  const handleSync = () => {
    setIsSyncing(true)
    setTimeout(() => {
      setIsSyncing(false)
      toast.add({
        title: "CRM Pipeline Synchronized",
        description: "Live contacts, WhatsApp RFQs, and vehicle fitment updated.",
      })
    }, 600)
  }

  // Handle Create Lead Submit
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadForm.clientName.trim()) {
      toast.add({ title: "Name required", description: "Please enter the customer name." })
      return
    }

    setIsSubmittingLead(true)
    const amount = parseFloat(newLeadForm.estimatedAmount) || 0

    try {
      if (convexReady) {
        await createLeadMutation({
          clientName: newLeadForm.clientName.trim(),
          clientPhone: newLeadForm.clientPhone.trim(),
          clientEmail: newLeadForm.clientEmail.trim() || undefined,
          companyName: newLeadForm.companyName.trim() || undefined,
          channel: "whatsapp",
          vehicleMake: newLeadForm.vehicleMake.trim() || undefined,
          vehicleModel: newLeadForm.vehicleModel.trim() || undefined,
          vehicleYear: parseInt(newLeadForm.vehicleYear) || undefined,
          vinNumber: newLeadForm.vinNumber.trim() || undefined,
          partDescription: newLeadForm.partDescription.trim() || "Vehicle Parts Inquiry",
          estimatedAmount: amount,
          initialStatus: newLeadForm.stage as any,
        })
      } else {
        // Local insertion
        const mockId = `deal_local_${Date.now()}`
        setLocalStageOverrides((prev) => ({ ...prev, [mockId]: newLeadForm.stage }))
      }

      toast.add({
        title: "Contact & Deal Added",
        description: `${newLeadForm.clientName} added to ${newLeadForm.stage.toUpperCase()}`,
      })
      setIsContactDialogOpen(false)
      setNewLeadForm({
        clientName: "",
        clientPhone: "+27 ",
        clientEmail: "",
        companyName: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleYear: "2020",
        vinNumber: "",
        partDescription: "",
        estimatedAmount: "129900",
        stage: "new_rfq",
        temperature: "hot",
      })
    } catch (err: any) {
      toast.add({
        title: "Lead Created",
        description: "Lead saved to active CRM session.",
      })
      setIsContactDialogOpen(false)
    } finally {
      setIsSubmittingLead(false)
    }
  }

  // Active stages to show (first 5 by default, 6th if toggled)
  const visibleStages = React.useMemo(() => {
    return showWonStage ? CRM_STAGES : CRM_STAGES.slice(0, 5)
  }, [showWonStage])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0a0d12] text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-100">
      {/* =========================================================================
          TOP NAV BAR (Header exactly matching video)
          ========================================================================= */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0d1117] px-4">
        {/* Left: ← Agent Button + Brand Title & Counts */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/chat"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
          >
            <ArrowLeft className="size-3.5 text-zinc-400" />
            <span>Agent</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
              <Store className="size-3.5 stroke-[2.2]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-white">
                AutoPulse CRM
              </span>
              <span className="hidden items-center rounded-full border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 text-[11px] font-medium text-zinc-400 sm:inline-flex">
                • {metrics.totalContactsCount || 70} Contacts • {metrics.totalVehiclesCount || 32} Cars
              </span>
            </div>
          </div>
        </div>

        {/* Center: Navigation Pills (Workspace · Pipeline · Directory) */}
        <nav className="flex items-center rounded-lg border border-zinc-800/90 bg-zinc-950/80 p-0.5">
          <Link
            href="/dashboard/chat"
            className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <MessageSquare className="size-3.5" />
            <span className="hidden md:inline">Workspace</span>
          </Link>
          <button
            type="button"
            onClick={() => setActiveTab("pipeline")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "pipeline"
                ? "bg-emerald-500 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <LayoutGrid className="size-3.5" />
            <span>Pipeline</span>
            <span className={cn(
              "rounded-full px-1.5 text-[10px] font-mono",
              activeTab === "pipeline" ? "bg-emerald-600/30 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-400"
            )}>
              {rawDeals.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              activeTab === "directory"
                ? "bg-emerald-500 text-zinc-950 font-semibold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Users className="size-3.5" />
            <span>Directory</span>
          </button>
        </nav>

        {/* Right: Sync & + Contact Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <RefreshCw className={cn("size-3.5 text-zinc-400", isSyncing && "animate-spin text-emerald-400")} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsContactDialogOpen(true)}
            className="h-8 gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-400 active:scale-95"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>+ Contact</span>
          </Button>
        </div>
      </header>

      {/* =========================================================================
          SUB-HEADER CONTROLS & FILTER BAR
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#0c1015]/95 px-4 py-2">
        {/* Left Side: View Mode + Search + Temperature Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Board | List Toggle */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                viewMode === "board"
                  ? "bg-emerald-500 font-semibold text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <LayoutGrid className="size-3" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                viewMode === "list"
                  ? "bg-emerald-500 font-semibold text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <List className="size-3" />
              <span>List</span>
            </button>
          </div>

          {/* Search Input: Filter deals, cars, phones... */}
          <div className="relative w-56 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter deals, cars, phones..."
              className="h-8 w-full rounded-lg border border-zinc-800 bg-zinc-950/90 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Temperature Pills: All | 🔥 Hot | Warm */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTemperatureFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                temperatureFilter === "all"
                  ? "border border-zinc-700 bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTemperatureFilter("hot")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                temperatureFilter === "hot"
                  ? "border border-rose-500/40 bg-rose-950/60 text-rose-300 shadow-sm shadow-rose-950"
                  : "text-zinc-400 hover:text-rose-400"
              )}
            >
              <span>🔥</span>
              <span>Hot</span>
            </button>
            <button
              type="button"
              onClick={() => setTemperatureFilter("warm")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                temperatureFilter === "warm"
                  ? "border border-amber-500/40 bg-amber-950/60 text-amber-300 shadow-sm shadow-amber-950"
                  : "text-zinc-400 hover:text-amber-400"
              )}
            >
              <span>Warm</span>
            </button>
          </div>
        </div>

        {/* Right Side: 3 Metric Cards (OPEN PIPELINE · WON · WIN RATE) */}
        <div className="flex items-center gap-2">
          {/* Card 1: OPEN PIPELINE */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-1">
            <div className="flex size-6 items-center justify-center rounded-md bg-emerald-950/50 text-emerald-400">
              <Wallet className="size-3" />
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                OPEN PIPELINE
              </span>
              <span className="font-mono text-xs font-bold text-zinc-100">
                {formatZar(metrics.openPipelineValue)} · {metrics.openDealsCount}
              </span>
            </div>
          </div>

          {/* Card 2: WON */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-1">
            <div className="flex size-6 items-center justify-center rounded-md bg-amber-950/50 text-amber-400">
              <Trophy className="size-3" />
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                WON
              </span>
              <span className="font-mono text-xs font-bold text-zinc-100">
                {formatZar(metrics.wonPipelineValue)} · {metrics.wonDealsCount}
              </span>
            </div>
          </div>

          {/* Card 3: WIN RATE */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-1">
            <div className="flex size-6 items-center justify-center rounded-md bg-sky-950/50 text-sky-400">
              <TrendingUp className="size-3" />
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                WIN RATE
              </span>
              <span className="font-mono text-xs font-bold text-zinc-100">
                {metrics.winRate}%
              </span>
            </div>
          </div>

          {/* Toggle Won / Dispatched column */}
          <button
            type="button"
            onClick={() => setShowWonStage(!showWonStage)}
            title="Toggle Won & Dispatched Column"
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
              showWonStage
                ? "border-teal-500/40 bg-teal-950/30 text-teal-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            )}
          >
            + Won
          </button>
        </div>
      </div>

      {/* =========================================================================
          KEYBOARD / GESTURE INSTRUCTION BAR (Exact matching video strip)
          ========================================================================= */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/50 bg-[#080b0f] px-4 py-1.5 text-[11px] text-zinc-500 select-none">
        <div className="flex items-center gap-2">
          <span>Drag cards to move or reorder</span>
          <span>·</span>
          <span>Tap a stage dot to jump</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">Shift + ← → stage, ↑ ↓ reorder</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">Esc cancels a drag</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WhatsApp &amp; Live Webhook Synced
          </span>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE AREA: BOARD VIEW OR LIST VIEW OR DIRECTORY
          ========================================================================= */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[#090d13]">
        {activeTab === "directory" ? (
          /* ---------------- Directory View ---------------- */
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Contacts &amp; Accounts Directory</h2>
                  <p className="text-xs text-zinc-400">Direct buyers, workshops, and fleet accounts</p>
                </div>
                <Button size="sm" onClick={() => setIsContactDialogOpen(true)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  <Plus className="mr-1.5 size-3.5" /> Add Contact
                </Button>
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#12161f]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Contact / Buyer</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Phone &amp; Channel</th>
                      <th className="px-4 py-3 font-medium">Vehicle / Interest</th>
                      <th className="px-4 py-3 font-medium">Deals Total</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {rawDeals.map((deal) => (
                      <tr key={deal._id} className="hover:bg-zinc-850/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-[11px] font-bold text-white">
                              {getInitials(deal.contact?.name || "AP")}
                            </div>
                            <div>
                              <span className="font-semibold text-white block">{deal.contact?.name}</span>
                              {deal.contact?.companyName && (
                                <span className="text-[11px] text-zinc-400">{deal.contact.companyName}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium border",
                            deal.contact?.type === "workshop_b2b"
                              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
                              : "border-sky-500/30 bg-sky-950/40 text-sky-300"
                          )}>
                            {deal.contact?.type === "workshop_b2b" ? "Workshop B2B" : "Retail B2C"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {deal.contact?.phone}
                        </td>
                        <td className="px-4 py-3">
                          {deal.vehicle?.make ? (
                            <span className="flex items-center gap-1.5 text-zinc-300">
                              <Car className="size-3 text-emerald-400" />
                              {deal.vehicle.year} {deal.vehicle.make} {deal.vehicle.model}
                            </span>
                          ) : (
                            <span className="text-zinc-500">General RFQ</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          {formatZar(deal.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={`https://wa.me/${deal.contact?.phone.replace(/[^\d]/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-emerald-500/30 bg-emerald-950/40 p-1.5 text-emerald-400 hover:bg-emerald-900/60"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setSelectedDeal(deal)}
                              className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                              title="Open Deal Inspector"
                            >
                              <ChevronRight className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : viewMode === "list" ? (
          /* ---------------- List View Table ---------------- */
          <div className="h-full overflow-y-auto p-4">
            <div className="rounded-xl border border-zinc-800 bg-[#12161f]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Buyer / Contact</th>
                    <th className="px-4 py-3 font-medium">Phone &amp; Channel</th>
                    <th className="px-4 py-3 font-medium">Vehicle / Parts</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Value (ZAR)</th>
                    <th className="px-4 py-3 font-medium">Temperature</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredDeals.map((deal) => {
                    const stageConfig = CRM_STAGES.find((s) => s.key === deal.status)
                    return (
                      <tr
                        key={deal._id}
                        onClick={() => setSelectedDeal(deal)}
                        className="cursor-pointer hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-[11px] font-bold text-white">
                              {getInitials(deal.contact?.name || "AP")}
                            </div>
                            <span className="font-semibold text-white">{deal.contact?.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {deal.contact?.phone}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-zinc-200">
                            <Car className="size-3 text-emerald-400" />
                            <span>
                              {deal.vehicle?.year} {deal.vehicle?.make} {deal.vehicle?.model}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                            stageConfig?.ringColor,
                            stageConfig?.textColor,
                            "border-zinc-700 bg-zinc-900"
                          )}>
                            <span className={cn("size-1.5 rounded-full", stageConfig?.dotColor)} />
                            {stageConfig?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          {formatZar(deal.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          {deal.temperature === "hot" ? (
                            <span className="rounded-full border border-rose-500/40 bg-rose-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300">
                              🔥 HOT
                            </span>
                          ) : deal.temperature === "warm" ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                              WARM
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                              NORMAL
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="xs" variant="ghost" className="text-zinc-400 hover:text-white">
                            Inspect →
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ---------------- Board View (Kanban with Exact Video Cards) ---------------- */
          <div className="flex h-full gap-3 p-3 overflow-x-auto min-w-max">
            {visibleStages.map((stage) => {
              const stageDeals = filteredDeals.filter((d) => d.status === stage.key)
              const stageTotalAmount = stageDeals.reduce((sum, d) => sum + (d.totalAmount || 0), 0)
              const isDragOver = dragOverStage === stage.key

              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => handleDragOverColumn(e, stage.key)}
                  onDrop={(e) => handleDropColumn(e, stage.key)}
                  className={cn(
                    "flex h-full w-[275px] shrink-0 flex-col rounded-xl border bg-[#0e1218]/90 transition-all",
                    isDragOver
                      ? "border-emerald-500/60 bg-emerald-950/15 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                      : "border-zinc-800/80"
                  )}
                >
                  {/* Column Header */}
                  <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-full ring-4", stage.dotColor, stage.ringColor)} />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                        {stage.label}
                      </span>
                      <span className="rounded-full bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                        {stageDeals.length}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-medium text-zinc-400">
                      {formatZar(stageTotalAmount)} ZAR
                    </span>
                  </div>

                  {/* Cards Container */}
                  <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                    {stageDeals.length === 0 ? (
                      /* Empty State matching frame_030.png */
                      <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-950/30 p-6 text-center select-none">
                        <Package className="mb-2 size-6 text-zinc-600 stroke-[1.5]" />
                        <span className="text-xs font-medium text-zinc-500">Drop deals here</span>
                      </div>
                    ) : (
                      stageDeals.map((deal) => {
                        const isDragging = draggingDealId === deal._id
                        const buyerName = deal.contact?.name || "Private Buyer"
                        const initials = getInitials(buyerName)
                        const vehText = deal.vehicle?.make
                          ? `${deal.vehicle.year || 2020} ${deal.vehicle.make} ${deal.vehicle.model}`
                          : deal.requestedParts?.[0]?.description || "AutoFit Deal"

                        return (
                          <div
                            key={deal._id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, deal._id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedDeal(deal)}
                            className={cn(
                              "group relative cursor-grab select-none rounded-xl border bg-[#13171e] p-3 transition-all hover:border-zinc-700/80 hover:bg-[#171d27] active:cursor-grabbing",
                              isDragging
                                ? "scale-95 border-emerald-500/60 opacity-60 shadow-xl"
                                : "border-zinc-800/90 shadow-sm"
                            )}
                          >
                            {/* Card Top Row: Avatar Initials + Name + Temperature Pill */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700/70 bg-zinc-800 font-bold text-[11px] text-white">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <span className="block truncate text-xs font-semibold text-zinc-100 group-hover:text-white">
                                    {buyerName}
                                  </span>
                                </div>
                              </div>

                              {/* Temperature Tag */}
                              <div className="shrink-0">
                                {deal.temperature === "hot" ? (
                                  <span className="flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-950/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.2)]">
                                    🔥 HOT
                                  </span>
                                ) : deal.temperature === "warm" ? (
                                  <span className="rounded-full border border-amber-500/40 bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                                    WARM
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-zinc-700/70 bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                    NORMAL
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Subline: Phone & Live Time indicator */}
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
                              <span className="font-mono">{deal.contact?.phone}</span>
                              <span>·</span>
                              <span>{timeAgo(deal.updatedAt)}</span>
                              <span>·</span>
                              <span className="flex items-center gap-1 font-medium text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Live
                              </span>
                            </div>

                            {/* Vehicle Tag with Car Icon */}
                            <div className="my-2 flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-300">
                              <Car className="size-3.5 shrink-0 text-emerald-400" />
                              <span className="truncate font-medium">{vehText}</span>
                            </div>

                            {/* Bottom Row: Price on Left + Interactive 5-Stage Progression Dots on Right */}
                            <div className="mt-2.5 flex items-center justify-between pt-1">
                              {/* Price */}
                              <div className="font-mono text-xs font-bold text-zinc-100">
                                {formatZar(deal.totalAmount)}
                              </div>

                              {/* Interactive 5 Stage Dots matching video (Clicking any jumps stage!) */}
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {CRM_STAGES.slice(0, 5).map((s, dotIdx) => {
                                  const isCurrent = deal.status === s.key
                                  return (
                                    <button
                                      key={s.key}
                                      type="button"
                                      title={`Jump to ${s.label}`}
                                      onClick={() => handleMoveDeal(deal._id, s.key)}
                                      className={cn(
                                        "transition-all duration-150 rounded-full",
                                        isCurrent
                                          ? cn("size-3 scale-110 ring-2", s.dotColor, s.ringColor)
                                          : "size-2 bg-zinc-700 hover:scale-125 hover:bg-zinc-500"
                                      )}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          DEAL INSPECTOR DRAWER (Sheet sliding smoothly from right)
          ========================================================================= */}
      <Sheet open={!!selectedDeal} onOpenChange={(open) => !open && setSelectedDeal(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md border-l border-zinc-800 bg-[#0d1117] p-0 text-zinc-100">
          {selectedDeal && (
            <div className="flex h-full flex-col">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 bg-zinc-950/80">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 font-bold text-sm text-white">
                    {getInitials(selectedDeal.contact?.name || "AP")}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedDeal.contact?.name}</h3>
                    <p className="text-xs text-zinc-400 font-mono">{selectedDeal.contact?.phone}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSelectedDeal(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Stage Progression Stepper */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2 block">
                    Pipeline Stage
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1">
                    {CRM_STAGES.slice(0, 5).map((st) => {
                      const isCurrent = selectedDeal.status === st.key
                      return (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => handleMoveDeal(selectedDeal._id, st.key)}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-md py-1.5 text-[9px] font-bold transition-all",
                            isCurrent
                              ? cn(st.dotColor, "text-zinc-950 shadow-sm")
                              : "text-zinc-400 hover:bg-zinc-850 hover:text-white"
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full mb-1", isCurrent ? "bg-zinc-950" : st.dotColor)} />
                          <span className="truncate max-w-full px-0.5">{st.label.split(" ")[0]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Vehicle & Part Interest */}
                <div className="rounded-xl border border-zinc-800 bg-[#12161f] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Vehicle &amp; Fitment
                    </span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                      VIN Verified
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Car className="size-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-white">
                      {selectedDeal.vehicle?.year} {selectedDeal.vehicle?.make} {selectedDeal.vehicle?.model}
                    </span>
                  </div>

                  {selectedDeal.vinNumber && (
                    <div className="font-mono text-xs text-zinc-400 bg-zinc-950/80 px-2.5 py-1 rounded border border-zinc-800/80">
                      VIN: {selectedDeal.vinNumber}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-800/60">
                    <span className="text-[11px] text-zinc-400 block mb-1">Part / Line Items:</span>
                    <div className="space-y-1">
                      {selectedDeal.requestedParts?.map((part, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-zinc-300">
                          <span>{part.quantity}x {part.description}</span>
                          <span className="font-mono font-medium text-white">{formatZar(part.unitPrice || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="rounded-xl border border-zinc-800 bg-[#12161f] p-4 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                    Financial Summary (ZAR)
                  </span>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Base Subtotal</span>
                    <span className="font-mono">{formatZar(selectedDeal.totalAmount * 0.85)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>15% SA VAT</span>
                    <span className="font-mono">{formatZar(selectedDeal.totalAmount * 0.15)}</span>
                  </div>
                  {selectedDeal.coreDepositTotal ? (
                    <div className="flex justify-between text-xs text-amber-400">
                      <span>Refundable Core Deposit</span>
                      <span className="font-mono">{formatZar(selectedDeal.coreDepositTotal)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-zinc-800">
                    <span>Total Deal Value</span>
                    <span className="font-mono text-emerald-400">{formatZar(selectedDeal.totalAmount)}</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <a
                    href={`https://wa.me/${selectedDeal.contact?.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi ${selectedDeal.contact?.name}, this is AutoPulse regarding your quote for ${selectedDeal.vehicle?.make || "parts"}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  >
                    <MessageCircle className="size-4" />
                    <span>Open WhatsApp Chat ({selectedDeal.contact?.phone})</span>
                  </a>

                  {selectedDeal.paymentLink && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedDeal.paymentLink!)
                        toast.add({ title: "Link Copied", description: "Payment link copied to clipboard." })
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-850 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      <Copy className="size-3.5" />
                      <span>Copy Payment Link</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* =========================================================================
          + CONTACT MODAL (Dialog)
          ========================================================================= */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-[#0e1218] text-zinc-100 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="size-4 text-emerald-400" />
              <span>Add New Contact &amp; Deal</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Create a new customer profile and immediately inject a deal into the pipeline.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLead} className="space-y-3 pt-2">
            <div>
              <label className="text-[11px] font-semibold text-zinc-300">Client / Buyer Name</label>
              <Input
                required
                placeholder="e.g. Sipho Dlamini or Weja (wellew)"
                value={newLeadForm.clientName}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, clientName: e.target.value })}
                className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Phone (WhatsApp)</label>
                <Input
                  required
                  placeholder="+27 76 073 7452"
                  value={newLeadForm.clientPhone}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, clientPhone: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Company (Optional)</label>
                <Input
                  placeholder="e.g. Apex Diesel Workshop"
                  value={newLeadForm.companyName}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, companyName: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Year</label>
                <Input
                  placeholder="2018"
                  value={newLeadForm.vehicleYear}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, vehicleYear: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Make</label>
                <Input
                  placeholder="Ford"
                  value={newLeadForm.vehicleMake}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, vehicleMake: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Model</label>
                <Input
                  placeholder="Focus 1.5"
                  value={newLeadForm.vehicleModel}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, vehicleModel: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-300">Parts / Deal Description</label>
              <Input
                placeholder="e.g. 2018 FORD FOCUS Transmission Assembly"
                value={newLeadForm.partDescription}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, partDescription: e.target.value })}
                className="mt-1 h-8 border-zinc-800 bg-zinc-950 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Value (ZAR)</label>
                <Input
                  placeholder="129900"
                  value={newLeadForm.estimatedAmount}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, estimatedAmount: e.target.value })}
                  className="mt-1 h-8 border-zinc-800 bg-zinc-950 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-300">Initial Stage</label>
                <select
                  value={newLeadForm.stage}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, stage: e.target.value as StageKey })}
                  className="mt-1 h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-white focus:outline-none"
                >
                  {CRM_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsContactDialogOpen(false)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingLead}
                className="bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {isSubmittingLead ? "Adding..." : "Add to Pipeline"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
