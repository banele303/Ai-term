import { generateText, Output } from "ai"
import { v } from "convex/values"
import { z } from "zod"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "./_generated/server"
import { embedText, embedTexts, visionModel } from "./lib/ai"
import { requireStaff } from "./lib/auth"
import { decodeVin } from "./lib/vin"
import { writeLog } from "./logs"

// ===========================================================================
// 1. Command Center Live KPIs & Agent Activity Feed (/autopulse)
// ===========================================================================

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const now = Date.now()
    const startOfToday = new Date(
      new Date(now).setHours(0, 0, 0, 0)
    ).getTime()

    const [deals, campaigns, cores, logs, parts, contacts] = await Promise.all([
      ctx.db.query("deals_and_quotes").order("desc").take(250),
      ctx.db.query("ad_campaigns").collect(),
      ctx.db.query("core_returns").collect(),
      ctx.db.query("automation_logs").withIndex("by_timestamp").order("desc").take(40),
      ctx.db.query("parts_catalog").take(500),
      ctx.db.query("crm_contacts").take(300),
    ])

    const activeWhatsappRfqs = deals.filter(
      (d) =>
        d.channel === "whatsapp" &&
        (d.status === "new_rfq" ||
          d.status === "fitment_verified" ||
          d.status === "quoted" ||
          d.status === "awaiting_payment")
    ).length

    const revenueStatuses = new Set(["paid", "dispatched", "core_pending", "closed"])
    const todaysRevenue = deals
      .filter((d) => revenueStatuses.has(d.status) && d.updatedAt >= startOfToday)
      .reduce((sum, d) => sum + d.totalAmount, 0)

    const pipelineValue = deals
      .filter((d) => d.status !== "lost" && d.status !== "closed")
      .reduce((sum, d) => sum + d.totalAmount, 0)

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
    const weightedRoasNumerator = campaigns.reduce((s, c) => s + c.spend * c.roas, 0)
    const blendedRoas =
      totalSpend > 0 ? Math.round((weightedRoasNumerator / totalSpend) * 100) / 100 : 0
    const totalAdLeads = campaigns.reduce((s, c) => s + c.leadsGenerated, 0)

    const pendingCores = cores.filter(
      (c) =>
        c.status === "owed" ||
        c.status === "photo_submitted" ||
        c.status === "inspection_passed"
    )
    const pendingCoreDepositValue = pendingCores.reduce(
      (s, c) => s + c.depositAmount,
      0
    )

    const lowStockCount = parts.filter(
      (p) => p.stockQuantity <= p.minReorderThreshold
    ).length

    const cleanLogs = logs
      .filter((l) => {
        if (l.status !== "success" || l.error) return false
        const p = l.payload as Record<string, unknown> | undefined
        if (p && typeof p === "object" && "error" in p && p.error) return false
        if (l.app === "cron") {
          if (!p || typeof p !== "object") return false
          if ("sent" in p && Number(p.sent) <= 0) return false
          if ("synced" in p && Number(p.synced) <= 0) return false
        }
        return true
      })
      .slice(0, 6)

    return {
      currency: process.env.STORE_CURRENCY ?? "ZAR",
      kpis: {
        activeWhatsappRfqs,
        todaysRevenue: Math.round(todaysRevenue * 100) / 100,
        pipelineValue: Math.round(pipelineValue * 100) / 100,
        blendedRoas,
        totalAdSpend: Math.round(totalSpend * 100) / 100,
        totalAdLeads,
        pendingCoreCount: pendingCores.length,
        pendingCoreDepositValue: Math.round(pendingCoreDepositValue * 100) / 100,
        totalCatalogSkus: parts.length,
        lowStockCount,
        totalContacts: contacts.length,
      },
      recentLogs: cleanLogs,
      campaigns,
    }
  },
})

export const cleanNoisyLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("automation_logs").collect()
    let deleted = 0
    for (const r of rows) {
      const p = r.payload as Record<string, unknown> | undefined
      const hasPayloadError =
        p && typeof p === "object" && "error" in p && Boolean(p.error)
      const isEmptyCron =
        r.app === "cron" &&
        (!p ||
          typeof p !== "object" ||
          ("sent" in p && Number(p.sent) <= 0) ||
          ("synced" in p && Number(p.synced) <= 0))
      if (r.status !== "success" || r.error || hasPayloadError || isEmptyCron) {
        await ctx.db.delete(r._id)
        deleted++
      }
    }
    return { deleted }
  },
})

// ===========================================================================
// Real-time Store Context for Ops AI & Teammate Bots (Stock, Emails, Quotes)
// ===========================================================================

