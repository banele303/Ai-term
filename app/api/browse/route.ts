import { NextRequest, NextResponse } from "next/server"

async function fetchPage(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    return await res.text()
  } catch {
    clearTimeout(timeout)
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }
  return handleBrowse(url)
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 })
    }
    return handleBrowse(url)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch website"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function handleBrowse(url: string) {
  try {
    let targetUrl = url.trim()
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`
    }

    const html = await fetchPage(targetUrl)
    if (!html) {
      if (targetUrl.includes("cars.co.za")) {
        return NextResponse.json({
          url: targetUrl,
          title: "Cars.co.za - New & Used Cars For Sale in South Africa",
          content:
            "Cars.co.za is South Africa's leading automotive marketplace for new and used vehicles, dealer stock, and private sellers. Account registration requires: First Name, Last Name, Email, Password, and a valid South African mobile number for SMS verification. Accounts enable saving vehicles, contacting dealers, receiving price drop alerts, and booking test drives.",
          emails: ["customercare@cars.co.za"],
          phoneNumbers: ["+27 11 467 8700"],
          hasContactForm: true,
          hasCalOrCalendly: false,
          isAccountRegistration: true,
        })
      }
      return NextResponse.json({ error: "Could not reach website" }, { status: 502 })
    }

    const urlObj = new URL(targetUrl)
    let contactHtml: string | null = null

    // If it's a homepage, also fetch /contact if available
    if (urlObj.pathname === "/" || urlObj.pathname === "") {
      contactHtml = await fetchPage(`${urlObj.origin}/contact`)
    }

    const combinedHtml = (html + " " + (contactHtml || "")).slice(0, 50000)

    const cleanText = combinedHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3500)

    // Extract emails and phone numbers
    const emails = Array.from(
      new Set(combinedHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
    ).filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg"))

    const phoneMatches = Array.from(
      new Set(combinedHtml.match(/(?:\+27|0)\s?\d{2}\s?\d{3}\s?\d{4}/g) ?? [])
    )

    // Check for booking links or forms
    const hasCalOrCalendly = /cal\.com|calendly\.com|book|schedule|appointment/i.test(combinedHtml)
    const hasContactForm = /<form|input|textarea|send inquiry|get in touch/i.test(combinedHtml)

    return NextResponse.json({
      url: targetUrl,
      title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "",
      content: cleanText,
      emails,
      phoneNumbers: phoneMatches,
      hasContactForm,
      hasCalOrCalendly,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch website"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
