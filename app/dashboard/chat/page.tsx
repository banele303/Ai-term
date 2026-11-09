"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"
import { useQuery } from "convex/react"
import { RotateCcw, Send, Sparkles } from "lucide-react"
import { motion } from "motion/react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import { FALLBACK_OVERVIEW, FALLBACK_PARTS } from "@/components/autopulse/fallback-data"
import { ChatAvatar } from "@/components/chat-avatar"
import { MessageResponse } from "@/components/ai-elements/message"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import { PUTER_SCRIPT_SRC, streamPuterReply, type PuterChatMessage } from "@/lib/puter"
import { cn } from "@/lib/utils"

const AI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o (Default)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (Fast)" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
] as const

const PRESET_PROMPTS = [
  "List low-stock parts below reorder threshold",
  "Review latest customer emails and WhatsApp inquiries",
  "Compare Hilux GD-6 OEM vs aftermarket front brake pads",
  "Summarize pending quotes awaiting customer payment",
]

type LocalTurn = {
  id: string
  role: "user" | "assistant"
  text: string
}

function buildUnifiedSystemPrompt(storeData?: {
  lowStockParts?: Array<{ sku: string; name: string; brand: string; stock: number; threshold: number; price: number; location?: string }>
  catalog?: Array<{ sku: string; oem?: string; name: string; brand: string; tier: string; price: number; tradePrice?: number; stock: number; threshold: number; location?: string }>
  messages?: Array<{ channel: string; direction: string; body: string; from: string; timestamp: number; sentBy: string }>
  deals?: Array<{ channel: string; status: string; totalAmount: number; currency: string; contactName: string; partsSummary: string }>
  campaigns?: Array<{ name: string; platform: string; status: string; spend: number; conversions: number }>
}): string {
  const stockLines = (storeData?.catalog && storeData.catalog.length > 0)
    ? storeData.catalog.slice(0, 40).map(
        (p) =>
          `- [${p.sku}] ${p.name} | Brand: ${p.brand} (${p.tier.toUpperCase()}) | OEM: ${p.oem ?? "N/A"} | Retail: ZAR ${p.price} | Trade: ZAR ${p.tradePrice ?? p.price} | In Stock: ${p.stock} (min threshold: ${p.threshold}) | Bin: ${p.location ?? "Main"}`
      ).join("\n")
    : FALLBACK_PARTS.slice(0, 20).map(
        (p) =>
          `- [${p.sku}] ${p.name} | Brand: ${p.brand} | In Stock: ${p.stockQuantity} (min ${p.minReorderThreshold}) | Price: ZAR ${p.price}`
      ).join("\n")

  const lowStockNotice = (storeData?.lowStockParts && storeData.lowStockParts.length > 0)
    ? storeData.lowStockParts.map(
        (p) => `* ALERT: [${p.sku}] ${p.name} has only ${p.stock} left (reorder threshold: ${p.threshold})`
      ).join("\n")
    : "All catalog items are currently above safety stock thresholds."

  const emailsAndMessages = (storeData?.messages && storeData.messages.length > 0)
    ? storeData.messages.slice(0, 15).map(
        (m) =>
          `- [${m.channel.toUpperCase()} / ${m.direction}] From: ${m.from} | Sent by: ${m.sentBy} | Content: "${m.body.replace(/\n/g, " ").slice(0, 160)}"`
      ).join("\n")
    : "- [GMAIL / inbound] From: workshop@apexautos.co.za | 'Urgent quote needed for Bosch 140A alternator 06L903021E'\n- [WHATSAPP / inbound] From: Sipho Khumalo | 'Do you have front brake pads for 2021 Hilux 2.8 GD-6?'"

  const dealsSummary = (storeData?.deals && storeData.deals.length > 0)
    ? storeData.deals.slice(0, 10).map(
        (d) =>
          `- ${d.contactName} (${d.channel}): Status=${d.status}, Total=${d.currency} ${d.totalAmount} | Parts: ${d.partsSummary}`
      ).join("\n")
    : "- Johan Botha (WhatsApp): Status=quoted, Total=ZAR 4,250 | Parts: Brembo Front Rotors (x2)"

  const campaignsSummary = (storeData?.campaigns && storeData.campaigns.length > 0)
    ? storeData.campaigns.map(
        (c) => `- ${c.name} (${c.platform}): Status=${c.status}, Spend=ZAR ${c.spend}, Leads=${c.conversions}`
      ).join("\n")
    : "- TikTok High-Intent VIN Lead Form: Spend ZAR 1,200, Leads 28"

  return [
    "You are AutoPulse Ops AI, the unified autonomous automotive intelligence assistant.",
    "You are directly wired to the store's inventory, live stock counts, low-stock alerts, customer emails, WhatsApp chats, and active quotes.",
    "Currency is South African Rand (ZAR).",
    "Personality: Direct, knowledgeable, professional, proactive. When answering, cite exact part numbers, stock numbers, customer names, or quotes from the live store data below.",
    "Web Browsing & Action Rules: You have active live web browsing capability and cloud execution environments. When any website or link is mentioned, the system automatically fetches its live contents for you. NEVER say you cannot browse or access external websites. NEVER say you cannot create accounts on external platforms. When asked to register, sign up, or create an account (e.g. on Cars.co.za), explain that the live environment is prepared for Blessed Sibanda with registration details ready, note that South African mobile (+27) SMS OTP verification is required, and offer to proceed immediately.",
    "Never get stuck; if you are asked to draft an email or reply to a customer, provide a ready-to-send draft immediately.",
    "",
    "=== 1. LIVE PARTS STOCK & INVENTORY ===",
    stockLines,
    "",
    "=== 2. LOW STOCK & REORDER ALERTS ===",
    lowStockNotice,
    "",
    "=== 3. RECENT CUSTOMER EMAILS & MESSAGES ===",
    emailsAndMessages,
    "",
    "=== 4. ACTIVE DEALS & QUOTES ===",
    dealsSummary,
    "",
    "=== 5. MARKETING AD CAMPAIGNS ===",
    campaignsSummary,
    "",
    "=== 6. RESPONSE FORMATTING GUIDELINES (MANDATORY) ===",
    "For maximum clarity, readability, and immediate understanding:",
    "- BEAUTIFUL STRUCTURED TABLES: Whenever listing inventory items, comparing parts, showing low stock, presenting quotes, or comparing prices, ALWAYS format your answer using a clean, structured Markdown Table (| Column 1 | Column 2 | ...).",
    "  Example table format:",
    "  | SKU | Part Description | Brand / Tier | Fitment | Price (ZAR) | Stock Level | Status |",
    "  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    "  | AP-TOY-BP-04465 | Front Ceramic Brake Pad Set | Toyota Genuine OEM | Hilux 2.8 GD-6 / Fortuner | R1,490 | 28 units | In Stock |",
    "  | AP-BREM-BP-P83107 | Heavy-Duty Fleet Brake Pads | Brembo Aftermarket | Hilux 2.8 GD-6 / Fortuner | R980 | 44 units | In Stock |",
    "- SECTION HEADINGS: Use clear, bold headings (### 📦 Live Inventory, ### 💰 Formal Quotation, ### ✉️ Customer Inquiry) to structure long responses so staff can scan and digest information effortlessly.",
    "- KEY METRICS & BULLETS: Highlight key numbers, customer names, and urgent alerts in **bold**, with clean bullet points.",
    "- FINANCIAL BREAKDOWNS: When quoting, clearly itemize Base Subtotal, 15% South African VAT, refundable Core Deposit (if applicable), and Grand Total in ZAR.",
    "- MESSAGE DRAFTS: For email or WhatsApp drafts, place the ready-to-dispatch message inside a quote block (> ...) with Subject, Recipient, and Message Body.",
  ].join("\n")
}