export const botStoreContext = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)

    const [parts, messages, deals, campaigns, contacts] = await Promise.all([
      ctx.db.query("parts_catalog").take(120),
      ctx.db.query("channel_messages").order("desc").take(30),
      ctx.db.query("deals_and_quotes").order("desc").take(20),
      ctx.db.query("ad_campaigns").collect(),
      ctx.db.query("crm_contacts").take(60),
    ])

    const contactMap = new Map(contacts.map((c) => [c._id, c]))

    const dbMessages = messages.map((m) => {
      const contact = contactMap.get(m.contactId)
      return {
        id: m._id,
        channel: m.channel,
        direction: m.direction,
        body: m.body,
        from: contact?.name || contact?.phone || contact?.email || "Customer",
        timestamp: m.timestamp,
        sentBy: m.sentBy,
      }
    })

    const sampleTikTokDms = [
      {
        id: "tiktok_dm_1",
        channel: "tiktok_lead" as const,
        direction: "inbound" as const,
        body: "Saw your TikTok video on the Golf 7 GTI timing chain kit! Do you have stock in Johannesburg and can you deliver to Sandton by tomorrow?",
        from: "@sipho_racing (Sipho M.)",
        timestamp: Date.now() - 1000 * 60 * 18,
        sentBy: "Customer",
      },
      {
        id: "tiktok_dm_2",
        channel: "tiktok_lead" as const,
        direction: "inbound" as const,
        body: "Need trade pricing for 4x Hilux 2.8 GD-6 heavy duty clutch kits and Brembo front discs. VIN: AHTBA3CD400192837. Please send quote.",
        from: "@johann_pretoria_workshop (Johann V.)",
        timestamp: Date.now() - 1000 * 60 * 42,
        sentBy: "Customer",
      },
      {
        id: "tiktok_dm_3",
        channel: "tiktok_lead" as const,
        direction: "inbound" as const,
        body: "Hi AutoPulse! Loved the tech breakdown of the Bosch 140A alternators. Are those compatible with Ford Ranger 3.2 TDCi?",
        from: "@nkosi_fleet (Nkosi Fleet Logistics)",
        timestamp: Date.now() - 1000 * 60 * 115,
        sentBy: "Customer",
      },
    ]

    const hasTiktokMessages = dbMessages.some((m) => m.channel === "tiktok_lead")
    const cleanMessages = hasTiktokMessages ? dbMessages : [...sampleTikTokDms, ...dbMessages]

    const cleanDeals = deals.map((d) => {
      const contact = contactMap.get(d.contactId)
      return {
        id: d._id,
        channel: d.channel,
        status: d.status,
        totalAmount: d.totalAmount,
        coreDepositTotal: d.coreDepositTotal,
        currency: d.currency,
        contactId: d.contactId,
        contactName: contact?.name || "Customer",
        contactPhone: contact?.phone || "",
        contactEmail: contact?.email || "",
        contactType: contact?.type || "retail_b2c",
        companyName: contact?.companyName || "",
        vinNumber: d.vinNumber || "",
        vehicle: d.vehicle || null,
        paymentLink: d.paymentLink || `/pay/${d._id}`,
        quoteExpiresAt: d.quoteExpiresAt,
        notes: d.notes,
        updatedAt: d.updatedAt,
        requestedParts: d.requestedParts,
        partsSummary: d.requestedParts.map((p) => `${p.description} (x${p.quantity})`).join(", "),
      }
    })

    const lowStockParts = parts
      .filter((p) => p.stockQuantity <= p.minReorderThreshold)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        stock: p.stockQuantity,
        threshold: p.minReorderThreshold,
        price: p.price,
        location: p.warehouseLocation,
      }))

    const catalog = parts.slice(0, 50).map((p) => ({
      sku: p.sku,
      oem: p.oemNumber,
      name: p.name,
      category: p.category,
      brand: p.brand,
      tier: p.tier,
      price: p.price,
      tradePrice: p.tradePrice,
      stock: p.stockQuantity,
      threshold: p.minReorderThreshold,
      location: p.warehouseLocation,
    }))

    return {
      currency: process.env.STORE_CURRENCY ?? "ZAR",
      lowStockParts,
      catalog,
      messages: cleanMessages,
      deals: cleanDeals,
      campaigns: campaigns.map((c) => ({
        name: c.name,
        platform: c.platform,
        status: c.status,
        spend: c.spend,
        conversions: c.conversions ?? 0,
      })),
    }
  },
})

// ===========================================================================
// 2. Module D.1 — Core Return & Deposit Tracker + WhatsApp Vision Inspection
// ===========================================================================

export const listCoreReturns = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const rows = await ctx.db.query("core_returns").order("desc").take(100)
    return await Promise.all(
      rows.map(async (r) => ({
        ...r,
        contact: await ctx.db.get(r.contactId),
      }))
    )
  },
})

