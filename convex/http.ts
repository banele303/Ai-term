import { httpRouter } from "convex/server"

import { auth } from "./auth"
import { leadWebhook } from "./composioTools"
import { webhook as whapiWebhook } from "./whapi"

const http = httpRouter()

// Native Convex Auth OpenID / JWKS endpoints (/.well-known/openid-configuration, /.well-known/jwks.json)
auth.addHttpRoutes(http)

// Whapi.cloud channel webhook. Configure in the Whapi dashboard as:
//   {CONVEX_SITE_URL}/webhooks/whapi?secret={WHAPI_WEBHOOK_SECRET}
// with the "messages / post" event enabled and media auto-download on.
http.route({ path: "/webhooks/whapi", method: "POST", handler: whapiWebhook })

// Composio trigger webhook (TikTok / Meta lead forms, new Gmail messages, ...)
http.route({ path: "/webhooks/composio", method: "POST", handler: leadWebhook })

export default http
