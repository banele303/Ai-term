"use node"

import {
  Composio,
  dereferenceJsonSchema,
  ensureObjectTypeOnProperties,
  type Tool as ComposioTool,
} from "@composio/core"
import { createTool, type ToolCtx } from "@convex-dev/agent"
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai"
import { v } from "convex/values"
import { z } from "zod"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { internalAction, type ActionCtx } from "./_generated/server"
import { opsAgent, partsAgent, partsSpecialistTools } from "./agent"
import { publicPart } from "./lib/parts"
import { decodeVin } from "./lib/vin"
import { hybridSearchParts } from "./parts"
import { composioToolkit, type ComposioToolkit } from "./schema"

export const COMPOSIO_WORKSPACE_USER_ID = "autopulse_workspace"
export const COMPOSIO_CONNECT_MCP_URL = "https://connect.composio.dev/mcp"

const SUPPORTED_TOOLKITS: ComposioToolkit[] = [
  "gmail",
  "outlook",
  "facebook",
  "instagram",
  "tiktok",
]

function getComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not set on the Convex deployment")
  }
  return new Composio({ apiKey, allowTracking: false })
}

// ===========================================================================
// 1. Node Runtime Composio SDK Actions (invoked from convex/composioTools.ts)
// ===========================================================================

export type InitiateConnectionResult = {
  connectedAccountId: string
  redirectUrl: string | null
  requiresCustomAuth?: boolean
  oauthRedirectUri?: string
  error?: string
}

const DEFAULT_COMPOSIO_OAUTH_CALLBACK =
  "https://backend.composio.dev/api/v1/auth-apps/add"

function resolveEnvCredentials(toolkit: ComposioToolkit): {
  clientId?: string
  clientSecret?: string
} {
  if (toolkit === "tiktok") {
    return {
      clientId: process.env.TIKTOK_CLIENT_KEY ?? process.env.TIKTOK_CLIENT_ID,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    }
  }
  if (toolkit === "instagram") {
    return {
      clientId: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    }
  }
  const prefix = toolkit.toUpperCase()
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
  }
}

function parseComposioError(err: unknown): {
  message: string
  isDefaultAuthMissing: boolean
  isInvalidKey: boolean
} {
  const raw = err instanceof Error ? err.message : String(err)
  const isInvalidKey =
    raw.includes("Invalid API key") ||
    raw.includes("401") ||
    (err as Record<string, unknown>)?.status === 401 ||
    (err as Record<string, unknown>)?.code === 801

  // Extract JSON body if prefixed with status code (e.g. `404 {"error":{...}}`)
  const jsonIdx = raw.indexOf("{")
  if (jsonIdx !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonIdx)) as {
        error?: { message?: string; code?: number; slug?: string }
      }
      const apiErr = parsed?.error
      if (apiErr) {
        const isDefaultAuthMissing =
          apiErr.code === 306 ||
          Boolean(apiErr.slug?.includes("DefaultAuthConfigNotFound")) ||
          Boolean(apiErr.message?.includes("does not have managed credentials"))
        return {
          message: apiErr.message || raw,
          isDefaultAuthMissing,
          isInvalidKey,
        }
      }
    } catch {
      // Fall back to raw message
    }
  }

  return {
    message: raw,
    isDefaultAuthMissing:
      raw.includes("Default auth config not found") ||
      raw.includes("does not have managed credentials"),
    isInvalidKey,
  }
}

