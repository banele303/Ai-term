import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"
import { requireStaff } from "./lib/auth"
import { writeLog } from "./logs"
import { channel, contactType, dealStatus, priceTier } from "./schema"

export const QUOTE_TTL_MS = 48 * 60 * 60 * 1000
const CURRENCY = process.env.STORE_CURRENCY ?? "ZAR"

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const getContact = internalQuery({
  args: { contactId: v.id("crm_contacts") },
  handler: (ctx, { contactId }) => ctx.db.get(contactId),
})

export async function findOrCreateByPhone(
  ctx: MutationCtx,
  args: { phone: string; name?: string; source: typeof channel.type }
): Promise<Doc<"crm_contacts">> {
  const existing = await ctx.db
    .query("crm_contacts")
    .withIndex("by_phone", (q) => q.eq("phone", args.phone))
    .unique()
  if (existing) return existing

  const id = await ctx.db.insert("crm_contacts", {
    name: args.name?.trim() || `+${args.phone}`,
    type: "retail_b2c",
    phone: args.phone,
    socialHandles: {},
    leadScore: 10,
    lifetimeValue: 0,
    autopilot: true,
    source: args.source,
    tags: ["new"],
  })
  await writeLog(ctx, {
    app: "system",
    actionName: "contact.created",
    status: "success",
    contactId: id,
    payload: { phone: args.phone, source: args.source },
  })
  return (await ctx.db.get(id))!
}

export const setAgentThread = internalMutation({
  args: { contactId: v.id("crm_contacts"), threadId: v.string() },
  handler: async (ctx, { contactId, threadId }) => {
    await ctx.db.patch(contactId, { agentThreadId: threadId })
  },
})

export const markReengaged = internalMutation({
  args: { contactId: v.id("crm_contacts") },
  handler: async (ctx, { contactId }) => {
    await ctx.db.patch(contactId, { lastReengagedAt: Date.now() })
  },
})

// Workshops whose last service-kit order is older than `cutoff` (or never),
// not nudged since `cutoff`, and reachable on WhatsApp
export const dormantWorkshops = internalQuery({
  args: { cutoff: v.number(), limit: v.number() },
  handler: async (ctx, { cutoff, limit }) => {
    const rows = await ctx.db
      .query("crm_contacts")
      .withIndex("by_type_and_service_kit", (q) =>
        q.eq("type", "workshop_b2b").lt("lastServiceKitOrderAt", cutoff)
      )
      .take(limit * 4)
    return rows
      .filter((c) => c.phone && c.autopilot && (c.lastReengagedAt ?? 0) < cutoff)
      .slice(0, limit)
  },
})

export const listContacts = query({
  args: { type: v.optional(contactType), search: v.optional(v.string()) },
  handler: async (ctx, { type, search }) => {
    await requireStaff(ctx)
    if (search) {
      return await ctx.db
        .query("crm_contacts")
        .withSearchIndex("search_contacts", (q) => {
          const s = q.search("name", search)
          return type ? s.eq("type", type) : s
        })
        .take(50)
    }
    return await ctx.db.query("crm_contacts").withIndex("by_lastInbound").order("desc").take(200)
  },
})

export const setAutopilot = mutation({
  args: { contactId: v.id("crm_contacts"), autopilot: v.boolean() },
  handler: async (ctx, { contactId, autopilot }) => {
    const { userId } = await requireStaff(ctx)
    await ctx.db.patch(contactId, { autopilot, assignedAgentId: autopilot ? undefined : userId })
  },
})

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const timeline = query({
  args: { contactId: v.id("crm_contacts") },
  handler: async (ctx, { contactId }) => {
    await requireStaff(ctx)
    return await ctx.db
      .query("channel_messages")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(200)
  },
})