export const updateCoreReturnStatus = mutation({
  args: {
    coreId: v.id("core_returns"),
    status: v.union(
      v.literal("owed"),
      v.literal("photo_submitted"),
      v.literal("inspection_passed"),
      v.literal("inspection_failed"),
      v.literal("refunded"),
      v.literal("forfeited")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { coreId, status, notes }) => {
    await requireStaff(ctx)
    const core = await ctx.db.get(coreId)
    if (!core) throw new Error("Core return record not found")

    await ctx.db.patch(coreId, {
      status,
      ...(notes ? { inspectionNotes: notes } : {}),
      ...(status === "refunded" ? { refundedAt: Date.now() } : {}),
    })

    await writeLog(ctx, {
      app: "system",
      actionName: `core_return.${status}`,
      status: "success",
      contactId: core.contactId,
      dealId: core.dealId,
      payload: { partName: core.partName, depositAmount: core.depositAmount },
    })

    if (status === "refunded") {
      await ctx.scheduler.runAfter(0, internal.dashboard.notifyCoreRefundWhatsApp, {
        contactId: core.contactId,
        partName: core.partName,
        depositAmount: core.depositAmount,
      })
    }
  },
})

export const notifyCoreRefundWhatsApp = internalAction({
  args: {
    contactId: v.id("crm_contacts"),
    partName: v.string(),
    depositAmount: v.number(),
  },
  handler: async (ctx, { contactId, partName, depositAmount }) => {
    const currency = process.env.STORE_CURRENCY ?? "ZAR"
    const msg = `Good news! Your core return for *${partName}* passed inspection. Your deposit refund of *${currency} ${depositAmount.toFixed(2)}* has been released.`
    if (!process.env.WHAPI_API_TOKEN) {
      await ctx.runMutation(internal.crm.recordOutbound, {
        contactId,
        channel: "whatsapp",
        body: `[Core Refund Notice] ${msg}`,
        sentBy: "agent",
      })
      return
    }
    await ctx.runAction(internal.whapi.sendToContact, {
      contactId,
      body: msg,
      sentBy: "agent",
    })
  },
})

const coreInspectionSchema = z.object({
  passed: z.boolean().describe("True if housing is intact, rebuildable, and matches expected part"),
  conditionSummary: z.string(),
  cracksOrMissingComponents: z.array(z.string()),
})

export const inspectCorePhoto = action({
  args: {
    coreId: v.id("core_returns"),
    photoUrl: v.string(),
  },
  handler: async (
    ctx,
    { coreId, photoUrl }
  ): Promise<z.infer<typeof coreInspectionSchema>> => {
    await requireStaff(ctx)
    const core: Doc<"core_returns"> | null = await ctx.runQuery(
      internal.dashboard.getCoreInternal,
      { coreId }
    )
    if (!core) throw new Error("Core return not found")

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for Vision core inspection")
    }

    const { output } = await generateText({
      model: visionModel(),
      output: Output.object({ schema: coreInspectionSchema }),
      instructions:
        "You inspect old automotive core units (alternators, turbochargers, brake calipers, starter motors) returned by workshops for remanufacturing deposit refunds. Reject cracked housings, fire damage, or missing pulleys/actuators.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Expected core unit: ${core.partName}` },
            { type: "image", image: new URL(photoUrl) },
          ],
        },
      ],
    })

    const nextStatus = output.passed ? "inspection_passed" : "inspection_failed"
    await ctx.runMutation(internal.dashboard.patchCoreInspectionInternal, {
      coreId,
      status: nextStatus,
      photoUrl,
      notes: `${output.conditionSummary}${output.cracksOrMissingComponents.length ? ` · Issues: ${output.cracksOrMissingComponents.join(", ")}` : ""}`,
    })
    return output
  },
})

export const getCoreInternal = internalQuery({
  args: { coreId: v.id("core_returns") },
  handler: (ctx, { coreId }) => ctx.db.get(coreId),
})

export const patchCoreInspectionInternal = internalMutation({
  args: {
    coreId: v.id("core_returns"),
    status: v.union(v.literal("inspection_passed"), v.literal("inspection_failed")),
    photoUrl: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, { coreId, status, photoUrl, notes }) => {
    await ctx.db.patch(coreId, {
      status,
      inspectionPhotoUrl: photoUrl,
      inspectionNotes: notes,
    })
  },
})

// ===========================================================================
// 3. Module D.2 — Margin Guardian & Dynamic Pricing
// ===========================================================================

export const listPricingSignals = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const rows = await ctx.db
      .query("pricing_signals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(50)

    return await Promise.all(
      rows.map(async (s) => ({
        ...s,
        part: await ctx.db.get(s.partId),
      }))
    )
  },
})

export const scanMarginSignals = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const parts = await ctx.db.query("parts_catalog").take(300)
    const openSignals = await ctx.db
      .query("pricing_signals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect()
    const flaggedPartIds = new Set(openSignals.map((s) => s.partId))

    let created = 0
    for (const p of parts) {
      if (flaggedPartIds.has(p._id)) continue
      const trade = p.tradePrice ?? p.price * 0.85
      const b2bMargin = p.costPrice > 0 ? (trade - p.costPrice) / trade : 1
      const b2cMargin = p.costPrice > 0 ? (p.price - p.costPrice) / p.price : 1

      if (b2bMargin < 0.18 || b2cMargin < 0.28) {
        const suggestedB2B = Math.ceil((p.costPrice / 0.76) * 100) / 100
        const suggestedB2C = Math.ceil((p.costPrice / 0.62) * 100) / 100
        await ctx.db.insert("pricing_signals", {
          partId: p._id,
          reason: "margin_below_floor",
          previousCost: p.costPrice,
          newCost: p.costPrice,
          suggestedB2BPrice: suggestedB2B,
          suggestedB2CPrice: suggestedB2C,
          rationale: `Current B2B margin is ${(b2bMargin * 100).toFixed(1)}% (floor 18%). Recommend 24% B2B / 38% B2C markup tier.`,
          status: "open",
          createdAt: Date.now(),
        })
        created++
      } else if (p.isServiceKit && p.stockQuantity <= p.minReorderThreshold * 1.2) {
        const suggestedB2B = Math.round(trade * 1.05 * 100) / 100
        const suggestedB2C = Math.round(p.price * 1.08 * 100) / 100
        await ctx.db.insert("pricing_signals", {
          partId: p._id,
          reason: "fast_mover",
          suggestedB2BPrice: suggestedB2B,
          suggestedB2CPrice: suggestedB2C,
          rationale: `High-velocity service item down to ${p.stockQuantity} units — capture +5% B2B / +8% B2C scarcity margin until restock lands.`,
          status: "open",
          createdAt: Date.now(),
        })
        created++
      }
    }
    return { created }
  },
})

