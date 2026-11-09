import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_WHAPI_TOKEN,
  DEFAULT_CHANNEL_ID,
  AUTOFAME_AGENT_GROUP_ID,
  SYNCED_WHAPI_CONTACTS,
  normalizeToChatId,
  fetchContactMessagesFromWhapi,
  formatContactDiscussion,
  findContactInQuery,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// STRICT POLICY: ZERO auto-replies to users. Passive CRM sync & manual dispatch only.

/**
 * Extracts structured finance fields & all attachments from a WhatsApp contact's messages
 */
function parseWhatsAppFinanceIntake(
  messages: any[],
  cars: any[] = [],
  overridePhone = "",
  overrideName = ""
) {
  const validMsgs = messages.filter((m: any) => m.source !== "api");
  const latestSender = validMsgs.find((m: any) => !m.from_me) || validMsgs[0] || {};
  const rawChatId = latestSender.chat_id || latestSender.from || "";
  const phone =
    overridePhone ||
    (latestSender.from && latestSender.from !== "27631995124"
      ? "+" + String(latestSender.from).replace(/@.*$/, "").replace(/^\+/, "")
      : rawChatId && !rawChatId.includes("@g.us")
      ? "+" + String(rawChatId).replace(/@.*$/, "").replace(/^\+/, "")
      : "+27631995124");

  const combinedText = validMsgs
    .map((m: any) => m.text?.body || m.document?.caption || m.image?.caption || "")
    .join("\n");

  const holderMatch = combinedText.match(
    /(?:account holder|full name|name|applicant)[:\s]+([A-Za-z\s]{3,35})/i
  );
  const detectedName = holderMatch
    ? holderMatch[1].split(/[|\n]/)[0].trim()
    : overrideName || latestSender.from_name || "WhatsApp Applicant";

  const idMatch = combinedText.match(/\b(\d{13})\b/);
  const emailMatch = combinedText.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  const incomeMatch = combinedText.match(/(?:income|salary|earn|gross)[:\s]*r?\s*([\d,\s]{4,9})/i);
  const parsedIncome = incomeMatch
    ? Number(incomeMatch[1].replace(/[,\s]/g, "")) || 0
    : 0;
  const employerMatch = combinedText.match(
    /(?:employer|business name|company|work)[:\s]+([A-Za-z0-9\s&.,-]{2,40})/i
  );
  const bankMatch = combinedText.match(/bank[:\s]+([A-Za-z0-9\s]{2,25})/i);
  const addressMatch = combinedText.match(/(?:address|location|city)[:\s]+([^\n]{5,60})/i);

  const lower = combinedText.toLowerCase();
  const matchedCar = cars.find(
    (c: any) =>
      lower.includes(c.make?.toLowerCase() || "") ||
      lower.includes((c.model?.toLowerCase() || "").split(" ")[0])
  );

  const extractedDocs: {
    docType: string;
    originalName: string;
    mime: string;
    size: number;
    url: string;
  }[] = [];

  const docOrder = [
    "ID_COPY",
    "DRIVERS_LICENSE",
    "BANK_STATEMENTS",
    "PAYSLIPS",
    "PROOF_OF_ADDRESS",
  ];

  validMsgs.forEach((m: any, idx: number) => {
    const doc = m.document || m.image;
    if (doc && (doc.link || doc.url)) {
      const fileName = (
        doc.filename ||
        doc.caption ||
        (m.type === "image" ? `WhatsApp_Attachment_${idx + 1}.jpg` : `WhatsApp_Document_${idx + 1}.pdf`)
      ).toLowerCase();

      let docType = docOrder[extractedDocs.length % docOrder.length] || "ID_COPY";
      if (fileName.includes("id") || fileName.includes("smart") || fileName.includes("passport")) {
        docType = "ID_COPY";
      } else if (fileName.includes("license") || fileName.includes("licence") || fileName.includes("driver")) {
        docType = "DRIVERS_LICENSE";
      } else if (fileName.includes("bank") || fileName.includes("statement")) {
        docType = "BANK_STATEMENTS";
      } else if (fileName.includes("pay") || fileName.includes("slip") || fileName.includes("salary")) {
        docType = "PAYSLIPS";
      } else if (fileName.includes("address") || fileName.includes("residence") || fileName.includes("utility")) {
        docType = "PROOF_OF_ADDRESS";
      }

      extractedDocs.push({
        docType,
        originalName:
          doc.filename ||
          doc.caption?.slice(0, 32) ||
          (m.type === "image" ? `${docType}.jpg` : `${docType}.pdf`),
        mime: doc.mime_type || (m.type === "image" ? "image/jpeg" : "application/pdf"),
        size: doc.file_size || 102400,
        url: doc.link || doc.url,
      });
    }
  });

  const cleanName = detectedName.replace(/\(.*?\)/g, "").replace(/^(MR|MS|MRS|DR)\s+/i, "").trim();
  const nameParts = cleanName.split(/\s+/);
  return {
    firstName: nameParts[0] || "Client",
    lastName: nameParts.slice(1).join(" ") || "",
    fullName: detectedName,
    phone,
    email: emailMatch ? emailMatch[1] : "",
    idNumber: idMatch ? idMatch[1] : "",
    address: addressMatch ? addressMatch[1].trim() : "Johannesburg, Gauteng",
    employerName: employerMatch
      ? employerMatch[1].split(/[|\n]/)[0].trim()
      : bankMatch
      ? `Bank: ${bankMatch[1].split(/[|\n]/)[0].trim()}`
      : "",
    jobTitle: "Applicant",
    carId: matchedCar?.id || cars[0]?.id,
    carName: matchedCar
      ? `${matchedCar.year} ${matchedCar.make} ${matchedCar.model}`
      : cars[0]
      ? `${cars[0].year} ${cars[0].make} ${cars[0].model}`
      : "Selected Vehicle",
    carPrice: matchedCar?.price || cars[0]?.price || 0,
    monthlyIncomeGross: parsedIncome,
    monthlyExpenses: 0,
    rawTranscript: combinedText.slice(0, 1200),
    documents: extractedDocs,
  };
}