export const recordOutbound = internalMutation({
  args: {
    contactId: v.id("crm_contacts"),
    channel,
    body: v.string(),
    externalId: v.optional(v.string()),
    dealId: v.optional(v.id("deals_and_quotes")),
    sentBy: v.union(v.literal("agent"), v.literal("staff")),
    kind: v.optional(v.union(v.literal("text"), v.literal("interactive"))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("channel_messages", {
      contactId: args.contactId,
      dealId: args.dealId,
      channel: args.channel,
      direction: "outbound",
      externalId: args.externalId,
      kind: args.kind ?? "text",
      body: args.body,
      sentBy: args.sentBy,
      timestamp: Date.now(),
    })
  },
})

// ---------------------------------------------------------------------------
// Deals & quotes
// ---------------------------------------------------------------------------

export function paymentLinkFor(dealId: Id<"deals_and_quotes">) {
  const base = process.env.APP_URL
  if (!base) throw new Error("APP_URL is not set on the Convex deployment")
  return `${base.replace(/\/$/, "")}/pay/${dealId}`
}

// Builds a quote from catalog prices. The agent picks parts and quantities;
// prices always come from the database, never from the model.
export const createQuote = internalMutation({
  args: {
    contactId: v.id("crm_contacts"),
    channel,
    vinNumber: v.optional(v.string()),
    vehicle: v.optional(
      v.object({
        make: v.optional(v.string()),
        model: v.optional(v.string()),
        year: v.optional(v.number()),
        engineCode: v.optional(v.string()),
      })
    ),
    lines: v.array(v.object({ partId: v.id("parts_catalog"), quantity: v.number() })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)
    if (!contact) throw new Error("Contact not found")
    if (args.lines.length === 0) throw new Error("A quote needs at least one part")
    const audience = contact.type === "workshop_b2b" ? "b2b" : "b2c"

    const requestedParts = []
    const unavailable: string[] = []
    for (const line of args.lines) {
      const part = await ctx.db.get(line.partId)
      if (!part) throw new Error(`Unknown part ${line.partId}`)
      const quantity = Math.max(1, Math.floor(line.quantity))
      if (part.stockQuantity < quantity) unavailable.push(`${part.sku} (${part.stockQuantity} in stock)`)
      requestedParts.push({
        partId: part._id,
        sku: part.sku,
        description: `${part.brand} ${part.name}`,
        quantity,
        tier: part.tier,
        unitPrice: audience === "b2b" ? (part.tradePrice ?? part.price) : part.price,
        coreDeposit: part.coreDepositAmount ?? 0,
      })
    }

    const partsTotal = requestedParts.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
    const coreDepositTotal = requestedParts.reduce((s, l) => s + l.coreDeposit * l.quantity, 0)
    const now = Date.now()

    const dealId = await ctx.db.insert("deals_and_quotes", {
      contactId: args.contactId,
      channel: args.channel,
      requestedParts,
      vinNumber: args.vinNumber,
      vehicle: args.vehicle,
      status: "quoted",
      totalAmount: round2(partsTotal + coreDepositTotal),
      coreDepositTotal: round2(coreDepositTotal),
      currency: CURRENCY,
      quoteExpiresAt: now + QUOTE_TTL_MS,
      notes: args.notes,
      updatedAt: now,
    })
    const paymentLink = paymentLinkFor(dealId)
    await ctx.db.patch(dealId, { paymentLink })

    await writeLog(ctx, {
      app: "agent",
      actionName: "quote.created",
      status: "success",
      contactId: args.contactId,
      dealId,
      payload: { total: partsTotal + coreDepositTotal, lines: requestedParts.length },
    })

    return {
      dealId,
      paymentLink,
      currency: CURRENCY,
      lines: requestedParts.map((l) => ({
        sku: l.sku,
        description: l.description,
        tier: l.tier,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        coreDeposit: l.coreDeposit,
      })),
      partsTotal: round2(partsTotal),
      coreDepositTotal: round2(coreDepositTotal),
      total: round2(partsTotal + coreDepositTotal),
      expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
      stockWarnings: unavailable,
    }
  },
})

export const pipeline = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const statuses: (typeof dealStatus.type)[] = [
      "new_rfq",
      "fitment_verified",
      "quoted",
      "awaiting_payment",
      "paid",
      "dispatched",
      "core_pending",
    ]
    const columns = await Promise.all(
      statuses.map(async (status) => {
        const deals = await ctx.db
          .query("deals_and_quotes")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(50)
        const withContacts = await Promise.all(
          deals.map(async (d) => ({ ...d, contact: await ctx.db.get(d.contactId) }))
        )
        return { status, deals: withContacts }
      })
    )
    return columns
  },
})

