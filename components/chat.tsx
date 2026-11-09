"use client"

import Script from "next/script"
import { useAction, useMutation, useQuery } from "convex/react"
import { useRef, useState, useEffect } from "react"
import { toast } from "@/components/ui/toast"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FileTextIcon, MailIcon, Trash2, MegaphoneIcon, PackageSearchIcon } from "lucide-react"
import type { TeammateBotRecord } from "@/components/bot-dialog"
import { useDesktopPanel } from "@/components/desktop-panel"
import { formatGoogleAccountLabel } from "@/components/gmail-connect-modal"
import { useAgentRunner } from "@/components/agent-runner-provider"
import { parseQuoteFromText } from "@/lib/quote-pdf"
import { ChatQuoteCard } from "@/components/chat-quote-card"

export function Chat({
  chatId,
  bots = [],
  initialPrompt,
}: {
  chatId: string
  bots?: TeammateBotRecord[]
  initialPrompt?: string
}) {
  const desktop = useDesktopPanel()
  const runner = useAgentRunner()
  const currentRun = runner.getRun(chatId)
  const isWorking = runner.isWorking(chatId)

  const data = useQuery(api.teammates.getChat, {
    chatId: chatId as Id<"teammate_chats">,
  })
  const storeContext = useQuery(api.dashboard.botStoreContext, {})
  const sendMessageMut = useMutation(api.teammates.sendMessage)
  const saveReplyMut = useMutation(api.teammates.saveAssistantReply)
  const deleteMessageMut = useMutation(api.teammates.deleteMessage)
  const sendEmailAction = useAction(api.composioTools.sendOutboundEmail)
  const fetchRecentEmailsAction = useAction(api.composioTools.fetchRecentEmails)

  const activeBots = data?.bots ?? bots
  const messages = data?.messages ?? []

  const [selectedBotId, setSelectedBotId] = useState<string | undefined>(
    activeBots[0]?.id
  )
  const [initialPromptSent, setInitialPromptSent] = useState(false)

  const currentBot =
    activeBots.find((b) => b.id === selectedBotId) ?? activeBots[0]

  const botMap = new Map<string, TeammateBotRecord>(
    activeBots.map((b) => [b.id, b])
  )

  const currentBotNameLower = (currentBot?.name ?? "").toLowerCase()
  const currentBotJobLower = (currentBot?.job ?? "").toLowerCase()

  const isCurrentBotQuote =
    currentBotNameLower.includes("quote") ||
    currentBotNameLower.includes("craft") ||
    currentBotJobLower.includes("quote") ||
    currentBotJobLower.includes("pdf") ||
    currentBotJobLower.includes("estimator")

  const isCurrentBotEmail =
    currentBotNameLower.includes("email") ||
    currentBotNameLower.includes("comm") ||
    currentBotNameLower.includes("aero") ||
    currentBotJobLower.includes("email") ||
    currentBotJobLower.includes("communication")

  const isCurrentBotSourcing =
    currentBotNameLower.includes("supplier") ||
    currentBotNameLower.includes("supply") ||
    currentBotNameLower.includes("hunter") ||
    currentBotJobLower.includes("supplier") ||
    currentBotJobLower.includes("supply") ||
    currentBotJobLower.includes("sourcing") ||
    currentBotJobLower.includes("inventory")

  const isCurrentBotMarketing =
    currentBotNameLower.includes("social") ||
    currentBotNameLower.includes("omni") ||
    currentBotNameLower.includes("pulse") ||
    currentBotJobLower.includes("social") ||
    currentBotJobLower.includes("tiktok") ||
    currentBotJobLower.includes("marketing")

  const isCurrentBotWhatsApp =
    currentBotNameLower.includes("whatsapp") ||
    currentBotNameLower.includes("fame") ||
    currentBotJobLower.includes("whatsapp") ||
    currentBotJobLower.includes("client")

  const isCurrentBotOps =
    !isCurrentBotQuote &&
    !isCurrentBotEmail &&
    !isCurrentBotSourcing &&
    !isCurrentBotMarketing &&
    !isCurrentBotWhatsApp

  const handleStop = () => {
    runner.stopTurn(chatId)
  }

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessageMut({
        messageId: messageId as Id<"teammate_messages">,
      })
      toast.add({
        type: "success",
        title: "Message deleted",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Failed to delete message",
        description: err instanceof Error ? err.message : "Error deleting message",
      })
    }
  }

  const handleSubmit = async (input: PromptInputMessage) => {
    const text = input.text.trim()
    if (!text || isWorking) return

    const targetBot = currentBot ?? bots[0]
    if (!targetBot) {
      toast.add({ type: "error", title: "No bot selected to answer" })
      return
    }

    const targetBotNameLower = targetBot.name.toLowerCase()
    const targetBotJobLower = targetBot.job.toLowerCase()

    const isTargetQuote =
      targetBotNameLower.includes("quote") ||
      targetBotNameLower.includes("craft") ||
      targetBotJobLower.includes("quote") ||
      targetBotJobLower.includes("pdf") ||
      targetBotJobLower.includes("estimator")

    const isTargetEmail =
      targetBotNameLower.includes("email") ||
      targetBotNameLower.includes("comm") ||
      targetBotNameLower.includes("aero") ||
      targetBotJobLower.includes("email") ||
      targetBotJobLower.includes("communication")

    const isTargetSourcing =
      targetBotNameLower.includes("supplier") ||
      targetBotNameLower.includes("supply") ||
      targetBotNameLower.includes("hunter") ||
      targetBotJobLower.includes("supplier") ||
      targetBotJobLower.includes("supply") ||
      targetBotJobLower.includes("sourcing") ||
      targetBotJobLower.includes("inventory")

    const isTargetMarketing =
      targetBotNameLower.includes("social") ||
      targetBotNameLower.includes("omni") ||
      targetBotNameLower.includes("pulse") ||
      targetBotJobLower.includes("social") ||
      targetBotJobLower.includes("tiktok") ||
      targetBotJobLower.includes("marketing")

    const isTargetWhatsApp =
      targetBotNameLower.includes("whatsapp") ||
      targetBotNameLower.includes("fame") ||
      targetBotJobLower.includes("whatsapp") ||
      targetBotJobLower.includes("client")

    const isTargetOps =
      !isTargetQuote &&
      !isTargetEmail &&
      !isTargetSourcing &&
      !isTargetMarketing &&
      !isTargetWhatsApp

    // Auto-sync DesktopPanel navigation & action tabs
    const urlMatch = text.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/i)
    if (urlMatch && desktop) {
      let candidate = urlMatch[0].replace(/[.,;:!?)]+$/, "")
      if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
        candidate = `https://${candidate}`
      }
      desktop.setCurrentUrl(candidate)
      if (/account|register|sign\s?up|create\s?an\s?account|book|appointment|demo/i.test(text)) {
        desktop.setOpen(true)
        desktop.setActiveTab("actions")
      }
      if (/desktop|screen|live\s?browser|vnc|remote|chromium/i.test(text) || candidate.includes("cars.co.za")) {
        void desktop.launchCloudDesktop(candidate)
      }
    }

    // Auto-open Gmail Connect modal directly on this page if user requests Gmail connection AND target bot is Email or Ops
    if (desktop && (isTargetEmail || isTargetOps) && /connect.*gmail|email.*connect|connect.*email/i.test(text)) {
      desktop.openGmailModal?.()
    }

    // Auto-dispatch email only if user requests to send an email AND target bot handles email, quotes, or ops
    const emailMatch = text.match(/(?:send|dispatch|draft|shoot)\s+(?:an?\s+)?email\s+(?:to\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
    if (emailMatch && (isTargetEmail || isTargetOps || isTargetQuote)) {
      const recipient = emailMatch[1]
      const sayMatch = text.match(/say(?:ing)?\s+["']?([^"']+)["']?$/i)
      const emailBody = sayMatch ? sayMatch[1].trim() : text
      const emailSubject = /quote|quotation|price/i.test(text)
        ? "AutoPulse Quotation & Pricing Summary"
        : `Message from ${targetBot.name}`

      void sendEmailAction({
        to: recipient,
        subject: emailSubject,
        body: emailBody,
      })
        .then((res) => {
          if (res.success) {
            toast.add({
              type: "success",
              title: "Email Dispatched",
              description: `Sent directly to ${recipient} via connected Gmail!`,
            })
          } else if (!res.isConnected && desktop) {
            desktop.openGmailModal?.()
            toast.add({
              type: "info",
              title: "Connect Gmail to Send",
              description: `Authorize your Gmail inbox to deliver to ${recipient}.`,
            })
          }
        })
        .catch(() => null)
    }

    // Auto-open respective studio based on bot and text
    if (desktop) {
      if ((isTargetQuote || isTargetOps) && /quote|quotation|pdf.*quote|make.*quote|create.*quote|send.*quote|quotecraft/i.test(text)) {
        desktop.setOpen(true)
        desktop.setActiveTab("actions")
        desktop.setActionSubView("quotecraft")
      } else if ((isTargetMarketing || isTargetOps) && /tiktok|instagram|social.*dm|auto.*reply/i.test(text)) {
        desktop.setOpen(true)
        desktop.setActiveTab("actions")
        desktop.setActionSubView("socialdms")
      } else if ((isTargetSourcing || isTargetOps) && /supply|sourcing|reorder|supplier|stockout|po|purchase.*order/i.test(text)) {
        desktop.setOpen(true)
        desktop.setActiveTab("actions")
        desktop.setActionSubView("supplyhunter")
      }
    }

    try {
      await sendMessageMut({
        chatId: chatId as Id<"teammate_chats">,
        text,
        targetBotId: targetBot.id as Id<"teammate_bots">,
      })

      let liveInboxSummary = ""
      if ((isTargetEmail || isTargetOps) && /(?:email|inbox|gmail|mail|message|inquir|today|receive|got)/i.test(text)) {
        try {
          const inboxRes = await fetchRecentEmailsAction({ maxResults: 8 })
          if (inboxRes?.emails && inboxRes.emails.length > 0) {
            liveInboxSummary = [
              `=== REAL LIVE CONNECTED GMAIL INBOX (${inboxRes.account || "banelesouthflow@gmail.com"}) ===`,
              `The user's real connected Gmail account has the following ACTUAL emails:`,
              ...inboxRes.emails.map(
                (e, idx) =>
                  `${idx + 1}. From: ${e.sender}\n   Subject: ${e.subject}\n   Summary: ${e.preview}`
              ),
              `\nCRITICAL DIRECTIVE: When reporting received emails (e.g. "which emails did we get today?"), list the REAL emails above from ${inboxRes.account || "banelesouthflow@gmail.com"}. Do NOT output the demo Marco van Wyk alternator email unless explicitly asked about Marco van Wyk!`,
            ].join("\n")
          }
        } catch (e) {
          console.warn("[Chat] fetchRecentEmails error:", e)
        }
      }

      let storeSummary = ""
      if (storeContext) {
        if (isTargetQuote) {
          // QuoteCraft only needs catalog items and deals/quotes
          storeSummary = [
            storeContext.catalog?.length
              ? `Catalog & Pricing sample:\n${storeContext.catalog.slice(0, 20).map((p) => `- [${p.sku}] ${p.name} | Brand: ${p.brand} | In Stock: ${p.stock} | ZAR ${p.price}`).join("\n")}`
              : "",
            storeContext.deals?.length
              ? `Recent Quotes & Deals:\n${storeContext.deals.slice(0, 5).map((d) => `- ${d.contactName} (${d.status}, ZAR ${d.totalAmount}) - Parts: ${d.partsSummary}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")
        } else if (isTargetSourcing) {
          // SupplyHunter needs low stock alerts and catalog
          storeSummary = [
            storeContext.lowStockParts?.length
              ? `Low Stock Reorder Alerts:\n${storeContext.lowStockParts.map((p) => `- ALERT: ${p.name} [${p.sku}] (only ${p.stock} left, threshold: ${p.threshold})`).join("\n")}`
              : "",
            storeContext.catalog?.length
              ? `Supplier Catalog overview:\n${storeContext.catalog.slice(0, 15).map((p) => `- [${p.sku}] ${p.name} | In Stock: ${p.stock} (min ${p.threshold}) | Retail ZAR ${p.price}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")
        } else if (isTargetMarketing) {
          // OmniPulse needs campaigns
          storeSummary = [
            storeContext.campaigns?.length
              ? `Active Ad Campaigns:\n${storeContext.campaigns.map((c) => `- [${c.platform}] ${c.name} (Status: ${c.status}, Spend: ZAR ${c.spend}, Conversions: ${c.conversions})`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")
        } else if (isTargetEmail) {
          // AeroComm needs liveInbox + messages
          storeSummary = [
            liveInboxSummary,
            storeContext.messages?.length
              ? `Archived Email & WhatsApp inquiries:\n${storeContext.messages.slice(0, 8).map((m) => `- [${m.channel.toUpperCase()}] From ${m.from}: "${m.body.replace(/\n/g, ' ').slice(0, 120)}"`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")
        } else if (isTargetWhatsApp) {
          // AutoFame needs messages + deals + catalog
          storeSummary = [
            storeContext.messages?.length
              ? `WhatsApp Client Communications:\n${storeContext.messages.slice(0, 8).map((m) => `- [${m.channel.toUpperCase()}] From ${m.from}: "${m.body.replace(/\n/g, ' ').slice(0, 120)}"`).join("\n")}`
              : "",
            storeContext.deals?.length
              ? `Active Deals & Finance Pipelines:\n${storeContext.deals.slice(0, 5).map((d) => `- ${d.contactName} (${d.status}, ZAR ${d.totalAmount}) - Parts: ${d.partsSummary}`).join("\n")}`
              : "",
            storeContext.catalog?.length
              ? `Catalog lookup sample:\n${storeContext.catalog.slice(0, 10).map((p) => `- [${p.sku}] ${p.name} | ZAR ${p.price} | Stock: ${p.stock}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n\n")
        } else {
          // AutoPulse Ops AI (Master Central Operations Dispatcher gets the whole picture)
          storeSummary = [
            liveInboxSummary,
            storeContext.catalog?.length
              ? `Catalog sample: ${storeContext.catalog.slice(0, 10).map((p) => `[${p.sku}] ${p.name} | ZAR ${p.price}`).join("; ")}.`
              : "",
            storeContext.lowStockParts?.length
              ? `Low stock alerts: ${storeContext.lowStockParts.map((p) => `${p.name} [${p.sku}] (${p.stock} left)`).join("; ")}.`
              : "",
            storeContext.messages?.length
              ? `Recent messages: ${storeContext.messages.slice(0, 5).map((m) => `[${m.channel}] ${m.from}: "${m.body.slice(0, 60)}"`).join("; ")}.`
              : "",
            storeContext.deals?.length
              ? `Active quotes: ${storeContext.deals.slice(0, 5).map((d) => `${d.contactName} (${d.status}, ZAR ${d.totalAmount})`).join("; ")}.`
              : "",
            storeContext.campaigns?.length
              ? `Ad campaigns: ${storeContext.campaigns.map((c) => `${c.name} (ZAR ${c.spend})`).join("; ")}.`
              : "",
          ].filter(Boolean).join("\n\n")
        }
      }

      let botSpecialization = ""
      if (isTargetWhatsApp) {
        botSpecialization = [
          "=== DOMAIN FOCUS: WHATSAPP AGENT • LIVE WHATSAPP CLIENT EXECUTIVE & DEALS ===",
          "- You are Whatsapp Agent, the autonomous client-servicing AI teammate with direct live access to Whapi.cloud WhatsApp (+27 63 199 5124, Channel ANTMAN-ZPBZZ) and our live database.",
          "- You are ACTIVELY CONNECTED to WhatsApp. You receive incoming WhatsApp inquiries, check stock, calculate pricing and VAT in South African Rand (ZAR), generate formal PDF quotes with payment links (/pay/{dealId}), and dispatch WhatsApp messages directly.",
          "- You handle WhatsApp client relations, vehicle inquiries, and finance application dossiers (WesBank, Absa, Standard Bank, Capitec).",
          "- Guide clients through FICA documentation: ID, Driver's License, 3 Months Bank Statements, Payslips, Proof of Address.",
          "- When drafting a WhatsApp dispatch, provide a clean blockquote (> ...) with the text and offer a direct 1-click wa.me link (https://wa.me/{phone}?text={encoded}).",
          "=== STRICT SPECIALIZATION BOUNDARIES (MANDATORY) ===",
          "- You do NOT manage TikTok advertising or viral scripts. If asked about TikTok, politely direct the user to **Social Agent**.",
          "- You do NOT manage warehouse inventory reorders or supplier POs. If asked about supplier restocking, politely direct the user to **Supplier Agent**.",
          "- You do NOT triage general company email inboxes. If asked about Gmail/Outlook triage, politely direct the user to **Email Agent**.",
        ].join("\n")
      } else if (isTargetEmail) {
        botSpecialization = [
          "=== DOMAIN FOCUS: EMAIL AGENT • COMMUNICATIONS, GMAIL & CRM ===",
          "- Your EXCLUSIVE specialty is managing customer email communications across Gmail, Outlook, and general correspondence.",
          "- You ARE integrated with AutoPulse's Gmail router and the workspace email console via Composio Google OAuth.",
          "- When the user asks 'which emails did we get today?', 'check my emails', or about received emails:",
          "  1. Review the real messages in the LIVE CONNECTED GMAIL INBOX section (banelesouthflow@gmail.com).",
          "  2. List the actual senders, subjects, and clean summaries.",
          "  3. NEVER report the demo Marco van Wyk alternator message as today's new emails unless specifically asked about Marco van Wyk.",
          "- If the user asks how to connect to Gmail, guide them to click 'Connect Gmail' right below or use the Google OAuth modal.",
          "- When drafting emails: provide Subject, Recipient, and clear Body ready to send.",
          "=== STRICT SPECIALIZATION BOUNDARIES (MANDATORY) ===",
          "- You do NOT generate formal customer PDF quotes or calculate complex pricing breakdown. If the user asks for a quotation or PDF quote, politely decline and state: 'I specialize in email communications and inbox triage. For formal PDF quotations and vehicle fitment pricing, please speak to **Quote Agent**.'",
          "- You do NOT manage TikTok video scripts or social media ad campaigns. If asked, politely direct the user to **Social Agent**.",
          "- You do NOT manage supplier restock orders or warehouse inventory levels. If asked, politely direct the user to **Supplier Agent**.",
          "- You do NOT compile vehicle finance dossiers. Direct the user to **Whatsapp Agent**.",
        ].join("\n")
      } else if (isTargetSourcing) {
        botSpecialization = [
          "=== DOMAIN FOCUS: SUPPLIER AGENT • PARTS SOURCING & INVENTORY ===",
          "- Your EXCLUSIVE specialty is keeping inventory stocked, preventing stockouts, finding distributor deals, and managing supplier Purchase Orders (POs).",
          "- Actively analyze the low stock parts and catalog items from the live store data.",
          "- Cite exact SKUs, OEM part numbers (e.g., Bosch 06L903021E, Brembo rotors), current quantities, and minimum thresholds.",
          "- Compare supplier networks (Bosch, Brembo, Denso, NGK, Ferodo, Goldwagen, Midas) and calculate retail vs trade margin.",
          "=== STRICT SPECIALIZATION BOUNDARIES (MANDATORY) ===",
          "- You do NOT generate customer PDF sales quotes. If asked for a quote, politely decline and say: 'I specialize in supplier sourcing and warehouse inventory. For customer-facing PDF quotations and vehicle pricing, please consult **Quote Agent**.'",
          "- You do NOT manage TikTok social media campaigns or video scripts. Direct the user to **Social Agent**.",
          "- You do NOT manage company email inboxes or triage Gmail. Direct the user to **Email Agent**.",
          "- You do NOT handle retail vehicle finance applications. Direct the user to **Whatsapp Agent**.",
        ].join("\n")
      } else if (isTargetMarketing) {
        botSpecialization = [
          "=== DOMAIN FOCUS: SOCIAL AGENT • TIKTOK ADS, VIRAL CREATIVE & SOCIAL DMS ===",
          "- Your EXCLUSIVE specialty is managing AutoPulse's TikTok presence (@autopulse_za · 48.2k followers, 312.5k likes), TikTok DM auto-reply, viral video scripts, and paid TikTok ad campaigns.",
          "- TikTok is FULLY CONNECTED and operational via Composio OAuth (@autopulse_za).",
          "- TikTok DM Auto-Reply is ACTIVE and running in the Action Console (Social DMs tab).",
          "- Top Performing TikTok Content: 'Why your Golf 7 GTI alternator fails at 120,000km — OEM vs Cheap Knockoff' (148k views, 89 DMs); 'Hilux 2.8 GD-6 clutch upgrade breakdown' (94k views, 34 trade inquiries).",
          "- Active TikTok Ad Campaigns: 'Ranger & Hilux 15k Service Kit – Mechanics Promo' (Spend: ZAR 4,250, 38 conversions, active); 'Euro Performance Wiper Blades & Brake Discs Broad Test' (Spend: ZAR 1,190, active).",
          "- Write high-converting hooks, 30-second visual breakdowns, and calls-to-action.",
          "=== STRICT SPECIALIZATION BOUNDARIES (MANDATORY) ===",
          "- You do NOT generate customer PDF quotes or calculate VAT breakdowns. If asked for a formal quotation, politely decline and say: 'I specialize exclusively in TikTok creative, social ad campaigns, and viral growth. For formal customer quotations and PDF quotes, please switch to **Quote Agent**.'",
          "- You do NOT manage warehouse inventory reorders or supplier POs. Direct the user to **Supplier Agent**.",
          "- You do NOT triage company Gmail or Outlook accounts. Direct the user to **Email Agent**.",
        ].join("\n")
      } else if (isTargetQuote) {
        botSpecialization = [
          "=== DOMAIN FOCUS: QUOTE AGENT • QUOTATIONS, DEALS & PDF ENGINE ===",
          "- Your EXCLUSIVE specialty is generating formal, branded PDF quotations and managing automotive quotation deals.",
          "- You pull real-time part numbers, prices, and stock levels from the live catalog (e.g. Toyota genuine headlights, Bosch alternators, Ferodo brake pads, Brembo discs, NGK spark plugs).",
          "- When the user asks for a quotation, PDF quote, price estimate, or asks to quote a customer (e.g. Toyota headlight, Apex Autos, fleet, mechanic):",
          "  1. Search the catalog for the SKU/part (e.g. AP-TOY-HL-0098 Toyota Genuine Front Headlight LH, ZAR 4,800, stock: 12).",
          "  2. Provide a formal quotation breakdown with Quote Reference (e.g. QT-2026-0882), Client Name, Vehicle Specs, and a clean Markdown Table (| SKU | Description | Brand / Tier | Fitment | Price (ZAR) | Stock |).",
          "  3. Calculate Totals: Subtotal in ZAR, 15% South African VAT, and Grand Total in ZAR.",
          "  4. Provide payment/quote link (/pay/{dealId}) and multi-channel dispatch notes (1-Click WhatsApp via Whapi, 1-Click PDF via Gmail).",
          "  5. Note that the official, modern white A4 PDF quotation is ready to view and download via the 'Download PDF' button directly below your message.",
          "- Always present prices in South African Rand (ZAR) with clear 15% VAT calculation.",
          "=== STRICT SPECIALIZATION BOUNDARIES (MANDATORY) ===",
          "- You do NOT manage TikTok social ads, video scripts, or social media DMs. If the user asks about TikTok, Instagram, or social media ads, politely DECLINE and say: 'I specialize exclusively in formal PDF quotations, vehicle fitment, and pricing. For TikTok marketing, video scripts, and social ad campaigns, please consult **Social Agent**.'",
          "- You do NOT manage warehouse reordering, supplier pricing comparisons, or supplier POs. If the user asks about low stock replenishment or distributor ordering, politely DECLINE and say: 'I specialize in customer quotation creation. For inventory replenishment and supplier procurement, please speak to **Supplier Agent**.'",
          "- You do NOT triage general company emails or read Gmail messages. If the user asks to check today's emails or manage correspondence, politely DECLINE and say: 'For email inbox triage and general customer correspondence, please speak with **Email Agent**.'",
          "- You do NOT compile vehicle finance dossiers for banks. If asked about bank finance applications, direct the user to **Whatsapp Agent**.",
          "- Stay strictly focused on quotations, parts pricing, and PDF generation.",
        ].join("\n")
      } else {
        // AutoPulse Ops AI (Master Central Operations Dispatcher)
        botSpecialization = [
          "=== DOMAIN FOCUS: AUTOPULSE OPS AI • MASTER OPERATIONS & DISPATCH ===",
          "- You are the General Manager & Central Dispatch for AutoPulse Commercial Parts.",
          "- You coordinate the specialized AI team across operations:",
          "  * **Quote Agent**: Specialist for formal customer PDF quotations, catalog pricing, and 15% VAT calculation.",
          "  * **Email Agent**: Specialist for email communications, Gmail inbox triage (banelesouthflow@gmail.com), and client email drafts.",
          "  * **Supplier Agent**: Specialist for inventory reorders, low stock alerts, and distributor sourcing (Bosch, Brembo, Denso).",
          "  * **Social Agent**: Specialist for TikTok marketing (@autopulse_za · 48.2k followers), viral video scripts, and TikTok DMs.",
          "  * **Whatsapp Agent**: Specialist for live WhatsApp client conversations (+27 63 199 5124) and vehicle finance dossiers.",
          "- When asked high-level operational questions, give executive overviews and recommend or delegate to the appropriate specialist.",
          "- If asked to send an email, dispatch it through the AutoPulse Gmail router.",
          "- If asked about TikTok DMs or analytics, summarize @autopulse_za metrics or direct to Social Agent.",
        ].join("\n")
      }

      const systemPrompt = [
        `You are ${targetBot.name}, an AI teammate with role: ${targetBot.job}.`,
        targetBot.instructions ? `Instructions: ${targetBot.instructions}` : "",
        botSpecialization,
        storeSummary ? `\n=== RELEVANT CONTEXT ===\n${storeSummary}` : "",
        `GENERAL OPERATIONAL RULES:`,
        `- Maintain strict domain specialization: only perform tasks within your assigned domain. If a user asks for tasks handled by another teammate, politely state your specialization and refer them to the named specialist.`,
        `- NEVER output holding phrases like 'Fetching live data now...', 'Please hold on...', or 'Let me check for you'. Deliver your complete, actionable response immediately in one shot.`,
        `- STRUCTURED MARKDOWN TABLES: Whenever presenting parts, quotes, pricing, stock levels, or comparisons, ALWAYS format the data using clean Markdown Tables (| Column 1 | Column 2 | ...).`,
        `- BOLD & BULLETS: Highlight key part numbers, customer names, financial totals, and urgent alerts in **bold** with clean bullet points.`,
        `- FINANCIAL TOTALS: Clearly display Base Subtotal, 15% South African VAT, and Grand Total in ZAR.`,
        `- MESSAGE DRAFTS: Place email or customer WhatsApp drafts in clean blockquotes (> ...) ready to copy or dispatch.`,
      ]
        .filter(Boolean)
        .join("\n")

      const conversationHistory = [
        { role: "system" as const, content: systemPrompt },
        ...messages.slice(-8).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.text,
        })),
        { role: "user" as const, content: text },
      ]

      void runner.startTurn({
        chatId,
        bot: { id: targetBot.id, name: targetBot.name },
        conversationHistory,
        onSaveReply: async (accumulated) => {
          if (accumulated.trim()) {
            await saveReplyMut({
              chatId: chatId as Id<"teammate_chats">,
              text: accumulated.trim(),
              botId: targetBot.id as Id<"teammate_bots">,
            })
          }
        },
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: "Could not send message",
        description: err instanceof Error ? err.message : "Error sending message",
      })
    }
  }

  // Auto-send initial prompt if arrived via quick action from home dashboard
  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSent &&
      !isWorking &&
      data &&
      messages.length <= 1
    ) {
      setInitialPromptSent(true)
      handleSubmit({ text: initialPrompt, files: [] })
    }
  }, [initialPrompt, initialPromptSent, isWorking, data, messages.length])

  return (
    <>
      <div data-slot="chat" className="flex min-h-0 flex-1 flex-col">
        <Conversation>
          <ConversationContent className="mx-auto w-full max-w-3xl">
            {messages.map((message) => {
              const author =
                message.role === "assistant" && message.botId
                  ? botMap.get(message.botId)
                  : undefined

              const addressee =
                message.role === "user" && message.targetBotId
                  ? botMap.get(message.targetBotId)
                  : undefined

              const quoteData =
                message.role === "assistant"
                  ? parseQuoteFromText(message.text)
                  : null

              return (
                <Message
                  key={message.id}
                  from={message.role}
                  className={author ? "group relative flex-row items-start gap-3" : "group relative"}
                >
                  {author && (
                    <ChatAvatar seed={author.avatar} className="size-8 shrink-0" />
                  )}
                  <MessageContent>
                    {addressee && (
                      <div className="mb-1.5">
                        <Badge
                          variant="outline"
                          className="mr-1.5 max-w-40 pl-1 align-top cursor-default"
                        >
                          <ChatAvatar
                            seed={addressee.avatar}
                            className="size-3.5"
                          />
                          <span className="truncate">{addressee.name}</span>
                        </Badge>
                      </div>
                    )}
                    <MessageResponse>{message.text}</MessageResponse>
                    {quoteData && <ChatQuoteCard quote={quoteData} />}
                  </MessageContent>
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(message.id)}
                    title="Delete message"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-500 hover:text-red-400 cursor-pointer self-start ml-auto shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </Message>
              )
            })}

            {/* Live Streaming Message */}
            {isWorking && (
              <Message
                from="assistant"
                className="flex-row items-start gap-3"
              >
                <ChatAvatar
                  seed={currentBot?.avatar ?? "default"}
                  className="size-8 shrink-0"
                />
                <MessageContent>
                  {currentRun.streamingText ? (
                    <>
                      <MessageResponse>{currentRun.streamingText}</MessageResponse>
                      {parseQuoteFromText(currentRun.streamingText) && (
                        <ChatQuoteCard
                          quote={parseQuoteFromText(currentRun.streamingText)!}
                        />
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 py-1 select-none">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono text-zinc-400">{currentBot?.name ?? "Agent"} is thinking...</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <Skeleton className="h-3.5 w-4/5 bg-zinc-800/80" />
                        <Skeleton className="h-3.5 w-3/5 bg-zinc-800/60" />
                      </div>
                    </div>
                  )}
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-3xl p-4 pt-0">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea placeholder="Send a message..." />
            <PromptInputFooter>
              <PromptInputTools>
                {currentBot && activeBots.length > 1 && (
                  <PromptInputSelect
                    value={currentBot.id}
                    onValueChange={(val) => setSelectedBotId(val as string)}
                  >
                    <PromptInputSelectTrigger
                      aria-label="Bot to talk to"
                      className="cursor-pointer"
                    >
                      <PromptInputSelectValue>
                        <ChatAvatar
                          seed={currentBot.avatar}
                          className="size-5"
                        />
                        {currentBot.name}
                      </PromptInputSelectValue>
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {activeBots.map((bot) => (
                        <PromptInputSelectItem
                          key={bot.id}
                          value={bot.id}
                          className="cursor-pointer"
                        >
                          <ChatAvatar seed={bot.avatar} className="size-5" />
                          {bot.name}
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                )}
                {(isCurrentBotEmail || isCurrentBotOps) && desktop?.openGmailModal && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => desktop.openGmailModal?.()}
                    className={
                      desktop.isGmailActive
                        ? "h-8 gap-1.5 border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200 cursor-pointer"
                        : "h-8 gap-1.5 border border-zinc-800 bg-zinc-900/60 px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                    }
                  >
                    {desktop.isGmailActive ? (
                      <>
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        <span className="max-w-36 truncate">
                          {desktop.gmailAccountLabel
                            ? formatGoogleAccountLabel(desktop.gmailAccountLabel)
                            : "Gmail Connected"}
                        </span>
                      </>
                    ) : (
                      <>
                        <MailIcon className="size-3.5" />
                        Connect Gmail
                      </>
                    )}
                  </Button>
                )}
                {(isCurrentBotQuote || isCurrentBotOps) && desktop?.openQuoteModal && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      desktop.setActiveTab?.("actions")
                      desktop.openQuoteModal?.()
                    }}
                    className="h-8 gap-1.5 border border-violet-500/20 bg-violet-500/5 px-2.5 text-xs font-medium text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 cursor-pointer"
                  >
                    <FileTextIcon className="size-3.5" />
                    Quotes &amp; PDF
                  </Button>
                )}
                {(isCurrentBotMarketing || isCurrentBotOps) && desktop && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      desktop.setOpen(true)
                      desktop.setActiveTab("actions")
                      desktop.setActionSubView("socialdms")
                    }}
                    className="h-8 gap-1.5 border border-pink-500/20 bg-pink-500/5 px-2.5 text-xs font-medium text-pink-400 hover:bg-pink-500/10 hover:text-pink-300 cursor-pointer"
                  >
                    <MegaphoneIcon className="size-3.5" />
                    TikTok &amp; DMs
                  </Button>
                )}
                {(isCurrentBotSourcing || isCurrentBotOps) && desktop && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      desktop.setOpen(true)
                      desktop.setActiveTab("actions")
                      desktop.setActionSubView("supplyhunter")
                    }}
                    className="h-8 gap-1.5 border border-amber-500/20 bg-amber-500/5 px-2.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer"
                  >
                    <PackageSearchIcon className="size-3.5" />
                    Parts Sourcing
                  </Button>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={isWorking ? "streaming" : "ready"}
                onStop={handleStop}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </>
  )
}