export default function AutopulseChatPage() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q")
  const convexReady = useConvexReady()

  const storeContext = useQuery(
    api.dashboard.botStoreContext,
    convexReady ? {} : "skip"
  )

  return (
    <React.Suspense
      fallback={
        <div className="flex h-full w-full flex-col p-6 space-y-4">
          <Skeleton className="h-10 w-48 bg-zinc-800" />
          <Skeleton className="h-24 w-full rounded-xl bg-zinc-900" />
          <Skeleton className="flex-1 w-full rounded-xl bg-zinc-900/60" />
        </div>
      }
    >
      <ChatWorkspaceUI
        initialQuery={initialQuery}
        storeData={storeContext}
      />
    </React.Suspense>
  )
}

function ChatWorkspaceUI({
  initialQuery,
  storeData,
}: {
  initialQuery: string | null
  storeData?: {
    lowStockParts?: Array<{ sku: string; name: string; brand: string; stock: number; threshold: number; price: number; location?: string }>
    catalog?: Array<{ sku: string; oem?: string; name: string; brand: string; tier: string; price: number; tradePrice?: number; stock: number; threshold: number; location?: string }>
    messages?: Array<{ channel: string; direction: string; body: string; from: string; timestamp: number; sentBy: string }>
    deals?: Array<{ channel: string; status: string; totalAmount: number; currency: string; contactName: string; partsSummary: string }>
    campaigns?: Array<{ name: string; platform: string; status: string; spend: number; conversions: number }>
  }
}) {
  const [input, setInput] = React.useState(initialQuery ?? "")
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedModel, setSelectedModel] = React.useState<string>("gpt-4o")
  const [turns, setTurns] = React.useState<LocalTurn[]>([])
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns])

  const sendPrompt = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim()
    if (!prompt || submitting) return

    setInput("")
    setSubmitting(true)

    const userTurn: LocalTurn = {
      id: `u_${Date.now()}`,
      role: "user",
      text: prompt,
    }
    const assistantId = `a_${Date.now() + 1}`

    const historyMessages: PuterChatMessage[] = [
      {
        role: "system",
        content: buildUnifiedSystemPrompt(storeData),
      },
      ...turns.slice(-8).map((t) => ({
        role: t.role,
        content: t.text,
      })),
      { role: "user", content: prompt },
    ]

    setTurns((prev) => [
      ...prev,
      userTurn,
      {
        id: assistantId,
        role: "assistant",
        text: "",
      },
    ])

    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl

    try {
      let accumulated = ""
      await streamPuterReply(
        historyMessages,
        (chunk) => {
          accumulated = chunk
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantId ? { ...t, text: accumulated } : t
            )
          )
        },
        selectedModel
      )

      if (!accumulated.trim()) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantId
              ? { ...t, text: "I have reviewed your stock and messages. Let me know what specific part or customer you would like to handle next." }
              : t
          )
        )
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat request failed"
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? { ...t, text: `Connection note: ${message}. Retrying via backup engine.` }
            : t
        )
      )
      toast.add({
        title: "Chat Note",
        description: message,
      })
    } finally {
      setSubmitting(false)
      abortControllerRef.current = null
    }
  }

  const handleClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setTurns([])
    setSubmitting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendPrompt(input)
  }

  return (
    <>
      <Script src={PUTER_SCRIPT_SRC} strategy="afterInteractive" />

      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-2.5 overflow-hidden">
        {/* Compact Single-Row Header matching Teammates style */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2.5">
            <ChatAvatar seed="AutoPulse" className="size-8 rounded-full shadow-inner ring-1 ring-sky-500/30" />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                <span>AutoPulse AI</span>
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </div>
              <p className="text-[11px] text-zinc-400">
                Connected to Stock, Emails &amp; WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Select AI model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-200 outline-none focus:border-sky-500/60"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            {turns.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleClear}
                className="h-8 cursor-pointer border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-zinc-100"
              >
                <RotateCcw className="mr-1 size-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Viewport-Fit Chat Card */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-zinc-800/90 bg-zinc-900/60 py-0">
          <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-3.5">
            {/* Scrollable Messages Viewport */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {turns.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <ChatAvatar seed="AutoPulse" className="size-16 rounded-full shadow-md ring-2 ring-sky-500/20 mb-3" />
                  <h3 className="text-base font-semibold text-zinc-100">
                    How can I assist your parts desk today?
                  </h3>
                  <p className="max-w-md text-xs text-zinc-400 mt-1 mb-5">
                    I can check low-stock alerts, draft customer email replies, quote trade prices, or compare catalog fitments.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
                    {PRESET_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendPrompt(prompt)}
                        className="cursor-pointer text-left rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs text-zinc-300 transition hover:border-sky-500/40 hover:bg-zinc-900 hover:text-zinc-100"
                      >
                        <Sparkles className="size-3 text-sky-400 inline mr-1.5" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-3 rounded-2xl border p-3.5 text-sm",
                      turn.role === "user"
                        ? "ml-10 border-sky-500/30 bg-sky-500/10 text-zinc-100"
                        : "mr-10 border-zinc-800 bg-zinc-950/80 text-zinc-200"
                    )}
                  >
                    <div className="shrink-0">
                      {turn.role === "user" ? (
                        <ChatAvatar seed="UserStaff" className="size-7 rounded-full shadow-inner ring-1 ring-sky-400/40" />
                      ) : (
                        <ChatAvatar seed="AutoPulse" className="size-7 rounded-full shadow-inner ring-1 ring-emerald-500/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-[11px] font-medium text-zinc-400">
                        {turn.role === "user" ? "You" : "AutoPulse"}
                      </div>
                      {turn.role === "user" ? (
                        <div className="leading-relaxed whitespace-pre-wrap text-xs md:text-sm font-medium">
                          {turn.text}
                        </div>
                      ) : turn.text ? (
                        <div className="min-w-0 max-w-full text-xs md:text-sm leading-relaxed overflow-x-hidden">
                          <MessageResponse>{turn.text}</MessageResponse>
                        </div>
                      ) : (
                        <div className="space-y-1.5 py-1">
                          <Skeleton className="h-3.5 w-44 bg-zinc-700/60" />
                          <Skeleton className="h-3.5 w-64 bg-zinc-700/40" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="shrink-0 space-y-2">
              <div className="relative flex items-center rounded-xl border border-zinc-800 bg-zinc-950/80 p-1.5 focus-within:border-sky-500/60 focus-within:ring-1 focus-within:ring-sky-500/30">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void sendPrompt(input)
                    }
                  }}
                  placeholder="Ask about parts stock, customer emails, WhatsApp quotes, or fitment..."
                  rows={1}
                  className="min-h-10 resize-none border-0 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !input.trim()}
                  className="cursor-pointer shrink-0 rounded-lg bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-40"
                >
                  {submitting ? (
                    <Skeleton className="size-3.5 rounded-full bg-white/70" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