export const moveDeal = mutation({
  args: { dealId: v.id("deals_and_quotes"), status: dealStatus },
  handler: async (ctx, { dealId, status }) => {
    const { userId } = await requireStaff(ctx)
    const deal = await ctx.db.get(dealId)
    if (!deal) throw new Error("Deal not found")
    await ctx.db.patch(dealId, { status, updatedAt: Date.now() })
    await writeLog(ctx, {
      app: "system",
      actionName: "deal.moved",
      status: "success",
      dealId,
      contactId: deal.contactId,
      payload: { from: deal.status, to: status, by: userId },
    })
  },
})

// Public quote lookup & checkout confirmation for /pay/[dealId] links sent via WhatsApp
export const getPublicQuote = query({
  args: { dealId: v.string() },
  handler: async (ctx, { dealId }) => {
    const normalizedId = ctx.db.normalizeId("deals_and_quotes", dealId)
    if (!normalizedId) return null
    const deal = await ctx.db.get(normalizedId)
    if (!deal) return null
    const contact = await ctx.db.get(deal.contactId)
    return {
      _id: deal._id,
      status: deal.status,
      channel: deal.channel,
      vinNumber: deal.vinNumber,
      vehicle: deal.vehicle,
      requestedParts: deal.requestedParts,
      totalAmount: deal.totalAmount,
      coreDepositTotal: deal.coreDepositTotal ?? 0,
      currency: deal.currency,
      quoteExpiresAt: deal.quoteExpiresAt,
      updatedAt: deal.updatedAt,
      customerName: contact?.name ?? "Customer",
      companyName: contact?.companyName,
      customerType: contact?.type ?? "retail_b2c",
    }
  },
})

