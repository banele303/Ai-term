import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v, type Infer } from "convex/values"

// text-embedding-3-small
export const EMBEDDING_DIMENSIONS = 1536

// ---------------------------------------------------------------------------
// Shared validators (exported so functions validate args with the same shapes)
// ---------------------------------------------------------------------------

export const vehicleFitment = v.object({
  make: v.string(),
  model: v.string(),
  // Inclusive, e.g. { from: 2016, to: 2023 }
  yearRange: v.object({ from: v.number(), to: v.number() }),
  engineCode: v.optional(v.string()),
})
export type VehicleFitment = Infer<typeof vehicleFitment>

export const contactType = v.union(
  v.literal("workshop_b2b"),
  v.literal("retail_b2c"),
  v.literal("supplier")
)

export const channel = v.union(
  v.literal("whatsapp"),
  v.literal("email"),
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("tiktok_lead"),
  v.literal("meta_lead"),
  v.literal("dashboard")
)
export type Channel = Infer<typeof channel>

export const dealStatus = v.union(
  v.literal("new_rfq"),
  v.literal("fitment_verified"),
  v.literal("quoted"),
  v.literal("awaiting_payment"),
  v.literal("paid"),
  v.literal("dispatched"),
  v.literal("core_pending"),
  v.literal("closed"),
  v.literal("lost")
)
export type DealStatus = Infer<typeof dealStatus>

export const priceTier = v.union(v.literal("oem"), v.literal("aftermarket"))

export const requestedPart = v.object({
  partId: v.optional(v.id("parts_catalog")),
  sku: v.optional(v.string()),
  description: v.string(),
  quantity: v.number(),
  tier: v.optional(priceTier),
  unitPrice: v.optional(v.number()),
  coreDeposit: v.optional(v.number()),
})
export type RequestedPart = Infer<typeof requestedPart>

export const automationApp = v.union(
  v.literal("whapi"),
  v.literal("composio"),
  v.literal("openai"),
  v.literal("agent"),
  v.literal("cron"),
  v.literal("system")
)

export const logStatus = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("error"),
  v.literal("skipped")
)

export const adPlatform = v.union(
  v.literal("tiktok_ads"),
  v.literal("facebook_ads"),
  v.literal("instagram")
)

export const composioToolkit = v.union(
  v.literal("gmail"),
  v.literal("outlook"),
  v.literal("facebook"),
  v.literal("instagram"),
  v.literal("tiktok")
)
export type ComposioToolkit = Infer<typeof composioToolkit>

