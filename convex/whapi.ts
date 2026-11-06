import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server"
import { partsAgent, partsSpecialistTools } from "./agent"
import { findOrCreateByPhone } from "./crm"
import { requireStaff } from "./lib/auth"
import { extractFromImage, transcribeAudio } from "./lib/media"
import * as whapi from "./lib/whapi"
import { writeLog } from "./logs"

// ===========================================================================
// 1. Inbound webhook  (POST {CONVEX_SITE_URL}/webhooks/whapi?secret=...)
// ===========================================================================

export const webhook = httpAction(async (ctx, req) => {
  const secret = process.env.WHAPI_WEBHOOK_SECRET
  const provided = new URL(req.url).searchParams.get("secret")
  if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 })

  let payload: whapi.WhapiWebhookPayload
  try {
    payload = (await req.json()) as whapi.WhapiWebhookPayload
  } catch {
    return new Response("Bad JSON", { status: 400 })
  }

  for (const m of payload.messages ?? []) {
    // Our own outbound messages echo back; groups are out of scope
    if (m.from_me || whapi.isGroupChat(m.chat_id)) continue
    const normalized = normalizeInbound(m)
    if (!normalized) continue
    await ctx.runMutation(internal.whapi.ingestInbound, normalized)
  }

  // Ack fast; processing runs in scheduled actions
  return new Response(null, { status: 200 })
})

function normalizeInbound(m: whapi.WhapiInboundMessage) {
  const base = {
    externalId: m.id,
    chatId: m.chat_id,
    phone: whapi.phoneFromChatId(m.chat_id),
    fromName: m.from_name,
    timestamp: (m.timestamp || Math.floor(Date.now() / 1000)) * 1000,
  }
  switch (m.type) {
    case "text":
      return { ...base, kind: "text" as const, body: m.text?.body ?? "" }
    case "image":
      return {
        ...base,
        kind: "image" as const,
        body: m.image?.caption ?? "",
        mediaId: m.image?.id,
        mediaUrl: m.image?.link,
        mimeType: m.image?.mime_type,
      }
    case "voice":
    case "audio": {
      const media = m.voice ?? m.audio
      return {
        ...base,
        kind: "audio" as const,
        body: "",
        mediaId: media?.id,
        mediaUrl: media?.link,
        mimeType: media?.mime_type,
      }
    }
    case "reply": {
      const title = m.reply?.buttons_reply?.title ?? m.reply?.list_reply?.title
      return title ? { ...base, kind: "text" as const, body: title } : null
    }
    case "document":
      return {
        ...base,
        kind: "document" as const,
        body: m.document?.caption ?? m.document?.file_name ?? "",
        mediaId: m.document?.id,
        mediaUrl: m.document?.link,
        mimeType: m.document?.mime_type,
      }
    default:
      return null
  }
}

export const ingestInbound = internalMutation({
  args: {
    externalId: v.string(),
    chatId: v.string(),
    phone: v.string(),
    fromName: v.optional(v.string()),
    timestamp: v.number(),
    kind: v.union(v.literal("text"), v.literal("image"), v.literal("audio"), v.literal("document")),
    body: v.string(),
    mediaId: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Whapi retries deliveries; the provider message id makes ingest idempotent
    const dup = await ctx.db
      .query("channel_messages")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first()
    if (dup) return null

    const contact = await findOrCreateByPhone(ctx, {
      phone: args.phone,
      name: args.fromName,
      source: "whatsapp",
    })
    await ctx.db.patch(contact._id, { lastInboundAt: args.timestamp })

    const messageId = await ctx.db.insert("channel_messages", {
      contactId: contact._id,
      channel: "whatsapp",
      direction: "inbound",
      externalId: args.externalId,
      kind: args.kind,
      body: args.body,
      mediaUrl: args.mediaUrl,
      sentBy: "contact",
      timestamp: args.timestamp,
    })

    await writeLog(ctx, {
      app: "whapi",
      actionName: "message.received",
      status: "success",
      contactId: contact._id,
      payload: { kind: args.kind, externalId: args.externalId },
    })

    await ctx.scheduler.runAfter(0, internal.whapi.processInbound, {
      messageId,
      chatId: args.chatId,
      mediaId: args.mediaId,
      mimeType: args.mimeType,
    })
    return messageId
  },
})

// ===========================================================================
// 2. Processing: vision / transcription -> agent -> reply
// ===========================================================================