export const confirmQuotePayment = mutation({
  args: { dealId: v.string(), poReference: v.optional(v.string()) },
  handler: async (ctx, { dealId, poReference }) => {
    const normalizedId = ctx.db.normalizeId("deals_and_quotes", dealId)
    if (!normalizedId) throw new Error("Invalid quote reference")
    const deal = await ctx.db.get(normalizedId)
    if (!deal) throw new Error("Quote not found")
    if (deal.status === "paid" || deal.status === "dispatched") {
      return { status: deal.status }
    }

    const now = Date.now()
    await ctx.db.patch(normalizedId, {
      status: "paid",
      notes: poReference
        ? [deal.notes, `PO/Ref: ${poReference}`].filter(Boolean).join(" · ")
        : deal.notes,
      updatedAt: now,
    })

    // Deduct stock and open core_returns records for rebuildable core items
    for (const line of deal.requestedParts) {
      if (!line.partId) continue
      const part = await ctx.db.get(line.partId)
      if (part) {
        await ctx.db.patch(part._id, {
          stockQuantity: Math.max(0, part.stockQuantity - line.quantity),
          updatedAt: now,
        })
      }
      if ((line.coreDeposit ?? 0) > 0) {
        await ctx.db.insert("core_returns", {
          dealId: deal._id,
          contactId: deal.contactId,
          partId: line.partId,
          partName: line.description,
          depositAmount: (line.coreDeposit ?? 0) * line.quantity,
          status: "owed",
          dueAt: now + 14 * 86_400_000,
        })
      }
    }

    const contact = await ctx.db.get(deal.contactId)
    if (contact) {
      await ctx.db.patch(contact._id, {
        lifetimeValue: contact.lifetimeValue + deal.totalAmount,
        lastOrderDate: now,
      })
    }

    await writeLog(ctx, {
      app: "system",
      actionName: "quote.paid",
      status: "success",
      dealId: deal._id,
      contactId: deal.contactId,
      payload: { totalAmount: deal.totalAmount, poReference },
    })

    return { status: "paid" as const }
  },
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}


// Public mutation for QuoteCraft AI & Desktop Panel to issue formal quotes
export const createQuoteAndDeal = mutation({
  args: {
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    companyName: v.optional(v.string()),
    channel: channel,
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vinNumber: v.optional(v.string()),
    parts: v.array(
      v.object({
        partId: v.optional(v.id("parts_catalog")),
        sku: v.string(),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        tier: v.optional(priceTier),
        coreDeposit: v.optional(v.number()),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)

    let contact: Doc<"crm_contacts"> | null = null
    if (args.clientPhone) {
      contact = await ctx.db
        .query("crm_contacts")
        .withIndex("by_phone", (q) => q.eq("phone", args.clientPhone!))
        .first()
    }
    if (!contact && args.clientEmail) {
      contact = await ctx.db
        .query("crm_contacts")
        .withIndex("by_email", (q) => q.eq("email", args.clientEmail!))
        .first()
    }
    if (!contact) {
      const contactId = await ctx.db.insert("crm_contacts", {
        name: args.clientName.trim() || "Customer",
        phone: args.clientPhone || "+27 82 000 0000",
        email: args.clientEmail,
        companyName: args.companyName,
        type: args.companyName ? "workshop_b2b" : "retail_b2c",
        socialHandles: {},
        leadScore: 25,
        lifetimeValue: 0,
        autopilot: true,
        source: args.channel,
        tags: ["quote_request", "quotecraft_ai"],
      })
      contact = await ctx.db.get(contactId)
    }

    const requestedParts = args.parts.map((p) => ({
      partId: p.partId,
      sku: p.sku,
      description: p.description,
      quantity: Math.max(1, p.quantity),
      unitPrice: p.unitPrice,
      tier: p.tier ?? ("aftermarket" as const),
      coreDeposit: p.coreDeposit ?? 0,
    }))

    const partsTotal = requestedParts.reduce(
      (s, l) => s + l.unitPrice * l.quantity,
      0
    )
    const coreDepositTotal = requestedParts.reduce(
      (s, l) => s + l.coreDeposit * l.quantity,
      0
    )
    const now = Date.now()
    const QUOTE_TTL_MS = 14 * 24 * 60 * 60 * 1000

    const dealId = await ctx.db.insert("deals_and_quotes", {
      contactId: contact!._id,
      channel: args.channel,
      requestedParts,
      vinNumber: args.vinNumber,
      vehicle: args.vehicleMake
        ? {
            make: args.vehicleMake,
            model: args.vehicleModel,
            year: args.vehicleYear,
          }
        : undefined,
      status: "quoted",
      totalAmount: Math.round((partsTotal + coreDepositTotal) * 100) / 100,
      coreDepositTotal: Math.round(coreDepositTotal * 100) / 100,
      currency: CURRENCY,
      quoteExpiresAt: now + QUOTE_TTL_MS,
      notes: args.notes,
      updatedAt: now,
    })

    const appUrl = process.env.APP_URL || "http://localhost:3000"
    const paymentLink = `${appUrl.replace(/\/$/, "")}/pay/${dealId}`
    await ctx.db.patch(dealId, { paymentLink })

    await writeLog(ctx, {
      app: "agent",
      actionName: "quotecraft.quote_created",
      status: "success",
      contactId: contact!._id,
      dealId,
      payload: {
        total: partsTotal + coreDepositTotal,
        lines: requestedParts.length,
      },
    })

    return {
      dealId,
      paymentLink,
      totalAmount: Math.round((partsTotal + coreDepositTotal) * 100) / 100,
      currency: CURRENCY,
      quoteNumber: `QT-${String(now).slice(-6)}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Omnichannel Inbound Lead Ingestion & Webhook Creator
// ---------------------------------------------------------------------------

export const createInboundLead = mutation({
  args: {
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    companyName: v.optional(v.string()),
    channel: channel,
    customerType: v.optional(contactType),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleYear: v.optional(v.number()),
    vinNumber: v.optional(v.string()),
    partDescription: v.string(),
    sku: v.optional(v.string()),
    quantity: v.optional(v.number()),
    estimatedAmount: v.number(),
    notes: v.optional(v.string()),
    initialStatus: v.optional(dealStatus),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)

    let contact: Doc<"crm_contacts"> | null = null
    const cleanPhone = args.clientPhone ? args.clientPhone.replace(/[^\d+]/g, "") : undefined

    if (cleanPhone) {
      contact = await ctx.db
        .query("crm_contacts")
        .withIndex("by_phone", (q) => q.eq("phone", cleanPhone))
        .first()
    }
    if (!contact && args.clientEmail) {
      contact = await ctx.db
        .query("crm_contacts")
        .withIndex("by_email", (q) => q.eq("email", args.clientEmail!.trim().toLowerCase()))
        .first()
    }

    const now = Date.now()
    if (!contact) {
      const type = args.customerType ?? (args.companyName ? "workshop_b2b" : "retail_b2c")
      const contactId = await ctx.db.insert("crm_contacts", {
        name: args.clientName.trim() || "New Lead",
        phone: cleanPhone || "+27 82 000 0000",
        email: args.clientEmail?.trim().toLowerCase(),
        companyName: args.companyName?.trim(),
        type,
        socialHandles: {},
        leadScore: 20,
        lifetimeValue: 0,
        autopilot: true,
        source: args.channel,
        tags: ["inbound_lead", args.channel],
        lastInboundAt: now,
      })
      contact = (await ctx.db.get(contactId))!
    } else {
      await ctx.db.patch(contact._id, { lastInboundAt: now })
    }

    const qty = Math.max(1, args.quantity ?? 1)
    const unitPrice = qty > 0 ? Math.round((args.estimatedAmount / qty) * 100) / 100 : args.estimatedAmount
    const requestedParts = [
      {
        sku: args.sku?.trim() || `PART-${String(now).slice(-4)}`,
        description: args.partDescription.trim(),
        quantity: qty,
        unitPrice,
        tier: "aftermarket" as const,
        coreDeposit: 0,
      },
    ]

    const status = args.initialStatus ?? "new_rfq"
    const dealId = await ctx.db.insert("deals_and_quotes", {
      contactId: contact._id,
      channel: args.channel,
      requestedParts,
      vinNumber: args.vinNumber?.trim().toUpperCase(),
      vehicle: args.vehicleMake
        ? {
            make: args.vehicleMake.trim(),
            model: args.vehicleModel?.trim(),
            year: args.vehicleYear,
          }
        : undefined,
      status,
      totalAmount: Math.round(args.estimatedAmount * 100) / 100,
      coreDepositTotal: 0,
      currency: CURRENCY,
      quoteExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
      notes: args.notes?.trim(),
      updatedAt: now,
    })

    const appUrl = process.env.APP_URL || "http://localhost:3000"
    const paymentLink = `${appUrl.replace(/\/$/, "")}/pay/${dealId}`
    await ctx.db.patch(dealId, { paymentLink })

    // Log the initial inbound communication
    await ctx.db.insert("channel_messages", {
      contactId: contact._id,
      dealId,
      channel: args.channel,
      direction: "inbound",
      kind: "text",
      body: `[Inbound RFQ via ${args.channel.toUpperCase()}] ${args.partDescription}${
        args.vinNumber ? ` (VIN: ${args.vinNumber})` : ""
      }${args.notes ? `\nNotes: ${args.notes}` : ""}`,
      sentBy: "contact",
      timestamp: now,
    })

    await writeLog(ctx, {
      app: "system",
      actionName: "lead.created",
      status: "success",
      contactId: contact._id,
      dealId,
      payload: {
        channel: args.channel,
        total: args.estimatedAmount,
        name: args.clientName,
      },
    })

    return { dealId, contactId: contact._id, paymentLink }
  },
})

// ---------------------------------------------------------------------------
// Follow-up Cadence Sequences
// ---------------------------------------------------------------------------

export const triggerFollowUpSequence = mutation({
  args: {
    dealId: v.id("deals_and_quotes"),
    sequenceStep: v.union(
      v.literal("24h_stock_hold"),
      v.literal("48h_fitment_check"),
      v.literal("72h_price_lock"),
      v.literal("custom")
    ),
    channel: v.optional(channel),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const deal = await ctx.db.get(args.dealId)
    if (!deal) throw new Error("Deal not found")
    const contact = await ctx.db.get(deal.contactId)
    if (!contact) throw new Error("Contact not found")

    const now = Date.now()
    const partsSummary = deal.requestedParts.map((p) => `${p.quantity}x ${p.description}`).join(", ")
    const appUrl = process.env.APP_URL || "http://localhost:3000"
    const quoteUrl = deal.paymentLink || `${appUrl.replace(/\/$/, "")}/pay/${deal._id}`
    const firstName = contact.name.split(" ")[0] || "there"

    let messageBody = ""
    let stepTitle = ""

    switch (args.sequenceStep) {
      case "24h_stock_hold":
        stepTitle = "24h Stock Hold Urgency"
        messageBody =
          `Hi ${firstName}! AutoPulse Parts Desk here regarding your quotation for *${partsSummary}*.\n\n` +
          `Your stock reservation at our warehouse is held for the next 24 hours. We currently have limited units in stock.\n\n` +
          `Review your quote and lock your stock here: ${quoteUrl}\n\n` +
          `Let us know if you need courier delivery arranged today!`
        break
      case "48h_fitment_check":
        stepTitle = "48h Fitment Guarantee & Technical Follow-up"
        messageBody =
          `Hi ${firstName}! Following up on your inquiry for ${partsSummary}${
            deal.vinNumber ? ` (VIN: ${deal.vinNumber})` : ""
          }.\n\n` +
          `Our technical team has verified 100% OEM fitment compatibility for your vehicle. All parts carry our 12-month manufacturer warranty.\n\n` +
          `Confirm your order to dispatch with express courier: ${quoteUrl}`
        break
      case "72h_price_lock":
        stepTitle = "72h Price Guarantee Expiration"
        messageBody =
          `Hi ${firstName}! Your price lock of ${deal.currency} ${deal.totalAmount.toLocaleString()} for ${partsSummary} expires within 24 hours due to distributor tariff updates.\n\n` +
          `Apply code *AUTOPULSE5* at checkout for an extra 5% commercial discount before the quote expires: ${quoteUrl}\n\n` +
          `Reply to this message if you have any questions!`
        break
      case "custom":
      default:
        stepTitle = "Agent Follow-up"
        messageBody =
          args.customMessage?.trim() ||
          `Hi ${firstName}, following up regarding your quote for ${partsSummary}. Please let us know if you have any questions or require an updated quotation: ${quoteUrl}`
        break
    }

    const targetChannel = args.channel ?? deal.channel

    await ctx.db.insert("channel_messages", {
      contactId: contact._id,
      dealId: deal._id,
      channel: targetChannel,
      direction: "outbound",
      kind: "text",
      body: `[Automated Cadence: ${stepTitle}]\n${messageBody}`,
      sentBy: "agent",
      timestamp: now,
    })

    await ctx.db.patch(deal._id, {
      updatedAt: now,
      notes: [deal.notes, `Sent ${stepTitle} at ${new Date(now).toLocaleDateString()}`]
        .filter(Boolean)
        .join(" · "),
    })

    await writeLog(ctx, {
      app: "agent",
      actionName: `sequence.${args.sequenceStep}`,
      status: "success",
      contactId: contact._id,
      dealId: deal._id,
      payload: { step: args.sequenceStep, channel: targetChannel },
    })

    return {
      success: true,
      stepTitle,
      message: messageBody,
      timestamp: now,
    }
  },
})

// ---------------------------------------------------------------------------
// Deal Deletion / Archival
// ---------------------------------------------------------------------------

export const deleteDeal = mutation({
  args: { dealId: v.id("deals_and_quotes") },
  handler: async (ctx, { dealId }) => {
    await requireStaff(ctx)
    const deal = await ctx.db.get(dealId)
    if (!deal) throw new Error("Deal not found")

    // Clean up channel messages for this deal
    const messages = await ctx.db
      .query("channel_messages")
      .filter((q) => q.eq(q.field("dealId"), dealId))
      .collect()
    for (const m of messages) {
      await ctx.db.delete(m._id)
    }

    await ctx.db.delete(dealId)
    await writeLog(ctx, {
      app: "system",
      actionName: "deal.deleted",
      status: "success",
      dealId,
      contactId: deal.contactId,
    })
    return { success: true }
  },
})

// ---------------------------------------------------------------------------
// CRM Workspace & Contact Management (Compatible with AdvanceFame Full-Stack)
// ---------------------------------------------------------------------------

export const getCrmWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const [contacts, deals, catalog] = await Promise.all([
      ctx.db.query("crm_contacts").take(100),
      ctx.db.query("deals_and_quotes").order("desc").take(50),
      ctx.db.query("parts_catalog").take(25),
    ])

    const dealMap = new Map<string, (typeof deals)[0]>()
    for (const d of deals) {
      if (!dealMap.has(d.contactId)) dealMap.set(d.contactId, d)
    }

    const stageMap: Record<string, string> = {
      new_rfq: "NEW_LEAD",
      fitment_verified: "CONTACTED",
      quoted: "QUOTE_SENT",
      awaiting_payment: "FINANCE_APP",
      fulfilled: "CLOSED_WON",
      lost: "CLOSED_LOST",
    }

    const crmContacts = contacts.map((c, idx) => {
      const deal = dealMap.get(c._id)
      const stage = deal?.status ? stageMap[deal.status] || "CONTACTED" : "NEW_LEAD"
      const phoneDigits = c.phone?.replace(/\D/g, "") || `2770000000${idx}`
      return {
        contactKey: phoneDigits,
        chatId: `${phoneDigits}@s.whatsapp.net`,
        name: c.name,
        phone: c.phone ? `+${c.phone}` : `+${phoneDigits}`,
        email: c.email || "",
        idNumber: "",
        address: "Johannesburg, Gauteng",
        employerName: c.companyName || "",
        jobTitle: "",
        monthlyIncomeGross: 0,
        monthlyExpenses: 0,
        stage,
        priority: c.leadScore > 50 ? "HOT" : "NORMAL",
        source: c.source?.toUpperCase() || "WHATSAPP",
        assignedCarId: idx + 1,
        assignedCarName: deal?.vehicle
          ? `${deal.vehicle.year || 2024} ${deal.vehicle.make || "Toyota"} ${deal.vehicle.model || "Hilux GD6"}`
          : "2024 Toyota Rumion 1.5 SX Auto",
        dealValueZar: deal?.totalAmount || 249900,
        depositZar: deal?.coreDepositTotal || 25000,
        lastMessage: "Inbound WhatsApp RFQ & Fitment Inquiry",
        lastContactedLabel: "Recent Chat",
        lastContactedAt: new Date(c.lastInboundAt || Date.now()).toISOString(),
        isRecentChat: true,
        notes: deal?.notes || "",
        ficaDocsCount: 0,
        sortOrder: idx,
      }
    })

    const cars = catalog.map((p, idx) => ({
      id: idx + 1,
      make: p.category || "Toyota",
      model: p.name,
      year: 2024,
      price: p.price || 249900,
      mileage: 15000,
      status: "AVAILABLE",
    }))

    return {
      crmContacts,
      cars,
      financings: [],
      inquiries: [],
      testDrives: [],
      sales: [],
      crmEvents: [],
    }
  },
})

export const upsertCrmContact = mutation({
  args: {
    contactKey: v.string(),
    chatId: v.string(),
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    employerName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    monthlyIncomeGross: v.optional(v.number()),
    monthlyExpenses: v.optional(v.number()),
    stage: v.optional(v.string()),
    priority: v.optional(v.string()),
    source: v.optional(v.string()),
    assignedCarId: v.optional(v.number()),
    assignedCarName: v.optional(v.string()),
    dealValueZar: v.optional(v.number()),
    depositZar: v.optional(v.number()),
    lastMessage: v.optional(v.string()),
    lastContactedLabel: v.optional(v.string()),
    lastContactedAt: v.optional(v.string()),
    isRecentChat: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    ficaDocsCount: v.optional(v.number()),
    pipelineOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rawDigits = args.phone.replace(/\D/g, "") || args.contactKey
    const existing = await ctx.db
      .query("crm_contacts")
      .withIndex("by_phone", (q) => q.eq("phone", rawDigits))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name || existing.name,
        companyName: args.employerName || existing.companyName,
        email: args.email || existing.email,
        lastInboundAt: Date.now(),
      })
      return existing._id
    }

    const newId = await ctx.db.insert("crm_contacts", {
      name: args.name,
      companyName: args.employerName,
      type: "retail_b2c",
      phone: rawDigits,
      email: args.email,
      socialHandles: {},
      leadScore: args.priority === "HOT" ? 80 : 30,
      lifetimeValue: args.dealValueZar || 0,
      autopilot: true,
      source: "whatsapp",
      tags: ["pipeline", args.stage?.toLowerCase() || "new_lead"],
    })

    return newId
  },
})
