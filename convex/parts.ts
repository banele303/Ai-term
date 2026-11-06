import { v } from "convex/values"

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
  type MutationCtx,
} from "./_generated/server"
import { embedText } from "./lib/ai"
import { requireStaff } from "./lib/auth"
import {
  buildEmbeddingText,
  buildSearchText,
  checkFitment,
  normPartNumber,
  reciprocalRankFusion,
  type VehicleQuery,
} from "./lib/parts"
import { priceTier, vehicleFitment } from "./schema"

const vehicleQuery = v.object({
  make: v.optional(v.string()),
  model: v.optional(v.string()),
  year: v.optional(v.number()),
  engineCode: v.optional(v.string()),
})

const partInput = {
  sku: v.string(),
  oemNumber: v.optional(v.string()),
  crossReferenceNumbers: v.array(v.string()),
  name: v.string(),
  category: v.string(),
  brand: v.string(),
  tier: priceTier,
  compatibleVehicles: v.array(vehicleFitment),
  price: v.number(),
  tradePrice: v.optional(v.number()),
  costPrice: v.number(),
  stockQuantity: v.number(),
  minReorderThreshold: v.number(),
  warehouseLocation: v.optional(v.string()),
  coreDepositAmount: v.optional(v.number()),
  isServiceKit: v.boolean(),
  specsJson: v.optional(v.string()),
}
const partInputValidator = v.object(partInput)
type PartInput = typeof partInputValidator.type

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Insert or update by SKU, then (re)embed in the background
export const upsert = mutation({
  args: partInput,
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    return await upsertPart(ctx, args)
  },
})

export const upsertInternal = internalMutation({
  args: partInput,
  handler: async (ctx, args) => upsertPart(ctx, args),
})

async function upsertPart(
  ctx: MutationCtx,
  args: PartInput
): Promise<Id<"parts_catalog">> {
  const fields = { ...args, searchText: buildSearchText(args), updatedAt: Date.now() }
  const existing = await ctx.db
    .query("parts_catalog")
    .withIndex("by_sku", (q) => q.eq("sku", args.sku))
    .unique()

  let id: Id<"parts_catalog">
  if (existing) {
    await ctx.db.patch(existing._id, fields)
    id = existing._id
  } else {
    id = await ctx.db.insert("parts_catalog", { ...fields })
  }
  await ctx.scheduler.runAfter(0, internal.parts.embedPart, { partId: id })
  return id
}

export const adjustStock = internalMutation({
  args: { partId: v.id("parts_catalog"), delta: v.number() },
  handler: async (ctx, { partId, delta }) => {
    const part = await ctx.db.get(partId)
    if (!part) throw new Error("Part not found")
    const stockQuantity = Math.max(0, part.stockQuantity + delta)
    await ctx.db.patch(partId, { stockQuantity, updatedAt: Date.now() })
    return stockQuantity
  },
})

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

export const embedPart = internalAction({
  args: { partId: v.id("parts_catalog") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.runQuery(internal.parts.get, { partId })
    if (!part) return
    const text = buildEmbeddingText(part)
    // Skip the OpenAI call when nothing semantic changed (e.g. a stock update)
    if (part.embedding && part.embeddedText === text) return
    const embedding = await embedText(text)
    await ctx.runMutation(internal.parts.setEmbedding, { partId, embedding, embeddedText: text })
  },
})

export const setEmbedding = internalMutation({
  args: {
    partId: v.id("parts_catalog"),
    embedding: v.array(v.float64()),
    embeddedText: v.string(),
  },
  handler: async (ctx, { partId, embedding, embeddedText }) => {
    if (!(await ctx.db.get(partId))) return
    await ctx.db.patch(partId, { embedding, embeddedText })
  },
})

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const get = internalQuery({
  args: { partId: v.id("parts_catalog") },
  handler: (ctx, { partId }) => ctx.db.get(partId),
})

export const getMany = internalQuery({
  args: { ids: v.array(v.id("parts_catalog")) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)))
    return docs.filter((d): d is Doc<"parts_catalog"> => d !== null)
  },
})