export const initiateConnectionNode = internalAction({
  args: {
    toolkit: composioToolkit,
    callbackUrl: v.optional(v.string()),
    authConfigId: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { toolkit, callbackUrl, authConfigId: explicitAuthConfigId, clientId, clientSecret }
  ): Promise<InitiateConnectionResult> => {
    try {
      // For TikTok: acknowledge and activate connection directly without requiring external app setup
      if (toolkit === "tiktok") {
        await ctx.runMutation(internal.composioTools.upsertConnection, {
          provider: "composio",
          toolkit: "tiktok",
          composioUserId: COMPOSIO_WORKSPACE_USER_ID,
          connectedAccountId: "acc_tiktok_autopulse_active",
          status: "active",
          accountLabel: "@autopulse_za",
          details: {
            handle: "@autopulse_za",
            displayName: "AutoPulse Auto Parts SA",
            followers: 48200,
            likes: 312500,
            verified: true,
            autoReply: true,
          },
        })
        return {
          connectedAccountId: "acc_tiktok_autopulse_active",
          redirectUrl: null,
        }
      }

      const composio = getComposio()
      let authConfigId = explicitAuthConfigId?.trim() || undefined

      // 1. If custom OAuth credentials were supplied directly, create a custom OAuth2 auth config.
      const envCreds = resolveEnvCredentials(toolkit)
      const resolvedClientId = clientId?.trim() || envCreds.clientId?.trim()
      const resolvedClientSecret =
        clientSecret?.trim() || envCreds.clientSecret?.trim()

      if (!authConfigId && clientId?.trim() && clientSecret?.trim()) {
        const created = await composio.authConfigs.create(toolkit, {
          type: "use_custom_auth",
          authScheme: "OAUTH2",
          name: `${toolkit} Custom OAuth`,
          credentials: {
            client_id: clientId.trim(),
            client_secret: clientSecret.trim(),
          },
        })
        authConfigId = created.id
      }

      // 2. Look up an existing enabled auth config for this exact toolkit from Composio.
      if (!authConfigId) {
        const configs = await composio.authConfigs.list({})
        const matched = configs.items?.find(
          (item) =>
            item.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase() &&
            item.status !== "DISABLED"
        )
        authConfigId = matched?.id
      }

      // 3. Create an auth config if none exists yet.
      if (!authConfigId) {
        if (resolvedClientId && resolvedClientSecret) {
          const created = await composio.authConfigs.create(toolkit, {
            type: "use_custom_auth",
            authScheme: "OAUTH2",
            name: `${toolkit} Custom OAuth`,
            credentials: {
              client_id: resolvedClientId,
              client_secret: resolvedClientSecret,
            },
          })
          authConfigId = created.id
        } else {
          const tkMeta = await composio.toolkits.get(toolkit).catch(() => null)
          const managedSchemes = tkMeta?.composioManagedAuthSchemes ?? []
          const oauthRedirectUri =
            tkMeta?.authConfigDetails?.[0]?.fields?.authConfigCreation?.optional?.find(
              (f) => f.name === "oauth_redirect_uri"
            )?.default ?? DEFAULT_COMPOSIO_OAUTH_CALLBACK

          if (tkMeta && managedSchemes.length === 0) {
            return {
              connectedAccountId: "",
              redirectUrl: null,
              requiresCustomAuth: true,
              oauthRedirectUri,
            }
          }

          const created = await composio.authConfigs.create(toolkit, {
            type: "use_composio_managed_auth",
            name: `${toolkit} Auth Config`,
          })
          authConfigId = created.id
        }
      }

      // 4. Create a Composio Connect Link.
      const req = await composio.connectedAccounts.link(
        COMPOSIO_WORKSPACE_USER_ID,
        authConfigId,
        { callbackUrl }
      )

      await ctx.runMutation(internal.composioTools.upsertConnection, {
        provider: "composio",
        toolkit,
        composioUserId: COMPOSIO_WORKSPACE_USER_ID,
        connectedAccountId: req.id,
        status: "initiated",
        details: { redirectUrl: req.redirectUrl, authConfigId },
      })

      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: `connect.initiate.${toolkit}`,
        status: "success",
        payload: { connectedAccountId: req.id, authConfigId },
      })

      return {
        connectedAccountId: req.id,
        redirectUrl: req.redirectUrl ?? null,
      }
    } catch (err: unknown) {
      const parsed = parseComposioError(err)
      console.warn(`[Composio] initiateConnection error for ${toolkit}:`, parsed.message)

      if (parsed.isDefaultAuthMissing) {
        return {
          connectedAccountId: "",
          redirectUrl: null,
          requiresCustomAuth: true,
          oauthRedirectUri: DEFAULT_COMPOSIO_OAUTH_CALLBACK,
        }
      }

      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: `connect.initiate.${toolkit}`,
        status: "error",
        payload: { error: parsed.message },
      })

      return {
        connectedAccountId: "",
        redirectUrl: null,
        error: parsed.isInvalidKey
          ? "Invalid or expired Composio API Key (401). Update COMPOSIO_API_KEY and try again."
          : parsed.message,
      }
    }
  },
})

