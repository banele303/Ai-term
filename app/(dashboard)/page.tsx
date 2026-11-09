"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Car,
  CarFront,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Layers,
  LineChart as LineChartIcon,
  Mail,
  MessageSquare,
  PackageSearch,
  PieChart as PieChartIcon,
  PlusIcon,
  Radio,
  RotateCw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useMutation, useQuery } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"

// ============================================================================
// Analytics Data & Configurations (South African Automotive Market)
// ============================================================================

const REVENUE_DATA = [
  { day: "Mon", revenue: 42500, margin: 15300, quotes: 18 },
  { day: "Tue", revenue: 58200, margin: 20950, quotes: 24 },
  { day: "Wed", revenue: 64900, margin: 23360, quotes: 29 },
  { day: "Thu", revenue: 71400, margin: 25700, quotes: 32 },
  { day: "Fri", revenue: 89300, margin: 32150, quotes: 41 },
  { day: "Sat", revenue: 53100, margin: 19120, quotes: 22 },
  { day: "Sun", revenue: 38800, margin: 13970, quotes: 14 },
]

const revenueChartConfig: ChartConfig = {
  revenue: {
    label: "Gross Sales (ZAR)",
    color: "#0ea5e9", // sky-500
  },
  margin: {
    label: "Gross Profit Margin (ZAR)",
    color: "#10b981", // emerald-500
  },
}

const CHANNEL_LEADS_DATA = [
  { channel: "WhatsApp", inquiries: 64, closed: 48, rate: "75%" },
  { channel: "Gmail", inquiries: 42, closed: 29, rate: "69%" },
  { channel: "TikTok", inquiries: 88, closed: 54, rate: "61%" },
  { channel: "Facebook", inquiries: 36, closed: 22, rate: "61%" },
  { channel: "Web RFQ", inquiries: 28, closed: 21, rate: "75%" },
]

const channelChartConfig: ChartConfig = {
  inquiries: {
    label: "Leads Received",
    color: "#38bdf8", // sky-400
  },
  closed: {
    label: "Quotes Closed & Paid",
    color: "#34d399", // emerald-400
  },
}

const CATEGORY_SHARE_DATA = [
  { name: "Alternators & Starters", value: 34, fill: "#38bdf8", brand: "Bosch / Valeo" },
  { name: "Brake Rotors & Discs", value: 26, fill: "#f59e0b", brand: "Brembo / Ferodo" },
  { name: "Clutch & Flywheels", value: 21, fill: "#a855f7", brand: "LuK / Sachs" },
  { name: "Ignition & Spark Plugs", value: 11, fill: "#ec4899", brand: "NGK / Denso" },
  { name: "Filters & Service Kits", value: 8, fill: "#10b981", brand: "Mann / GUD" },
]

const categoryChartConfig: ChartConfig = {
  alternators: { label: "Alternators & Starters", color: "#38bdf8" },
  brakes: { label: "Brake Rotors & Discs", color: "#f59e0b" },
  clutch: { label: "Clutch & Flywheels", color: "#a855f7" },
  ignition: { label: "Ignition & Spark Plugs", color: "#ec4899" },
  filters: { label: "Service Kits & Filters", color: "#10b981" },
}

const FUNNEL_DATA = [
  { stage: "1. Inbound Inquiries", count: 258, percentage: 100, fill: "#0284c7" },
  { stage: "2. Fitment Verified", count: 218, percentage: 84.5, fill: "#0ea5e9" },
  { stage: "3. Quote Issued", count: 184, percentage: 71.3, fill: "#38bdf8" },
  { stage: "4. Paid & Dispatched", count: 146, percentage: 56.6, fill: "#10b981" },
]

