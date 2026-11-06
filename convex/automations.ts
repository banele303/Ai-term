import { generateText } from "ai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { chatModel } from "./lib/ai"
import { requireStaff } from "./lib/auth"
import { writeLog } from "./logs"
import { logStatus } from "./schema"

// The 1-click automation library. `key` is referenced by crons.ts; a cron
// does nothing while its automation is disabled.
export const AUTOMATION_LIBRARY = [
  {
    key: "workshop_reengagement",
    name: "Workshop Re-engagement",
    description:
      "Daily 09:00: WhatsApp check-in to workshops with no service-kit order (filters, pads, oil) in 14+ days.",
    schedule: "Daily 09:00",
    defaultEnabled: true,
  },
  {
    key: "unanswered_rfq_sweep",
    name: "8:00 AM Unanswered RFQ Sweep",
    description: "Finds RFQs with no quote after 2 hours and nudges the agent or staff to respond.",
    schedule: "Daily 08:00",
    defaultEnabled: true,
  },
  {
    key: "dead_stock_tiktok_ads",
    name: "Friday Dead-Stock TikTok Ad Generator",
    description: "Drafts TikTok promo campaigns for parts with no sales in 90 days.",
    schedule: "Fridays 10:00",
    defaultEnabled: false,
  },
  {
    key: "low_stock_po_drafter",
    name: "Low-Stock Supplier PO Drafter",
    description: "Drafts purchase-order emails to suppliers for parts at or below reorder threshold.",
    schedule: "Weekdays 07:00",
    defaultEnabled: false,
  },
  {
    key: "ad_metrics_sync",
    name: "Ad Metrics Sync",
    description: "Pulls TikTok and Meta campaign spend, leads and ROAS into the dashboard.",
    schedule: "Hourly",
    defaultEnabled: true,
  },
] as const

export type AutomationKey = (typeof AUTOMATION_LIBRARY)[number]["key"]

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)
    const rows = await ctx.db.query("automations").collect()
    const byKey = new Map(rows.map((r) => [r.key, r]))
    return AUTOMATION_LIBRARY.map((a) => {
      const row = byKey.get(a.key)
      return {
        key: a.key,
        name: a.name,
        description: a.description,
        schedule: a.schedule,
        enabled: row?.enabled ?? a.defaultEnabled,
        lastRunAt: row?.lastRunAt,
        lastRunStatus: row?.lastRunStatus,
      }
    })
  },
})

export const toggle = mutation({
  args: { key: v.string(), enabled: v.boolean() },
  handler: async (ctx, { key, enabled }) => {
    const { userId } = await requireStaff(ctx)
    const def = AUTOMATION_LIBRARY.find((a) => a.key === key)
    if (!def) throw new Error(`Unknown automation ${key}`)
    const row = await ctx.db
      .query("automations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    if (row) await ctx.db.patch(row._id, { enabled })
    else
      await ctx.db.insert("automations", {
        key,
        name: def.name,
        description: def.description,
        schedule: def.schedule,
        enabled,
      })
    await writeLog(ctx, {
      app: "system",
      actionName: "automation.toggled",
      status: "success",
      payload: { key, enabled, by: userId },
    })
  },
})

export const isEnabled = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("automations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    if (row) return row.enabled
    return AUTOMATION_LIBRARY.find((a) => a.key === key)?.defaultEnabled ?? false
  },
})

export const markRun = internalMutation({
  args: { key: v.string(), status: logStatus, payload: v.optional(v.any()) },
  handler: async (ctx, { key, status, payload }) => {
    const def = AUTOMATION_LIBRARY.find((a) => a.key === key)
    if (!def) return
    const row = await ctx.db
      .query("automations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    const patch = { lastRunAt: Date.now(), lastRunStatus: status }
    if (row) await ctx.db.patch(row._id, patch)
    else
      await ctx.db.insert("automations", {
        key,
        name: def.name,
        description: def.description,
        schedule: def.schedule,
        enabled: def.defaultEnabled,
        ...patch,
      })

    const hasMeaningfulWork =
      status === "success" &&
      (!payload ||
        typeof payload !== "object" ||
        ("sent" in payload ? Number(payload.sent) > 0 : true) &&
          ("synced" in payload ? Number(payload.synced) > 0 : true))

    if (hasMeaningfulWork) {
      await writeLog(ctx, { app: "cron", actionName: key, status, payload })
    }
  },
})

// ---------------------------------------------------------------------------
// Workshop re-engagement (Module B)
// ---------------------------------------------------------------------------

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000
const MAX_PER_RUN = 40

export const recentVehiclesForContact = internalQuery({
  args: { contactId: v.id("crm_contacts") },
  handler: async (ctx, { contactId }) => {
    const deals = await ctx.db
      .query("deals_and_quotes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .order("desc")
      .take(10)
    const vehicles = deals
      .map((d) => d.vehicle)
      .filter((x): x is NonNullable<typeof x> => !!x?.make)
      .map((x) => [x.make, x.model, x.year].filter(Boolean).join(" "))
    return [...new Set(vehicles)].slice(0, 3)
  },
})

export const reengageWorkshops = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!(await ctx.runQuery(internal.automations.isEnabled, { key: "workshop_reengagement" }))) {
      return
    }
    if (!process.env.WHAPI_API_TOKEN) {
      return
    }
    const cutoff = Date.now() - FOURTEEN_DAYS
    const workshops = await ctx.runQuery(internal.crm.dormantWorkshops, {
      cutoff,
      limit: MAX_PER_RUN,
    })

    let sent = 0
    let failed = 0
    for (const shop of workshops) {
      try {
        const vehicles = await ctx.runQuery(internal.automations.recentVehiclesForContact, {
          contactId: shop._id,
        })
        const daysSince = shop.lastServiceKitOrderAt
          ? Math.floor((Date.now() - shop.lastServiceKitOrderAt) / 86_400_000)
          : null

        let messageText: string
        if (process.env.OPENAI_API_KEY) {
          const { text } = await generateText({
            model: chatModel(),
            instructions:
              "Write a short, friendly WhatsApp check-in (max 3 sentences, no markdown, no emojis beyond one) from an auto-parts supplier to a workshop customer. Offer to restock service items: oil & air filters, brake pads, engine oil. Invite them to reply with a VIN or reg for a same-day quote. Do not invent prices or promotions.",
            prompt: JSON.stringify({
              contactName: shop.name,
              workshop: shop.companyName,
              daysSinceLastServiceOrder: daysSince,
              vehiclesTheyRecentlyServiced: vehicles,
            }),
          })
          messageText = text.trim()
        } else {
          const greeting = shop.name ? `Hi ${shop.name}` : "Hi team"
          messageText = `${greeting}, checking in from AutoPulse Parts. Let us know if you need oil & air filters, brake pads, or service kits restocked this week — reply with a VIN for a same-day trade quote.`
        }

        await ctx.runAction(internal.whapi.sendToContact, {
          contactId: shop._id,
          body: messageText,
        })
        await ctx.runMutation(internal.crm.markReengaged, { contactId: shop._id })
        sent++
      } catch {
        failed++
      }
    }

    await ctx.runMutation(internal.automations.markRun, {
      key: "workshop_reengagement",
      status: failed && !sent ? "error" : "success",
      payload: { candidates: workshops.length, sent, failed },
    })
  },
})