export default defineSchema({
  ...authTables,

  // -------------------------------------------------------------------------
  // Module A.1 — Parts catalog (hybrid: full-text + vector)
  // -------------------------------------------------------------------------
  parts_catalog: defineTable({
    sku: v.string(),
    oemNumber: v.optional(v.string()),
    crossReferenceNumbers: v.array(v.string()),
    name: v.string(),
    category: v.string(),
    brand: v.string(),
    tier: priceTier,
    compatibleVehicles: v.array(vehicleFitment),
    price: v.number(),
    // B2B (workshop) price; falls back to `price` when absent
    tradePrice: v.optional(v.number()),
    costPrice: v.number(),
    stockQuantity: v.number(),
    minReorderThreshold: v.number(),
    warehouseLocation: v.optional(v.string()),
    coreDepositAmount: v.optional(v.number()),
    // Fast movers drive the workshop re-engagement cron
    isServiceKit: v.boolean(),
    specsJson: v.optional(v.string()),
    // Denormalized: sku + oem + cross refs + name + brand + fitment, for the
    // full-text index. Rebuilt on every write by `parts.buildSearchText`.
    searchText: v.string(),
    // Filled asynchronously by `parts.embedPart`
    embedding: v.optional(v.array(v.float64())),
    embeddedText: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_sku", ["sku"])
    .index("by_oem", ["oemNumber"])
    .index("by_category", ["category"])
    .index("by_stock", ["stockQuantity"])
    .searchIndex("search_parts", {
      searchField: "searchText",
      filterFields: ["category", "brand", "tier"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["category", "brand", "tier"],
    }),

  // -------------------------------------------------------------------------
  // Module A.2 — CRM contacts
  // -------------------------------------------------------------------------
  crm_contacts: defineTable({
    name: v.string(),
    companyName: v.optional(v.string()),
    type: contactType,
    // WhatsApp ID: digits only, international format, no "+" (e.g. 27821234567)
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    socialHandles: v.object({
      fb: v.optional(v.string()),
      ig: v.optional(v.string()),
      tiktok: v.optional(v.string()),
    }),
    leadScore: v.number(),
    lifetimeValue: v.number(),
    // Clerk user id of the staff member who owns the account
    assignedAgentId: v.optional(v.string()),
    lastOrderDate: v.optional(v.number()),
    lastServiceKitOrderAt: v.optional(v.number()),
    lastReengagedAt: v.optional(v.number()),
    lastInboundAt: v.optional(v.number()),
    // @convex-dev/agent thread that holds this contact's conversation memory
    agentThreadId: v.optional(v.string()),
    // Staff can take over a conversation; the agent stops auto-replying
    autopilot: v.boolean(),
    source: v.optional(channel),
    tags: v.array(v.string()),
  })
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_type_and_service_kit", ["type", "lastServiceKitOrderAt"])
    .index("by_lastInbound", ["lastInboundAt"])
    .searchIndex("search_contacts", {
      searchField: "name",
      filterFields: ["type"],
    }),

  // -------------------------------------------------------------------------
  // Module A.3 — Deals & quotes (CRM Kanban)
  // -------------------------------------------------------------------------
  deals_and_quotes: defineTable({
    contactId: v.id("crm_contacts"),
    channel: channel,
    requestedParts: v.array(requestedPart),
    vinNumber: v.optional(v.string()),
    vehicle: v.optional(
      v.object({
        make: v.optional(v.string()),
        model: v.optional(v.string()),
        year: v.optional(v.number()),
        engineCode: v.optional(v.string()),
      })
    ),
    status: dealStatus,
    totalAmount: v.number(),
    coreDepositTotal: v.number(),
    currency: v.string(),
    paymentLink: v.optional(v.string()),
    quoteExpiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "updatedAt"])
    .index("by_contact", ["contactId", "updatedAt"])
    .index("by_status_and_expiry", ["status", "quoteExpiresAt"]),

  // -------------------------------------------------------------------------
  // Unified omnichannel timeline (WhatsApp + email + IG/FB DMs)
  // -------------------------------------------------------------------------
  channel_messages: defineTable({
    contactId: v.id("crm_contacts"),
    dealId: v.optional(v.id("deals_and_quotes")),
    channel: channel,
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    // Provider message id (Whapi message id, Gmail message id, ...) for dedupe
    externalId: v.optional(v.string()),
    kind: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("audio"),
      v.literal("document"),
      v.literal("interactive"),
      v.literal("other")
    ),
    body: v.string(),
    mediaUrl: v.optional(v.string()),
    // Vision / transcription output, attached once processed
    extracted: v.optional(
      v.object({
        transcript: v.optional(v.string()),
        vin: v.optional(v.string()),
        partNumbers: v.optional(v.array(v.string())),
        description: v.optional(v.string()),
      })
    ),
    sentBy: v.union(v.literal("contact"), v.literal("agent"), v.literal("staff")),
    timestamp: v.number(),
  })
    .index("by_contact", ["contactId", "timestamp"])
    .index("by_externalId", ["externalId"]),

  // -------------------------------------------------------------------------
  // Module A.4 — Automation audit log (Whapi, Composio, agent, crons)
  // -------------------------------------------------------------------------
  automation_logs: defineTable({
    app: automationApp,
    actionName: v.string(),
    status: logStatus,
    payload: v.optional(v.any()),
    error: v.optional(v.string()),
    contactId: v.optional(v.id("crm_contacts")),
    dealId: v.optional(v.id("deals_and_quotes")),
    timestamp: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_app", ["app", "timestamp"]),

  // -------------------------------------------------------------------------
  // Module A.5 — Ad campaigns (synced from Composio)
  // -------------------------------------------------------------------------
  ad_campaigns: defineTable({
    platform: adPlatform,
    campaignId: v.string(),
    name: v.string(),
    spend: v.number(),
    dailyBudget: v.optional(v.number()),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cpc: v.optional(v.number()),
    conversions: v.optional(v.number()),
    leadsGenerated: v.number(),
    revenue: v.optional(v.number()),
    roas: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
      v.literal("unknown")
    ),
    lastSyncedAt: v.number(),
  })
    .index("by_platform_campaign", ["platform", "campaignId"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // Module D.1 — Core returns & deposits
  // -------------------------------------------------------------------------
  core_returns: defineTable({
    dealId: v.id("deals_and_quotes"),
    contactId: v.id("crm_contacts"),
    partId: v.optional(v.id("parts_catalog")),
    partName: v.string(),
    depositAmount: v.number(),
    status: v.union(
      v.literal("owed"),
      v.literal("photo_submitted"),
      v.literal("inspection_passed"),
      v.literal("inspection_failed"),
      v.literal("refunded"),
      v.literal("forfeited")
    ),
    dueAt: v.number(),
    inspectionPhotoUrl: v.optional(v.string()),
    inspectionNotes: v.optional(v.string()),
    refundedAt: v.optional(v.number()),
  })
    .index("by_status", ["status", "dueAt"])
    .index("by_contact", ["contactId", "status"]),

  // -------------------------------------------------------------------------
  // Module D.2 — Margin Guardian signals
  // -------------------------------------------------------------------------
  pricing_signals: defineTable({
    partId: v.id("parts_catalog"),
    reason: v.union(
      v.literal("cost_increase"),
      v.literal("fast_mover"),
      v.literal("dead_stock"),
      v.literal("margin_below_floor")
    ),
    previousCost: v.optional(v.number()),
    newCost: v.optional(v.number()),
    suggestedB2BPrice: v.number(),
    suggestedB2CPrice: v.number(),
    rationale: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("applied"),
      v.literal("dismissed")
    ),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_part", ["partId", "status"]),

  // -------------------------------------------------------------------------
  // Module D.3 — 1-click automation library (crons check `enabled`)
  // -------------------------------------------------------------------------
  automations: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.string(),
    schedule: v.string(),
    enabled: v.boolean(),
    lastRunAt: v.optional(v.number()),
    lastRunStatus: v.optional(logStatus),
  }).index("by_key", ["key"]),

  // -------------------------------------------------------------------------
  // Integrations: Composio connected accounts + Whapi channel health
  // -------------------------------------------------------------------------
  integration_connections: defineTable({
    provider: v.union(v.literal("composio"), v.literal("whapi")),
    toolkit: v.optional(composioToolkit),
    // Composio user id the connection belongs to (the workspace, see composio lib)
    composioUserId: v.optional(v.string()),
    connectedAccountId: v.optional(v.string()),
    status: v.union(
      v.literal("initiated"),
      v.literal("active"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("disconnected")
    ),
    accountLabel: v.optional(v.string()),
    details: v.optional(v.any()),
    updatedAt: v.number(),
  })
    .index("by_provider_toolkit", ["provider", "toolkit"])
    .index("by_connectedAccountId", ["connectedAccountId"]),

  // -------------------------------------------------------------------------
  // Knowledge base documents (spec sheets, CSV catalogs) chunked + embedded
  // -------------------------------------------------------------------------
  kb_documents: defineTable({
    title: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    storageId: v.id("_storage"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    chunkCount: v.number(),
    error: v.optional(v.string()),
    uploadedBy: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  kb_chunks: defineTable({
    documentId: v.id("kb_documents"),
    index: v.number(),
    text: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_document", ["documentId", "index"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["documentId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["documentId"],
    }),

  // -------------------------------------------------------------------------
  // AI Teammates (Gaze bots, direct & group chats, message history)
  // -------------------------------------------------------------------------
  teammate_bots: defineTable({
    userId: v.string(),
    name: v.string(),
    avatar: v.string(),
    job: v.string(),
    instructions: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  teammate_chats: defineTable({
    userId: v.string(),
    kind: v.union(v.literal("direct"), v.literal("group")),
    name: v.optional(v.string()),
    botIds: v.array(v.id("teammate_bots")),
    lastMessagePreview: v.optional(v.string()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_lastMessage", ["userId", "lastMessageAt"])
    .index("by_user", ["userId"]),

  teammate_messages: defineTable({
    chatId: v.id("teammate_chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    botId: v.optional(v.id("teammate_bots")),
    targetBotId: v.optional(v.id("teammate_bots")),
    createdAt: v.number(),
  }).index("by_chat", ["chatId", "createdAt"]),
})