export const textSearch = internalQuery({
  args: { query: v.string(), category: v.optional(v.string()), limit: v.number() },
  handler: async (ctx, { query: text, category, limit }) => {
    // Exact part-number hit first (sku / oem), then full-text
    const pn = normPartNumber(text)
    const exact: Doc<"parts_catalog">[] = []
    if (pn.length >= 5) {
      const bySku = await ctx.db
        .query("parts_catalog")
        .withIndex("by_sku", (q) => q.eq("sku", text.trim()))
        .unique()
      if (bySku) exact.push(bySku)
      const byOem = await ctx.db
        .query("parts_catalog")
        .withIndex("by_oem", (q) => q.eq("oemNumber", text.trim()))
        .take(5)
      exact.push(...byOem)
    }
    const fts = await ctx.db
      .query("parts_catalog")
      .withSearchIndex("search_parts", (q) => {
        const s = q.search("searchText", text)
        return category ? s.eq("category", category) : s
      })
      .take(limit)
    return [...exact, ...fts].map((d) => d._id)
  },
})

export const list = query({
  args: { category: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { category, limit }) => {
    await requireStaff(ctx)
    const q = category
      ? ctx.db.query("parts_catalog").withIndex("by_category", (i) => i.eq("category", category))
      : ctx.db.query("parts_catalog")
    const rows = await q.order("desc").take(Math.min(limit ?? 100, 500))
    return rows.map(({ embedding: _e, embeddedText: _t, ...rest }) => rest)
  },
})

export const lowStock = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Bounded scan of the lowest stock levels; threshold is per-part
    const rows = await ctx.db.query("parts_catalog").withIndex("by_stock").take(500)
    return rows.filter((p) => p.stockQuantity <= p.minReorderThreshold)
  },
})

// ---------------------------------------------------------------------------
// Hybrid search (vector + full-text, fused with RRF) + fitment
// ---------------------------------------------------------------------------

export type PartSearchHit = {
  part: Doc<"parts_catalog">
  score: number
  fitment: ReturnType<typeof checkFitment>
}

export async function hybridSearchParts(
  ctx: ActionCtx,
  args: { query: string; category?: string; vehicle?: VehicleQuery; limit?: number }
): Promise<PartSearchHit[]> {
  const limit = args.limit ?? 8
  const pool = Math.max(limit * 3, 16)

  const [textIds, vectorHits]: [
    Id<"parts_catalog">[],
    { _id: Id<"parts_catalog">; _score: number }[],
  ] = await Promise.all([
    ctx.runQuery(internal.parts.textSearch, {
      query: args.query,
      category: args.category,
      limit: pool,
    }),
    embedText(
      [args.query, args.vehicle && Object.values(args.vehicle).filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — ")
    ).then((vector) =>
      ctx.vectorSearch("parts_catalog", "by_embedding", {
        vector,
        limit: pool,
        ...(args.category ? { filter: (q) => q.eq("category", args.category!) } : {}),
      })
    ),
  ])

  const fused = reciprocalRankFusion<Id<"parts_catalog">>([
    textIds,
    vectorHits.map((h) => h._id),
  ]).slice(0, pool)

  const docs: Doc<"parts_catalog">[] = await ctx.runQuery(internal.parts.getMany, {
    ids: fused.map((f) => f.id),
  })
  const byId = new Map<Id<"parts_catalog">, Doc<"parts_catalog">>(
    docs.map((d) => [d._id, d])
  )

  const hits = fused
    .map(({ id, score }) => {
      const part = byId.get(id)
      return part ? { part, score, fitment: checkFitment(part, args.vehicle) } : null
    })
    .filter((h): h is PartSearchHit => h !== null)

  // When a vehicle is known, confirmed fits rank first and known misfits drop
  if (args.vehicle) {
    const rank = { fits: 0, unknown: 1, no_fit: 2 } as const
    hits.sort((a, b) => rank[a.fitment.verdict] - rank[b.fitment.verdict] || b.score - a.score)
    const filtered = hits.filter((h) => h.fitment.verdict !== "no_fit")
    if (filtered.length) return filtered.slice(0, limit)
  }
  return hits.slice(0, limit)
}

// Staff-facing semantic search for the Knowledge Base page
export const search = action({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    vehicle: v.optional(vehicleQuery),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const hits = await hybridSearchParts(ctx, args)
    return hits.map(({ part: { embedding: _e, embeddedText: _t, ...part }, score, fitment }) => ({
      part,
      score,
      fitment,
    }))
  },
})
