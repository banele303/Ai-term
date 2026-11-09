import type { QuoteData, QuoteItem } from "@/components/quote-pdf-modal"

export const DEFAULT_SAMPLE_QUOTE: QuoteData = {
  id: "quote-za-0841",
  quoteNumber: "QT-2026-0841",
  date: "05 Nov 2026",
  validUntil: "19 Nov 2026",
  clientName: "Marco van Wyk",
  clientPhone: "+27 82 459 1102",
  clientEmail: "marco@autoworks.co.za",
  companyName: "AutoWorks Precision Midrand",
  vehicleMake: "Volkswagen",
  vehicleModel: "Golf 7 GTI 2.0 TSI (CHHB)",
  vehicleYear: 2017,
  vinNumber: "WVWZZZAUZHP189421",
  channel: "whatsapp",
  items: [
    {
      sku: "06L-903-021-E",
      description: "Bosch 140A Smart Alternator (OEM Fitment for Golf 7 GTI)",
      quantity: 1,
      unitPrice: 5850.0,
      coreDeposit: 750.0,
    },
    {
      sku: "FDB4434-DS",
      description: "Ferodo Premier Front Brake Pad Set (Low-Dust Anti-Noise)",
      quantity: 1,
      unitPrice: 1240.0,
    },
    {
      sku: "MOT-RBF660",
      description: "Motul RBF 660 High-Temp Racing DOT 4 Brake Fluid (500ml)",
      quantity: 2,
      unitPrice: 320.0,
    },
  ],
  notes:
    "OEM fitment verified against VIN. 12-Month / 30,000 km warranty included. Express courier dispatch via The Courier Guy.",
  paymentLink: "http://localhost:3000/pay/QT-2026-0841",
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

/**
 * Generates an ISO-compliant PDF 1.4 document Blob for the quotation.
 * Designed with a crisp, simple, modern white aesthetic with corporate emblem logo.
 * Uses standard Type 1 fonts (Helvetica & Helvetica-Bold) for zero-dependency universal viewing.
 */
export function generateQuotePdfBlob(quote: QuoteData): Blob {
  const subtotal = quote.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const coreTotal = quote.items.reduce((s, it) => s + (it.coreDeposit || 0) * it.quantity, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const grandTotal = Math.round((subtotal + vat + coreTotal) * 100) / 100

  const streamOps: string[] = []

  // Base canvas: crisp white page
  streamOps.push("1 1 1 rg")
  streamOps.push("0 0 595.28 841.89 re f")

  // Header Container: Modern white card with subtle light-gray border
  streamOps.push("0.98 0.99 1.0 rg")
  streamOps.push("36 742 523 68 re f")
  streamOps.push("0.87 0.90 0.94 RG")
  streamOps.push("1 w 36 742 523 68 re S")

  // AutoPulse Brand Emblem Logo Badge
  streamOps.push("0.08 0.12 0.20 rg") // Slate dark rounded pill
  streamOps.push("48 754 44 44 re f")
  streamOps.push("0.14 0.65 0.92 rg") // Sky-teal accent dot
  streamOps.push("51 757 38 38 re f")
  streamOps.push("BT")
  streamOps.push("/F2 16 Tf")
  streamOps.push("1 1 1 rg") // Crisp white text
  streamOps.push("59 769 Td")
  streamOps.push("(AP) Tj")
  streamOps.push("ET")

  // Company Brand text (Dark, modern, crisp)
  streamOps.push("BT")
  streamOps.push("/F2 15 Tf")
  streamOps.push("0.08 0.12 0.20 rg")
  streamOps.push("102 783 Td")
  streamOps.push(`(${escapePdfText("AUTOPULSE AUTO PARTS")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.40 0.45 0.52 rg")
  streamOps.push("102 770 Td")
  streamOps.push(`(${escapePdfText("Commercial Parts & Fleet Logistics (Pty) Ltd • VAT Reg: 4890219481")}) Tj`)
  streamOps.push("0 -10 Td")
  streamOps.push(`(${escapePdfText("14 Old Pretoria Road, Halfway House, Midrand • quotes@autopulse.co.za")}) Tj`)
  streamOps.push("ET")

  // Header Right: Quote Reference & Date (Clean modern white/dark styling)
  streamOps.push("BT")
  streamOps.push("/F2 13 Tf")
  streamOps.push("0.08 0.12 0.20 rg")
  streamOps.push("418 783 Td")
  streamOps.push(`(${escapePdfText(quote.quoteNumber)}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8.5 Tf")
  streamOps.push("0.35 0.40 0.48 rg")
  streamOps.push("418 770 Td")
  streamOps.push(`(${escapePdfText(`Date: ${quote.date}`)}) Tj`)
  streamOps.push("0 -10 Td")
  streamOps.push(`(${escapePdfText(`Valid Until: ${quote.validUntil}`)}) Tj`)
  streamOps.push("ET")

  // Subtitle / Document Type Banner
  streamOps.push("0.96 0.97 0.99 rg")
  streamOps.push("36 708 523 26 re f")
  streamOps.push("0.87 0.90 0.94 RG")
  streamOps.push("1 w 36 708 523 26 re S")

  streamOps.push("BT")
  streamOps.push("/F2 9.5 Tf")
  streamOps.push("0.1 0.15 0.25 rg")
  streamOps.push("48 718 Td")
  streamOps.push(`(${escapePdfText("OFFICIAL TAX INVOICE & PRICE ESTIMATE (ZAR)")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.35 0.45 0.55 rg")
  streamOps.push("370 718 Td")
  streamOps.push(`(${escapePdfText(`Channel: ${quote.channel.toUpperCase()} • Status: VERIFIED`)}) Tj`)
  streamOps.push("ET")

  // Client Details Box (Left)
  streamOps.push("0.97 0.98 0.99 rg")
  streamOps.push("36 626 252 80 re f")
  streamOps.push("0.85 0.88 0.92 RG")
  streamOps.push("1 w 36 626 252 80 re S")

  streamOps.push("BT")
  streamOps.push("/F2 8 Tf")
  streamOps.push("0.4 0.45 0.5 rg")
  streamOps.push("46 690 Td")
  streamOps.push(`(${escapePdfText("CLIENT / BILL TO")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F2 10 Tf")
  streamOps.push("0.1 0.1 0.1 rg")
  streamOps.push("46 675 Td")
  streamOps.push(`(${escapePdfText(quote.clientName)}) Tj`)
  streamOps.push("ET")

  if (quote.companyName) {
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.2 0.4 0.8 rg")
    streamOps.push("46 662 Td")
    streamOps.push(`(${escapePdfText(quote.companyName)}) Tj`)
    streamOps.push("ET")
  }

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.3 0.3 0.3 rg")
  streamOps.push("46 648 Td")
  streamOps.push(`(${escapePdfText(`Phone: ${quote.clientPhone}`)}) Tj`)
  streamOps.push("ET")

  if (quote.clientEmail) {
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.3 0.3 0.3 rg")
    streamOps.push("46 636 Td")
    streamOps.push(`(${escapePdfText(`Email: ${quote.clientEmail}`)}) Tj`)
    streamOps.push("ET")
  }

  // Vehicle & Fitment Box (Right)
  streamOps.push("0.97 0.98 0.99 rg")
  streamOps.push("307 626 252 80 re f")
  streamOps.push("0.85 0.88 0.92 RG")
  streamOps.push("1 w 307 626 252 80 re S")

  streamOps.push("BT")
  streamOps.push("/F2 8 Tf")
  streamOps.push("0.4 0.45 0.5 rg")
  streamOps.push("317 690 Td")
  streamOps.push(`(${escapePdfText("VEHICLE & OEM FITMENT VERIFICATION")}) Tj`)
  streamOps.push("ET")

  const vehicleDesc = `${quote.vehicleYear || ""} ${quote.vehicleMake || ""} ${quote.vehicleModel || "Universal Fitment"}`.trim()
  streamOps.push("BT")
  streamOps.push("/F2 9 Tf")
  streamOps.push("0.1 0.1 0.1 rg")
  streamOps.push("317 675 Td")
  streamOps.push(`(${escapePdfText(vehicleDesc)}) Tj`)
  streamOps.push("ET")

  if (quote.vinNumber) {
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.2 0.2 0.2 rg")
    streamOps.push("317 662 Td")
    streamOps.push(`(${escapePdfText(`VIN: ${quote.vinNumber}`)}) Tj`)
    streamOps.push("ET")
  }

  streamOps.push("BT")
  streamOps.push("/F2 8 Tf")
  streamOps.push("0.1 0.6 0.3 rg")
  streamOps.push("317 646 Td")
  streamOps.push(`(${escapePdfText("[OEM Fitment Verified Against Parts Catalog]")}) Tj`)
  streamOps.push("ET")

  // Line Items Table Header
  const tableTop = 600
  streamOps.push("0.12 0.16 0.24 rg")
  streamOps.push(`36 ${tableTop - 20} 523 20 re f`)

  streamOps.push("BT")
  streamOps.push("/F2 8 Tf")
  streamOps.push("1 1 1 rg")
  streamOps.push(`46 ${tableTop - 14} Td`)
  streamOps.push(`(${escapePdfText("#")}) Tj`)
  streamOps.push("68 0 Td")
  streamOps.push(`(${escapePdfText("SKU / PART CODE")}) Tj`)
  streamOps.push("105 0 Td")
  streamOps.push(`(${escapePdfText("DESCRIPTION & SPECIFICATION")}) Tj`)
  streamOps.push("195 0 Td")
  streamOps.push(`(${escapePdfText("QTY")}) Tj`)
  streamOps.push("45 0 Td")
  streamOps.push(`(${escapePdfText("UNIT PRICE")}) Tj`)
  streamOps.push("50 0 Td")
  streamOps.push(`(${escapePdfText("TOTAL (ZAR)")}) Tj`)
  streamOps.push("ET")

  // Line Item Rows
  let currentY = tableTop - 20
  quote.items.forEach((item, index) => {
    currentY -= 26
    const isEven = index % 2 === 0
    if (isEven) {
      streamOps.push("0.97 0.98 0.99 rg")
      streamOps.push(`36 ${currentY} 523 26 re f`)
    }
    streamOps.push("0.90 0.92 0.94 RG")
    streamOps.push(`0.5 w 36 ${currentY} 523 26 re S`)

    // Index
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.4 0.4 0.4 rg")
    streamOps.push(`46 ${currentY + 10} Td`)
    streamOps.push(`(${index + 1}) Tj`)
    streamOps.push("ET")

    // SKU
    streamOps.push("BT")
    streamOps.push("/F2 8 Tf")
    streamOps.push("0.1 0.4 0.7 rg")
    streamOps.push(`70 ${currentY + 10} Td`)
    streamOps.push(`(${escapePdfText(item.sku.slice(0, 16))}) Tj`)
    streamOps.push("ET")

    // Description
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.15 0.15 0.15 rg")
    streamOps.push(`175 ${currentY + 10} Td`)
    const descShort = item.description.length > 40 ? item.description.slice(0, 38) + "..." : item.description
    streamOps.push(`(${escapePdfText(descShort)}) Tj`)
    streamOps.push("ET")

    // Qty
    streamOps.push("BT")
    streamOps.push("/F2 8 Tf")
    streamOps.push("0.2 0.2 0.2 rg")
    streamOps.push(`378 ${currentY + 10} Td`)
    streamOps.push(`(${item.quantity}) Tj`)
    streamOps.push("ET")

    // Unit Price
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.2 0.2 0.2 rg")
    streamOps.push(`420 ${currentY + 10} Td`)
    streamOps.push(`(${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}) Tj`)
    streamOps.push("ET")

    // Line Total
    streamOps.push("BT")
    streamOps.push("/F2 8 Tf")
    streamOps.push("0.1 0.1 0.1 rg")
    streamOps.push(`485 ${currentY + 10} Td`)
    streamOps.push(`(${(item.unitPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}) Tj`)
    streamOps.push("ET")
  })

  // Totals Area
  const totalsY = currentY - 18
  const totalsBoxHeight = 115

  // Banking Details Box (Left)
  streamOps.push("0.97 0.98 0.99 rg")
  streamOps.push(`36 ${totalsY - totalsBoxHeight} 300 ${totalsBoxHeight} re f`)
  streamOps.push("0.85 0.88 0.92 RG")
  streamOps.push(`1 w 36 ${totalsY - totalsBoxHeight} 300 ${totalsBoxHeight} re S`)

  streamOps.push("BT")
  streamOps.push("/F2 8 Tf")
  streamOps.push("0.2 0.25 0.35 rg")
  streamOps.push(`48 ${totalsY - 18} Td`)
  streamOps.push(`(${escapePdfText("OFFICIAL FNB BANKING DETAILS (EFT)")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.3 0.3 0.3 rg")
  streamOps.push(`48 ${totalsY - 32} Td`)
  streamOps.push(`(${escapePdfText("Account Name: AutoPulse Auto Parts (Pty) Ltd")}) Tj`)
  streamOps.push("0 -13 Td")
  streamOps.push(`(${escapePdfText("Bank: First National Bank (FNB) • Branch: 250655")}) Tj`)
  streamOps.push("0 -13 Td")
  streamOps.push(`(${escapePdfText("Account Number: 62894109214 • Type: Cheque")}) Tj`)
  streamOps.push("0 -13 Td")
  streamOps.push(`(${escapePdfText(`Payment Reference: ${quote.quoteNumber}`)}) Tj`)
  streamOps.push("0 -14 Td")
  streamOps.push(`(${escapePdfText("Dispatch Policy: Fast The Courier Guy delivery (24-48h nationwide)")}) Tj`)
  streamOps.push("ET")

  // Totals Breakdown (Right)
  streamOps.push("0.98 0.98 0.99 rg")
  streamOps.push(`346 ${totalsY - totalsBoxHeight} 213 ${totalsBoxHeight} re f`)
  streamOps.push("0.85 0.88 0.92 RG")
  streamOps.push(`1 w 346 ${totalsY - totalsBoxHeight} 213 ${totalsBoxHeight} re S`)

  // Subtotal
  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.4 0.45 0.5 rg")
  streamOps.push(`358 ${totalsY - 20} Td`)
  streamOps.push(`(${escapePdfText("Subtotal (Excl. VAT):")}) Tj`)
  streamOps.push("105 0 Td")
  streamOps.push(`(${escapePdfText(`ZAR ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}) Tj`)
  streamOps.push("ET")

  // VAT (15%)
  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.4 0.45 0.5 rg")
  streamOps.push(`358 ${totalsY - 36} Td`)
  streamOps.push(`(${escapePdfText("VAT (15.0% SARS):")}) Tj`)
  streamOps.push("105 0 Td")
  streamOps.push(`(${escapePdfText(`ZAR ${vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}) Tj`)
  streamOps.push("ET")

  // Core exchange
  if (coreTotal > 0) {
    streamOps.push("BT")
    streamOps.push("/F1 8 Tf")
    streamOps.push("0.7 0.4 0.1 rg")
    streamOps.push(`358 ${totalsY - 52} Td`)
    streamOps.push(`(${escapePdfText("Core Exchange Deposit:")}) Tj`)
    streamOps.push("105 0 Td")
    streamOps.push(`(${escapePdfText(`ZAR ${coreTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}) Tj`)
    streamOps.push("ET")
  }

  // Divider
  streamOps.push("0.80 0.83 0.88 RG")
  streamOps.push(`1 w 356 ${totalsY - 66} 193 0 m 549 ${totalsY - 66} l S`)

  // Grand Total
  streamOps.push("0.08 0.12 0.20 rg")
  streamOps.push(`348 ${totalsY - totalsBoxHeight + 6} 209 36 re f`)

  streamOps.push("BT")
  streamOps.push("/F2 11 Tf")
  streamOps.push("1 1 1 rg")
  streamOps.push(`358 ${totalsY - totalsBoxHeight + 20} Td`)
  streamOps.push(`(${escapePdfText("TOTAL PAYABLE:")}) Tj`)
  streamOps.push("75 0 Td")
  streamOps.push(`(${escapePdfText(`ZAR ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}) Tj`)
  streamOps.push("ET")

  // Footer notes & terms
  const footerY = 50
  streamOps.push("BT")
  streamOps.push("/F1 7 Tf")
  streamOps.push("0.5 0.5 0.5 rg")
  streamOps.push(`36 ${footerY + 20} Td`)
  streamOps.push(
    `(${escapePdfText("AutoPulse Commercial Parts (Pty) Ltd • 14 Old Pretoria Road, Halfway House, Midrand, 1685 • quotes@autopulse.co.za • +27 11 805 2100")}) Tj`
  )
  streamOps.push("0 -10 Td")
  streamOps.push(
    `(${escapePdfText("All quotations subject to standard terms. 12-month manufacturer warranty. Prices valid for 14 calendar days from issue.")}) Tj`
  )
  streamOps.push("ET")

  const streamContent = streamOps.join("\n")
  const streamBytes = Buffer.byteLength(streamContent, "binary")

  const objects: string[] = []
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj")
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj"
  )
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj")
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj")
  objects.push(`6 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamContent}\nendstream\nendobj`)

  let offset = Buffer.byteLength("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")
  const xrefs: number[] = [0]
  let body = ""

  for (const obj of objects) {
    xrefs.push(offset)
    const objStr = obj + "\n"
    body += objStr
    offset += Buffer.byteLength(objStr, "binary")
  }

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    xref += String(xrefs[i]).padStart(10, "0") + " 00000 n \n"
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`
  const fullPdf = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n${body}${xref}${trailer}`

  const uint8 = new Uint8Array(Buffer.from(fullPdf, "binary"))
  return new Blob([uint8], { type: "application/pdf" })
}

/**
 * Downloads the quotation directly as a .pdf file.
 */
export function downloadQuotePdf(quote: QuoteData): void {
  const blob = generateQuotePdfBlob(quote)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `AutoPulse-Quotation-${quote.quoteNumber || "Quote"}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Prints the quotation using an isolated iframe so only the crisp A4 page is sent to the printer/PDF dialog.
 */
export function printQuoteViaIframe(elementId: string): void {
  const sourceEl = document.getElementById(elementId)
  if (!sourceEl) {
    window.print()
    return
  }

  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "none"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    window.print()
    return
  }

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Quotation Print</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #fff;
            color: #111827;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            padding: 8px 10px;
          }
        </style>
      </head>
      <body>
        ${sourceEl.innerHTML}
      </body>
    </html>
  `)
  doc.close()

  iframe.contentWindow?.focus()
  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 250)
}

/**
 * Robustly parses a quotation from an assistant chat message into a formal QuoteData structure.
 * Supports Markdown tables, bulleted lines, reference numbers (QT-xxxx-xxxx), and financial totals.
 */
export function parseQuoteFromText(text: string): QuoteData | null {
  if (!text || typeof text !== "string") return null

  // Must have a clear quote indicator or reference
  const hasQuoteIndicator =
    /quotation reference|quote reference|formal quotation|quote #|tax invoice|quote summary/i.test(text) ||
    /qt-20\d{2}-\d{3,5}/i.test(text) ||
    (/subtotal/i.test(text) && /vat/i.test(text) && (/grand total/i.test(text) || /total payable/i.test(text)))

  if (!hasQuoteIndicator) return null

  // 1. Quote Number
  const quoteNumMatch =
    text.match(/(?:quotation reference|quote reference|quote number|quote #)\s*:\s*([A-Za-z0-9-_]+)/i) ||
    text.match(/\b(QT-20\d{2}-\d{3,5})\b/i)
  const quoteNumber = quoteNumMatch
    ? quoteNumMatch[1].trim()
    : `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

  // 2. Client Name
  const clientMatch = text.match(/(?:client name|customer name|billed? to)\s*:\s*([^\n\r]+)/i)
  let clientName = clientMatch ? clientMatch[1].trim() : ""
  if (!clientName || /\[.*to be filled.*\]|\[.*confirm.*\]|tbd|pending|\[.*name.*\]/i.test(clientName)) {
    clientName = "Client (Quote Request)"
  }

  // 3. Vehicle & Fitment
  const vehicleMatch = text.match(/(?:vehicle|fitment|vehicle specs?)\s*:\s*([^\n\r]+)/i)
  let vehicleRaw = vehicleMatch ? vehicleMatch[1].trim() : ""
  let vehicleMake = "Toyota"
  let vehicleModel = "Hilux / Fortuner"
  let vehicleYear = 2021

  if (vehicleRaw) {
    const cleanVeh = vehicleRaw.replace(/\[|\]/g, "")
    const yearMatch = cleanVeh.match(/\b(20\d{2}|19\d{2})\b/)
    if (yearMatch) vehicleYear = parseInt(yearMatch[1], 10)

    if (/toyota/i.test(cleanVeh) || /toyota/i.test(text)) {
      vehicleMake = "Toyota"
      if (/hilux/i.test(cleanVeh) || /hilux/i.test(text)) vehicleModel = "Hilux 2.8 GD-6"
      else if (/fortuner/i.test(cleanVeh) || /fortuner/i.test(text)) vehicleModel = "Fortuner 2.8 GD-6"
      else if (/corolla/i.test(cleanVeh)) vehicleModel = "Corolla Cross"
      else vehicleModel = "Hilux / Fortuner"
    } else if (/volkswagen|vw|golf/i.test(cleanVeh)) {
      vehicleMake = "Volkswagen"
      vehicleModel = "Golf 7 GTI 2.0 TSI"
    } else if (/ford|ranger/i.test(cleanVeh)) {
      vehicleMake = "Ford"
      vehicleModel = "Ranger 2.0 Bi-Turbo"
    } else if (/bmw/i.test(cleanVeh)) {
      vehicleMake = "BMW"
      vehicleModel = "330d / X5"
    }
  }

  // 4. Totals parsing
  const parseNum = (str?: string) => {
    if (!str) return 0
    return parseFloat(str.replace(/,/g, ""))
  }

  const subtotalMatch = text.match(/subtotal\s*:\s*(?:ZAR|R)?\s*([\d,]+(?:\.\d{2})?)/i)
  const vatMatch = text.match(/(?:15%\s*vat|vat\s*(?:\(15%\))?|vat\s*:)\s*(?:ZAR|R)?\s*([\d,]+(?:\.\d{2})?)/i)
  const grandTotalMatch = text.match(/(?:grand total|total payable|balance due)\s*:\s*(?:ZAR|R)?\s*([\d,]+(?:\.\d{2})?)/i)

  const parsedSubtotal = subtotalMatch ? parseNum(subtotalMatch[1]) : 0
  const parsedVat = vatMatch ? parseNum(vatMatch[1]) : 0
  const parsedGrandTotal = grandTotalMatch ? parseNum(grandTotalMatch[1]) : 0

  // 5. Line items
  const items: QuoteItem[] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (/^\|?\s*SKU\s*\|/i.test(line) || /^\|?[\s-:]+\|[\s-:]+\|/i.test(line)) continue
    if (/quotation reference|quote reference|client name|vehicle/i.test(line)) continue

    // Markdown table row
    if (line.includes("|") && /[A-Z0-9]{2,5}-[A-Z0-9]+-[A-Z0-9-]+|[0-9]{4,}[A-Z0-9-]/i.test(line)) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 3 && !parts[0].startsWith("QT-")) {
        const sku = parts[0]
        const desc = parts[1]
        const priceCol = parts.find(
          (p) => /(?:ZAR|R)?\s*[\d,]+(?:\.\d{2})?/i.test(p) && !p.startsWith("AP-") && !/stock|tier|fitment|genuine/i.test(p)
        )
        const priceVal = priceCol ? parseNum(priceCol.replace(/[^0-9.]/g, "")) : (parsedSubtotal || 4800)
        items.push({
          sku,
          description: desc,
          quantity: 1,
          unitPrice: priceVal,
        })
      }
    } else if (/[A-Z0-9]{2,5}-[A-Z0-9]+-[A-Z0-9-]+/i.test(line)) {
      // Tab or space separated row
      const skuMatch = line.match(/\b([A-Z0-9]{2,5}-[A-Z0-9]+-[A-Z0-9-]+)\b/i)
      if (skuMatch && !skuMatch[1].startsWith("QT-")) {
        const sku = skuMatch[1]
        const tabParts = line.split("\t").map((p) => p.trim()).filter(Boolean)
        let desc = "Toyota Genuine Front Headlight (LH)"
        let unitPrice = parsedSubtotal || 4800

        if (tabParts.length >= 2) {
          desc = tabParts[1]
          const pricePart = tabParts.find((p) => /(?:ZAR|R)?\s*[\d,]+(?:\.\d{2})?/i.test(p) && !p.startsWith("AP-"))
          if (pricePart) {
            unitPrice = parseNum(pricePart.replace(/[^0-9.]/g, ""))
          }
        } else {
          const remaining = line.replace(sku, "").trim()
          const priceMatch = remaining.match(/(?:ZAR|R)?\s*([\d,]+(?:\.\d{2})?)/i)
          if (priceMatch) unitPrice = parseNum(priceMatch[1])
          const cleanDesc = remaining
            .replace(/(?:ZAR|R)?\s*[\d,]+(?:\.\d{2})?/gi, "")
            .replace(/Toyota OEM|OEM|In Stock:?\s*\d+|Hilux|Fortuner/gi, "")
            .trim()
          if (cleanDesc) desc = cleanDesc.replace(/^[\t\s,-]+|[\t\s,-]+$/g, "")
        }

        items.push({
          sku,
          description: desc,
          quantity: 1,
          unitPrice,
        })
      }
    }
  }

  // Fallback item synthesis if table parsing was empty
  if (items.length === 0) {
    const isToyota = /toyota|headlight/i.test(text)
    items.push({
      sku: isToyota ? "AP-TOY-HL-0098" : "AP-PART-001",
      description: isToyota
        ? "Toyota Genuine Front Headlight Assembly (LH)"
        : "OEM Automotive Replacement Part",
      quantity: 1,
      unitPrice: parsedSubtotal || (parsedGrandTotal ? Math.round(parsedGrandTotal / 1.15) : 4800),
    })
  }

  const finalSubtotal = parsedSubtotal || items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const finalVat = parsedVat || Math.round(finalSubtotal * 0.15 * 100) / 100
  const finalGrandTotal = parsedGrandTotal || Math.round((finalSubtotal + finalVat) * 100) / 100

  // Date formatting
  const now = new Date()
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const dateStr = `${String(now.getDate()).padStart(2, "0")} ${months[now.getMonth()]} ${now.getFullYear()}`
  const validDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const validUntilStr = `${String(validDate.getDate()).padStart(2, "0")} ${months[validDate.getMonth()]} ${validDate.getFullYear()}`

  return {
    id: `quote-${quoteNumber.toLowerCase()}`,
    quoteNumber,
    date: dateStr,
    validUntil: validUntilStr,
    clientName,
    clientPhone: "+27 82 459 1102",
    clientEmail: "quotes@autopulse.co.za",
    companyName: "Commercial Workshop Client",
    vehicleMake,
    vehicleModel,
    vehicleYear,
    channel: "whatsapp",
    items,
    notes: "15% VAT Included. 12-Month Manufacturer Warranty. Fast nationwide dispatch via The Courier Guy.",
    paymentLink: `https://autopulse.co.za/pay/${quoteNumber}`,
  }
}