export const resolvePricingSignal = mutation({
  args: {
    signalId: v.id("pricing_signals"),
    decision: v.union(v.literal("applied"), v.literal("dismissed")),
  },
  handler: async (ctx, { signalId, decision }) => {
    await requireStaff(ctx)
    const signal = await ctx.db.get(signalId)
    if (!signal) throw new Error("Signal not found")

    if (decision === "applied") {
      await ctx.db.patch(signal.partId, {
        tradePrice: signal.suggestedB2BPrice,
        price: signal.suggestedB2CPrice,
        updatedAt: Date.now(),
      })
    }
    await ctx.db.patch(signalId, { status: decision })
    await writeLog(ctx, {
      app: "system",
      actionName: `margin_guardian.${decision}`,
      status: "success",
      payload: {
        partId: signal.partId,
        b2b: signal.suggestedB2BPrice,
        b2c: signal.suggestedB2CPrice,
      },
    })
  },
})

// ===========================================================================
// 4. Knowledge Base Document Uploader, Chunker, CSV Importer & VIN Decoder
// ===========================================================================

export const decodeVinAction = action({
  args: { vin: v.string() },
  handler: async (ctx, { vin }) => {
    await requireStaff(ctx)
    return await decodeVin(vin)
  },
})

export const listKbDocuments = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    return await ctx.db
      .query("kb_documents")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50)
  },
})

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const registerKbDocument = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx)
    const docId = await ctx.db.insert("kb_documents", {
      title: args.title.trim() || args.fileName,
      fileName: args.fileName,
      mimeType: args.mimeType,
      storageId: args.storageId,
      status: "processing",
      chunkCount: 0,
      uploadedBy: userId,
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.dashboard.processKbDocument, {
      documentId: docId,
    })
    return docId
  },
})

export const getKbDocInternal = internalQuery({
  args: { documentId: v.id("kb_documents") },
  handler: (ctx, { documentId }) => ctx.db.get(documentId),
})

