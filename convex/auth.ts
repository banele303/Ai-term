import { Anonymous } from "@convex-dev/auth/providers/Anonymous"
import { Password } from "@convex-dev/auth/providers/Password"
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server"

import { query } from "./_generated/server"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return {
          email: String(params.email ?? "").trim().toLowerCase(),
          ...(params.name ? { name: String(params.name).trim() } : {}),
        }
      },
    }),
    Anonymous,
  ],
})

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    return await ctx.db.get(userId)
  },
})
