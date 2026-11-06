import type { AuthConfig } from "convex/server"

// Native Convex Auth (@convex-dev/auth) — tokens are issued and verified
// directly by this Convex deployment's HTTP Actions site URL.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