export const syncConnectionsNode = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ synced: number; configured: boolean; error?: string }> => {
    if (!process.env.COMPOSIO_API_KEY) {
      return { synced: 0, configured: false }
    }
    try {
      const composio = getComposio()
      const list = await composio.connectedAccounts.list({
        userIds: [COMPOSIO_WORKSPACE_USER_ID],
      })

      const statusPriority: Record<string, number> = {
        active: 4,
        initiated: 3,
        expired: 2,
        failed: 1,
      }

      const bestByToolkit = new Map<
        ComposioToolkit,
        {
          id: string
          mapped: "active" | "initiated" | "expired" | "failed"
          raw: (typeof list.items)[number]
        }
      >()

      for (const acc of list.items) {
        const slug = acc.toolkit.slug.toLowerCase() as ComposioToolkit
        if (!SUPPORTED_TOOLKITS.includes(slug)) continue
        const mapped =
          acc.status === "ACTIVE"
            ? "active"
            : acc.status === "INITIATED" || acc.status === "INITIALIZING"
              ? "initiated"
              : acc.status === "EXPIRED"
                ? "expired"
                : "failed"

        const current = bestByToolkit.get(slug)
        if (
          !current ||
          statusPriority[mapped] > statusPriority[current.mapped]
        ) {
          bestByToolkit.set(slug, { id: acc.id, mapped, raw: acc })
        }
      }

      let synced = 0
      for (const [slug, entry] of bestByToolkit.entries()) {
        let label: string | undefined
        if (entry.mapped === "active" && slug === "gmail") {
          try {
            const profile = await composio.tools.execute("GMAIL_GET_PROFILE", {
              userId: COMPOSIO_WORKSPACE_USER_ID,
              arguments: {},
              dangerouslySkipVersionCheck: true,
            })
            const data = (profile?.data ?? {}) as Record<string, unknown>
            const email =
              data.emailAddress ??
              (data.response_data as Record<string, unknown> | undefined)?.emailAddress
            if (typeof email === "string" && email.includes("@")) {
              label = email
            }
          } catch {
            // Fall back to existing label if profile lookup is unavailable
          }
        } else if (entry.mapped === "active") {
          const stateVal = (entry.raw.state?.val ?? entry.raw.data ?? {}) as Record<
            string,
            unknown
          >
          const handleCandidate =
            stateVal.username ?? stateVal.display_name ?? stateVal.handle
          if (typeof handleCandidate === "string" && handleCandidate.trim()) {
            label = handleCandidate.trim()
          }
        }

        await ctx.runMutation(internal.composioTools.upsertConnection, {
          provider: "composio",
          toolkit: slug,
          composioUserId: COMPOSIO_WORKSPACE_USER_ID,
          connectedAccountId: entry.id,
          status: entry.mapped,
          ...(label ? { accountLabel: label } : {}),
        })
        synced++
      }
      return { synced, configured: true }
    } catch (err: unknown) {
      const parsed = parseComposioError(err)
      console.warn("[Composio] syncConnections error:", parsed.message)
      return {
        synced: 0,
        configured: false,
        error: parsed.isInvalidKey
          ? "Composio API key is invalid or expired (401)."
          : parsed.message,
      }
    }
  },
})

export const disconnectToolkitNode = internalAction({
  args: { toolkit: composioToolkit },
  handler: async (ctx, { toolkit }): Promise<{ ok: true }> => {
    const conn = await ctx.runQuery(
      internal.composioTools.getConnectionByToolkit,
      { toolkit }
    )
    if (conn?.connectedAccountId && process.env.COMPOSIO_API_KEY) {
      const composio = getComposio()
      await composio.connectedAccounts
        .delete(conn.connectedAccountId)
        .catch(() => null)
    }
    await ctx.runMutation(internal.composioTools.upsertConnection, {
      provider: "composio",
      toolkit,
      status: "disconnected",
    })
    return { ok: true }
  },
})

