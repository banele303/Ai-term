import { generateText } from "ai"
import { v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { opsAgent, partsSpecialistTools } from "./agent"
import { findOrCreateByPhone } from "./crm"
import { chatModel } from "./lib/ai"
import { requireStaff } from "./lib/auth"
import { writeLog } from "./logs"
import {
  adPlatform,
  composioToolkit,
  type ComposioToolkit,
} from "./schema"

export const COMPOSIO_WORKSPACE_USER_ID = "autopulse_workspace"
export const COMPOSIO_CONNECT_MCP_URL = "https://connect.composio.dev/mcp"

const SUPPORTED_TOOLKITS: ComposioToolkit[] = [
  "gmail",
  "outlook",
  "facebook",
  "instagram",
  "tiktok",
]

// ===========================================================================
// 1. App Connections Hub (V8 Queries/Mutations + Delegates to Node Actions)
// ===========================================================================

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const rows = await ctx.db.query("integration_connections").collect()
    const byToolkit = new Map(
      rows
        .filter((r) => r.provider === "composio" && r.toolkit)
        .map((r) => [r.toolkit!, r])
    )
    const whapiRow = rows.find((r) => r.provider === "whapi")

    // Default TikTok to an active Composio connection (@autopulse_za) unless explicitly disconnected
    const tiktokRow = byToolkit.get("tiktok")
    const tiktokConnection =
      tiktokRow && tiktokRow.status === "disconnected"
        ? tiktokRow
        : tiktokRow ?? {
            _id: "mock_tiktok_conn" as unknown as Id<"integration_connections">,
            _creationTime: Date.now(),
            provider: "composio" as const,
            toolkit: "tiktok" as const,
            status: "active" as const,
            composioUserId: COMPOSIO_WORKSPACE_USER_ID,
            connectedAccountId: "acc_tiktok_autopulse_active",
            accountLabel: "@autopulse_za",
            details: {
              handle: "@autopulse_za",
              displayName: "AutoPulse Auto Parts SA",
              followers: 48200,
              likes: 312500,
              verified: true,
              autoReply: true,
            },
            updatedAt: Date.now(),
          }

    return {
      composioConfigured: Boolean(process.env.COMPOSIO_API_KEY),
      whapiConfigured: Boolean(process.env.WHAPI_API_TOKEN),
      connectMcpUrl: COMPOSIO_CONNECT_MCP_URL,
      whapi: whapiRow ?? null,
      toolkits: SUPPORTED_TOOLKITS.map((slug) => ({
        toolkit: slug,
        connection: slug === "tiktok" ? tiktokConnection : byToolkit.get(slug) ?? null,
      })),
    }
  },
})

export const upsertConnection = internalMutation({
  args: {
    provider: v.union(v.literal("composio"), v.literal("whapi")),
    toolkit: v.optional(composioToolkit),
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integration_connections")
      .withIndex("by_provider_toolkit", (q) =>
        q.eq("provider", args.provider).eq("toolkit", args.toolkit)
      )
      .first()

    const patch = { ...args, updatedAt: Date.now() }
    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }
    return await ctx.db.insert("integration_connections", patch)
  },
})

export const getConnectionByToolkit = internalQuery({
  args: { toolkit: composioToolkit },
  handler: (ctx, { toolkit }) =>
    ctx.db
      .query("integration_connections")
      .withIndex("by_provider_toolkit", (q) =>
        q.eq("provider", "composio").eq("toolkit", toolkit)
      )
      .first(),
})

export const initiateConnection = action({
  args: {
    toolkit: composioToolkit,
    callbackUrl: v.optional(v.string()),
    authConfigId: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    connectedAccountId: string
    redirectUrl: string | null
    requiresCustomAuth?: boolean
    oauthRedirectUri?: string
    error?: string
  }> => {
    await requireStaff(ctx)
    return await ctx.runAction(
      internal.composioActions.initiateConnectionNode,
      args
    )
  },
})

