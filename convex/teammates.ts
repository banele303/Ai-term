import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireStaff } from "./lib/auth"
import { writeLog } from "./logs"

export const listWorkspace = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx)

    const bots = await ctx.db
      .query("teammate_bots")
      .order("desc")
      .collect()

    const rawChats = await ctx.db
      .query("teammate_chats")
      .order("desc")
      .collect()

    const botMap = new Map(bots.map((b) => [b._id, b]))

    const chats = rawChats
      .map((chat) => {
        const chatBots = chat.botIds
          .map((id) => botMap.get(id))
          .filter((b): b is NonNullable<typeof b> => Boolean(b))
          .map((b) => ({
            id: b._id,
            name: b.name,
            avatar: b.avatar,
            job: b.job,
          }))

        if (chatBots.length === 0) return null

        return {
          id: chat._id,
          kind: chat.kind,
          name: chat.name ?? chatBots[0]?.name ?? "Chat",
          bots: chatBots,
          lastMessagePreview: chat.lastMessagePreview,
          lastMessageAt: chat.lastMessageAt,
          createdAt: chat.createdAt,
        }
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c))

    return {
      bots: bots.map((b) => ({
        id: b._id,
        name: b.name,
        avatar: b.avatar,
        job: b.job,
        instructions: b.instructions,
      })),
      chats,
    }
  },
})

export const getChat = query({
  args: {
    chatId: v.id("teammate_chats"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)

    const chat = await ctx.db.get(args.chatId)
    if (!chat) return null

    const allBots = await ctx.db
      .query("teammate_bots")
      .collect()

    const botMap = new Map(allBots.map((b) => [b._id, b]))
    const chatBots = chat.botIds
      .map((id) => botMap.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        id: b._id,
        name: b.name,
        avatar: b.avatar,
        job: b.job,
        instructions: b.instructions,
      }))

    const rawMessages = await ctx.db
      .query("teammate_messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .collect()

    const messages = rawMessages.map((m) => ({
      id: m._id,
      role: m.role,
      text: m.text,
      botId: m.botId,
      targetBotId: m.targetBotId,
      createdAt: m.createdAt,
    }))

    return {
      chat: {
        id: chat._id,
        kind: chat.kind,
        name: chat.name ?? chatBots[0]?.name ?? "Chat",
        botIds: chat.botIds,
        lastMessagePreview: chat.lastMessagePreview,
        lastMessageAt: chat.lastMessageAt,
        createdAt: chat.createdAt,
        bots: chatBots,
      },
      bots: chatBots,
      allUserBots: allBots.map((b) => ({
        id: b._id,
        name: b.name,
        avatar: b.avatar,
        job: b.job,
      })),
      messages,
    }
  },
})