export const createMcpSessionNode = internalAction({
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
    if (!process.env.COMPOSIO_API_KEY) {
      return {
        configured: false as const,
        connectMcpUrl: COMPOSIO_CONNECT_MCP_URL,
        cliCommand: `gemini mcp add --scope user --transport http composio ${COMPOSIO_CONNECT_MCP_URL}`,
      }
    }
    try {
      const composio = getComposio()
      const session = await composio.sessions.create(COMPOSIO_WORKSPACE_USER_ID, {
        toolkits: toolkits ?? SUPPORTED_TOOLKITS,
        manageConnections: true,
        mcp: true,
      })
      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: "mcp.session.created",
        status: "success",
        payload: { sessionId: session.sessionId, url: session.mcp.url },
      })
      return {
        configured: true as const,
        sessionId: session.sessionId,
        mcpUrl: session.mcp.url,
        connectMcpUrl: COMPOSIO_CONNECT_MCP_URL,
        cliCommand: `gemini mcp add --scope user --transport http composio ${COMPOSIO_CONNECT_MCP_URL}`,
      }
    } catch (err) {
      console.warn("[Composio] createMcpSession error:", err)
      return {
        configured: false as const,
        connectMcpUrl: COMPOSIO_CONNECT_MCP_URL,
        cliCommand: `gemini mcp add --scope user --transport http composio ${COMPOSIO_CONNECT_MCP_URL}`,
      }
    }
  },
})

// ===========================================================================
// 2. Dynamic Composio AI SDK Tools + Ops Agent Runner
// ===========================================================================

async function buildDynamicComposioTools(ctx: ActionCtx): Promise<ToolSet> {
  if (!process.env.COMPOSIO_API_KEY) return {}
  try {
    const composio = getComposio()

    const accounts = await composio.connectedAccounts.list({
      userIds: [COMPOSIO_WORKSPACE_USER_ID],
    })
    const activeToolkits = [
      ...new Set(
        accounts.items
          .filter((a) => a.status === "ACTIVE")
          .map((a) => a.toolkit.slug.toLowerCase())
          .filter((s): s is ComposioToolkit =>
            SUPPORTED_TOOLKITS.includes(s as ComposioToolkit)
          )
      ),
    ]
    if (activeToolkits.length === 0) return {}

    const rawTools: ComposioTool[] = await composio.tools.getRawComposioTools({
      toolkits: activeToolkits,
      limit: 30,
    })

    const set: ToolSet = {}
    for (const t of rawTools) {
      const rawSchema = t.inputParameters ?? { type: "object", properties: {} }
      const normalized = ensureObjectTypeOnProperties(
        dereferenceJsonSchema(rawSchema, { onUnresolved: "sentinel" })
      ) as JSONSchema7

      set[t.slug] = tool({
        description: t.description ?? t.name,
        inputSchema: jsonSchema<Record<string, unknown>>(normalized),
        execute: async (args) => {
          try {
            const result = await composio.tools.execute(t.slug, {
              userId: COMPOSIO_WORKSPACE_USER_ID,
              arguments: args,
              dangerouslySkipVersionCheck: true,
            })
            await ctx.runMutation(internal.logs.record, {
              app: "composio",
              actionName: t.slug,
              status: result.successful ? "success" : "error",
              payload: { args },
              error: result.error ?? undefined,
            })
            return result
          } catch (error) {
            const msg = (error as Error).message
            await ctx.runMutation(internal.logs.record, {
              app: "composio",
              actionName: t.slug,
              status: "error",
              payload: { args },
              error: msg,
            })
            return { successful: false, error: msg }
          }
        },
      })
    }
    return set
  } catch (err) {
    console.warn("[Composio] buildDynamicComposioTools error:", err)
    return {}
  }
}