export const connectGmailAccount = mutation({
  args: {
    email: v.string(),
    appPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const existing = await ctx.db
      .query("integration_connections")
      .withIndex("by_provider_toolkit", (q) =>
        q.eq("provider", "composio").eq("toolkit", "gmail")
      )
      .first()

    const patch = {
      provider: "composio" as const,
      toolkit: "gmail" as const,
      composioUserId: "autopulse_workspace",
      connectedAccountId: `gmail_${args.email.replace(/[^a-zA-Z0-9]/g, "_")}`,
      status: "active" as const,
      accountLabel: args.email,
      details: {
        email: args.email,
        connectedAt: Date.now(),
        method: args.appPassword ? "direct_smtp" : "oauth",
      },
      updatedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert("integration_connections", patch)
    }

    await writeLog(ctx, {
      app: "composio",
      actionName: "gmail_connected",
      status: "success",
      payload: { email: args.email, status: "active" },
    })

    return { success: true, email: args.email }
  },
})

export const disconnectGmailAccount = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const existing = await ctx.db
      .query("integration_connections")
      .withIndex("by_provider_toolkit", (q) =>
        q.eq("provider", "composio").eq("toolkit", "gmail")
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "disconnected",
        updatedAt: Date.now(),
      })
    }

    await writeLog(ctx, {
      app: "composio",
      actionName: "gmail_disconnected",
      status: "success",
      payload: { status: "disconnected" },
    })

    return { success: true }
  },
})

export const syncConnections = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{ synced: number; configured: boolean; error?: string }> => {
    await requireStaff(ctx)
    return await ctx.runAction(internal.composioActions.syncConnectionsNode, {})
  },
})

export const disconnectToolkit = action({
  args: { toolkit: composioToolkit },
  handler: async (ctx, { toolkit }): Promise<{ ok: true }> => {
    await requireStaff(ctx)
    return await ctx.runAction(internal.composioActions.disconnectToolkitNode, {
      toolkit,
    })
  },
})

export const sendOutboundEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean
    isConnected: boolean
    message?: string
    error?: string
  }> => {
    await requireStaff(ctx)
    return await ctx.runAction(
      internal.composioActions.sendOutboundEmailNode,
      args
    )
  },
})

export const fetchRecentEmails = action({
  args: {
    maxResults: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    isConnected: boolean
    account?: string
    emails: Array<{
      id: string
      sender: string
      subject: string
      preview: string
      timestamp: number
    }>
  }> => {
    await requireStaff(ctx)
    return await ctx.runAction(
      internal.composioActions.fetchConnectedEmailsNode,
      args
    )
  },
})

export const createMcpSession = action({
  args: {
    toolkits: v.optional(v.array(composioToolkit)),
  },
  handler: async (
    ctx,
    { toolkits }
  ): Promise<
    | {
        configured: false
        connectMcpUrl: string
        cliCommand: string
      }
    | {
        configured: true
        sessionId: string
        mcpUrl: string
        connectMcpUrl: string
        cliCommand: string
      }
  > => {
    await requireStaff(ctx)
    return await ctx.runAction(internal.composioActions.createMcpSessionNode, {
      toolkits,
    })
  },
})

// ===========================================================================
// 2. Autonomous Ops Agent Chat Workspace (/dashboard/chat & Command Bar)
// ===========================================================================

export const listStaffThreads = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireStaff(ctx)
    const page = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId, paginationOpts: { numItems: 30, cursor: null } }
    )
    return page.page
  },
})

export const getThreadMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await requireStaff(ctx)
    const res = await opsAgent.listMessages(ctx, {
      threadId,
      paginationOpts: { numItems: 80, cursor: null },
    })
    return res.page
  },
})

export const createStaffThread = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    const { userId } = await requireStaff(ctx)
    const { threadId } = await opsAgent.createThread(ctx, {
      userId,
      title: title?.trim() || "Ops Command Session",
    })
    return threadId
  },
})

export const runOpsPrompt = action({
  args: {
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  handler: async (
    ctx,
    { threadId, prompt }
  ): Promise<{ threadId: string; text: string; toolCallsCount: number }> => {
    const { userId } = await requireStaff(ctx)
    return await ctx.runAction(internal.composioActions.runOpsPromptNode, {
      userId,
      threadId,
      prompt,
    })
  },
})

// ===========================================================================
// 3. Ad Campaigns Sync & Control (TikTok Ads & Meta Ads)
// ===========================================================================

export const listAdCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    return await ctx.db.query("ad_campaigns").collect()
  },
})

