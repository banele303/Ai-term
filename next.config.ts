import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
}

const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN
)

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Uploads source maps on production builds; without it the build still succeeds.
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Railway builds have no .git to detect the commit from; locally this is unset and git HEAD is used.
      release: { name: process.env.RAILWAY_GIT_COMMIT_SHA },

      widenClientFileUpload: true,

      // Proxies browser events through the app so ad-blockers don't drop them.
      tunnelRoute: "/monitoring",

      silent: !process.env.CI,
    })
  : nextConfig