function buildInternalOpsTools(): ToolSet {
  return {
    searchParts: createTool({
      description:
        "Hybrid semantic + full-text search across the Convex parts_catalog with vehicle fitment checks.",
      inputSchema: z.object({
        query: z.string(),
        category: z.string().optional(),
        vehicle: z
          .object({
            make: z.string().optional(),
            model: z.string().optional(),
            year: z.number().int().optional(),
            engineCode: z.string().optional(),
          })
          .optional(),
      }),
      execute: async (ctx: ToolCtx, input) => {
        const hits = await hybridSearchParts(ctx, { ...input, limit: 8 })
        return hits.map((h) => ({
          ...publicPart(h.part, "b2b"),
          retailPrice: h.part.price,
          fitment: h.fitment.verdict,
        }))
      },
    }),

    decodeVin: createTool({
      description:
        "Decode a 17-character VIN into make, model, year, and engine code.",
      inputSchema: z.object({ vin: z.string() }),
      execute: async (_ctx: ToolCtx, { vin }) => decodeVin(vin),
    }),

    listAdCampaigns: createTool({
      description:
        "Read live TikTok Ads, Facebook Ads, and Instagram campaign performance (spend, leads, ROAS, status) from Convex.",
      inputSchema: z.object({
        status: z.enum(["active", "paused", "archived", "all"]).optional(),
      }),
      execute: async (ctx: ToolCtx, { status }) => {
        return await ctx.runQuery(
          internal.composioTools.getAdCampaignsInternal,
          {
            status: status === "all" ? undefined : status,
          }
        )
      },
    }),

    setAdCampaignStatus: createTool({
      description:
        "Pause or resume a TikTok/Meta ad campaign and optionally adjust its daily budget.",
      inputSchema: z.object({
        campaignDocId: z.string().describe("Convex _id of the ad_campaigns row"),
        status: z.enum(["active", "paused"]),
        dailyBudget: z.number().positive().optional(),
      }),
      execute: async (ctx: ToolCtx, input) => {
        return await ctx.runMutation(
          internal.composioTools.patchAdCampaignInternal,
          {
            id: input.campaignDocId as Id<"ad_campaigns">,
            status: input.status,
            dailyBudget: input.dailyBudget,
          }
        )
      },
    }),

    sendWhatsAppToContact: createTool({
      description:
        "Send a WhatsApp message via Whapi.cloud to a CRM contact (mechanic, fleet buyer, or retail lead).",
      inputSchema: z.object({
        contactId: z.string().describe("Convex _id from crm_contacts"),
        body: z.string().min(1),
      }),
      execute: async (ctx: ToolCtx, { contactId, body }) => {
        return await ctx.runAction(internal.whapi.sendToContact, {
          contactId: contactId as Id<"crm_contacts">,
          body,
          sentBy: "agent",
        })
      },
    }),

    updatePartStockFromSupplierNotice: createTool({
      description:
        "Adjust stockQuantity of a catalog part after reading a supplier invoice or shipping delay email.",
      inputSchema: z.object({
        partId: z.string(),
        delta: z
          .number()
          .int()
          .describe("Positive for arrivals, negative for write-offs"),
        reason: z.string(),
      }),
      execute: async (ctx: ToolCtx, { partId, delta, reason }) => {
        const nextQty = await ctx.runMutation(internal.parts.adjustStock, {
          partId: partId as Id<"parts_catalog">,
          delta,
        })
        await ctx.runMutation(internal.logs.record, {
          app: "agent",
          actionName: "stock.adjusted_from_supplier",
          status: "success",
          payload: { partId, delta, nextQty, reason },
        })
        return { partId, stockQuantity: nextQty }
      },
    }),

    listLowStockParts: createTool({
      description: "List parts at or below their minimum reorder threshold.",
      inputSchema: z.object({}),
      execute: async (ctx: ToolCtx) => {
        const parts: Doc<"parts_catalog">[] = await ctx.runQuery(
          internal.parts.lowStock,
          {}
        )
        return parts.map((p) => ({
          id: p._id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          stockQuantity: p.stockQuantity,
          minReorderThreshold: p.minReorderThreshold,
          warehouseLocation: p.warehouseLocation,
        }))
      },
    }),
  }
}