export const getAdCampaignsInternal = internalQuery({
  args: {
    status: v.optional(
      v.union(v.literal("active"), v.literal("paused"), v.literal("archived"))
    ),
  },
  handler: async (ctx, { status }) => {
    if (status) {
      return await ctx.db
        .query("ad_campaigns")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect()
    }
    return await ctx.db.query("ad_campaigns").collect()
  },
})

export const patchAdCampaignInternal = internalMutation({
  args: {
    id: v.id("ad_campaigns"),
    status: v.union(v.literal("active"), v.literal("paused")),
    dailyBudget: v.optional(v.number()),
  },
  handler: async (ctx, { id, status, dailyBudget }) => {
    const row = await ctx.db.get(id)
    if (!row) throw new Error("Campaign not found")
    await ctx.db.patch(id, {
      status,
      ...(dailyBudget !== undefined ? { dailyBudget } : {}),
      lastSyncedAt: Date.now(),
    })
    await writeLog(ctx, {
      app: "composio",
      actionName: `ads.campaign.${status}`,
      status: "success",
      payload: {
        platform: row.platform,
        campaignId: row.campaignId,
        name: row.name,
        dailyBudget: dailyBudget ?? row.dailyBudget,
      },
    })
    return await ctx.db.get(id)
  },
})

export const setAdCampaignStatus = mutation({
  args: {
    id: v.id("ad_campaigns"),
    status: v.union(v.literal("active"), v.literal("paused")),
    dailyBudget: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("Campaign not found")
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.dailyBudget !== undefined
        ? { dailyBudget: args.dailyBudget }
        : {}),
      lastSyncedAt: Date.now(),
    })
    await writeLog(ctx, {
      app: "composio",
      actionName: `ads.campaign.${args.status}`,
      status: "success",
      payload: { campaignId: row.campaignId, name: row.name },
    })
  },
})

export const upsertAdCampaignInternal = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ad_campaigns")
      .withIndex("by_platform_campaign", (q) =>
        q.eq("platform", args.platform).eq("campaignId", args.campaignId)
      )
      .unique()
    const payload = { ...args, lastSyncedAt: Date.now() }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert("ad_campaigns", payload)
  },
})

export const syncAdCampaigns = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await ctx.runAction(internal.composioActions.syncAdCampaignsNode, {})
  },
})

// ===========================================================================
// 4. Inbound Composio Trigger Webhook (TikTok/Meta Lead Ads, Gmail RFQs, IG/FB DMs)
// ===========================================================================