const TOP_MOVING_SKUS = [
  {
    sku: "06L903021E",
    name: "Bosch 140A Smart Alternator",
    vehicle: "Golf 7 GTI / Audi S3 (CHHB)",
    brand: "Bosch OEM",
    unitsSold: 38,
    unitPrice: 3850,
    costPrice: 2450,
    marginPct: 36.4,
    status: "Fast Moving",
  },
  {
    sku: "BR-099411",
    name: "Brembo 312mm Coated Front Rotors",
    vehicle: "VW Golf 7 / Audi A3 2.0 TDI",
    brand: "Brembo High Carbon",
    unitsSold: 54,
    unitPrice: 1950,
    costPrice: 1220,
    marginPct: 37.4,
    status: "High Demand",
  },
  {
    sku: "F000BL0743",
    name: "Bosch Heavy Duty Alternator",
    vehicle: "Ford Ranger 3.2 TDCi / BT-50",
    brand: "Bosch Trade",
    unitsSold: 29,
    unitPrice: 4200,
    costPrice: 2750,
    marginPct: 34.5,
    status: "Fleet Priority",
  },
  {
    sku: "04E115561H",
    name: "Mann High Filtration Oil Filter",
    vehicle: "VAG 1.0 & 1.4 TSI Engines",
    brand: "Mann-Filter",
    unitsSold: 92,
    unitPrice: 220,
    costPrice: 95,
    marginPct: 56.8,
    status: "Volume Runner",
  },
  {
    sku: "FDB1617",
    name: "Ferodo Premier Ceramic Brake Pads",
    vehicle: "Toyota Hilux 2.8 GD-6 / Fortuner",
    brand: "Ferodo Racing",
    unitsSold: 67,
    unitPrice: 1150,
    costPrice: 680,
    marginPct: 40.8,
    status: "Workshop Favorite",
  },
]

