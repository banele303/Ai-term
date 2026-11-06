import { createClerkClient } from "@clerk/backend"
import { and, eq, gte, sql } from "drizzle-orm"

import { db } from "@/db"
import { usageEntries, type NewUsageEntry, type UsageKind } from "@/db/schema"

function getClerk() {
  if (!process.env.CLERK_SECRET_KEY) return null
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
}

// What one billing period includes
export const usageLimits: Record<UsageKind, number> = {
  // $10 of model spend, in millionths of a dollar
  ai: 10_000_000,
  // 50 hours of running sandboxes, in seconds
  sandbox: 50 * 60 * 60,
}

// The billing period the user's plan is in, or null without one
async function getBillingPeriod(userId: string) {
  const clerk = getClerk()
  if (!clerk) return null
  try {
    const subscription = await clerk.billing.getUserBillingSubscription(userId)
    const item = subscription.subscriptionItems.find(
      (item) => item.status === "active" && item.periodEnd
    )
    if (!item?.periodEnd) return null
    return { start: new Date(item.periodStart), end: new Date(item.periodEnd) }
  } catch {
    return null
  }
}

// What the user has used and has left in their current billing period
export async function getUsage(userId: string) {
  if (!process.env.CLERK_SECRET_KEY) {
    // Convex mode: full unlimited usage, no Clerk required
    return {
      period: {
        start: new Date(Date.now() - 30 * 86400000),
        end: new Date(Date.now() + 365 * 86400000),
      },
      used: { ai: 0, sandbox: 0 },
      remaining: {
        ai: usageLimits.ai,
        sandbox: usageLimits.sandbox,
      },
    }
  }

  const period = await getBillingPeriod(userId)
  if (!period) return null

  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    return {
      period,
      used: { ai: 0, sandbox: 0 },
      remaining: {
        ai: usageLimits.ai,
        sandbox: usageLimits.sandbox,
      },
    }
  }

  try {
    const rows = await db
      .select({
        kind: usageEntries.kind,
        amount: sql`sum(${usageEntries.amount})`.mapWith(Number),
      })
      .from(usageEntries)
      .where(
        and(
          eq(usageEntries.userId, userId),
          gte(usageEntries.createdAt, period.start)
        )
      )
      .groupBy(usageEntries.kind)

    const used: Record<UsageKind, number> = { ai: 0, sandbox: 0 }
    for (const row of rows) used[row.kind] = row.amount

    return {
      period,
      used,
      remaining: {
        ai: Math.max(0, usageLimits.ai - used.ai),
        sandbox: Math.max(0, usageLimits.sandbox - used.sandbox),
      },
    }
  } catch {
    return {
      period,
      used: { ai: 0, sandbox: 0 },
      remaining: {
        ai: usageLimits.ai,
        sandbox: usageLimits.sandbox,
      },
    }
  }
}

export type Usage = NonNullable<Awaited<ReturnType<typeof getUsage>>>

// Adds to the ledger. In Convex mode without Postgres, no-ops safely.
export async function recordUsage(entries: NewUsageEntry[]) {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    return // Running in Convex mode
  }
  if (entries.length === 0) return

  try {
    await db
      .insert(usageEntries)
      .values(entries)
      .onConflictDoNothing({ target: usageEntries.idempotencyKey })
  } catch (err) {
    console.warn("Usage recording skipped in Convex mode:", err)
  }
}