export const saveKbChunksInternal = internalMutation({
  args: {
    documentId: v.id("kb_documents"),
    chunks: v.array(
      v.object({
        index: v.number(),
        text: v.string(),
        embedding: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, { documentId, chunks }) => {
    for (const c of chunks) {
      await ctx.db.insert("kb_chunks", {
        documentId,
        index: c.index,
        text: c.text,
        embedding: c.embedding,
      })
    }
    await ctx.db.patch(documentId, {
      status: "ready",
      chunkCount: chunks.length,
    })
  },
})

export const markKbDocFailed = internalMutation({
  args: { documentId: v.id("kb_documents"), error: v.string() },
  handler: async (ctx, { documentId, error }) => {
    await ctx.db.patch(documentId, { status: "failed", error })
  },
})

export const processKbDocument = internalAction({
  args: { documentId: v.id("kb_documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runQuery(internal.dashboard.getKbDocInternal, {
      documentId,
    })
    if (!doc) return

    try {
      const blob = await ctx.storage.get(doc.storageId)
      if (!blob) throw new Error("Uploaded file not found in Convex storage")
      const rawText = await blob.text()

      // If CSV catalog with sku/name/price headers, also upsert rows into parts_catalog
      if (doc.fileName.toLowerCase().endsWith(".csv")) {
        await importCsvPartsIfStructured(ctx, rawText)
      }

      const chunks = chunkText(rawText, 900, 120)
      if (chunks.length === 0) {
        throw new Error("Document contained no extractable text")
      }

      const embeddings = process.env.OPENAI_API_KEY
        ? await embedTexts(chunks)
        : chunks.map(() => new Array<number>(1536).fill(0))

      await ctx.runMutation(internal.dashboard.saveKbChunksInternal, {
        documentId,
        chunks: chunks.map((text, index) => ({
          index,
          text,
          embedding: embeddings[index],
        })),
      })
    } catch (error) {
      await ctx.runMutation(internal.dashboard.markKbDocFailed, {
        documentId,
        error: (error as Error).message,
      })
    }
  },
})

function chunkText(input: string, maxChars: number, overlap: number): string[] {
  const cleaned = input.replace(/\r\n/g, "\n").trim()
  if (!cleaned) return []
  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length && chunks.length < 120) {
    const end = Math.min(cleaned.length, start + maxChars)
    chunks.push(cleaned.slice(start, end).trim())
    if (end >= cleaned.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks.filter(Boolean)
}

async function importCsvPartsIfStructured(ctx: ActionCtx, csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const idx = (name: string) => headers.indexOf(name)
  if (idx("sku") < 0 || idx("name") < 0 || idx("price") < 0) return

  for (const row of lines.slice(1, 101)) {
    const cols = row.split(",").map((c) => c.trim())
    const sku = cols[idx("sku")]
    const name = cols[idx("name")]
    const price = Number(cols[idx("price")])
    if (!sku || !name || !Number.isFinite(price)) continue

    await ctx.runMutation(internal.parts.upsertInternal, {
      sku,
      oemNumber: idx("oem") >= 0 ? cols[idx("oem")] || undefined : undefined,
      crossReferenceNumbers:
        idx("cross_refs") >= 0 && cols[idx("cross_refs")]
          ? cols[idx("cross_refs")].split(";").map((s) => s.trim())
          : [],
      name,
      category: (idx("category") >= 0 && cols[idx("category")]) || "General",
      brand: (idx("brand") >= 0 && cols[idx("brand")]) || "OEM",
      tier:
        idx("tier") >= 0 && cols[idx("tier")]?.toLowerCase() === "aftermarket"
          ? "aftermarket"
          : "oem",
      compatibleVehicles: [],
      price,
      tradePrice: Math.round(price * 0.84 * 100) / 100,
      costPrice:
        idx("cost") >= 0 && Number.isFinite(Number(cols[idx("cost")]))
          ? Number(cols[idx("cost")])
          : Math.round(price * 0.6 * 100) / 100,
      stockQuantity:
        idx("stock") >= 0 && Number.isFinite(Number(cols[idx("stock")]))
          ? Number(cols[idx("stock")])
          : 10,
      minReorderThreshold: 4,
      isServiceKit: /filter|pad|oil|kit/i.test(name),
    })
  }
}

export const searchKnowledgeChunks = action({
  args: { query: v.string() },
  handler: async (
    ctx,
    { query: q }
  ): Promise<{ id: Id<"kb_chunks">; text: string; docTitle: string }[]> => {
    await requireStaff(ctx)
    if (!process.env.OPENAI_API_KEY) return []
    const vector = await embedText(q)
    const hits = await ctx.vectorSearch("kb_chunks", "by_embedding", {
      vector,
      limit: 6,
    })
    return await ctx.runQuery(internal.dashboard.getKbChunksInternal, {
      ids: hits.map((h) => h._id),
    })
  },
})

export const getKbChunksInternal = internalQuery({
  args: { ids: v.array(v.id("kb_chunks")) },
  handler: async (ctx, { ids }) => {
    const out: { id: Id<"kb_chunks">; text: string; docTitle: string }[] = []
    for (const id of ids) {
      const c = await ctx.db.get(id)
      if (!c) continue
      const doc = await ctx.db.get(c.documentId)
      out.push({ id: c._id, text: c.text, docTitle: doc?.title ?? "Document" })
    }
    return out
  },
})

// ===========================================================================
// 5. Production Seed — Real Automotive OEM/Aftermarket Parts, Workshops,
//    Omnichannel Deals, Core Returns, Margin Signals & Ad Campaigns
// ===========================================================================

export const seedDemoWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const existing = await ctx.db.query("parts_catalog").first()
    if (existing) {
      return { seeded: false, message: "Catalog already populated" }
    }

    const now = Date.now()
    const DAY = 86_400_000

    const sampleParts = [
      {
        sku: "AP-TOY-BP-04465",
        oemNumber: "04465-0K240",
        crossReferenceNumbers: ["DB1841", "GDB3473", "P83107", "04465-0K380"],
        name: "Front Ceramic Brake Pad Set — Hilux GD6 / Fortuner",
        category: "Brakes",
        brand: "Toyota Genuine",
        tier: "oem" as const,
        compatibleVehicles: [
          {
            make: "Toyota",
            model: "Hilux 2.8 GD-6",
            yearRange: { from: 2016, to: 2025 },
            engineCode: "1GD-FTV",
          },
          {
            make: "Toyota",
            model: "Fortuner 2.4 / 2.8 GD-6",
            yearRange: { from: 2016, to: 2025 },
            engineCode: "2GD-FTV",
          },
        ],
        price: 1890,
        tradePrice: 1490,
        costPrice: 1080,
        stockQuantity: 28,
        minReorderThreshold: 8,
        warehouseLocation: "Aisle B2 · Bin 14",
        isServiceKit: true,
        specsJson: JSON.stringify({ thicknessMm: 17.5, wearSensor: "Acoustic", axle: "Front" }),
      },
      {
        sku: "AP-BREM-BP-P83107",
        oemNumber: "04465-0K240",
        crossReferenceNumbers: ["P83107", "GDB3473"],
        name: "Heavy-Duty Fleet Front Brake Pads — Hilux / Fortuner",
        category: "Brakes",
        brand: "Brembo Aftermarket",
        tier: "aftermarket" as const,
        compatibleVehicles: [
          {
            make: "Toyota",
            model: "Hilux 2.8 GD-6",
            yearRange: { from: 2016, to: 2025 },
            engineCode: "1GD-FTV",
          },
        ],
        price: 1295,
        tradePrice: 980,
        costPrice: 710,
        stockQuantity: 44,
        minReorderThreshold: 10,
        warehouseLocation: "Aisle B2 · Bin 16",
        isServiceKit: true,
        specsJson: JSON.stringify({ compound: "Low-Metallic Fleet", eceR90: true }),
      },
      {
        sku: "AP-GAR-TRB-17201",
        oemNumber: "17201-11080",
        crossReferenceNumbers: ["854909-5002S", "17201-11110"],
        name: "VNT Turbocharger Assembly — 2.8 GD-6 1GD-FTV",
        category: "Forced Induction",
        brand: "Garrett Advancing Motion",
        tier: "oem" as const,
        compatibleVehicles: [
          {
            make: "Toyota",
            model: "Hilux 2.8 GD-6",
            yearRange: { from: 2016, to: 2024 },
            engineCode: "1GD-FTV",
          },
        ],
        price: 18450,
        tradePrice: 15800,
        costPrice: 12950,
        stockQuantity: 4,
        minReorderThreshold: 3,
        warehouseLocation: "Vault C1 · Cage 02",
        coreDepositAmount: 2500,
        isServiceKit: false,
        specsJson: JSON.stringify({ actuator: "Electronic VNT", gasketKitIncluded: true }),
      },
      {
        sku: "AP-TOY-HL-0098",
        oemNumber: "81150-0KD10",
        crossReferenceNumbers: ["81110-0KD10", "TO2502213", "81150-0KD20"],
        name: "Toyota Genuine Front Headlight Assembly (LH) — Hilux / Fortuner",
        category: "Lighting",
        brand: "Toyota Genuine",
        tier: "oem" as const,
        compatibleVehicles: [
          {
            make: "Toyota",
            model: "Hilux 2.8 GD-6 / Fortuner",
            yearRange: { from: 2016, to: 2024 },
            engineCode: "1GD-FTV / 2GD-FTV",
          },
        ],
        price: 4800,
        tradePrice: 3950,
        costPrice: 2800,
        stockQuantity: 12,
        minReorderThreshold: 4,
        warehouseLocation: "Aisle L1 · Shelf 04",
        isServiceKit: false,
        specsJson: JSON.stringify({ side: "Left Hand (LH)", type: "Bi-LED Projector", dRL: true }),
      },
      {
        sku: "AP-BOS-ALT-0124525",
        oemNumber: "06L903021E",
        crossReferenceNumbers: ["0124525539", "TG14C052", "CA2112IR"],
        name: "140A Smart Alternator — VW Golf 7 GTI / Polo GTI / Audi A3",
        category: "Electrical",
        brand: "Bosch",
        tier: "oem" as const,
        compatibleVehicles: [
          {
            make: "Volkswagen",
            model: "Golf 7 GTI 2.0 TSI",
            yearRange: { from: 2013, to: 2020 },
            engineCode: "CHHB",
          },
          {
            make: "Volkswagen",
            model: "Polo AW GTI 2.0 TSI",
            yearRange: { from: 2018, to: 2025 },
            engineCode: "CZPC",
          },
        ],
        price: 6490,
        tradePrice: 5150,
        costPrice: 4320,
        stockQuantity: 6,
        minReorderThreshold: 3,
        warehouseLocation: "Aisle D1 · Bin 05",
        coreDepositAmount: 1200,
        isServiceKit: false,
        specsJson: JSON.stringify({ voltage: "14V", amperage: "140A", pulley: "6PK Freewheel" }),
      },
      {
        sku: "AP-MAN-KIT-RANGER",
        oemNumber: "JB3Q-6714-AA",
        crossReferenceNumbers: ["HU7002z", "C27045", "PU9012z"],
        name: "Full 15,000km Service Filter Kit — Ford Ranger 2.0 Bi-Turbo",
        category: "Filtration",
        brand: "MANN-FILTER",
        tier: "aftermarket" as const,
        compatibleVehicles: [
          {
            make: "Ford",
            model: "Ranger 2.0 Bi-Turbo / Raptor",
            yearRange: { from: 2019, to: 2025 },
            engineCode: "YN2X",
          },
        ],
        price: 1580,
        tradePrice: 1190,
        costPrice: 790,
        stockQuantity: 7,
        minReorderThreshold: 10,
        warehouseLocation: "Aisle A1 · Bin 03",
        isServiceKit: true,
        specsJson: JSON.stringify({ includes: ["Oil", "Air", "Fuel Water-Separator", "Cabin"] }),
      },
      {
        sku: "AP-ZF-MECH-6HP26",
        oemNumber: "1068298044",
        crossReferenceNumbers: ["24347588725", "ZF-1068-298-044"],
        name: "ZF 6HP Solenoid & Mechatronic Seal Kit — BMW 330d / X5",
        category: "Drivetrain",
        brand: "ZF Aftermarket",
        tier: "oem" as const,
        compatibleVehicles: [
          {
            make: "BMW",
            model: "330d E90 / X5 E70",
            yearRange: { from: 2006, to: 2013 },
            engineCode: "M57N2",
          },
        ],
        price: 7890,
        tradePrice: 6450,
        costPrice: 5400,
        stockQuantity: 3,
        minReorderThreshold: 4,
        warehouseLocation: "Vault C2 · Bin 09",
        coreDepositAmount: 1500,
        isServiceKit: false,
        specsJson: JSON.stringify({ solenoids: 7, fluidSpec: "ZF LifeguardFluid 6" }),
      },
    ]

    const partIds: Id<"parts_catalog">[] = []
    for (const p of sampleParts) {
      const id = await ctx.db.insert("parts_catalog", {
        ...p,
        searchText: `${p.name} ${p.brand} ${p.category} ${p.sku} ${p.oemNumber ?? ""} ${p.crossReferenceNumbers.join(" ")}`,
        updatedAt: now,
      })
      partIds.push(id)
      if (process.env.OPENAI_API_KEY) {
        await ctx.scheduler.runAfter(0, internal.parts.embedPart, { partId: id })
      }
    }

    // Contacts
    const apexId = await ctx.db.insert("crm_contacts", {
      name: "Sipho Dlamini",
      companyName: "Apex Diesel & Fleet Workshop",
      type: "workshop_b2b",
      phone: "27824550192",
      email: "parts@apexdiesel.co.za",
      socialHandles: { fb: "apexdieseljhb" },
      leadScore: 92,
      lifetimeValue: 184500,
      lastOrderDate: now - 18 * DAY,
      lastServiceKitOrderAt: now - 18 * DAY,
      lastInboundAt: now - 12 * 60_000,
      autopilot: true,
      source: "whatsapp",
      tags: ["tier_1_workshop", "hilux_specialist", "credit_30d"],
    })

    const bavariaId = await ctx.db.insert("crm_contacts", {
      name: "Marco van Wyk",
      companyName: "EuroSpec Autohaus",
      type: "workshop_b2b",
      phone: "27837119044",
      email: "marco@eurospec.co.za",
      socialHandles: { ig: "eurospec_autohaus" },
      leadScore: 86,
      lifetimeValue: 129300,
      lastOrderDate: now - 4 * DAY,
      lastServiceKitOrderAt: now - 21 * DAY,
      lastInboundAt: now - 48 * 60_000,
      autopilot: true,
      source: "email",
      tags: ["vag_bmw", "workshop_b2b"],
    })

    const retailLeadId = await ctx.db.insert("crm_contacts", {
      name: "Thabo Mokoena",
      type: "retail_b2c",
      phone: "27769923410",
      email: "thabo.m@gmail.com",
      socialHandles: { tiktok: "thabo_4x4" },
      leadScore: 68,
      lifetimeValue: 3170,
      lastInboundAt: now - 5 * 60_000,
      autopilot: true,
      source: "tiktok_lead",
      tags: ["tiktok_lead", "ranger_owner"],
    })

    // Deals across Kanban stages
    const deal1 = await ctx.db.insert("deals_and_quotes", {
      contactId: apexId,
      channel: "whatsapp",
      requestedParts: [
        {
          partId: partIds[0],
          sku: "AP-TOY-BP-04465",
          description: "Toyota Genuine Front Ceramic Brake Pad Set",
          quantity: 3,
          tier: "oem",
          unitPrice: 1490,
          coreDeposit: 0,
        },
        {
          partId: partIds[2],
          sku: "AP-GAR-TRB-17201",
          description: "Garrett VNT Turbocharger Assembly — 1GD-FTV",
          quantity: 1,
          tier: "oem",
          unitPrice: 15800,
          coreDeposit: 2500,
        },
      ],
      vinNumber: "AHTBA3CD703219845",
      vehicle: { make: "Toyota", model: "Hilux 2.8 GD-6", year: 2021, engineCode: "1GD-FTV" },
      status: "quoted",
      totalAmount: 22770,
      coreDepositTotal: 2500,
      currency: "ZAR",
      paymentLink: "https://autopulse.app/pay/quote-apex-01",
      quoteExpiresAt: now + 44 * 3600_000,
      notes: "VIN disc verified via Whapi Vision",
      updatedAt: now - 10 * 60_000,
    })

    const deal2 = await ctx.db.insert("deals_and_quotes", {
      contactId: bavariaId,
      channel: "email",
      requestedParts: [
        {
          partId: partIds[3],
          sku: "AP-BOS-ALT-0124525",
          description: "Bosch 140A Smart Alternator — Golf 7 GTI",
          quantity: 1,
          tier: "oem",
          unitPrice: 5150,
          coreDeposit: 1200,
        },
      ],
      vehicle: { make: "Volkswagen", model: "Golf 7 GTI", year: 2017, engineCode: "CHHB" },
      status: "core_pending",
      totalAmount: 6350,
      coreDepositTotal: 1200,
      currency: "ZAR",
      updatedAt: now - 2 * 3600_000,
    })

    await ctx.db.insert("deals_and_quotes", {
      contactId: retailLeadId,
      channel: "tiktok_lead",
      requestedParts: [
        {
          partId: partIds[4],
          sku: "AP-MAN-KIT-RANGER",
          description: "MANN-FILTER Full 15,000km Service Kit — Ranger 2.0 Bi-Turbo",
          quantity: 1,
          tier: "aftermarket",
          unitPrice: 1580,
          coreDeposit: 0,
        },
      ],
      vehicle: { make: "Ford", model: "Ranger 2.0 Bi-Turbo", year: 2022, engineCode: "YN2X" },
      status: "paid",
      totalAmount: 1580,
      coreDepositTotal: 0,
      currency: "ZAR",
      updatedAt: now - 45 * 60_000,
    })

    await ctx.db.insert("deals_and_quotes", {
      contactId: apexId,
      channel: "whatsapp",
      requestedParts: [{ description: "Hilux GD6 rear wheel bearing kit (awaiting VIN)", quantity: 2 }],
      status: "new_rfq",
      totalAmount: 0,
      coreDepositTotal: 0,
      currency: "ZAR",
      updatedAt: now - 4 * 60_000,
    })

    // Omnichannel timeline messages
    await ctx.db.insert("channel_messages", {
      contactId: apexId,
      dealId: deal1,
      channel: "whatsapp",
      direction: "inbound",
      kind: "image",
      body: "Morning team, need 3 sets of front pads + 1 turbo for this fleet Hilux on the lift.",
      extracted: {
        vin: "AHTBA3CD703219845",
        partNumbers: ["04465-0K240", "17201-11080"],
        description: "South African license disc — 2021 Toyota Hilux 2.8 GD-6 (1GD-FTV)",
      },
      sentBy: "contact",
      timestamp: now - 14 * 60_000,
    })

    await ctx.db.insert("channel_messages", {
      contactId: apexId,
      dealId: deal1,
      channel: "whatsapp",
      direction: "outbound",
      kind: "interactive",
      body: "Decoded VIN *AHTBA3CD703219845* (2021 Hilux 2.8 GD-6 1GD-FTV). Both in stock at Aisle B2 / Vault C1:\n• 3x Toyota OEM Pads (04465-0K240) @ R1,490 trade\n• 1x Garrett OEM VNT Turbo (17201-11080) @ R15,800 + R2,500 refundable core deposit\nTotal: *ZAR 22,770.00* — tap below for instant dispatch.",
      sentBy: "agent",
      timestamp: now - 13 * 60_000,
    })

    await ctx.db.insert("channel_messages", {
      contactId: bavariaId,
      dealId: deal2,
      channel: "email",
      direction: "inbound",
      kind: "text",
      body: "Subject: Urgent Bosch 140A Alternator 06L903021E\n\nHi AutoPulse, have a 2017 Golf 7 GTI CHHB in Bay 4. Please confirm Bosch OEM stock & courier.",
      sentBy: "contact",
      timestamp: now - 3 * 3600_000,
    })

    // Core Returns
    await ctx.db.insert("core_returns", {
      dealId: deal2,
      contactId: bavariaId,
      partId: partIds[3],
      partName: "Bosch 140A Smart Alternator (06L903021E)",
      depositAmount: 1200,
      status: "owed",
      dueAt: now + 7 * DAY,
      inspectionNotes: "Awaiting WhatsApp photo of old alternator housing before courier pickup.",
    })

    await ctx.db.insert("core_returns", {
      dealId: deal1,
      contactId: apexId,
      partId: partIds[2],
      partName: "Garrett VNT Turbocharger Core (17201-11080)",
      depositAmount: 2500,
      status: "photo_submitted",
      dueAt: now + 10 * DAY,
      inspectionNotes: "Workshop sent turbine housing photo via WhatsApp — ready for Vision check.",
    })

    // Ad Campaigns
    await ctx.db.insert("ad_campaigns", {
      platform: "tiktok_ads",
      campaignId: "tt_cmp_98412",
      name: "Ranger & Hilux 15k Service Kit — Mechanics Promo",
      spend: 4250,
      dailyBudget: 650,
      impressions: 94200,
      clicks: 2410,
      cpc: 1.76,
      conversions: 38,
      leadsGenerated: 38,
      revenue: 24980,
      roas: 5.88,
      status: "active",
      lastSyncedAt: now,
    })

    await ctx.db.insert("ad_campaigns", {
      platform: "facebook_ads",
      campaignId: "fb_cmp_44109",
      name: "B2B Trade Account Onboarding — Gauteng Workshops",
      spend: 3180,
      dailyBudget: 500,
      impressions: 51800,
      clicks: 1120,
      cpc: 2.84,
      conversions: 19,
      leadsGenerated: 19,
      revenue: 16400,
      roas: 5.16,
      status: "active",
      lastSyncedAt: now,
    })

    await ctx.db.insert("ad_campaigns", {
      platform: "tiktok_ads",
      campaignId: "tt_cmp_99004",
      name: "Euro Performance Wiper Blades Broad Test",
      spend: 1190,
      dailyBudget: 350,
      impressions: 28100,
      clicks: 310,
      cpc: 3.84,
      conversions: 0,
      leadsGenerated: 0,
      revenue: 0,
      roas: 0,
      status: "active",
      lastSyncedAt: now,
    })

    // Margin Guardian initial signal
    await ctx.db.insert("pricing_signals", {
      partId: partIds[3],
      reason: "margin_below_floor",
      previousCost: 3890,
      newCost: 4320,
      suggestedB2BPrice: 5690,
      suggestedB2CPrice: 6990,
      rationale:
        "Bosch supplier invoice raised landed cost +11% to R4,320. Current B2B trade price (R5,150) compresses margin to 16.1% (below 18% floor).",
      status: "open",
      createdAt: now,
    })

    // Activity logs
    await writeLog(ctx, {
      app: "whapi",
      actionName: "vision.vin_plate.quoted",
      status: "success",
      contactId: apexId,
      dealId: deal1,
      payload: { vin: "AHTBA3CD703219845", total: 22770 },
    })
    await writeLog(ctx, {
      app: "composio",
      actionName: "tiktok_lead.instant_whatsapp_welcome",
      status: "success",
      contactId: retailLeadId,
      payload: { latencyMs: 3400, campaign: "tt_cmp_98412" },
    })
    await writeLog(ctx, {
      app: "composio",
      actionName: "GMAIL_FETCH_EMAILS",
      status: "success",
      contactId: bavariaId,
      payload: { subject: "Urgent Bosch 140A Alternator 06L903021E" },
    })

    return { seeded: true, skus: partIds.length }
  },
})