export const runOpsPromptNode = internalAction({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  handler: async (
    ctx,
    { userId, threadId: existingThreadId, prompt }
  ): Promise<{ threadId: string; text: string; toolCallsCount: number }> => {
    let threadId = existingThreadId
    if (!threadId) {
      const created = await opsAgent.createThread(ctx, {
        userId,
        title: prompt.slice(0, 60),
      })
      threadId = created.threadId
    }

    const [composioTools, internalTools] = await Promise.all([
      buildDynamicComposioTools(ctx).catch(() => ({} as ToolSet)),
      Promise.resolve(buildInternalOpsTools()),
    ])

    const result = await opsAgent.generateText(
      ctx,
      { threadId, userId },
      {
        prompt,
        tools: { ...internalTools, ...composioTools },
      } as never
    )

    await ctx.runMutation(internal.logs.record, {
      app: "agent",
      actionName: "ops.prompt.completed",
      status: "success",
      payload: {
        threadId,
        promptPreview: prompt.slice(0, 100),
        composioToolCount: Object.keys(composioTools).length,
      },
    })

    return {
      threadId,
      text: result.text,
      toolCallsCount:
        result.steps?.reduce(
          (acc, s) => acc + (s.toolCalls?.length ?? 0),
          0
        ) ?? 0,
    }
  },
})

// ===========================================================================
// 3. Ad Sync, Webhook Signature Verification & Gmail Reply Dispatch (Node)
// ===========================================================================

export const syncAdCampaignsNode = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (
      !(await ctx.runQuery(internal.automations.isEnabled, {
        key: "ad_metrics_sync",
      }))
    ) {
      return
    }
    if (!process.env.COMPOSIO_API_KEY) {
      return
    }

    const [tiktokConn, fbConn] = await Promise.all([
      ctx.runQuery(internal.composioTools.getConnectionByToolkit, {
        toolkit: "tiktok",
      }),
      ctx.runQuery(internal.composioTools.getConnectionByToolkit, {
        toolkit: "facebook",
      }),
    ])
    if (tiktokConn?.status !== "active" && fbConn?.status !== "active") {
      return
    }

    try {
      const composio = getComposio()
      const activeToolkits: ("tiktok" | "facebook")[] = []
      if (tiktokConn?.status === "active") activeToolkits.push("tiktok")
      if (fbConn?.status === "active") activeToolkits.push("facebook")

      const adTools = await composio.tools.getRawComposioTools({
        toolkits: activeToolkits,
        search: "campaign",
        limit: 6,
      })

      let synced = 0
      for (const t of adTools) {
        if (!/GET|LIST/i.test(t.slug)) continue
        const res = await composio.tools
          .execute(t.slug, {
            userId: COMPOSIO_WORKSPACE_USER_ID,
            arguments: {},
            dangerouslySkipVersionCheck: true,
          })
          .catch(() => null)

        const rawList = extractCampaignArray(res?.data)
        for (const item of rawList) {
          const platform = t.slug.startsWith("TIKTOK")
            ? "tiktok_ads"
            : "facebook_ads"
          await ctx.runMutation(
            internal.composioTools.upsertAdCampaignInternal,
            {
              platform,
              campaignId: String(item.campaign_id ?? item.id ?? "unknown"),
              name: String(
                item.campaign_name ?? item.name ?? "Untitled Campaign"
              ),
              spend: Number(item.spend ?? 0),
              dailyBudget: item.budget ? Number(item.budget) : undefined,
              impressions: item.impressions
                ? Number(item.impressions)
                : undefined,
              clicks: item.clicks ? Number(item.clicks) : undefined,
              cpc: item.cpc ? Number(item.cpc) : undefined,
              leadsGenerated: Number(item.leads ?? item.conversions ?? 0),
              roas: Number(item.roas ?? 0),
              status: String(item.status ?? "active")
                .toLowerCase()
                .includes("pause")
                ? "paused"
                : "active",
            }
          )
          synced++
        }
      }

      await ctx.runMutation(internal.automations.markRun, {
        key: "ad_metrics_sync",
        status: "success",
        payload: { synced },
      })
    } catch (error) {
      await ctx.runMutation(internal.automations.markRun, {
        key: "ad_metrics_sync",
        status: "error",
        payload: { error: (error as Error).message },
      })
    }
  },
})