const FLEET_SPEC = [
  {
    name: "AeroComm AI",
    avatar: "AeroComm",
    job: "Email, WhatsApp & Customer Communications Specialist",
    instructions:
      "You are AeroComm AI, the dedicated Communications & Email Specialist for AutoPulse. You handle inbound customer inquiries across Gmail, Outlook, and Whapi.cloud WhatsApp. You draft professional email replies, prepare formal quote proposals with South African Rand (ZAR) totals and payment links (/pay/{dealId}), verify customer fitment details, and maintain high-standard workshop correspondence.",
    welcome:
      "Hi! I'm AeroComm AI, your Communications & Email Specialist. I'm connected to your Gmail, Outlook, and Whapi WhatsApp inboxes. I can draft responses to customer inquiries, prepare quote emails, and follow up on pending RFQs.",
  },
  {
    name: "SupplyHunter AI",
    avatar: "SupplyHunter",
    job: "Automotive Parts Sourcing & Supply Chain Specialist",
    instructions:
      "You are SupplyHunter AI, the dedicated Parts Sourcing & Inventory Specialist for AutoPulse. You track low inventory stock, monitor safety reorder thresholds, cross-reference OEM and aftermarket part numbers, compare wholesale and trade supplier prices (Bosch, Brembo, Denso, NGK, Ferodo), and browse South African distributor networks to restock catalog parts.",
    welcome:
      "Hi! I'm SupplyHunter AI, your Parts Sourcing & Supply Specialist. I track inventory levels, detect parts below minimum thresholds, cross-reference OEM numbers, and find supplier deals to keep your workshop stocked.",
  },
  {
    name: "OmniPulse AI",
    avatar: "OmniPulse",
    job: "TikTok Ads & Omnichannel Marketing Specialist",
    instructions:
      "You are OmniPulse AI, the dedicated Social Media & TikTok Ads Specialist for AutoPulse. You connect to TikTok Ads, Facebook Ads, and Instagram via Composio. You analyze ad spend and cost per lead, manage high-intent VIN lead forms, draft viral automotive marketing scripts, and optimize ad campaigns to drive parts sales.",
    welcome:
      "Hi! I'm OmniPulse AI, your TikTok & Social Marketing Specialist. I connect to your TikTok Ads and Meta campaigns, track ad spend and lead generation forms, create viral video scripts, and optimize vehicle parts marketing.",
  },
  {
    name: "AutoPulse Ops AI",
    avatar: "AutoPulse",
    job: "Autonomous Automotive Operations Specialist",
    instructions:
      "You are AutoPulse Ops AI, the unified master operations manager. You coordinate across stock levels, customer communications, active quotes, and ad campaigns. Currency is ZAR.",
    welcome:
      "Hi! I'm AutoPulse Ops AI. I'm connected to your live stock, customer emails, WhatsApp channel, and ad campaigns. How can I assist you today?",
  },
  {
    name: "QuoteCraft AI",
    avatar: "QuoteCraft",
    job: "Automated PDF Quotations & Multi-Channel Sales Specialist",
    instructions:
      "You are QuoteCraft AI, the dedicated PDF Quotation & Multi-Channel Deals Specialist for AutoPulse. Your mission is to extract vehicle fitment, part requirements, and customer inquiries from the live database (CRM, WhatsApp, and Catalog) and transform them into professional, formal PDF Quotations with exact South African Rand (ZAR) line items, 15% VAT, and payment links (/pay/{dealId}). You dispatch quotes via Whapi.cloud WhatsApp and Google Workspace Email, and manage automated 24h/48h client follow-ups to close sales.",
    welcome:
      "Hi! I'm QuoteCraft AI, your Automated PDF Quotations & Multi-Channel Sales Specialist. I pull vehicle fitment, catalog pricing, and customer inquiries from your database to create formal, branded PDF quotes, dispatch them instantly via WhatsApp & Email, and manage automated client follow-ups.",
  },
]

export const ensureWorkspaceFleet = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireStaff(ctx)
    const existingBots = await ctx.db.query("teammate_bots").collect()
    const now = Date.now()

    const results = []

    for (const spec of FLEET_SPEC) {
      const match = existingBots.find(
        (b) =>
          b.name.toLowerCase() === spec.name.toLowerCase() ||
          b.job.toLowerCase().includes(spec.name.toLowerCase().replace(" ai", ""))
      )

      if (match) {
        let chat = await ctx.db
          .query("teammate_chats")
          .filter((q) =>
            q.and(
              q.eq(q.field("kind"), "direct"),
              q.eq(q.field("name"), match.name)
            )
          )
          .first()

        if (!chat) {
          const chatId = await ctx.db.insert("teammate_chats", {
            userId,
            kind: "direct",
            name: match.name,
            botIds: [match._id],
            lastMessagePreview: spec.welcome,
            lastMessageAt: now,
            createdAt: now,
          })
          await ctx.db.insert("teammate_messages", {
            chatId,
            role: "assistant",
            text: spec.welcome,
            botId: match._id,
            createdAt: now,
          })
          chat = await ctx.db.get(chatId)
        }

        results.push({
          botId: match._id,
          chatId: chat?._id,
          name: match.name,
          job: match.job,
          avatar: match.avatar,
          created: false,
        })
      } else {
        const botId = await ctx.db.insert("teammate_bots", {
          userId,
          name: spec.name,
          avatar: spec.avatar,
          job: spec.job,
          instructions: spec.instructions,
          createdAt: now,
        })

        const chatId = await ctx.db.insert("teammate_chats", {
          userId,
          kind: "direct",
          name: spec.name,
          botIds: [botId],
          lastMessagePreview: spec.welcome,
          lastMessageAt: now,
          createdAt: now,
        })

        await ctx.db.insert("teammate_messages", {
          chatId,
          role: "assistant",
          text: spec.welcome,
          botId,
          createdAt: now,
        })

        results.push({
          botId,
          chatId,
          name: spec.name,
          job: spec.job,
          avatar: spec.avatar,
          created: true,
        })
      }
    }

    return { fleet: results }
  },
})

