import { NextResponse } from "next/server"

function convexSiteUrl(): string | null {
  if (process.env.NEXT_PUBLIC_CONVEX_SITE_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_SITE_URL.replace(/\/$/, "")
  }
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_URL.replace(/\.convex\.cloud\/?$/, ".convex.site")
  }
  return null
}

/**
 * Next.js webhook relay -> Convex HTTP Action (`/webhooks/composio`).
 * Preserves `webhook-id`, `webhook-timestamp`, `webhook-signature`, and
 * `x-composio-webhook-version` headers so Composio V3 signature verification succeeds.
 */
export async function POST(request: Request) {
  const siteUrl = convexSiteUrl()
  if (!siteUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "NEXT_PUBLIC_CONVEX_SITE_URL is not configured",
      },
      { status: 503 }
    )
  }

  const forwardHeaders = new Headers({ "Content-Type": "application/json" })
  for (const headerName of [
    "webhook-id",
    "webhook-timestamp",
    "webhook-signature",
    "x-composio-webhook-version",
  ]) {
    const val = request.headers.get(headerName)
    if (val) forwardHeaders.set(headerName, val)
  }

  const rawBody = await request.text()
  const upstream = await fetch(`${siteUrl}/webhooks/composio`, {
    method: "POST",
    headers: forwardHeaders,
    body: rawBody,
  })

  const body = await upstream.text()
  return new Response(body || null, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function GET() {
  return NextResponse.json({
    service: "AutoPulse Composio Trigger Webhook",
    status: "ready",
    convexTargetConfigured: Boolean(convexSiteUrl()),
  })
}
