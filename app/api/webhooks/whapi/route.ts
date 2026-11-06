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
 * Next.js webhook relay -> Convex HTTP Action (`/webhooks/whapi`).
 * Supports configuring Whapi.cloud either directly against
 * `https://<deployment>.convex.site/webhooks/whapi?secret=...` or against
 * `https://<app-domain>/api/webhooks/whapi?secret=...`.
 */
export async function POST(request: Request) {
  const siteUrl = convexSiteUrl()
  if (!siteUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NEXT_PUBLIC_CONVEX_SITE_URL (or NEXT_PUBLIC_CONVEX_URL) is not configured",
      },
      { status: 503 }
    )
  }

  const incomingUrl = new URL(request.url)
  const secret =
    incomingUrl.searchParams.get("secret") ??
    process.env.WHAPI_WEBHOOK_SECRET ??
    ""

  const target = new URL(`${siteUrl}/webhooks/whapi`)
  if (secret) target.searchParams.set("secret", secret)

  const rawBody = await request.text()
  const upstream = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  })

  const responseText = await upstream.text()
  return new Response(responseText || null, {
    status: upstream.status,
  })
}

export async function GET() {
  return NextResponse.json({
    service: "AutoPulse Whapi.cloud Webhook Endpoint",
    status: "ready",
    convexTargetConfigured: Boolean(convexSiteUrl()),
  })
}
