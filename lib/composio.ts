import {
  Composio,
  dereferenceJsonSchema,
  ensureObjectTypeOnProperties,
  type Tool as ComposioTool,
} from "@composio/core"
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai"

// Shared Composio entity ID representing the AutoPulse workspace
export const COMPOSIO_WORKSPACE_USER_ID = "autopulse_workspace"

// Canonical Composio Connect MCP endpoint for local CLI / agent sessions
export const COMPOSIO_CONNECT_MCP_URL = "https://connect.composio.dev/mcp"

export const AUTOPULSE_TOOLKITS = [
  {
    slug: "gmail",
    label: "Gmail",
    category: "Email & RFQ Triage",
    description:
      "Auto-triage inbound fleet RFQ emails, parse CSV/PDF parts lists, send quotes, and process supplier shipping notices.",
  },
  {
    slug: "outlook",
    label: "Outlook",
    category: "Email & RFQ Triage",
    description:
      "Corporate inbox sync for B2B workshop purchase orders, supplier invoices, and automated quote dispatch.",
  },
  {
    slug: "facebook",
    label: "Facebook Pages & Lead Ads",
    category: "Social & Lead Capture",
    description:
      "Reply to Page DMs/comments checking live stock, publish high-margin arrivals, and ingest Meta Lead Ads.",
  },
  {
    slug: "instagram",
    label: "Instagram Business",
    category: "Social & Lead Capture",
    description:
      "Respond to mechanic & enthusiast DMs asking for fitment and auto-publish new car part bundles.",
  },
  {
    slug: "tiktok",
    label: "TikTok Ads & Lead Gen",
    category: "Paid Acquisition",
    description:
      "Sync live ad spend, CPC & ROAS, pause zero-lead ad sets, and trigger instant WhatsApp follow-ups on new leads.",
  },
] as const

export type AutopulseToolkitSlug = (typeof AUTOPULSE_TOOLKITS)[number]["slug"]

export function getComposioClient(apiKey = process.env.COMPOSIO_API_KEY) {
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not configured")
  }
  return new Composio({
    apiKey,
    allowTracking: false,
  })
}

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY)
}

/**
 * Initiates a Composio OAuth / Connect Link for the workspace so staff can
 * click "Connect" on `/autopulse/integrations` and authorize Gmail, Facebook,
 * Instagram, Outlook, or TikTok Ads in one click.
 */
export async function authorizeWorkspaceToolkit(
  toolkitSlug: AutopulseToolkitSlug,
  callbackUrl?: string
) {
  const composio = getComposioClient()

  // Find or auto-create a managed auth config via `toolkits.authorize`, or link
  // directly with a callback URL when an auth config already exists.
  const configs = await composio.authConfigs.list({
    toolkitSlug,
  } as never)

  const existingAuthConfigId = configs.items?.[0]?.id
  if (existingAuthConfigId && callbackUrl) {
    const req = await composio.connectedAccounts.link(
      COMPOSIO_WORKSPACE_USER_ID,
      existingAuthConfigId,
      { callbackUrl }
    )
    return {
      connectionId: req.id,
      redirectUrl: req.redirectUrl ?? null,
      status: req.status,
    }
  }

  const req = await composio.toolkits.authorize(
    COMPOSIO_WORKSPACE_USER_ID,
    toolkitSlug
  )
  return {
    connectionId: req.id,
    redirectUrl: req.redirectUrl ?? null,
    status: req.status,
  }
}

/**
 * Creates an MCP-enabled Composio session for the AutoPulse workspace, returning
 * both the hosted Connect MCP URL and the per-session streamable HTTP MCP endpoint.
 */
export async function createWorkspaceMcpSession(toolkits?: AutopulseToolkitSlug[]) {
  const composio = getComposioClient()
  const session = await composio.sessions.create(COMPOSIO_WORKSPACE_USER_ID, {
    toolkits: toolkits ?? AUTOPULSE_TOOLKITS.map((t) => t.slug),
    manageConnections: true,
    mcp: true,
  })
  return {
    sessionId: session.sessionId,
    mcpUrl: session.mcp.url,
    mcpHeaders: session.mcp.headers,
    connectMcpUrl: COMPOSIO_CONNECT_MCP_URL,
  }
}

/**
 * Fetches live Composio tools for connected toolkits and wraps them as native
 * Vercel AI SDK v7 `ToolSet` entries (`jsonSchema` + `composio.tools.execute`),
 * logging every invocation via an optional `onExecute` hook.
 */
export async function loadComposioAiTools(options: {
  toolkits?: AutopulseToolkitSlug[]
  search?: string
  limit?: number
  onExecute?: (event: {
    slug: string
    args: Record<string, unknown>
    ok: boolean
    result?: unknown
    error?: string
  }) => Promise<void>
}): Promise<ToolSet> {
  if (!isComposioConfigured()) return {}
  const composio = getComposioClient()

  const accounts = await composio.connectedAccounts.list({
    userIds: [COMPOSIO_WORKSPACE_USER_ID],
  })
  const activeToolkits = new Set(
    accounts.items
      .filter((a) => a.status === "ACTIVE")
      .map((a) => a.toolkit.slug.toLowerCase())
  )

  const requested = (options.toolkits ?? AUTOPULSE_TOOLKITS.map((t) => t.slug)).filter(
    (slug) => activeToolkits.has(slug)
  )
  if (requested.length === 0) return {}

  const rawTools: ComposioTool[] = await composio.tools.getRawComposioTools({
    toolkits: requested,
    ...(options.search ? { search: options.search } : {}),
    limit: options.limit ?? 25,
  })

  const toolSet: ToolSet = {}
  for (const t of rawTools) {
    const rawParams = t.inputParameters ?? {
      type: "object",
      properties: {},
    }
    const normalized = ensureObjectTypeOnProperties(
      dereferenceJsonSchema(rawParams, { onUnresolved: "sentinel" })
    ) as JSONSchema7

    toolSet[t.slug] = tool({
      description: t.description ?? t.name,
      inputSchema: jsonSchema<Record<string, unknown>>(normalized),
      execute: async (args) => {
        try {
          const res = await composio.tools.execute(t.slug, {
            userId: COMPOSIO_WORKSPACE_USER_ID,
            arguments: args,
            dangerouslySkipVersionCheck: true,
          })
          await options.onExecute?.({
            slug: t.slug,
            args,
            ok: Boolean(res.successful),
            result: res,
            error: res.error ?? undefined,
          })
          return res
        } catch (err) {
          const message = (err as Error).message
          await options.onExecute?.({
            slug: t.slug,
            args,
            ok: false,
            error: message,
          })
          return { successful: false, error: message }
        }
      },
    })
  }

  return toolSet
}