export const ensureDefaultBot = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireStaff(ctx)
    const existing = await ctx.db.query("teammate_bots").first()
    if (existing) {
      const chat = await ctx.db
        .query("teammate_chats")
        .filter((q) => q.eq(q.field("kind"), "direct"))
        .first()
      return { botId: existing._id, chatId: chat?._id }
    }

    const now = Date.now()
    const botId = await ctx.db.insert("teammate_bots", {
      userId,
      name: "AutoPulse Ops AI",
      avatar: "AutoPulse",
      job: "Autonomous Parts & Ops Specialist",
      instructions: "Monitor catalog stock, review customer email inquiries, draft quotes, and flag low inventory thresholds.",
      createdAt: now,
    })

    const chatId = await ctx.db.insert("teammate_chats", {
      userId,
      kind: "direct",
      name: "AutoPulse Ops AI",
      botIds: [botId],
      lastMessagePreview: "Online and connected to parts catalog and messages.",
      lastMessageAt: now,
      createdAt: now,
    })

    await ctx.db.insert("teammate_messages", {
      chatId,
      role: "assistant",
      text: "Hi! I'm AutoPulse Ops AI. I'm connected to your live stock, customer emails, WhatsApp channel, and ad campaigns. How can I assist you today?",
      botId,
      createdAt: now,
    })

    return { botId, chatId }
  },
})

export const createBot = mutation({
  args: {
    name: v.string(),
    avatar: v.string(),
    job: v.string(),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx)
    const now = Date.now()

    const botId = await ctx.db.insert("teammate_bots", {
      userId,
      name: args.name.trim(),
      avatar: args.avatar.trim(),
      job: args.job.trim(),
      instructions: args.instructions?.trim() || undefined,
      createdAt: now,
    })

    const chatId = await ctx.db.insert("teammate_chats", {
      userId,
      kind: "direct",
      name: args.name.trim(),
      botIds: [botId],
      lastMessagePreview: `Hi! I'm ${args.name.trim()}, ready to help.`,
      lastMessageAt: now,
      createdAt: now,
    })

    await ctx.db.insert("teammate_messages", {
      chatId,
      role: "assistant",
      text: `Hi! I'm ${args.name.trim()} (${args.job.trim()}). How can I help you today?`,
      botId,
      createdAt: now,
    })

    return {
      id: chatId,
      chatId,
      botId,
      name: args.name.trim(),
    }
  },
})

export const updateBot = mutation({
  args: {
    botId: v.id("teammate_bots"),
    name: v.string(),
    avatar: v.string(),
    job: v.string(),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const bot = await ctx.db.get(args.botId)
    if (!bot) throw new Error("Bot not found")

    await ctx.db.patch(bot._id, {
      name: args.name.trim(),
      avatar: args.avatar.trim(),
      job: args.job.trim(),
      instructions: args.instructions?.trim() || undefined,
    })

    const directChats = await ctx.db
      .query("teammate_chats")
      .filter((q) => q.eq(q.field("kind"), "direct"))
      .collect()

    for (const c of directChats) {
      if (c.botIds.includes(bot._id)) {
        await ctx.db.patch(c._id, { name: args.name.trim() })
      }
    }

    return { id: bot._id, name: args.name.trim() }
  },
})

export const renameBot = mutation({
  args: {
    botId: v.id("teammate_bots"),
    name: v.string(),
    job: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const bot = await ctx.db.get(args.botId)
    if (!bot) throw new Error("Bot not found")
    const newName = args.name.trim()
    await ctx.db.patch(bot._id, {
      name: newName,
      ...(args.job ? { job: args.job.trim() } : {}),
    })

    const directChats = await ctx.db
      .query("teammate_chats")
      .filter((q) => q.eq(q.field("kind"), "direct"))
      .collect()

    for (const c of directChats) {
      if (c.botIds.includes(bot._id)) {
        await ctx.db.patch(c._id, { name: newName })
      }
    }

    return { id: bot._id, name: newName }
  },
})

