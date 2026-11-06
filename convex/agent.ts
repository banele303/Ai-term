import { Agent, createTool, stepCountIs, type ToolCtx } from "@convex-dev/agent"
import { z } from "zod"

import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { chatModel, embeddingModel } from "./lib/ai"
import { publicPart } from "./lib/parts"
import { decodeVin } from "./lib/vin"
import { hybridSearchParts } from "./parts"
import type { Channel } from "./schema"

// ---------------------------------------------------------------------------
// Tools shared by the customer-facing and staff-facing agents
// ---------------------------------------------------------------------------

const vehicleSchema = z
  .object({
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().optional(),
    engineCode: z.string().optional(),
  })
  .describe("The customer's vehicle, as precise as known")

function catalogTools(audience: "b2b" | "b2c") {
  return {
    searchParts: createTool({
      description:
        "Hybrid semantic + keyword search of the live parts catalog. Use part names, OEM or cross-reference numbers, or symptoms. Pass the vehicle whenever it is known so results are fitment-checked.",
      inputSchema: z.object({
        query: z.string().describe("e.g. 'front brake pads', '04465-0K240', 'oil filter'"),
        category: z.string().optional(),
        vehicle: vehicleSchema.optional(),
      }),
      execute: async (ctx: ToolCtx, input) => {
        const hits = await hybridSearchParts(ctx, { ...input, limit: 6 })
        return hits.map((h) => ({
          ...publicPart(h.part, audience),
          fitment: h.fitment.verdict,
        }))
      },
    }),

    decodeVin: createTool({
      description:
        "Decode a 17-character VIN into make, model, year and engine. Use before searching when the customer gives a VIN or a VIN was read from a photo.",
      inputSchema: z.object({ vin: z.string() }),
      execute: async (_ctx: ToolCtx, { vin }) => decodeVin(vin),
    }),
  }
}

function quoteTool(contactId: Id<"crm_contacts">, channel: Channel) {
  return createTool({
    description:
      "Create a priced quote with a payment link for parts found with searchParts. Prices come from the catalog. Only quote parts whose fitment is 'fits' or that the customer explicitly confirmed. Offer OEM and aftermarket as separate quotes when both exist.",
    inputSchema: z.object({
      lines: z
        .array(z.object({ partId: z.string(), quantity: z.number().int().min(1) }))
        .min(1),
      vinNumber: z.string().optional(),
      vehicle: vehicleSchema.optional(),
      notes: z.string().optional(),
    }),
    execute: async (ctx: ToolCtx, input) => {
      return await ctx.runMutation(internal.crm.createQuote, {
        contactId,
        channel,
        vinNumber: input.vinNumber,
        vehicle: input.vehicle,
        notes: input.notes,
        lines: input.lines.map((l) => ({
          partId: l.partId as Id<"parts_catalog">,
          quantity: l.quantity,
        })),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Customer-facing parts specialist (WhatsApp, IG/FB DMs, email replies)
// ---------------------------------------------------------------------------

const PARTS_SPECIALIST_INSTRUCTIONS = `You are AutoPulse, the parts specialist for an automotive parts supplier, chatting with mechanics, workshops and retail car owners on WhatsApp and social DMs.

How you work:
- Identify the vehicle first (make, model, year, engine). If a VIN is available, call decodeVin. Ask one short question if the vehicle is unclear.
- Always call searchParts with the vehicle before naming a part, price or stock level. Never invent part numbers, prices or stock.
- Only recommend parts whose fitment is "fits". If fitment is "unknown", say so and ask for the VIN or engine code.
- When both OEM and aftermarket options exist, show both with price and stock.
- When the customer wants to buy, call createQuote and share the payment link. Mention any core deposit and that it is refunded when the old part is returned.
- Keep replies short and scannable for a phone: plain text, no markdown tables, at most ~8 lines. Use *bold* (WhatsApp style) sparingly.
- Workshops (B2B) get trade prices automatically; never mention cost prices or margins.
- If asked something outside parts, orders, fitment or deliveries, politely steer back or offer a human.`

export const partsAgent = new Agent(components.agent, {
  name: "AutoPulse Parts Specialist",
  languageModel: chatModel(),
  embeddingModel: embeddingModel(),
  instructions: PARTS_SPECIALIST_INSTRUCTIONS,
  stopWhen: stepCountIs(8),
  contextOptions: {
    recentMessages: 30,
    searchOtherThreads: false,
    searchOptions: { limit: 6, textSearch: true, vectorSearch: true, messageRange: { before: 1, after: 1 } },
  },
})

// Per-conversation tool set: the quote tool is bound to the contact and channel
export function partsSpecialistTools(args: {
  contactId: Id<"crm_contacts">
  channel: Channel
  audience: "b2b" | "b2c"
}) {
  return {
    ...catalogTools(args.audience),
    createQuote: quoteTool(args.contactId, args.channel),
  }
}

// ---------------------------------------------------------------------------
// Staff-facing operations agent (dashboard /dashboard/chat)
// Composio tools (Gmail, FB/IG, TikTok Ads) are attached in composioTools.ts
// ---------------------------------------------------------------------------

export const OPS_AGENT_INSTRUCTIONS = `You are the AutoPulse operations agent working for the staff of an automotive parts supplier. You can search the live catalog, check stock and fitment, read and send email, manage Facebook/Instagram posts and DMs, read and control TikTok/Meta ads, and message customers on WhatsApp.

Rules:
- Ground every number (stock, price, spend, ROAS) in a tool result. Say when data is missing.
- Before irreversible external actions (sending email or WhatsApp, publishing posts, pausing ads, changing budgets) state exactly what you are about to do in one line, then do it if the staff member's request clearly asked for it.
- Summarize what you did at the end as a short bullet list.`

export const opsAgent = new Agent(components.agent, {
  name: "AutoPulse Ops Agent",
  languageModel: chatModel(),
  embeddingModel: embeddingModel(),
  instructions: OPS_AGENT_INSTRUCTIONS,
  stopWhen: stepCountIs(15),
  tools: catalogTools("b2b"),
})