export const getMessageWithContact = internalQuery({
  args: { messageId: v.id("channel_messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId)
    if (!message) return null
    const contact = await ctx.db.get(message.contactId)
    return contact ? { message, contact } : null
  },
})

export const saveExtraction = internalMutation({
  args: {
    messageId: v.id("channel_messages"),
    extracted: v.object({
      transcript: v.optional(v.string()),
      vin: v.optional(v.string()),
      partNumbers: v.optional(v.array(v.string())),
      description: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { messageId, extracted }) => {
    await ctx.db.patch(messageId, { extracted })
  },
})

export const processInbound = internalAction({
  args: {
    messageId: v.id("channel_messages"),
    chatId: v.string(),
    mediaId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.whapi.getMessageWithContact, {
      messageId: args.messageId,
    })
    if (!loaded) return
    const { message, contact } = loaded

    // --- Multimodal pre-processing -----------------------------------------
    let prompt = message.body
    try {
      if (message.kind === "image" && (message.mediaUrl || args.mediaId)) {
        const image = await loadMedia(message.mediaUrl, args.mediaId)
        const extracted = await extractFromImage(image, message.body)
        await ctx.runMutation(internal.whapi.saveExtraction, {
          messageId: message._id,
          extracted: {
            vin: extracted.vin ?? undefined,
            partNumbers: extracted.partNumbers,
            description: extracted.description,
          },
        })
        await ctx.runMutation(internal.logs.record, {
          app: "openai",
          actionName: "vision.extract",
          status: "success",
          contactId: contact._id,
          payload: extracted,
        })
        prompt = [
          message.body && `Customer caption: ${message.body}`,
          `[The customer sent a photo. Image analysis: ${extracted.imageType}.`,
          extracted.vin && `VIN read from image: ${extracted.vin}.`,
          extracted.partNumbers.length && `Part numbers visible: ${extracted.partNumbers.join(", ")}.`,
          extracted.vehicle && `Vehicle details visible: ${JSON.stringify(extracted.vehicle)}.`,
          `Description: ${extracted.description}]`,
        ]
          .filter(Boolean)
          .join("\n")
      } else if (message.kind === "audio" && (message.mediaUrl || args.mediaId)) {
        const audio = await loadMedia(message.mediaUrl, args.mediaId)
        const transcript = await transcribeAudio(audio)
        await ctx.runMutation(internal.whapi.saveExtraction, {
          messageId: message._id,
          extracted: { transcript },
        })
        prompt = `[Voice note transcript] ${transcript}`
      } else if (message.kind === "document") {
        prompt = `[The customer sent a document: ${message.body || "untitled"}. Ask them what they need from it, or for the part list as text.]`
      }
    } catch (error) {
      await ctx.runMutation(internal.logs.record, {
        app: "openai",
        actionName: `media.${message.kind}`,
        status: "error",
        contactId: contact._id,
        error: (error as Error).message,
      })
      prompt = `${message.body}\n[The customer sent a ${message.kind} that could not be processed. Ask them to resend it or type the details.]`
    }

    // Staff took over the conversation: record, don't auto-reply
    if (!contact.autopilot || !prompt.trim()) return

    await replyWithAgent(ctx, { contact, chatId: args.chatId, prompt })
  },
})

async function loadMedia(url: string | undefined, mediaId: string | undefined) {
  if (url) {
    const res = await fetch(url)
    if (res.ok) {
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mimeType: res.headers.get("content-type") ?? "application/octet-stream",
      }
    }
  }
  if (!mediaId) throw new Error("Media has no link and no id")
  return await whapi.downloadMedia(mediaId)
}

type ReplyCtx = ActionCtx

async function replyWithAgent(
  ctx: ReplyCtx,
  { contact, chatId, prompt }: { contact: Doc<"crm_contacts">; chatId: string; prompt: string }
) {
  const userId = contact._id
  let threadId = contact.agentThreadId
  if (!threadId) {
    const created = await partsAgent.createThread(ctx, {
      userId,
      title: `WhatsApp · ${contact.name}`,
    })
    threadId = created.threadId
    await ctx.runMutation(internal.crm.setAgentThread, { contactId: contact._id, threadId })
  }

  const audience = contact.type === "workshop_b2b" ? "b2b" : "b2c"
  const customerContext = `Customer: ${contact.name}${contact.companyName ? ` (${contact.companyName})` : ""}, ${audience === "b2b" ? "trade workshop account" : "retail customer"}.`

  let text: string
  let quote: { dealId: Id<"deals_and_quotes">; paymentLink: string; total: number; currency: string } | undefined
  try {
    const result = await partsAgent.generateText(
      ctx,
      { threadId, userId },
      {
        prompt,
        instructions: undefined,
        system: undefined,
        tools: partsSpecialistTools({ contactId: contact._id, channel: "whatsapp", audience }),
        providerOptions: undefined,
        experimental_context: undefined,
      } as never,
      { contextOptions: undefined } as never
    )
    text = result.text
    quote = findQuote(result)
    void customerContext
  } catch (error) {
    await ctx.runMutation(internal.logs.record, {
      app: "agent",
      actionName: "whatsapp.reply",
      status: "error",
      contactId: contact._id,
      error: (error as Error).message,
    })
    text = "Sorry, I hit a snag looking that up. A team member will get back to you shortly."
  }

  await sendWhatsApp(ctx, { contactId: contact._id, to: chatId, body: text, dealId: quote?.dealId })

  if (quote) {
    const sent = await whapi.sendUrlButton(chatId, {
      body: `Quote total: ${quote.currency} ${quote.total.toFixed(2)}. Valid for 48 hours.`,
      title: "Pay now",
      url: quote.paymentLink,
      footer: "AutoPulse · secure checkout",
    })
    await ctx.runMutation(internal.crm.recordOutbound, {
      contactId: contact._id,
      channel: "whatsapp",
      body: `[Pay now] ${quote.paymentLink}`,
      externalId: sent.message?.id,
      dealId: quote.dealId,
      sentBy: "agent",
      kind: "interactive",
    })
  }
}

// Pulls the createQuote output out of the agent's steps, if it ran this turn
function findQuote(result: unknown) {
  const steps = (result as { steps?: { toolResults?: { toolName: string; output?: unknown }[] }[] })
    .steps
  for (const step of [...(steps ?? [])].reverse()) {
    const hit = step.toolResults?.find((r) => r.toolName === "createQuote")
    if (hit?.output && typeof hit.output === "object" && "paymentLink" in hit.output) {
      return hit.output as {
        dealId: Id<"deals_and_quotes">
        paymentLink: string
        total: number
        currency: string
      }
    }
  }
  return undefined
}

// ===========================================================================
// 3. Outbound helpers
// ===========================================================================

async function sendWhatsApp(
  ctx: ReplyCtx,
  args: {
    contactId: Id<"crm_contacts">
    to: string
    body: string
    dealId?: Id<"deals_and_quotes">
    sentBy?: "agent" | "staff"
  }
) {
  try {
    const sent = await whapi.sendText(args.to, args.body)
    await ctx.runMutation(internal.crm.recordOutbound, {
      contactId: args.contactId,
      channel: "whatsapp",
      body: args.body,
      externalId: sent.message?.id,
      dealId: args.dealId,
      sentBy: args.sentBy ?? "agent",
    })
    await ctx.runMutation(internal.logs.record, {
      app: "whapi",
      actionName: "messages.text",
      status: "success",
      contactId: args.contactId,
      payload: { to: args.to, id: sent.message?.id },
    })
    return sent
  } catch (error) {
    await ctx.runMutation(internal.logs.record, {
      app: "whapi",
      actionName: "messages.text",
      status: "error",
      contactId: args.contactId,
      error: (error as Error).message,
      payload: error instanceof whapi.WhapiError ? error.body : undefined,
    })
    throw error
  }
}

// Used by other modules (lead capture, crons, ops agent) to message a contact
export const sendToContact = internalAction({
  args: {
    contactId: v.id("crm_contacts"),
    body: v.string(),
    sentBy: v.optional(v.union(v.literal("agent"), v.literal("staff"))),
  },
  handler: async (ctx, { contactId, body, sentBy }) => {
    const contact = await ctx.runQuery(internal.crm.getContact, { contactId })
    if (!contact?.phone) throw new Error("Contact has no WhatsApp number")
    const sent = await sendWhatsApp(ctx, { contactId, to: contact.phone, body, sentBy })
    return { messageId: sent.message?.id ?? null }
  },
})

// Staff reply from the CRM timeline
export const staffSend = action({
  args: { contactId: v.id("crm_contacts"), body: v.string() },
  handler: async (ctx, { contactId, body }): Promise<{ messageId: string | null }> => {
    await requireStaff(ctx)
    return await ctx.runAction(internal.whapi.sendToContact, { contactId, body, sentBy: "staff" })
  },
})

// Dispatch formal PDF document via Whapi gateway
export const sendPdfToContact = action({
  args: {
    phone: v.string(),
    pdfBase64: v.string(),
    filename: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { phone, pdfBase64, filename, caption }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    await requireStaff(ctx)
    try {
      const cleanPhone = phone.replace(/\D/g, "")
      const targetChat = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@s.whatsapp.net`
      const mediaUri = `data:application/pdf;name=${filename};base64,${pdfBase64}`
      const sent = await whapi.sendDocument(targetChat, {
        media: mediaUri,
        filename,
        caption: caption ?? `AutoPulse Official Quotation ${filename}`,
      })

      await ctx.runMutation(internal.logs.record, {
        app: "whapi",
        actionName: "messages.document",
        status: "success",
        payload: { to: phone, filename, id: sent.message?.id },
      })

      return { success: true, messageId: sent.message?.id }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
  },
})

// ===========================================================================
// 4. Channel health (Integrations page)
// ===========================================================================

export const health = action({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    try {
      const h = await whapi.checkHealth()
      const linked = h.status?.text === "AUTH"
      const qr = linked ? null : await whapi.getLoginQr().catch(() => null)
      return {
        ok: true as const,
        status: h.status?.text ?? "UNKNOWN",
        linked,
        phone: h.user?.id ?? null,
        name: h.user?.name ?? null,
        qrBase64: qr?.base64 ?? null,
      }
    } catch (error) {
      return { ok: false as const, error: (error as Error).message }
    }
  },
})