export const deleteBot = mutation({
  args: {
    botId: v.id("teammate_bots"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const bot = await ctx.db.get(args.botId)
    if (!bot) throw new Error("Bot not found")

    const chats = await ctx.db
      .query("teammate_chats")
      .collect()

    for (const chat of chats) {
      if (!chat.botIds.includes(bot._id)) continue

      if (chat.kind === "direct") {
        const messages = await ctx.db
          .query("teammate_messages")
          .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
          .collect()
        for (const m of messages) await ctx.db.delete(m._id)
        await ctx.db.delete(chat._id)
      } else {
        const remainingBots = chat.botIds.filter((id) => id !== bot._id)
        if (remainingBots.length < 2) {
          const messages = await ctx.db
            .query("teammate_messages")
            .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
            .collect()
          for (const m of messages) await ctx.db.delete(m._id)
          await ctx.db.delete(chat._id)
        } else {
          await ctx.db.patch(chat._id, { botIds: remainingBots })
        }
      }
    }

    await ctx.db.delete(bot._id)
    return { success: true }
  },
})

export const createGroupChat = mutation({
  args: {
    name: v.string(),
    botIds: v.array(v.id("teammate_bots")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx)
    if (args.botIds.length < 2) {
      throw new Error("A group chat must have at least 2 bots")
    }
    const now = Date.now()

    const chatId = await ctx.db.insert("teammate_chats", {
      userId,
      kind: "group",
      name: args.name.trim(),
      botIds: args.botIds,
      lastMessagePreview: "Group chat created",
      lastMessageAt: now,
      createdAt: now,
    })

    return { id: chatId, chatId, name: args.name.trim() }
  },
})

export const updateGroupChat = mutation({
  args: {
    chatId: v.id("teammate_chats"),
    name: v.string(),
    botIds: v.array(v.id("teammate_bots")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    await ctx.db.patch(chat._id, {
      name: args.name.trim(),
      botIds: args.botIds,
    })

    return { id: chat._id, name: args.name.trim() }
  },
})

export const deleteGroupChat = mutation({
  args: {
    chatId: v.id("teammate_chats"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    const messages = await ctx.db
      .query("teammate_messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .collect()
    for (const m of messages) await ctx.db.delete(m._id)

    await ctx.db.delete(chat._id)
    return { success: true }
  },
})

export const sendMessage = mutation({
  args: {
    chatId: v.id("teammate_chats"),
    text: v.string(),
    targetBotId: v.optional(v.id("teammate_bots")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    const now = Date.now()
    const messageId = await ctx.db.insert("teammate_messages", {
      chatId: chat._id,
      role: "user",
      text: args.text.trim(),
      targetBotId: args.targetBotId,
      createdAt: now,
    })

    await ctx.db.patch(chat._id, {
      lastMessagePreview: args.text.trim().slice(0, 100),
      lastMessageAt: now,
    })

    return { messageId }
  },
})

export const saveAssistantReply = mutation({
  args: {
    chatId: v.id("teammate_chats"),
    text: v.string(),
    botId: v.id("teammate_bots"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    const now = Date.now()
    const messageId = await ctx.db.insert("teammate_messages", {
      chatId: chat._id,
      role: "assistant",
      text: args.text.trim(),
      botId: args.botId,
      createdAt: now,
    })

    await ctx.db.patch(chat._id, {
      lastMessagePreview: args.text.trim().slice(0, 100),
      lastMessageAt: now,
    })

    return { messageId }
  },
})

export const editMessage = mutation({
  args: {
    messageId: v.id("teammate_messages"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    await ctx.db.patch(args.messageId, { text: args.text.trim() })
    return { success: true }
  },
})

export const createDirectChat = mutation({
  args: {
    botId: v.id("teammate_bots"),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx)
    const bot = await ctx.db.get(args.botId)
    if (!bot) throw new Error("Bot not found")

    const now = Date.now()
    const welcome = `Hi! I'm ${bot.name} (${bot.job}). How can I help you today?`
    const chatId = await ctx.db.insert("teammate_chats", {
      userId: user.userId,
      kind: "direct",
      name: bot.name,
      botIds: [bot._id],
      lastMessagePreview: welcome,
      lastMessageAt: now,
      createdAt: now,
    })

    await ctx.db.insert("teammate_messages", {
      chatId,
      role: "assistant",
      text: welcome,
      botId: bot._id,
      createdAt: now,
    })

    return { chatId }
  },
})

export const clearChatMessages = mutation({
  args: {
    chatId: v.id("teammate_chats"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    const messages = await ctx.db
      .query("teammate_messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect()

    for (const msg of messages) {
      await ctx.db.delete(msg._id)
    }

    const now = Date.now()
    let welcome = "Conversation reset. How can I help you today?"
    if (chat.botIds.length > 0) {
      const firstBot = await ctx.db.get(chat.botIds[0])
      if (firstBot) {
        welcome = `Hi! I'm ${firstBot.name} (${firstBot.job}). How can I help you today?`
        await ctx.db.insert("teammate_messages", {
          chatId: chat._id,
          role: "assistant",
          text: welcome,
          botId: firstBot._id,
          createdAt: now,
        })
      }
    }

    await ctx.db.patch(args.chatId, {
      lastMessagePreview: welcome.slice(0, 100),
      lastMessageAt: now,
    })

    return { success: true }
  },
})

export const deleteChat = mutation({
  args: {
    chatId: v.id("teammate_chats"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const chat = await ctx.db.get(args.chatId)
    if (!chat) throw new Error("Chat not found")

    const messages = await ctx.db
      .query("teammate_messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect()

    for (const msg of messages) {
      await ctx.db.delete(msg._id)
    }

    await ctx.db.delete(args.chatId)
    return { success: true }
  },
})

export const deleteMessage = mutation({
  args: {
    messageId: v.id("teammate_messages"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const msg = await ctx.db.get(args.messageId)
    if (msg) {
      await ctx.db.delete(args.messageId)
    }
    return { success: true }
  },
})

export const recordCustomerOutreach = mutation({
  args: {
    recipient: v.string(),
    channel: v.union(v.literal("email"), v.literal("whatsapp")),
    subject: v.optional(v.string()),
    body: v.string(),
    quoteRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const receipt = `COMM-${Date.now().toString(36).toUpperCase()}`
    await writeLog(ctx, {
      app: args.channel === "whatsapp" ? "whapi" : "composio",
      actionName: args.channel === "whatsapp" ? "whapi_send_quote" : "gmail_send_message",
      status: "success",
      payload: {
        receipt,
        recipient: args.recipient,
        channel: args.channel,
        subject: args.subject,
        quoteRef: args.quoteRef,
        preview: args.body.slice(0, 120),
      },
    })
    return { receipt }
  },
})

export const recordSupplierRFQ = mutation({
  args: {
    supplier: v.string(),
    sku: v.string(),
    partName: v.string(),
    quantity: v.number(),
    targetPrice: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const poNumber = `PO-${args.supplier.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
    await writeLog(ctx, {
      app: "agent",
      actionName: "supplyhunter_rfq_dispatch",
      status: "success",
      payload: {
        poNumber,
        supplier: args.supplier,
        sku: args.sku,
        partName: args.partName,
        quantity: args.quantity,
        targetPrice: args.targetPrice,
        notes: args.notes,
      },
    })
    return { poNumber }
  },
})

export const recordCampaignUpdate = mutation({
  args: {
    platform: v.string(),
    campaignName: v.string(),
    budget: v.number(),
    hook: v.string(),
    script: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    const campaignId = `CAMP-${Date.now().toString(36).toUpperCase()}`
    await writeLog(ctx, {
      app: "composio",
      actionName: "omnipulse_campaign_deploy",
      status: "success",
      payload: {
        campaignId,
        platform: args.platform,
        campaignName: args.campaignName,
        dailyBudget: args.budget,
        hook: args.hook,
        scriptPreview: args.script.slice(0, 100),
      },
    })
    return { campaignId }
  },
})
