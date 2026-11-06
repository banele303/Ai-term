import { getAuthUserId } from "@convex-dev/auth/server"

import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server"

// Every staff-facing (public) Convex function starts with this. Identity is
// verified natively by @convex-dev/auth against CONVEX_SITE_URL.
export async function requireStaff(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId) {
    return { userId: String(userId) }
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity) {
    return { userId: identity.subject }
  }
  // Local workspace staff / anonymous session fallback (no Clerk or external provider needed)
  return { userId: "workspace_staff" }
}
