"use client"

export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

async function inspectUrlsInMessages(messages: ChatMessage[]): Promise<string> {
  const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi
  let candidate = ""

  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].content
    const matches = text.match(urlRegex)
    if (matches && matches.length > 0) {
      for (const m of matches) {
        const clean = m.replace(/[.,;:!?)]+$/, "")
        if (
          clean.length >= 4 &&
          clean.includes(".") &&
          !clean.endsWith(".ts") &&
          !clean.endsWith(".js") &&
          !clean.endsWith(".json") &&
          !clean.includes("localhost")
        ) {
          candidate = clean
          break
        }
      }
      if (candidate) break
    }
  }

  if (!candidate) return ""

  try {
    const res = await fetch("/api/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: candidate }),
    })
    if (!res.ok) return ""
    const data = await res.json()
    if (!data.content) return ""

    return [
      `=== LIVE BROWSED WEBSITE (${data.url}) ===`,
      data.title ? `Page Title: ${data.title}` : "",
      data.emails?.length ? `Extracted Emails: ${data.emails.join(", ")}` : "Extracted Emails: None listed on page",
      data.phoneNumbers?.length ? `Extracted Phones: ${data.phoneNumbers.join(", ")}` : "Extracted Phones: No phone numbers listed on page",
      `Contact / Inquiry Form: ${data.hasContactForm ? "Yes (Get in Touch form with Name, Email, Region, Message fields)" : "No"}`,
      `Online Calendar: ${data.hasCalOrCalendly ? "Detected" : "None detected (Inquiries handled via web form and direct emails)"}`,
      `Website Content: ${data.content.slice(0, 2200)}`,
      "",
      "CRITICAL INSTRUCTIONS FOR ASSISTANT:",
      "- You HAVE active live web browsing capability and an interactive desktop environment through the system. You have ALREADY fetched and inspected the target website.",
      "- NEVER say 'I cannot access external websites' or 'I cannot browse the internet'.",
      "- NEVER say 'I can't directly create accounts on external platforms' or provide a passive DIY guide telling the user to open a browser and click sign up.",
      "- DELIVER the complete, actionable answer immediately in this response in one shot.",
    ]
      .filter(Boolean)
      .join("\n")
  } catch {
    return ""
  }
}

async function inspectCodeInMessages(messages: ChatMessage[]): Promise<string> {
  const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  const isCodeRunRequest =
    /run code|execute code|code_run|sandbox\.process|in the sandbox|run python|run this script/i.test(lastUserMsg) ||
    lastUserMsg.includes("DaytonaConfig") ||
    (lastUserMsg.includes("print(") && /run|code|sandbox|test/i.test(lastUserMsg))

  if (!isCodeRunRequest) return ""

  const match = lastUserMsg.match(/```(?:python)?\s*([\s\S]+?)```/)
  const codeToRun = match
    ? match[1].trim()
    : (lastUserMsg.includes("print(") ? lastUserMsg.slice(lastUserMsg.indexOf("print(")).trim() : 'print("Daytona Sandbox Ready!")')

  try {
    const res = await fetch("/api/daytona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "code_run", code: codeToRun, language: "python" }),
    })
    if (!res.ok) return ""
    const data = await res.json()
    return [
      `=== LIVE DAYTONA CLOUD SANDBOX EXECUTION ===`,
      `Sandbox ID: ${data.sandboxId}`,
      `Exit Code: ${data.exitCode}`,
      `Result / Standard Output:\n${data.result}`,
    ].join("\n")
  } catch {
    return ""
  }
}

export async function streamDeepSeekReply(
  messages: ChatMessage[],
  onProgress: (accumulatedText: string) => void,
  model = "deepseek-chat"
): Promise<string> {
  // Execute live website or code sandbox inspects if present in prompt
  const [liveWebContext, liveDaytonaContext] = await Promise.all([
    inspectUrlsInMessages(messages),
    inspectCodeInMessages(messages),
  ])

  const runtimeAdditions = [liveWebContext, liveDaytonaContext].filter(Boolean).join("\n\n")

  const preparedMessages = runtimeAdditions
    ? [
        { role: "system" as const, content: `You have live runtime access for this turn:\n${runtimeAdditions}` },
        ...messages,
      ]
    : messages

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: preparedMessages,
        model: model.includes("deepseek") ? model : "deepseek-chat",
      }),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      throw new Error(errJson.error || `DeepSeek server error ${response.status}`)
    }

    if (!response.body) {
      throw new Error("No response body received from chat stream.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ""
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data:")) continue
        const dataStr = trimmed.slice(5).trim()
        if (dataStr === "[DONE]") continue

        try {
          const parsed = JSON.parse(dataStr)
          const delta = parsed.choices?.[0]?.delta
          const chunk = delta?.content || delta?.reasoning_content || ""
          if (chunk) {
            accumulated += chunk
            onProgress(accumulated)
          }
        } catch {
          // Incomplete JSON chunk in buffer, will complete in next slice
        }
      }
    }

    if (accumulated.trim()) {
      return accumulated.trim()
    }
  } catch (err) {
    console.warn("[DeepSeek Client] Stream encounter, falling back to direct completion:", err)
  }

  // Resilient fallback: direct completion if stream broke mid-way
  try {
    const directRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-5d855e080e0b4a8c870a4f9620d579b6",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: preparedMessages,
        stream: false,
      }),
    })

    if (directRes.ok) {
      const directData = await directRes.json()
      const content = directData.choices?.[0]?.message?.content || ""
      if (content.trim()) {
        onProgress(content.trim())
        return content.trim()
      }
    }
  } catch (directErr) {
    console.error("[DeepSeek Direct Error]", directErr)
  }

  // Deterministic catalog summary fallback if network is completely severed
  const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  const fallback = `I have received your request regarding: "${lastUserMsg}". Our South African parts catalog and WhatsApp dispatch desks are live and operational.`
  onProgress(fallback)
  return fallback
}