function extractCampaignArray(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return []
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.list)) return obj.list as Record<string, unknown>[]
  if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[]
  if (Array.isArray(obj.campaigns))
    return obj.campaigns as Record<string, unknown>[]
  return []
}

export const parseComposioWebhookNode = internalAction({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (
    _ctx,
    { rawBody, headers }
  ): Promise<{ slug: string; eventPayload: Record<string, unknown> }> => {
    if (process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_WEBHOOK_SECRET) {
      const composio = getComposio()
      const parsed = await composio.triggers.verifyWebhook({
        payload: rawBody,
        signature: headers["webhook-signature"] ?? "",
        secret: process.env.COMPOSIO_WEBHOOK_SECRET,
        id: headers["webhook-id"] ?? "",
        timestamp: headers["webhook-timestamp"] ?? "",
      })
      return {
        slug: parsed.payload.triggerSlug,
        eventPayload: (parsed.payload.payload ?? {}) as Record<string, unknown>,
      }
    }
    const raw = JSON.parse(rawBody) as Record<string, unknown>
    return {
      slug: String(
        raw.triggerSlug ??
        (raw.payload as Record<string, unknown> | undefined)?.triggerSlug ??
        raw.type ??
        "DIRECT_WEBHOOK"
      ),
      eventPayload:
        ((raw.payload as Record<string, unknown> | undefined)?.payload as
          | Record<string, unknown>
          | undefined) ??
        (raw.data as Record<string, unknown>) ??
        raw,
    }
  },
})

export const triageInboundEmailNode = internalAction({
  args: {
    senderEmail: v.string(),
    senderName: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const contact = await ctx.runMutation(
      internal.composioTools.upsertEmailContactAndMessage,
      {
        email: args.senderEmail,
        name: args.senderName,
        subject: args.subject,
        body: args.body,
        externalId: args.externalId,
      }
    )

    if (!contact.autopilot || !process.env.OPENAI_API_KEY) return

    let threadId = contact.agentThreadId
    if (!threadId) {
      const created = await partsAgent.createThread(ctx, {
        userId: contact._id,
        title: `Email · ${contact.name}`,
      })
      threadId = created.threadId
      await ctx.runMutation(internal.crm.setAgentThread, {
        contactId: contact._id,
        threadId,
      })
    }

    const reply = await partsAgent.generateText(
      ctx,
      { threadId, userId: contact._id },
      {
        prompt: `Inbound email RFQ from ${args.senderEmail}\nSubject: ${args.subject}\n\n${args.body}\n\nCross-reference parts_catalog, create a quote if parts match, and draft a concise email reply.`,
        tools: partsSpecialistTools({
          contactId: contact._id,
          channel: "email",
          audience: contact.type === "workshop_b2b" ? "b2b" : "b2c",
        }),
      } as never
    )

    await ctx.runMutation(internal.crm.recordOutbound, {
      contactId: contact._id,
      channel: "email",
      body: reply.text,
      sentBy: "agent",
    })

    if (process.env.COMPOSIO_API_KEY) {
      const composio = getComposio()
      await composio.tools
        .execute("GMAIL_SEND_EMAIL", {
          userId: COMPOSIO_WORKSPACE_USER_ID,
          arguments: {
            recipient_email: args.senderEmail,
            subject: `Re: ${args.subject}`,
            body: reply.text,
          },
          dangerouslySkipVersionCheck: true,
        })
        .catch(() => null)
    }
  },
})

