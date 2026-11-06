import type { QuoteData } from "@/components/quote-pdf-modal"

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
 * Uses standard Type 1 fonts (Helvetica & Helvetica-Bold) for zero-dependency universal viewing.
 */
export function generateQuotePdfBlob(quote: QuoteData): Blob {
  const subtotal = quote.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const coreTotal = quote.items.reduce((s, it) => s + (it.coreDeposit || 0) * it.quantity, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const grandTotal = Math.round((subtotal + vat + coreTotal) * 100) / 100

  const streamOps: string[] = []

  // Top header bar (slate background)
  streamOps.push("0.08 0.12 0.20 rg") // Dark slate fill
  streamOps.push("36 756 523 58 re f")

  // AutoPulse Brand Emblem Logo Badge
  streamOps.push("0.15 0.22 0.35 rg")
  streamOps.push("46 766 38 38 re f")
  streamOps.push("0.32 0.86 0.84 rg") // Teal cyan accent
  streamOps.push("49 769 32 32 re f")
  streamOps.push("BT")
  streamOps.push("/F2 16 Tf")
  streamOps.push("0.06 0.09 0.16 rg")
  streamOps.push("56 780 Td")
  streamOps.push("(AP) Tj")
  streamOps.push("ET")

  // Company Brand text
  streamOps.push("BT")
  streamOps.push("/F2 16 Tf")
  streamOps.push("1 1 1 rg") // White text
  streamOps.push("92 788 Td")
  streamOps.push(`(${escapePdfText("AUTOPULSE AUTO PARTS")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.75 0.82 0.95 rg")
  streamOps.push("92 774 Td")
  streamOps.push(`(${escapePdfText("COMMERCIAL PARTS & FLEET LOGISTICS (PTY) LTD • VAT: 4890219481")}) Tj`)
  streamOps.push("ET")

  // Header Right: Quote Reference & Date
  streamOps.push("BT")
  streamOps.push("/F2 12 Tf")
  streamOps.push("1 1 1 rg")
  streamOps.push("420 788 Td")
  streamOps.push(`(${escapePdfText(quote.quoteNumber)}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.75 0.82 0.95 rg")
  streamOps.push("420 774 Td")
  streamOps.push(`(${escapePdfText(`Date: ${quote.date} • Valid 14 Days`)}) Tj`)
  streamOps.push("ET")

  // Subtitle / Document Type Banner
  streamOps.push("0.96 0.97 0.98 rg")
  streamOps.push("36 718 523 30 re f")
  streamOps.push("0.85 0.88 0.92 RG")
  streamOps.push("1 w 36 718 523 30 re S")

  streamOps.push("BT")
  streamOps.push("/F2 10 Tf")
  streamOps.push("0.1 0.15 0.25 rg")
  streamOps.push("48 730 Td")
  streamOps.push(`(${escapePdfText("OFFICIAL TAX INVOICE / PRICE ESTIMATE")}) Tj`)
  streamOps.push("ET")

  streamOps.push("BT")
  streamOps.push("/F1 8 Tf")
  streamOps.push("0.4 0.45 0.5 rg")
  streamOps.push("350 730 Td")
  streamOps.push(`(${escapePdfText(`Channel: ${quote.channel.toUpperCase()} • Status: PENDING FULFILLMENT`)}) Tj`)
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