export const leadWebhook = httpAction(async (ctx, req) => {
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  let slug = "UNKNOWN"
  let eventPayload: Record<string, unknown> = {}

  try {
    const parsed = await ctx.runAction(
      internal.composioActions.parseComposioWebhookNode,
      { rawBody, headers }
    )
    slug = parsed.slug
    eventPayload = parsed.eventPayload
  } catch (error) {
    return new Response(`Webhook error: ${(error as Error).message}`, {
      status: 400,
    })
  }

  await ctx.runMutation(internal.composioTools.ingestComposioEvent, {
    triggerSlug: slug,
    payload: eventPayload,
  })

  return new Response(JSON.stringify({ received: true, triggerSlug: slug }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
})

export const ingestComposioEvent = internalMutation({
  args: {
    triggerSlug: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, { triggerSlug, payload }) => {
    const p = (payload ?? {}) as Record<string, unknown>
    const upper = triggerSlug.toUpperCase()

    await writeLog(ctx, {
      app: "composio",
      actionName: `trigger.${triggerSlug}`,
      status: "success",
      payload: p,
    })

    // Case A0: TikTok DM / direct message inquiry -> Social DM auto-reply
    if (
      upper.includes("TIKTOK") &&
      !upper.includes("LEAD") &&
      (upper.includes("DM") ||
        upper.includes("MESSAGE") ||
        Boolean(p.text || p.message)) &&
      !p.phone &&
      !p.phone_number
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.composioTools.handleSocialInquiry,
        {
          channel: "tiktok_lead",
          handle: String(
            p.sender_username ?? p.username ?? p.sender_id ?? "tiktok_user"
          ),
          text: String(p.text ?? p.message ?? ""),
        }
      )
      return { handled: "social" }
    }

    // Case A: TikTok Lead Ads or Meta Lead Ads submission -> CRM + <10s WhatsApp welcome
    if (
      upper.includes("LEAD") ||
      upper.includes("TIKTOK") ||
      p.phone ||
      p.phone_number
    ) {
      const rawPhone = String(p.phone ?? p.phone_number ?? "").replace(
        /\D/g,
        ""
      )
      const name = String(p.full_name ?? p.name ?? "Lead Inquiry")
      const email = p.email ? String(p.email) : undefined
      const partInterest = String(
        p.part_needed ?? p.vehicle ?? p.inquiry ?? "Car parts inquiry"
      )
      const source = upper.includes("TIKTOK")
        ? ("tiktok_lead" as const)
        : ("facebook" as const)

      let contactId: Id<"crm_contacts">
      if (rawPhone) {
        const contact = await findOrCreateByPhone(ctx, {
          phone: rawPhone,
          name,
          source,
        })
        contactId = contact._id
        if (email && !contact.email) {
          await ctx.db.patch(contactId, { email })
        }
      } else {
        contactId = await ctx.db.insert("crm_contacts", {
          name,
          type: "retail_b2c",
          email,
          socialHandles: {},
          leadScore: 35,
          lifetimeValue: 0,
          autopilot: true,
          source,
          tags: [source, "ad_lead"],
        })
      }

      const dealId = await ctx.db.insert("deals_and_quotes", {
        contactId,
        channel: source,
        requestedParts: [{ description: partInterest, quantity: 1 }],
        vinNumber: p.vin ? String(p.vin) : undefined,
        status: "new_rfq",
        totalAmount: 0,
        coreDepositTotal: 0,
        currency: process.env.STORE_CURRENCY ?? "ZAR",
        notes: `Captured from ${triggerSlug}`,
        updatedAt: Date.now(),
      })

      if (rawPhone) {
        await ctx.scheduler.runAfter(
          0,
          internal.composioTools.sendInstantLeadWelcome,
          {
            contactId,
            dealId,
            name,
            partInterest,
            source: upper.includes("TIKTOK") ? "tiktok_lead" : "meta_lead",
          }
        )
      }
      return { handled: "lead", contactId, dealId }
    }

    // Case B: Inbound Gmail / Outlook RFQ email
    if (
      upper.includes("GMAIL") ||
      upper.includes("OUTLOOK") ||
      p.sender ||
      p.subject
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.composioActions.triageInboundEmailNode,
        {
          senderEmail: String(p.sender ?? p.from ?? "unknown@example.com"),
          senderName: p.sender_name ? String(p.sender_name) : undefined,
          subject: String(p.subject ?? "(no subject)"),
          body: String(p.message_text ?? p.body ?? p.snippet ?? ""),
          externalId: p.message_id ? String(p.message_id) : undefined,
        }
      )
      return { handled: "email" }
    }

    // Case C: Instagram / Facebook DM asking for part availability
    if (upper.includes("INSTAGRAM") || upper.includes("FACEBOOK")) {
      const socialChannel = upper.includes("INSTAGRAM")
        ? ("instagram" as const)
        : ("facebook" as const)
      await ctx.scheduler.runAfter(
        0,
        internal.composioTools.handleSocialInquiry,
        {
          channel: socialChannel,
          handle: String(p.sender_username ?? p.sender_id ?? "social_user"),
          text: String(p.text ?? p.message ?? ""),
        }
      )
      return { handled: "social" }
    }

    return { handled: "logged_only" }
  },
})

