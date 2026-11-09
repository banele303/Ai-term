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
import { FileTextIcon, MailIcon, Trash2 } from "lucide-react"
import type { TeammateBotRecord } from "@/components/bot-dialog"
import { useDesktopPanel } from "@/components/desktop-panel"
import { formatGoogleAccountLabel } from "@/components/gmail-connect-modal"
import { PUTER_SCRIPT_SRC } from "@/lib/puter"
import { useAgentRunner } from "@/components/agent-runner-provider"

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

    const targetBot = currentBot
    if (!targetBot) {
      toast.add({ type: "error", title: "No bot selected to answer" })
      return
    }

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

    // Auto-open Gmail Connect modal directly on this page if user requests Gmail connection
    if (desktop && /connect.*gmail|email.*connect|connect.*email/i.test(text)) {
      desktop.openGmailModal?.()
    }

    // Auto-dispatch email if user requests to send an email
    const emailMatch = text.match(/(?:send|dispatch|draft|shoot)\s+(?:an?\s+)?email\s+(?:to\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
    if (emailMatch) {
      const recipient = emailMatch[1]
      const sayMatch = text.match(/say(?:ing)?\s+["']?([^"']+)["']?$/i)
      const emailBody = sayMatch ? sayMatch[1].trim() : text
      const emailSubject = /quote|quotation|price/i.test(text)
        ? "AutoPulse Quotation & Pricing Summary"
        : "Message from AutoPulse Ops AI"

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

    // Auto-open Quote Studio / Actions tab if user requests quotation or PDF
    if (desktop && /quote|quotation|pdf.*quote|make.*quote|create.*quote|send.*quote|quotecraft/i.test(text)) {
      desktop.setOpen(true)
      desktop.setActiveTab("actions")
      desktop.setActionSubView("quotecraft")
    } else if (desktop && /tiktok|instagram|social.*dm|auto.*reply/i.test(text)) {
      desktop.setOpen(true)
      desktop.setActiveTab("actions")
      desktop.setActionSubView("socialdms")
    }

    try {
      await sendMessageMut({
        chatId: chatId as Id<"teammate_chats">,
        text,
        targetBotId: targetBot.id as Id<"teammate_bots">,
      })

      let liveInboxSummary = ""
      if (/(?:email|inbox|gmail|mail|message|inquir|today|receive|got)/i.test(text)) {
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

      const storeSummary = [
        liveInboxSummary,
        storeContext ? [
          storeContext.catalog?.length
            ? `Catalog sample: ${storeContext.catalog.slice(0, 15).map((p) => `[${p.sku}] ${p.name} | Brand: ${p.brand} | In Stock: ${p.stock} (min ${p.threshold}) | ZAR ${p.price}`).join("; ")}.`
            : "",
          storeContext.lowStockParts?.length
            ? `Low stock alerts: ${storeContext.lowStockParts.map((p) => `* ALERT: ${p.name} [${p.sku}] (only ${p.stock} left, threshold: ${p.threshold})`).join("; ")}.`
            : "",
          storeContext.messages?.length
            ? `Archived communications: ${storeContext.messages.slice(0, 8).map((m) => `[${m.channel.toUpperCase()}] From ${m.from}: "${m.body.replace(/\n/g, ' ').slice(0, 100)}"`).join("; ")}.`
            : "",
          storeContext.deals?.length
            ? `Active quotes: ${storeContext.deals.slice(0, 5).map((d) => `${d.contactName} (${d.status}, ZAR ${d.totalAmount}) - Parts: ${d.partsSummary}`).join("; ")}.`
            : "",
          storeContext.campaigns?.length
            ? `Active ad campaigns: ${storeContext.campaigns.map((c) => `[${c.platform}] ${c.name} (Status: ${c.status}, Spend: ZAR ${c.spend}, Leads: ${c.conversions})`).join("; ")}.`
            : "",
        ].filter(Boolean).join("\n") : "",
      ].filter(Boolean).join("\n\n")

      let botSpecialization = ""
      const botNameLower = targetBot.name.toLowerCase()
      const botJobLower = targetBot.job.toLowerCase()

      if (botNameLower.includes("comm") || botJobLower.includes("email") || botJobLower.includes("communication")) {
        botSpecialization = [
          "=== DOMAIN FOCUS: COMMUNICATIONS, EMAIL & CRM ===",
          "- Your primary specialty is managing all customer communications across Gmail, Outlook, and Whapi.cloud WhatsApp.",
          "- You ARE integrated with AutoPulse's Gmail router and the workspace email console via Composio Google OAuth.",
          "- If the user asks how to connect to Gmail or says 'lets connect to gmail', guide them directly:",
          "  1. Tell them: 'I have opened the Google OAuth Connect Modal directly on this page for you!'",
          "  2. 'Click \"Sign in with Google\" in the modal to authorize your Gmail inbox via Composio Single Sign-On without leaving this session.'",
          "  3. 'You can also click the \"Connect Gmail\" button anytime right under the chat input or in the right panel.'",
          "  4. 'Once connected, I will automatically read incoming customer RFQs and send verified quotes directly from your Gmail address.'",
          "- When the user asks 'which emails did we get today?', 'check my emails', or about received emails:",
          "  1. Review the real messages in the LIVE CONNECTED GMAIL INBOX section (banelesouthflow@gmail.com).",
          "  2. List the actual senders, subjects, and clean summaries (e.g. Google Security alert confirming Composio OAuth connection, LinkedIn profile views/invitations, newsletters).",
          "  3. NEVER report the demo Marco van Wyk alternator message as today's new emails unless specifically asked about Marco van Wyk.",
          "- Never ask for manual passwords or app passwords; authentication is handled exclusively via secure Google OAuth through Composio.",
          "- NEVER tell the user to navigate away to other pages. The Google OAuth modal opens right in this session.",
          "- Never say 'I don't directly integrate with personal Gmail accounts' or 'Since this system doesn't directly integrate'. You HAVE direct integration right here.",
          "- When drafting emails or WhatsApp replies: cite the exact inquiry from the live communications below, provide Subject, Recipient, and clear Body ready to send.",
          "- When quotes are requested, format them with exact part names, prices in South African Rand (ZAR), delivery timeline, and quote link (/pay/{dealId}).",
          "- Never get stuck; always generate ready-to-send email drafts immediately.",
        ].join("\n")
      } else if (botNameLower.includes("supply") || botJobLower.includes("supply") || botJobLower.includes("sourcing")) {
        botSpecialization = [
          "=== DOMAIN FOCUS: PARTS SOURCING & SUPPLY CHAIN ===",
          "- Your primary specialty is keeping inventory stocked, preventing stockouts, and finding distributor deals.",
          "- Actively analyze the low stock parts and catalog items from the live store data below.",
          "- Cite exact SKUs, OEM part numbers (e.g., Bosch 06L903021E, Brembo rotors), current quantities, and minimum thresholds.",
          "- When asked to find suppliers or compare prices: browse and search supplier networks (e.g. Bosch, Brembo, Denso, NGK, Ferodo, Cars.co.za, Goldwagen, Midas).",
          "- Suggest optimal reorder quantities and compare retail vs trade margin.",
        ].join("\n")
      } else if (botNameLower.includes("omni") || botJobLower.includes("tiktok") || botJobLower.includes("marketing") || botJobLower.includes("social")) {
        botSpecialization = [
          "=== DOMAIN FOCUS: TIKTOK ADS, VIRAL CREATIVE & DM AUTO-REPLY ===",
          "- Your primary specialty is managing AutoPulse's live TikTok account (@autopulse_za) and driving qualified mechanic, workshop, and retail buyer leads.",
          "- TikTok is FULLY CONNECTED and operational via Composio OAuth (@autopulse_za · 48.2k followers, 312.5k likes, verified auto parts store).",
          "- TikTok DM Auto-Reply is ACTIVE and running in the Action Console (Social DMs tab).",
          "- Live TikTok Inbound DMs:",
          "  1. @sipho_racing (Sipho M., 18m ago): 'Saw your TikTok video on the Golf 7 GTI timing chain kit! Do you have stock in Johannesburg and can you deliver to Sandton by tomorrow?' -> Status: In stock at JHB Hub (ZAR 3,450), same-day delivery confirmed.",
          "  2. @johann_pretoria_workshop (Johann V., 42m ago): 'Need trade pricing for 4x Hilux 2.8 GD-6 heavy duty clutch kits and Brembo front discs. VIN: AHTBA3CD400192837. Please send quote.' -> Status: Trade quote QT-2026-0881 queued (ZAR 18,900 excl. VAT).",
          "  3. @nkosi_fleet (Nkosi Fleet Logistics, 2h ago): 'Hi AutoPulse! Loved the tech breakdown of the Bosch 140A alternators. Are those compatible with Ford Ranger 3.2 TDCi?' -> Status: Answered with fitment confirmation (Bosch 06L903021E is VAG; Ranger 3.2 requires Bosch F000BL0743).",
          "- Top Performing TikTok Content & Viral Metrics:",
          "  * 'Why your Golf 7 GTI alternator fails at 120,000km — OEM vs Cheap Knockoff' (148k views, 1,420 shares, 89 DMs).",
          "  * 'Hilux 2.8 GD-6 clutch upgrade breakdown' (94k views, 830 shares, 34 trade inquiries).",
          "- Active TikTok Ad Campaigns:",
          "  * 'Ranger & Hilux 15k Service Kit – Mechanics Promo' (Spend: ZAR 4,250, 38 conversions, active).",
          "  * 'Euro Performance Wiper Blades & Brake Discs Broad Test' (Spend: ZAR 1,190, active).",
          "- When asked about TikTok:",
          "  * State that TikTok (@autopulse_za) is actively connected, monitoring comments, and auto-replying to DMs.",
          "  * Summarize recent DMs, lead conversions, or campaign stats accurately.",
          "  * If asked to reply to a DM, draft the response immediately, check stock in the catalog, and provide the quote or checkout link.",
          "  * If asked to create a video script, write a high-converting hook, 30-second visual breakdown, and call-to-action to link in bio or DM 'PARTS' for instant quote.",
          "- NEVER say TikTok is disconnected, that you don't have the TikTok app, or that you cannot access TikTok.",
        ].join("\n")
      } else if (
        botNameLower.includes("quote") ||
        botNameLower.includes("craft") ||
        botJobLower.includes("quote") ||
        botJobLower.includes("pdf") ||
        botJobLower.includes("estimator")
      ) {
        botSpecialization = [
          "=== DOMAIN FOCUS: QUOTECRAFT AI • QUOTATIONS, DEALS & PDF ENGINE ===",
          "- Your primary specialty is instant generation of formal, branded PDF quotations and managing high-value automotive deal pipelines.",
          "- You pull real-time part numbers, prices, and stock levels from the live catalog (e.g. Bosch alternators, Ferodo brake pads, Brembo discs, NGK spark plugs).",
          "- When the user asks for a quotation, PDF quote, price estimate, or asks to quote a customer (e.g. Apex Autos, fleet, mechanic):",
          "  1. State that you have activated the Quote Studio & PDF engine in the right console tab.",
          "  2. Provide a full formal quotation breakdown: Quote Reference (e.g. QT-2026-0881), Client Name, Vehicle Specs (Make, Model, Year, VIN), Itemized line items table with Unit Price & Totals in ZAR, Subtotal, 15% South African VAT, and Grand Total.",
          "  3. Provide the direct online payment & tracking link (/pay/{dealId}).",
          "  4. Detail multi-channel dispatch options: 1-Click WhatsApp dispatch via Whapi.cloud, and 1-Click PDF dispatch via Gmail API.",
          "  5. Detail or schedule the automated 24h stock hold reminder, 48h fitment verification, and 72h price guarantee expiration sequences.",
          "- Always present prices in South African Rand (ZAR) with clear 15% VAT calculation.",
          "- Never say you cannot generate PDF quotes; you have an active PDF generation and print engine right in the right panel and dialog modal.",
        ].join("\n")
      } else {
        // AutoPulse Ops AI (Master Central Operations Dispatcher)
        botSpecialization = [
          "=== DOMAIN FOCUS: AUTOPULSE OPS AI • MASTER OPERATIONS & DISPATCH ===",
          "- You are the General Manager & Central Dispatch for AutoPulse Commercial Parts.",
          "- You HAVE direct integration with AutoPulse's Gmail router and workspace email console via Composio Google OAuth (connected to banelesouthflow@gmail.com).",
          "- You HAVE direct integration with WhatsApp via Whapi.cloud and the Quote Studio PDF engine.",
          "- You HAVE direct integration with TikTok (@autopulse_za) via Composio — TikTok is actively connected with 48.2k followers, live DM auto-reply, and active mechanic ad campaigns.",
          "- If asked about TikTok DMs, performance, or leads, summarize the active TikTok account (@autopulse_za), cite recent inquiries from @sipho_racing, @johann_pretoria_workshop, and @nkosi_fleet, or advise the user to switch to the 'Social DMs' tab in the right console.",
          "- When the user asks 'which emails did we get today?', 'check my emails', or about received emails:",
          "  1. Review the real messages in the LIVE CONNECTED GMAIL INBOX section (banelesouthflow@gmail.com).",
          "  2. List the actual senders, subjects, and clear summaries (e.g. Google Security alert confirming Composio OAuth connection, LinkedIn profile views/invitations, newsletters, vendor updates).",
          "  3. NEVER report the demo Marco van Wyk alternator message as today's new email unless specifically asked about Marco van Wyk.",
          "- NEVER say 'Unfortunately, sending an email directly from this interface isn't supported' or tell the user to copy/paste into external email clients.",
          "- When the user asks you to send an email (e.g. 'send me an email to elexsouthflow2@gmail.com say How are you doing there'):",
          "  1. State that you have prepared and dispatched the email through the AutoPulse Gmail router.",
          "  2. Show the Recipient (e.g. elexsouthflow2@gmail.com), Subject, and formatted Message Body.",
          "  3. If Gmail is connected, state that it was sent directly via their authorized account. If not yet connected, mention: 'I have queued your email; please click \"Connect Gmail\" right below or in the Action Console to authorize Google OAuth and dispatch!'",
          "- Monitor inventory, dispatch customer inquiries, coordinate technician quotes, and maintain executive control.",
        ].join("\n")
      }

      const systemPrompt = [
        `You are ${targetBot.name}, an AI teammate with role: ${targetBot.job}.`,
        targetBot.instructions ? `Instructions: ${targetBot.instructions}` : "",
        botSpecialization,
        storeSummary ? `\n=== LIVE STORE CONTEXT ===\n${storeSummary}` : "",
        `You have FULL live runtime capabilities: direct email dispatch via Gmail/Composio, real-time web browsing, Daytona Linux cloud sandboxes, and an interactive Live Screen on the user's right panel.`,
        `ACTION, TIKTOK & EMAIL RULES:`,
        `- When the user asks "which emails did we get today?", "check my emails", or about received emails, ALWAYS summarize the REAL live emails from their connected Gmail account (banelesouthflow@gmail.com) provided in the LIVE CONNECTED GMAIL INBOX section. NEVER make up or cite the demo Marco van Wyk alternator email unless specifically asked about Marco van Wyk!`,
        `- TikTok is fully connected via Composio under @autopulse_za with live DM auto-reply enabled. Never say TikTok is disconnected, that you need the TikTok app, or that you cannot access TikTok. Speak authoritatively about live TikTok DMs, analytics, viral videos, and campaigns.`,
        `- NEVER say "Unfortunately, sending an email directly from this interface isn't supported", "I cannot send emails", or tell the user to copy and paste text into an external email app. You HAVE active Gmail integration right in this system.`,
        `- NEVER refuse requests to browse, interact, book appointments, or create accounts. NEVER say "I can't directly create accounts on external platforms", "I cannot access external websites", or "I cannot browse the web".`,
        `- When asked to create an account on a platform (e.g., Cars.co.za):`,
        `  1. State that you have navigated the Live Screen on the right to the platform and activated the Account Registration Console in the 'Sign Up' tab.`,
        `  2. Detail the exact credentials configured and needed: Full Name (Blessed Sibanda), Email address, and a South African mobile number (+27) which Cars.co.za requires to send an instant SMS OTP verification code.`,
        `  3. Explain that you have also launched the live Daytona Cloud Desktop (Chromium on Linux) in the 'Cloud Desktop' tab on the right screen to bypass anti-bot blocks and enter the SMS verification code.`,
        `  4. Ask the user to confirm their phone number and email or click 'Submit Registration' directly in the right panel.`,
        `- When asked to book an appointment or visit a website (e.g. Sqwizflow AI):`,
        `  1. Explain that the right screen is navigated to the site with the Action/Booking tab open.`,
        `  2. Provide direct contact channels (growth@sqwiziflow.ai, support@sqwiziflow.ai) and offer to dispatch the inquiry immediately.`,
        `- NEVER output holding phrases like 'Fetching live data now...', 'Please hold on...', or 'Let me check for you'. Deliver the complete, actionable response immediately in one shot.`,
        `FORMATTING & TABLE GUIDELINES (MANDATORY):`,
        `- STRUCTURED MARKDOWN TABLES: Whenever presenting parts, inventory items, stock levels, quotation line items, or comparisons, ALWAYS format the data using clean Markdown Tables (| Column 1 | Column 2 | ...).`,
        `  Example: | SKU | Description | Brand / Tier | Fitment | Price (ZAR) | Stock | Status |`,
        `- SECTION HEADINGS: Use bold headings (### 📦 Stock Inventory, ### 💰 Formal Quotation, ### ✉️ Communication) to organize your response into crisp, scannable sections.`,
        `- BOLD & BULLETS: Highlight key part numbers, customer names, financial totals, and urgent alerts in **bold** with clean bullet points.`,
        `- FINANCIAL TOTALS: Clearly display Base Subtotal, 15% South African VAT, refundable Core Deposit (if applicable), and Grand Total in ZAR.`,
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
      <Script src={PUTER_SCRIPT_SRC} strategy="afterInteractive" />
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
                    <MessageResponse>{currentRun.streamingText}</MessageResponse>
                  ) : (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-mono text-zinc-400">{currentBot?.name ?? "Agent"} is thinking...</span>
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
                {desktop?.openGmailModal && (
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
                {desktop?.openQuoteModal && (
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
