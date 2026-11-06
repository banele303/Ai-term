import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { internalMutation, type MutationCtx } from "./_generated/server"
import { automationApp, logStatus } from "./schema"

export type LogEntry = {
  app: typeof automationApp.type
  actionName: string
  status: typeof logStatus.type
  payload?: unknown
  error?: string
  contactId?: Id<"crm_contacts">
  dealId?: Id<"deals_and_quotes">
}

// Use inside mutations
export async function writeLog(ctx: MutationCtx, entry: LogEntry) {
  return await ctx.db.insert("automation_logs", { ...entry, timestamp: Date.now() })
}

// Use from actions: ctx.runMutation(internal.logs.record, {...})
export const record = internalMutation({
  args: {
    app: automationApp,
    actionName: v.string(),
    status: logStatus,
    payload: v.optional(v.any()),
    error: v.optional(v.string()),
    contactId: v.optional(v.id("crm_contacts")),
    dealId: v.optional(v.id("deals_and_quotes")),
  },
  handler: async (ctx, args) => writeLog(ctx, args),
})