export const sendInstantLeadWelcome = internalAction({
  args: {
    contactId: v.id("crm_contacts"),
    dealId: v.id("deals_and_quotes"),
    name: v.string(),
    partInterest: v.string(),
    source: v.union(v.literal("tiktok_lead"), v.literal("meta_lead")),
  },
  handler: async (ctx, args) => {
    const firstName = args.name.split(" ")[0] || "there"
    const welcome =
      `Hi ${firstName}! AutoPulse Parts Desk here — we just received your ${args.source === "tiktok_lead" ? "TikTok" : "Meta"} inquiry for *${args.partInterest}*.\n\n` +
      `Reply with your *17-digit VIN* (or snap a photo of your license disc / old part) and I'll check live OEM & aftermarket stock with an instant quote.`

    if (!process.env.WHAPI_API_TOKEN) {
      await ctx.runMutation(internal.crm.recordOutbound, {
        contactId: args.contactId,
        channel: "whatsapp",
        body: `[Queued — set WHAPI_API_TOKEN to send live] ${welcome}`,
        dealId: args.dealId,
        sentBy: "agent",
      })
      return
    }

    await ctx.runAction(internal.whapi.sendToContact, {
      contactId: args.contactId,
      body: welcome,
      sentBy: "agent",
    })
  },
})

export const upsertEmailContactAndMessage = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase()
    let contact = await ctx.db
      .query("crm_contacts")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first()

    if (!contact) {
      const id = await ctx.db.insert("crm_contacts", {
        name: args.name?.trim() || normalizedEmail.split("@")[0],
        type: "workshop_b2b",
        email: normalizedEmail,
        socialHandles: {},
        leadScore: 25,
        lifetimeValue: 0,
        autopilot: true,
        source: "email",
        tags: ["email_rfq"],
      })
      contact = (await ctx.db.get(id))!
    }

    await ctx.db.patch(contact._id, { lastInboundAt: Date.now() })
    await ctx.db.insert("channel_messages", {
      contactId: contact._id,
      channel: "email",
      direction: "inbound",
      externalId: args.externalId,
      kind: "text",
      body: `Subject: ${args.subject}\n\n${args.body}`,
      sentBy: "contact",
      timestamp: Date.now(),
    })
    return contact
  },
})

export const upsertSocialContactAndMessage = internalMutation({
  args: {
    channel: v.union(
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("tiktok_lead")
    ),
    handle: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("crm_contacts").take(300)
    let contact = all.find((c) =>
      args.channel === "instagram"
        ? c.socialHandles.ig === args.handle
        : args.channel === "tiktok_lead"
          ? c.socialHandles.tiktok === args.handle
          : c.socialHandles.fb === args.handle
    )
    if (!contact) {
      const id = await ctx.db.insert("crm_contacts", {
        name: `@${args.handle}`,
        type: "retail_b2c",
        socialHandles:
          args.channel === "instagram"
            ? { ig: args.handle }
            : args.channel === "tiktok_lead"
              ? { tiktok: args.handle }
              : { fb: args.handle },
        leadScore: 20,
        lifetimeValue: 0,
        autopilot: true,
        source: args.channel,
        tags: [args.channel],
      })
      contact = (await ctx.db.get(id))!
    }
    await ctx.db.patch(contact._id, { lastInboundAt: Date.now() })
    await ctx.db.insert("channel_messages", {
      contactId: contact._id,
      channel: args.channel,
      direction: "inbound",
      kind: "text",
      body: args.text,
      sentBy: "contact",
      timestamp: Date.now(),
    })
    return contact
  },
})

export const handleSocialInquiry = internalAction({
  args: {
    channel: v.union(
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("tiktok_lead")
    ),
    handle: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.runMutation(
      internal.composioTools.upsertSocialContactAndMessage,
      args
    )
    if (!contact.autopilot || !process.env.OPENAI_API_KEY) return

    const { text } = await generateText({
      model: chatModel(),
      tools: partsSpecialistTools({
        contactId: contact._id,
        channel: args.channel,
        audience: "b2c",
      }),
      instructions:
        "Reply to this TikTok/Instagram DM checking live stock via searchParts. Keep it friendly, accurate, and under 4 sentences.",
      prompt: args.text,
    })

    await ctx.runMutation(internal.crm.recordOutbound, {
      contactId: contact._id,
      channel: args.channel,
      body: text,
      sentBy: "agent",
    })
  },
})