export async function GET(req: NextRequest) {
  const token =
    process.env.WHAPI_API_TOKEN ||
    process.env.NEXT_PUBLIC_WHAPI_TOKEN ||
    DEFAULT_WHAPI_TOKEN;
  const channelId = process.env.WHAPI_CHANNEL_ID || DEFAULT_CHANNEL_ID;
  const action = req.nextUrl.searchParams.get("action") || "status";

  try {
    if (action === "contact_messages" || action === "contact_chat") {
      const contactQuery =
        req.nextUrl.searchParams.get("contact") ||
        req.nextUrl.searchParams.get("query") ||
        req.nextUrl.searchParams.get("chatId") ||
        "Precious";

      const contactData = await fetchContactMessagesFromWhapi(contactQuery, token);
      const summary = formatContactDiscussion(
        contactData.contactName,
        contactData.contactPhone,
        contactData.messages,
        contactQuery
      );

      return NextResponse.json({
        success: true,
        contact: contactData.contact,
        contactName: contactData.contactName,
        contactPhone: contactData.contactPhone,
        targetChatId: contactData.targetChatId,
        messages: contactData.messages,
        isLive: contactData.isLive,
        summary,
      });
    }

    if (action === "messages" || action === "contacts") {
      let contactsList = [...SYNCED_WHAPI_CONTACTS];

      // Enrich with live chats from Whapi Cloud
      try {
        const liveChatsRes = await fetch("https://gate.whapi.cloud/chats?count=50", {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (liveChatsRes.ok) {
          const liveData = await liveChatsRes.json();
          const liveChats = Array.isArray(liveData?.chats) ? liveData.chats : [];
          liveChats.forEach((lc: any) => {
            const chatId = lc.id;
            if (!chatId || chatId.includes("status@broadcast")) return;
            const digits = chatId.replace(/@.*$/, "");
            const existingIdx = contactsList.findIndex(
              (c) => c.chatId === chatId || c.id === digits
            );
            const lastMsgText =
              lc.last_message?.text?.body ||
              (lc.last_message?.type === "voice"
                ? `[Voice Note ${lc.last_message?.voice?.seconds || ""}s]`
                : lc.last_message?.type === "action"
                ? `[Reaction ${lc.last_message?.action?.emoji || ""}]`
                : lc.last_message?.type
                ? `[${lc.last_message.type}]`
                : "");
            const timeIso = lc.last_message?.timestamp
              ? new Date(lc.last_message.timestamp * 1000).toISOString()
              : new Date().toISOString();

            if (existingIdx >= 0) {
              if (lastMsgText) contactsList[existingIdx].lastMessage = lastMsgText;
              if (lc.last_message?.timestamp) contactsList[existingIdx].timestamp = timeIso;
              contactsList[existingIdx].isRecentChat = true;
            } else {
              contactsList.push({
                id: digits,
                chatId,
                name: lc.name || `+${digits}`,
                phone: `+${digits}`,
                lastMessage: lastMsgText || "WhatsApp Chat",
                fromMe: Boolean(lc.last_message?.from_me),
                timestamp: timeIso,
                lastContactedLabel: "Recent Chat",
                isRecentChat: true,
              });
            }
          });
        }
      } catch (liveErr) {
        // Fallback to static synced contacts
      }

      const syncedFormatted = contactsList.map((c) => ({
        id: `sync-${c.id}`,
        fromMe: Boolean(c.fromMe),
        source: "mobile",
        from: c.phone,
        fromName: c.name,
        chatId: c.chatId,
        type: "text",
        text: c.lastMessage || "Saved WhatsApp Contact",
        documentUrl: null,
        documentName: null,
        timestamp: c.timestamp || new Date().toISOString(),
      }));

      return NextResponse.json({
        connected: true,
        channelId,
        agentGroupId: AUTOFAME_AGENT_GROUP_ID,
        totalChats: contactsList.length,
        contacts: contactsList,
        messages: syncedFormatted,
        intakePreview: {
          firstName: "Maria",
          lastName: "Engelbrecht",
          phone: "+27 83 732 4229",
          email: "",
          idNumber: "",
          employerName: "West Bulk Bags (Capitec: 2558165883)",
          monthlyIncomeGross: 0,
          documents: [],
        },
      });
    }

    const healthRes = await fetch("https://gate.whapi.cloud/health?wakeup=true", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const healthData = await healthRes.json();

    return NextResponse.json({
      connected: healthRes.ok,
      channelId,
      agentGroupId: AUTOFAME_AGENT_GROUP_ID,
      status: healthData?.status?.text || "AUTH",
      user: healthData?.user || null,
      contacts: SYNCED_WHAPI_CONTACTS,
      raw: healthData,
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: true,
      channelId,
      contacts: SYNCED_WHAPI_CONTACTS,
      messages: [],
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      to,
      message,
      query,
      bankEmail,
      fromEmail,
      appPassword,
      customerName,
      actionType,
      mediaUrl,
      fileName,
      context,
      whapiToken: clientToken,
    } = body;

    const whapiToken =
      clientToken ||
      process.env.WHAPI_API_TOKEN ||
      process.env.NEXT_PUBLIC_WHAPI_TOKEN ||
      DEFAULT_WHAPI_TOKEN;

    // STRICT PROTECTION: ZERO AUTO-REPLIES TO ANY CLIENTS
    if (action === "agent_auto_reply" || action === "auto_reply") {
      return NextResponse.json({
        ok: true,
        replied: false,
        reason: "Auto-replies are strictly and permanently disabled.",
      });
    }

    // ──────────────────────────────────────────────────────────────
    // ACTION 0: Add or Update a Contact in the WhatsApp Directory
    // ──────────────────────────────────────────────────────────────
    if (action === "add_contact") {
      const rawPhone = String(to || body.phone || "").trim();
      const rawName = String(customerName || body.name || rawPhone).trim();
      if (!rawPhone) {
        return NextResponse.json(
          { error: "Contact phone number is required." },
          { status: 400 }
        );
      }
      const chatId = normalizeToChatId(rawPhone);
      const id = chatId.replace(/@.*$/, "");
      const formattedDisplayPhone = rawPhone.startsWith("+")
        ? rawPhone
        : rawPhone.startsWith("0") && rawPhone.replace(/\D/g, "").length === 10
        ? "+27 " + rawPhone.replace(/\D/g, "").slice(1)
        : "+" + id;

      const existingIdx = SYNCED_WHAPI_CONTACTS.findIndex(
        (c) => c.id === id || c.chatId === chatId
      );
      const newEntry = {
        id,
        chatId,
        name: rawName,
        phone: formattedDisplayPhone,
        lastMessage: message || "Added Contact — Ready to chat",
        fromMe: false,
        timestamp: new Date().toISOString(),
        lastContactedLabel: "Just Now",
        isRecentChat: true,
      };
      if (existingIdx >= 0) {
        SYNCED_WHAPI_CONTACTS.splice(existingIdx, 1);
      }
      SYNCED_WHAPI_CONTACTS.unshift(newEntry);

      return NextResponse.json({
        success: true,
        contact: newEntry,
        contacts: SYNCED_WHAPI_CONTACTS,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // ACTION A: Extract Info & Attachments from Any WhatsApp Contact,
    // Fill Application Form Container, and Email with Attachments
    // ──────────────────────────────────────────────────────────────
    if (action === "extract_contact_and_submit") {
      const searchPrompt = query || message || "";
      const contactData = await fetchContactMessagesFromWhapi(searchPrompt, whapiToken);
      const intake = parseWhatsAppFinanceIntake(
        contactData.messages,
        context?.cars || [],
        contactData.contactPhone,
        contactData.contactName
      );

      const shouldSendEmail =
        searchPrompt.toLowerCase().includes("send") ||
        searchPrompt.toLowerCase().includes("email") ||
        searchPrompt.toLowerCase().includes("bank") ||
        Boolean(bankEmail);

      let emailDispatchResult: any = null;
      const targetRecipient =
        bankEmail ||
        searchPrompt.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/)?.[1] ||
        "alexsouthflow3@gmail.com";

      if (shouldSendEmail) {
        const origin = req.nextUrl.origin || "http://localhost:3000";
        const emailSubject = `VEHICLE FINANCE APPLICATION — ${intake.fullName} (${intake.phone}) — ${intake.carName}`;
        const emailBody = `OFFICIAL DEALERSHIP VEHICLE FINANCE APPLICATION DOSSIER
Extracted from WhatsApp Contact: ${intake.fullName} (${intake.phone})
====================================================================

1. USER DETAILS (EXTRACTED FROM WHATSAPP)
• Applicant Full Name: ${intake.fullName}
• Phone / WhatsApp Number: ${intake.phone}
• SA ID Number: ${intake.idNumber || "Pending Verification"}
• Email Address: ${intake.email || "Provided via WhatsApp"}
• Address: ${intake.address}

2. CAR DETAILS
• Selected Vehicle: ${intake.carName}
• Retail Price: R${Number(intake.carPrice || 0).toLocaleString()} ZAR
• Deposit (10%): R${Math.round(Number(intake.carPrice || 0) * 0.1).toLocaleString()} ZAR
• Loan Amount: R${Math.round(Number(intake.carPrice || 0) * 0.9).toLocaleString()} ZAR

3. FINANCIAL & BANKING DETAILS
• Employer / Business / Bank Info: ${intake.employerName || "See WhatsApp Transcript Below"}
• Gross Monthly Income: ${
          intake.monthlyIncomeGross > 0
            ? `R${intake.monthlyIncomeGross.toLocaleString()} ZAR`
            : "See Attached Statements"
        }

4. WHATSAPP CONVERSATION TRANSCRIPT & NOTES
${intake.rawTranscript || "No text transcript."}

5. ATTACHED PROOF DOCUMENTS (${intake.documents.length} File(s))
${
  intake.documents.length > 0
    ? intake.documents.map((d, i) => `${i + 1}. ${d.docType}: ${d.originalName} (${d.url})`).join("\n")
    : "No media files found in chat history."
}`;

        const emailRes = await fetch(`${origin}/api/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_finance_to_bank",
            fromEmail: fromEmail || "alexsouthflow3@gmail.com",
            appPassword: appPassword || "dmjjjsyxcpqpdwlb",
            to: targetRecipient,
            subject: emailSubject,
            body: emailBody,
            customerName: intake.fullName,
            carName: intake.carName,
            carPrice: intake.carPrice,
            financeData: {
              firstName: intake.firstName,
              lastName: intake.lastName,
              idNumber: intake.idNumber,
              phone: intake.phone,
              email: intake.email,
              address: intake.address,
              carName: intake.carName,
              carPrice: intake.carPrice,
              depositAmount: Math.round((intake.carPrice || 0) * 0.1),
              termMonths: 72,
              employerName: intake.employerName,
              jobTitle: intake.jobTitle || "Applicant",
              monthlyIncomeGross: intake.monthlyIncomeGross,
              monthlyExpenses: intake.monthlyExpenses || 0,
              bankEmail: targetRecipient,
            },
            attachments: intake.documents.map((d: any) => ({
              filename: d.originalName,
              url: d.url,
              mime: d.mime,
            })),
          }),
        });
        emailDispatchResult = await emailRes.json().catch(() => ({}));
      }

      return NextResponse.json({
        success: true,
        contactName: contactData.contactName,
        contactPhone: contactData.contactPhone,
        intake,
        emailDispatched: Boolean(emailDispatchResult?.status === "SENT"),
        emailRecipient: targetRecipient,
        emailResult: emailDispatchResult,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // ACTION B: Direct WhatsApp Message or Document Dispatch
    // ──────────────────────────────────────────────────────────────
    if (!to || !message) {
      return NextResponse.json(
        { error: "Phone number 'to' and 'message' are required." },
        { status: 400 }
      );
    }

    let formattedPhone = String(to).trim();
    const cleanDigits = formattedPhone.replace(/\D/g, "");
    if (!formattedPhone.includes("@g.us") && !formattedPhone.includes("@s.whatsapp.net")) {
      formattedPhone = formattedPhone.replace(/\s+/g, "").replace(/[-()]/g, "");
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "27" + formattedPhone.slice(1);
      } else if (formattedPhone.startsWith("+")) {
        formattedPhone = formattedPhone.slice(1);
      }
    }

    const endpoint = mediaUrl
      ? "https://gate.whapi.cloud/messages/document"
      : "https://gate.whapi.cloud/messages/text";

    const payload = mediaUrl
      ? {
          to: formattedPhone,
          media: mediaUrl,
          caption: message,
          filename: fileName || "AutoFame_Document.pdf",
        }
      : {
          to: formattedPhone,
          body: message,
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${whapiToken}`,
      },
      body: JSON.stringify(payload),
    });

    const dispatchResult = await response.json().catch(() => ({}));

    // If Whapi trial quota is temporarily exceeded (402), return waMeUrl so user can still send with 1 click
    if (!response.ok) {
      const waDigits = cleanDigits.startsWith("0") ? "27" + cleanDigits.slice(1) : cleanDigits;
      return NextResponse.json({
        success: true,
        mode: "whatsapp_direct",
        trialQuotaExceeded: response.status === 402,
        waMeUrl: `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}`,
        formattedPhone,
        recipient: formattedPhone,
        customerName: customerName || "Customer",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      mode: "live",
      channelId: DEFAULT_CHANNEL_ID,
      formattedPhone,
      recipient: formattedPhone,
      customerName: customerName || "Customer",
      actionType: actionType || "WHATSAPP_MESSAGE",
      data: dispatchResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("API /api/whatsapp error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process WhatsApp dispatch" },
      { status: 500 }
    );
  }
}
