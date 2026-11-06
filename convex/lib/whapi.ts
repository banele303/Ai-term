// Thin, typed client for the Whapi.cloud gateway. Uses fetch only, so it runs
// in the default Convex runtime (no "use node" needed).

const WHAPI_BASE_URL = process.env.WHAPI_API_URL ?? "https://gate.whapi.cloud"

function token() {
  const value = process.env.WHAPI_API_TOKEN
  if (!value) throw new Error("WHAPI_API_TOKEN is not set on the Convex deployment")
  return value
}

export class WhapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message)
  }
}

async function whapiFetch<T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${WHAPI_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })

  const text = await res.text()
  const data: unknown = text ? safeJson(text) : null
  if (!res.ok) {
    throw new WhapiError(`Whapi ${path} failed with ${res.status}`, res.status, data)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// --- Chat id helpers --------------------------------------------------------

// "27821234567@s.whatsapp.net" -> "27821234567"
export function phoneFromChatId(chatId: string) {
  return chatId.split("@")[0].replace(/\D/g, "")
}

export function isGroupChat(chatId: string) {
  return chatId.endsWith("@g.us")
}

// --- Outbound ---------------------------------------------------------------

export type WhapiSentMessage = {
  sent: boolean
  message?: { id: string; chat_id: string; timestamp: number }
}

export function sendText(to: string, body: string) {
  return whapiFetch<WhapiSentMessage>("/messages/text", {
    method: "POST",
    body: { to, body },
  })
}

export function sendDocument(
  to: string,
  args: {
    media: string
    filename?: string
    caption?: string
  }
) {
  return whapiFetch<WhapiSentMessage>("/messages/document", {
    method: "POST",
    body: {
      to,
      media: args.media,
      ...(args.filename ? { filename: args.filename } : {}),
      ...(args.caption ? { caption: args.caption } : {}),
    },
  })
}

export type QuickReplyButton = { id: string; title: string }

// WhatsApp allows at most 3 quick-reply buttons, titles up to 20 characters
export function sendButtons(
  to: string,
  args: {
    body: string
    buttons: QuickReplyButton[]
    header?: string
    footer?: string
  }
) {
  return whapiFetch<WhapiSentMessage>("/messages/interactive", {
    method: "POST",
    body: {
      to,
      type: "button",
      ...(args.header ? { header: { text: args.header } } : {}),
      body: { text: args.body },
      ...(args.footer ? { footer: { text: args.footer } } : {}),
      action: {
        buttons: args.buttons.slice(0, 3).map((b) => ({
          type: "quick_reply",
          id: b.id,
          title: b.title.slice(0, 20),
        })),
      },
    },
  })
}

// A tappable URL button, used for the payment / invoice link
export function sendUrlButton(
  to: string,
  args: { body: string; title: string; url: string; footer?: string }
) {
  return whapiFetch<WhapiSentMessage>("/messages/interactive", {
    method: "POST",
    body: {
      to,
      type: "button",
      body: { text: args.body },
      ...(args.footer ? { footer: { text: args.footer } } : {}),
      action: {
        buttons: [
          { type: "url", id: "pay", title: args.title.slice(0, 20), url: args.url },
        ],
      },
    },
  })
}

// --- Media & health ---------------------------------------------------------

// Downloads media by id when the webhook did not include a direct link
export async function downloadMedia(mediaId: string) {
  const res = await fetch(`${WHAPI_BASE_URL}/media/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) throw new WhapiError(`Whapi media ${mediaId} failed`, res.status, null)
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
  }
}

export type WhapiHealth = {
  status?: { code: number; text: string }
  user?: { id: string; name?: string }
  channel_id?: string
  uptime?: number
}

// status.text is "AUTH" when the phone is linked, "QR" when waiting for a scan
export function checkHealth() {
  return whapiFetch<WhapiHealth>("/health?wakeup=true")
}

export function getLoginQr() {
  return whapiFetch<{ status: string; base64?: string; expire?: number }>(
    "/users/login?wakeup=true"
  )
}

// --- Inbound webhook payload ------------------------------------------------

type WhapiMedia = {
  id: string
  link?: string
  mime_type?: string
  caption?: string
  seconds?: number
  file_name?: string
}

export type WhapiInboundMessage = {
  id: string
  from_me: boolean
  type: string
  chat_id: string
  timestamp: number
  from?: string
  from_name?: string
  text?: { body: string }
  image?: WhapiMedia
  voice?: WhapiMedia
  audio?: WhapiMedia
  document?: WhapiMedia
  reply?: {
    type: string
    buttons_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
}

export type WhapiWebhookPayload = {
  messages?: WhapiInboundMessage[]
  event?: { type: string; event: string }
  channel_id?: string
}