export default function TeammatesHomePage() {
  const router = useRouter()
  const data = useQuery(api.teammates.listWorkspace, {})
  const overview = useQuery(api.dashboard.overview, {})
  const storeContext = useQuery(api.dashboard.botStoreContext, {})

  const ensureFleetMut = useMutation(api.teammates.ensureWorkspaceFleet)
  const createDirectChatMut = useMutation(api.teammates.createDirectChat)

  const [isSyncingFleet, setIsSyncingFleet] = React.useState(false)

  const bots = data?.bots ?? []
  const chats = data?.chats ?? []

  // Ensure workspace fleet exists
  React.useEffect(() => {
    if (data && bots.length < 6) {
      ensureFleetMut().catch(() => { })
    }
  }, [data, bots.length, ensureFleetMut])

  const handleSyncFleet = async () => {
    setIsSyncingFleet(true)
    try {
      await ensureFleetMut({})
      toast.add({
        type: "success",
        title: "Fleet Synchronized",
        description: "All AutoPulse AI agents are online and connected.",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Fleet Sync Note",
        description: err instanceof Error ? err.message : "Sync error",
      })
    } finally {
      setIsSyncingFleet(false)
    }
  }

  const handleStartNewChat = async (botId: string, botName: string, initialPrompt?: string) => {
    try {
      const res = await createDirectChatMut({
        botId: botId as Id<"teammate_bots">,
      })
      const promptQuery = initialPrompt ? `?prompt=${encodeURIComponent(initialPrompt)}` : ""
      router.push(`/chats/${res.chatId}${promptQuery}`)
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to open conversation",
        description: (err as Error).message,
      })
    }
  }

  // Find bots for quick actions
  const whatsAppBot = bots.find((b) => b.name.toLowerCase().includes("whatsapp") || b.name.includes("Fame"))
  const emailBot = bots.find((b) => b.name.toLowerCase().includes("email") || b.name.includes("Comm") || b.name.includes("Aero"))
  const supplyBot = bots.find((b) => b.name.toLowerCase().includes("supplier") || b.name.includes("Supply"))
  const socialBot = bots.find((b) => b.name.toLowerCase().includes("social") || b.name.includes("Omni") || b.job.includes("TikTok"))
  const quoteBot = bots.find((b) => b.name.toLowerCase().includes("quote"))
  const opsBot = bots.find((b) => b.name.includes("Ops")) || bots[0]

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-mono">
                AutoPulse v2.4 • South Africa Hub
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                All 5 Agents Online
              </Badge>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-100 md:text-3xl">
              Operations &amp; Executive Analytics Command
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Live performance metrics, revenue trajectories, omnichannel conversion velocity &amp; catalog analytics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncFleet}
              disabled={isSyncingFleet}
              className="h-9 gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              {isSyncingFleet ? (
                <Skeleton className="size-3.5 rounded-full bg-emerald-400/80" />
              ) : (
                <RotateCw className="size-3.5 text-emerald-400" />
              )}
              Sync Fleet
            </Button>

            <Link href="/dashboard/crm">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-sky-500/30 bg-sky-500/10 text-xs text-sky-400 hover:bg-sky-500/20 cursor-pointer"
              >
                <Layers className="size-3.5" />
                Open Kanban CRM
              </Button>
            </Link>

            {whatsAppBot && (
              <Button
                size="sm"
                onClick={() =>
                  handleStartNewChat(
                    whatsAppBot.id,
                    whatsAppBot.name,
                    "Check live WhatsApp chats on +27 63 199 5124, look up stock in our database, and assist client inquiries."
                  )
                }
                className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs text-white cursor-pointer shadow-md"
              >
                <MessageSquare className="size-3.5" />
                WhatsApp Executive
              </Button>
            )}

            {quoteBot && (
              <Button
                size="sm"
                onClick={() =>
                  handleStartNewChat(
                    quoteBot.id,
                    quoteBot.name,
                    "Generate a formal South African VAT-compliant PDF quotation for a customer inquiry."
                  )
                }
                className="h-9 gap-1.5 bg-sky-600 hover:bg-sky-500 text-xs text-white cursor-pointer shadow-md"
              >
                <PlusIcon className="size-3.5" />
                Issue New Quote
              </Button>
            )}
          </div>
        </div>

        {/* 1. Live KPI Operations Bar */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: 7-Day Gross Revenue */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 p-4 transition hover:border-sky-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sky-400">7-Day Gross Sales</span>
              <DollarSign className="size-4 text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
              ZAR 418,200
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <TrendingUp className="size-3" />
              <span>+24.6% vs last week</span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Gross profit: <strong className="text-zinc-300 font-mono">ZAR 150,560</strong> (36.0% margin)
            </p>
          </div>

          {/* Card 2: Average Order Value (AOV) */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 transition hover:border-emerald-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-400">Average Order Value</span>
              <ShoppingBag className="size-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
              ZAR 3,420
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <TrendingUp className="size-3" />
              <span>+12.8% B2B trade increase</span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              184 active customer quotes issued this month
            </p>
          </div>

          {/* Card 3: Automated Follow-Up Conversion */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 transition hover:border-amber-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-400">Cadence Win Rate</span>
              <Zap className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
              41.2%
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
              <Clock className="size-3" />
              <span>24h stock hold + 48h fitment cadence</span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              68 deals closed via Whapi &amp; Composio reminders
            </p>
          </div>

          {/* Card 4: AI Response Time */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-950/10 p-4 transition hover:border-purple-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-400">AI Response Velocity</span>
              <Activity className="size-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
              38 seconds
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-400 font-medium">
              <ShieldCheck className="size-3" />
              <span>99.2% faster than manual desk</span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Instant VIN decoding &amp; OEM fitment validation
            </p>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* 2. ADVANCED PROFESSIONAL AUTOMOTIVE ANALYTICS SUITE (SHADCN CHARTS) */}
        {/* ==================================================================== */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                <BarChart3 className="size-5 text-sky-400" />
                Comprehensive Store Analytics &amp; Revenue Trends
              </h2>
              <p className="text-xs text-zinc-400">
                Multi-channel performance, revenue curves, product category shares, and conversion funnels.
              </p>
            </div>
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 text-[11px] w-fit">
              Updated Live &bull; Currency in ZAR
            </Badge>
          </div>

          {/* Top Charts Row: Revenue Area Chart (Line) + Omnichannel Leads (Bar) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chart 1: Revenue & Gross Margin Area Chart (7 Cols) */}
            <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <LineChartIcon className="size-4 text-sky-400" />
                    7-Day Sales &amp; Gross Profit Margin (ZAR)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Daily commercial sales revenue vs parts procurement gross margin.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-sky-500" />
                    <span className="text-[11px] text-zinc-400">Gross Sales</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-zinc-400">Gross Profit</span>
                  </div>
                </div>
              </div>

              <ChartContainer config={revenueChartConfig} className="h-72 w-full pt-2">
                <AreaChart data={REVENUE_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#27272a" }}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `R${val / 1000}k`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => `${value} Performance`}
                        formatter={(value, name) => [
                          `ZAR ${Number(value).toLocaleString()}`,
                          name === "revenue" ? "Gross Sales" : "Gross Profit",
                        ]}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="margin"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorMargin)"
                  />
                </AreaChart>
              </ChartContainer>
            </div>

            {/* Chart 2: Omnichannel Lead Volume & Close Rate (Bar Chart) (5 Cols) */}
            <div className="lg:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <BarChart3 className="size-4 text-emerald-400" />
                    Channel Leads vs Closed Deals
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Lead intake volume vs quote payment rate.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-sky-400" />
                    <span className="text-[11px] text-zinc-400">Inbound</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="text-[11px] text-zinc-400">Closed</span>
                  </div>
                </div>
              </div>

              <ChartContainer config={channelChartConfig} className="h-72 w-full pt-2">
                <BarChart data={CHANNEL_LEADS_DATA} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="channel"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#27272a" }}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          value,
                          name === "inquiries" ? "Inbound Leads" : "Deals Paid",
                        ]}
                      />
                    }
                  />
                  <Bar dataKey="inquiries" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="closed" fill="#34d399" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* Bottom Charts Row: Category Market Share (Donut / Pie) + Conversion Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 3: Category & Brand Market Share (Donut Pie) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <PieChartIcon className="size-4 text-purple-400" />
                  Parts Category Market Share
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Sales distribution across core mechanical categories.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center pt-2">
                <div className="sm:col-span-5 flex justify-center">
                  <ChartContainer config={categoryChartConfig} className="h-52 w-52 shrink-0 aspect-square">
                    <PieChart>
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => [`${value}% share`, name]}
                          />
                        }
                      />
                      <Pie
                        data={CATEGORY_SHARE_DATA}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {CATEGORY_SHARE_DATA.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} stroke="#18181b" strokeWidth={2} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </div>

                <div className="sm:col-span-7 space-y-2">
                  {CATEGORY_SHARE_DATA.map((cat) => (
                    <div
                      key={cat.name}
                      className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-1.5 transition-colors hover:border-zinc-700"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span
                          className="size-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: cat.fill }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-zinc-200">
                            {cat.name}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {cat.brand}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono text-xs font-bold text-zinc-100 shrink-0">
                        {cat.value}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chart 4: Pipeline Conversion Velocity */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <Target className="size-4 text-amber-400" />
                      Deal Pipeline Conversion Funnel
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Lead survival rate from initial RFQ to paid dispatch.
                    </p>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                    56.6% End-to-End Win Rate
                  </Badge>
                </div>

                <div className="space-y-2.5 pt-3">
                  {FUNNEL_DATA.map((step) => (
                    <div key={step.stage} className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-200">{step.stage}</span>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="text-zinc-400">{step.count} inquiries</span>
                          <span className="font-bold text-sky-400">{step.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${step.percentage}%`,
                            backgroundColor: step.fill,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-amber-400" />
                  Fastest converting channel: <strong className="text-zinc-200">WhatsApp 1-Click Quotes</strong>
                </span>
                <Link
                  href="/dashboard/crm"
                  className="font-medium text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                >
                  Manage Pipeline
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Table: Top Moving SKUs & Profit Margins */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <PackageSearch className="size-4 text-sky-400" />
                  Top Fast-Moving Commercial Parts &amp; Trade Margins
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Best-selling automotive SKUs, units moved, trade margin %, and stock health.
                </p>
              </div>
              <Badge variant="outline" className="border-sky-500/30 text-sky-400 text-xs font-mono">
                5 High-Velocity Runners
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                    <th className="pb-2.5 font-medium">Part Number / SKU</th>
                    <th className="pb-2.5 font-medium">Part Description &amp; Vehicle Fitment</th>
                    <th className="pb-2.5 font-medium">Brand</th>
                    <th className="pb-2.5 font-medium text-right">Units Sold</th>
                    <th className="pb-2.5 font-medium text-right">Retail Price</th>
                    <th className="pb-2.5 font-medium text-right">Gross Margin</th>
                    <th className="pb-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-sans">
                  {TOP_MOVING_SKUS.map((item) => (
                    <tr key={item.sku} className="hover:bg-zinc-900/70 transition">
                      <td className="py-3 font-mono font-semibold text-sky-400">
                        {item.sku}
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-zinc-100">{item.name}</div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Car className="size-2.5 text-zinc-500" />
                          {item.vehicle}
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-[10px] border-zinc-700 bg-zinc-800/40 text-zinc-300">
                          {item.brand}
                        </Badge>
                      </td>
                      <td className="py-3 text-right font-mono font-medium text-zinc-200">
                        {item.unitsSold} units
                      </td>
                      <td className="py-3 text-right font-mono text-zinc-100">
                        ZAR {item.unitPrice.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-mono font-semibold text-emerald-400">
                        {item.marginPct}%
                      </td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* 3. Live Feeds from AutoPulse (Direct Agent Actions)                   */}
        {/* ==================================================================== */}
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-bold tracking-tight text-zinc-100">
              Live Operations &amp; Agent Alerts Feed
            </h2>
            <p className="text-xs text-zinc-400">
              Real inventory alerts, customer emails, and TikTok campaigns connected to your AutoPulse store.
            </p>
          </div>

          <Tabs defaultValue="supply" className="w-full">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger
                value="supply"
                className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-400 cursor-pointer"
              >
                <PackageSearch className="size-3.5" />
                Low Stock Sourcing ({storeContext?.lowStockParts?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="communications"
                className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-sky-400 cursor-pointer"
              >
                <Mail className="size-3.5" />
                Customer Inquiries ({storeContext?.messages?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="campaigns"
                className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-400 cursor-pointer"
              >
                <Share2 className="size-3.5" />
                TikTok &amp; Social Ads ({storeContext?.campaigns?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: LOW STOCK SOURCING FEED */}
            <TabsContent value="supply" className="mt-4">
              <div className="space-y-3">
                {storeContext?.lowStockParts && storeContext.lowStockParts.length > 0 ? (
                  storeContext.lowStockParts.map((part) => (
                    <div
                      key={part.sku}
                      className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-amber-400">
                            [{part.sku}]
                          </span>
                          <span className="font-medium text-zinc-100 text-sm">
                            {part.name}
                          </span>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300">
                            {part.brand}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-zinc-400">
                          <span className="text-red-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            Stock: {part.stock} left (Min: {part.threshold})
                          </span>
                          <span>Retail: ZAR {part.price}</span>
                          <span>Bin: {part.location ?? "Main Warehouse"}</span>
                        </div>
                      </div>

                      {supplyBot && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStartNewChat(
                              supplyBot.id,
                              supplyBot.name,
                              `Find suppliers, compare wholesale distributor pricing, and recommend reorder quantities for [${part.sku}] ${part.name} (${part.brand}). Current stock is only ${part.stock} (min threshold: ${part.threshold}).`
                            )
                          }
                          className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs cursor-pointer"
                        >
                          <PackageSearch className="size-3.5" />
                          Hunt Supplier with Supplier Agent
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-xs text-zinc-400">
                    <CheckCircle2 className="size-6 text-emerald-400 mx-auto mb-2" />
                    All catalog parts are currently above safety reorder thresholds!
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: INBOUND CUSTOMER INQUIRIES FEED */}
            <TabsContent value="communications" className="mt-4">
              <div className="space-y-3">
                {storeContext?.messages && storeContext.messages.length > 0 ? (
                  storeContext.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="flex flex-col gap-3 rounded-xl border border-sky-500/20 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px] uppercase">
                            {msg.channel}
                          </Badge>
                          <span className="font-medium text-sm text-zinc-100">
                            {msg.from}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            Direction: {msg.direction}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-300 line-clamp-2">
                          &ldquo;{msg.body}&rdquo;
                        </p>
                      </div>

                      {emailBot && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStartNewChat(
                              emailBot.id,
                              emailBot.name,
                              `Draft a professional reply to ${msg.from} regarding their inquiry: "${msg.body}". Provide quote details and payment link if applicable.`
                            )
                          }
                          className="shrink-0 gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs cursor-pointer"
                        >
                          <Mail className="size-3.5" />
                          Draft Reply with Email Agent
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-xs text-zinc-400">
                    No unread customer messages at this time.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: TIKTOK & SOCIAL MARKETING FEED */}
            <TabsContent value="campaigns" className="mt-4">
              <div className="space-y-3">
                {storeContext?.campaigns && storeContext.campaigns.length > 0 ? (
                  storeContext.campaigns.map((camp) => (
                    <div
                      key={camp.name}
                      className="flex flex-col gap-3 rounded-xl border border-purple-500/20 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] uppercase">
                            {camp.platform}
                          </Badge>
                          <span className="font-medium text-sm text-zinc-100">
                            {camp.name}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {camp.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-zinc-400">
                          <span>Spend: ZAR {camp.spend.toLocaleString()}</span>
                          <span className="text-purple-300 font-semibold">
                            Leads Generated: {camp.conversions}
                          </span>
                        </div>
                      </div>

                      {socialBot && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStartNewChat(
                              socialBot.id,
                              socialBot.name,
                              `Analyze our ${camp.platform} campaign "${camp.name}" (Spend: ZAR ${camp.spend}, Leads: ${camp.conversions}). Provide suggestions to lower cost per lead and create 3 new video hooks.`
                            )
                          }
                          className="shrink-0 gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs cursor-pointer"
                        >
                          <Share2 className="size-3.5" />
                          Optimize with Social Agent
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-xs text-zinc-400">
                    No active ad campaigns configured.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
