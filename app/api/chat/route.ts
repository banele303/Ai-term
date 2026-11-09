import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEFAULT_API_KEY = "sk-5d855e080e0b4a8c870a4f9620d579b6"

export async function POST(req: NextRequest) {
  try {
    const { messages, model = "deepseek-chat", temperature = 0.7 } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required." },
        { status: 400 }
      )
    }

    const apiKey = process.env.DEEPSEEK_API_KEY || DEFAULT_API_KEY

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model === "gpt-4o" || model === "gpt-4o-mini" ? "deepseek-chat" : model,
        messages,
        temperature,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[DeepSeek API Error]", response.status, errorText)
      return NextResponse.json(
        { error: `DeepSeek API returned error ${response.status}: ${errorText}` },
        { status: response.status }
      )
    }

    // Proxy the event stream directly to client
    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    return new Response(response.body, { headers })
  } catch (error: any) {
    console.error("[Chat Route Exception]", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error communicating with DeepSeek" },
      { status: 500 }
    )
  }
}