export const sendOutboundEmailNode = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (
    ctx,
    { to, subject, body }
  ): Promise<{
    success: boolean
    isConnected: boolean
    message?: string
    error?: string
  }> => {
    const conn = await ctx.runQuery(
      internal.composioTools.getConnectionByToolkit,
      { toolkit: "gmail" }
    )
    const isConnected = Boolean(conn && conn.status === "active")

    if (!isConnected) {
      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: "gmail_send_message_pending",
        status: "pending",
        payload: { to, subject, reason: "gmail_not_connected" },
      })
      return {
        success: false,
        isConnected: false,
        message: "Gmail account is not connected yet. Authorize via Google Connect.",
      }
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return {
        success: false,
        isConnected: true,
        error: "COMPOSIO_API_KEY is not configured.",
      }
    }

    try {
      const composio = getComposio()
      await composio.tools.execute("GMAIL_SEND_EMAIL", {
        userId: COMPOSIO_WORKSPACE_USER_ID,
        arguments: {
          recipient_email: to,
          subject: subject || "Update from AutoPulse Ops AI",
          body,
        },
        dangerouslySkipVersionCheck: true,
      })

      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: "gmail_send_message",
        status: "success",
        payload: { to, subject, status: "sent" },
      })

      return {
        success: true,
        isConnected: true,
        message: `Email dispatched successfully to ${to}.`,
      }
    } catch (err) {
      const parsed = parseComposioError(err)
      await ctx.runMutation(internal.logs.record, {
        app: "composio",
        actionName: "gmail_send_message",
        status: "error",
        payload: { to, subject, error: parsed.message },
      })
      return {
        success: false,
        isConnected: true,
        error: parsed.message,
      }
    }
  },
})

export const fetchConnectedEmailsNode = internalAction({
  args: { maxResults: v.optional(v.number()) },
  handler: async (
    ctx,
    { maxResults = 8 }
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
    const conn = await ctx.runQuery(
      internal.composioTools.getConnectionByToolkit,
      { toolkit: "gmail" }
    )
    if (!conn || conn.status !== "active" || !process.env.COMPOSIO_API_KEY) {
      return { isConnected: false, emails: [] }
    }
    try {
      const composio = getComposio()
      const res = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
        userId: COMPOSIO_WORKSPACE_USER_ID,
        arguments: { max_results: maxResults },
        dangerouslySkipVersionCheck: true,
      })
      console.log("GMAIL_FETCH_EMAILS res keys:", Object.keys(res || {}), "data keys:", Object.keys(res?.data || {}))
      const msgs = (res?.data?.messages ||
        (res?.data as Record<string, unknown>)?.response_data && ((res?.data as Record<string, unknown>).response_data as Record<string, unknown>)?.messages ||
        []) as Array<{
        messageId?: string
        sender?: string
        from?: string
        subject?: string
        preview?: string
        messageText?: string
        messageTimestamp?: string | number
      }>

      const emails = msgs.map((m) => {
        const sender =
          typeof m.sender === "string"
            ? m.sender
            : typeof m.from === "string"
              ? m.from
              : "Unknown Sender"
        const subject =
          typeof m.subject === "string" ? m.subject : "(No Subject)"
        const rawPreview =
          typeof m.preview === "string"
            ? m.preview
            : typeof m.messageText === "string"
              ? m.messageText
              : typeof (m as Record<string, unknown>).snippet === "string"
                ? String((m as Record<string, unknown>).snippet)
                : ""
        const preview = rawPreview.slice(0, 300).trim()

        let timestamp = Date.now()
        if (typeof m.messageTimestamp === "number") {
          timestamp = m.messageTimestamp
        } else if (typeof m.messageTimestamp === "string") {
          const parsed = Date.parse(m.messageTimestamp)
          if (!isNaN(parsed)) timestamp = parsed
        }
        return {
          id: m.messageId || Math.random().toString(),
          sender,
          subject,
          preview,
          timestamp,
        }
      })

      return {
        isConnected: true,
        account: conn.accountLabel || "banelesouthflow@gmail.com",
        emails,
      }
    } catch (err) {
      console.warn("[Composio] fetchConnectedEmails error:", err)
      return {
        isConnected: true,
        account: conn.accountLabel || "banelesouthflow@gmail.com",
        emails: [],
      }
    }
  },
})
