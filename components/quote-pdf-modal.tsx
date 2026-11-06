"use client"

import * as React from "react"
import { useAction } from "convex/react"
import {
  FileTextIcon,
  PrinterIcon,
  DownloadIcon,
  SendIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  CarIcon,
  ShieldCheckIcon,
  ClockIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  Share2Icon,
  ExternalLinkIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import {
  DEFAULT_SAMPLE_QUOTE,
  downloadQuotePdf,
  generateQuotePdfBlob,
  printQuoteViaIframe,
} from "@/lib/quote-pdf"

export interface QuoteItem {
  sku: string
  description: string
  quantity: number
  unitPrice: number
  coreDeposit?: number
}

export interface QuoteData {
  id?: string
  quoteNumber: string
  date: string
  validUntil: string
  clientName: string
  clientPhone: string
  clientEmail: string
  companyName?: string
  vehicleMake?: string
  vehicleModel?: string
  vehicleYear?: number
  vinNumber?: string
  channel: "whatsapp" | "email" | "dashboard"
  items: QuoteItem[]
  notes?: string
  paymentLink?: string
}

export function QuotePdfModal({
  open,
  onOpenChange,
  quote: rawQuote,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quote: QuoteData | null
}) {
  const quote = rawQuote ?? DEFAULT_SAMPLE_QUOTE

  const sendPdfToContactAction = useAction(api.whapi.sendPdfToContact)
  const [activeTab, setActiveTab] = React.useState<"preview" | "whatsapp" | "followup">("preview")
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [isSendingWhatsApp, setIsSendingWhatsApp] = React.useState(false)
  const [hasCopiedLink, setHasCopiedLink] = React.useState(false)
  const [followUpPeriod, setFollowUpPeriod] = React.useState<"24h" | "48h" | "72h">("24h")

  const subtotal = quote.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const coreTotal = quote.items.reduce((s, it) => s + (it.coreDeposit || 0) * it.quantity, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const grandTotal = Math.round((subtotal + vat + coreTotal) * 100) / 100

  const handleDownload = () => {
    setIsDownloading(true)
    try {
      downloadQuotePdf(quote)
      toast.add({
        type: "success",
        title: "PDF Downloaded",
        description: `Saved AutoPulse-Quotation-${quote.quoteNumber}.pdf`,
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not generate PDF",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handlePrint = () => {
    try {
      printQuoteViaIframe("quotation-a4-sheet")
    } catch {
      window.print()
    }
  }

  const copyPaymentLink = async () => {
    const link = quote.paymentLink || `https://autopulse.co.za/pay/${quote.quoteNumber}`
    await navigator.clipboard.writeText(link)
    setHasCopiedLink(true)
    toast.add({
      type: "success",
      title: "Link Copied",
      description: "Payment and verification link copied to clipboard.",
    })
    setTimeout(() => setHasCopiedLink(false), 2000)
  }

  const handleSendPdfToWhatsApp = async () => {
    setIsSendingWhatsApp(true)
    const filename = `AutoPulse-Quotation-${quote.quoteNumber}.pdf`
    const cleanPhone = quote.clientPhone.replace(/[^0-9]/g, "")

    try {
      const pdfBlob = generateQuotePdfBlob(quote)

      // 1. Mobile & modern browsers with native File Sharing (iOS, Android, Chrome/Edge)
      const file = new File([pdfBlob], filename, { type: "application/pdf" })
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `AutoPulse Quotation ${quote.quoteNumber}`,
            text: `AutoPulse Official Quotation ${quote.quoteNumber} for ${quote.clientName} (ZAR ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})`,
          })
          toast.add({
            type: "success",
            title: "PDF Attachment Shared",
            description: `Quotation PDF loaded into WhatsApp ready to send!`,
          })
          return
        } catch (shareErr) {
          if ((shareErr as Error).name !== "AbortError") {
            console.warn("Navigator share error:", shareErr)
          } else {
            return
          }
        }
      }

      // 2. Automated Gateway Dispatch via Whapi if phone is available
      let whapiSuccess = false
      if (cleanPhone) {
        try {
          const arrayBuffer = await pdfBlob.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ""
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)

          const res = await sendPdfToContactAction({
            phone: cleanPhone,
            pdfBase64: base64,
            filename,
            caption: `AutoPulse Official Quotation ${quote.quoteNumber} • Total: ZAR ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          })

          if (res.success) {
            whapiSuccess = true
            toast.add({
              type: "success",
              title: "PDF Dispatched via WhatsApp",
              description: `Directly sent ${filename} to ${quote.clientPhone}!`,
            })
          }
        } catch {
          // Whapi token not configured or network error; fall back to Web WhatsApp attachment flow
        }
      }

      // 3. Desktop browser fallback: download the PDF file and open WhatsApp conversation
      if (!whapiSuccess) {
        downloadQuotePdf(quote)
        const waUrl = cleanPhone
          ? `https://web.whatsapp.com/send?phone=${cleanPhone}`
          : `https://web.whatsapp.com/`
        window.open(waUrl, "_blank", "noopener,noreferrer")
        toast.add({
          type: "success",
          title: "Quotation PDF Ready",
          description: `Saved ${filename} to Downloads. Attach it directly to WhatsApp!`,
        })
      }
    } catch (err) {
      toast.add({
        type: "error",
        title: "Dispatch Failed",
        description: err instanceof Error ? err.message : "Error preparing PDF dispatch",
      })
    } finally {
      setIsSendingWhatsApp(false)
    }
  }

  const getFollowUpTemplate = (period: "24h" | "48h" | "72h") => {
    if (period === "24h") {
      return `Hi ${quote.clientName}, following up on your parts quote *${quote.quoteNumber}* (ZAR ${grandTotal.toLocaleString()}) for your ${quote.vehicleMake || "vehicle"}.\n\nOur Midrand warehouse currently has this stock allocated for you. Would you like us to proceed with dispatch today?\n\nOrder link: ${quote.paymentLink || "https://autopulse.co.za"}`
    }
    if (period === "48h") {
      return `Hi ${quote.clientName}, technical fitment for your ${quote.vehicleMake || "vehicle"} parts under quote *${quote.quoteNumber}* has been verified by our OEM database.\n\nLet us know if you have any questions or reply to confirm courier delivery.`
    }
    return `URGENT NOTICE: Hi ${quote.clientName}, quote *${quote.quoteNumber}* is due to expire. To lock in current pricing and avoid stock reservation release, please confirm payment here:\n\n${quote.paymentLink || "https://autopulse.co.za"}`
  }

  const [followUpMsg, setFollowUpMsg] = React.useState(getFollowUpTemplate("24h"))

  const handleSendWhatsApp = (text: string) => {
    const cleanPhone = quote.clientPhone.replace(/[^0-9]/g, "")
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, "_blank", "noopener,noreferrer")
    toast.add({
      type: "success",
      title: "WhatsApp Opened",
      description: `Follow-up draft loaded for ${quote.clientName} (${quote.clientPhone}).`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full sm:w-[96vw] max-w-full sm:max-w-6xl md:max-w-6xl lg:max-w-7xl h-full sm:h-[94vh] max-h-[100dvh] sm:max-h-[960px] flex flex-col bg-zinc-950 border-0 sm:border sm:border-zinc-800/90 text-zinc-100 p-0 shadow-2xl rounded-none sm:rounded-2xl overflow-hidden focus:outline-none"
        style={{ maxWidth: "min(96vw, 1340px)", width: "100%" }}
      >
        {/* Top Control Bar (Responsive) */}
        <div className="border-b border-zinc-800/90 px-4 sm:px-6 py-3 bg-zinc-900/95 backdrop-blur shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Left Header Title / Badges */}
            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/logo.svg"
                  alt="AutoPulse"
                  className="size-8 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 shrink-0"
                />
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="font-mono">{quote.quoteNumber}</span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-200 border border-zinc-700/60">
                      ZAR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20 hidden md:inline-flex items-center gap-1">
                      <ShieldCheckIcon className="size-2.5" /> SARS VAT 15%
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-zinc-400 truncate">
                    {quote.clientName} • {quote.vehicleYear || ""} {quote.vehicleMake || ""} {quote.vehicleModel || ""}
                  </DialogDescription>
                </div>
              </div>

              {/* Mobile Close Button */}
              <DialogClose className="sm:hidden flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer">
                <XIcon className="size-4" />
              </DialogClose>
            </div>

            {/* Right Side: View Switcher & Action Buttons */}
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto flex-wrap">
              {/* Segmented view controls */}
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-950/90 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${activeTab === "preview"
                      ? "bg-zinc-800 text-zinc-100 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                  PDF Document
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("whatsapp")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${activeTab === "whatsapp"
                      ? "bg-zinc-800 text-emerald-400 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("followup")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${activeTab === "followup"
                      ? "bg-zinc-800 text-amber-400 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                  Follow-ups
                </button>
              </div>

              {/* Direct Actions */}
              <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                <Button
                  size="sm"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="h-8 gap-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs shadow cursor-pointer px-2.5 sm:px-3"
                >
                  <DownloadIcon className="size-3.5" />
                  <span>Download PDF</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrint}
                  className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-xs cursor-pointer px-2.5 sm:px-3"
                >
                  <PrinterIcon className="size-3.5" />
                  <span className="hidden md:inline">Print / Save</span>
                </Button>

                {/* Desktop Close Button */}
                <DialogClose className="hidden sm:flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer">
                  <XIcon className="size-4" />
                </DialogClose>
              </div>
            </div>
          </div>
        </div>

        {/* Viewport Content Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-2 sm:p-6 md:p-8 flex justify-center items-start">
          {/* TAB 1: AUTHENTIC A4 PDF DOCUMENT VIEW */}
          {activeTab === "preview" && (
            <div className="w-full max-w-4xl flex flex-col items-center">
              {/* Document Sheet Floating on Studio Backdrop */}
              <div
                id="quotation-a4-sheet"
                className="w-full bg-white text-zinc-900 rounded-sm shadow-2xl ring-1 ring-zinc-300/80 p-4 sm:p-8 md:p-12 font-sans select-text relative flex flex-col justify-between"
                style={{ minHeight: "1050px" }}
              >
                {/* PDF Header: Brand & Document Identity */}
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start pb-5 sm:pb-6 border-b border-zinc-200 gap-4">
                    <div className="flex items-start gap-3.5">
                      <img
                        src="/logo.svg"
                        alt="AutoPulse Logo"
                        className="size-12 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800 shadow-sm shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-950">
                            AUTOPULSE<span className="text-sky-600">.AI</span>
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-300">
                            Official Quotation
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-zinc-700">
                          AutoPulse Commercial Parts &amp; Fleet Logistics (Pty) Ltd
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 space-y-0.5">
                          <p>14 Old Pretoria Road, Halfway House, Midrand, 1685</p>
                          <p>VAT Reg: 4890219481 • Co Reg: 2021/489021/07</p>
                          <p>Email: quotes@autopulse.co.za • Tel: +27 11 805 2100</p>
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right bg-zinc-50 sm:bg-transparent p-3 sm:p-0 rounded-lg border sm:border-0 border-zinc-200 w-full sm:w-auto">
                      <div className="text-lg font-mono font-bold text-zinc-950">
                        {quote.quoteNumber}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">
                        Date: <span className="font-semibold text-zinc-800">{quote.date}</span>
                      </div>
                      <div className="text-xs text-zinc-600">
                        Valid Until: <span className="font-semibold text-zinc-800">{quote.validUntil}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 flex items-center sm:justify-end gap-1">
                        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                        <span>Status: Pending Fulfillment</span>
                      </div>
                    </div>
                  </div>

                  {/* Two Cards: Client & Vehicle Fitment */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 my-4 sm:my-6">
                    {/* Client Box */}
                    <div className="p-3.5 sm:p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Client Details / Bill To
                      </div>
                      <div className="text-sm font-bold text-zinc-950">
                        {quote.clientName}
                      </div>
                      {quote.companyName && (
                        <div className="text-xs font-medium text-sky-700 mt-0.5">
                          {quote.companyName}
                        </div>
                      )}
                      <div className="text-xs text-zinc-600 mt-2 space-y-0.5">
                        <p>Phone: {quote.clientPhone}</p>
                        {quote.clientEmail && <p>Email: {quote.clientEmail}</p>}
                        <p className="text-zinc-400">Account Ref: CUST-ZA-{quote.quoteNumber.replace(/[^0-9]/g, "").slice(-4) || "8812"}</p>
                      </div>
                    </div>

                    {/* Vehicle & Fitment Box */}
                    <div className="p-3.5 sm:p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Vehicle Specification &amp; Fitment
                      </div>
                      <div className="text-sm font-bold text-zinc-950 flex items-center gap-1.5">
                        <CarIcon className="size-4 text-sky-700 shrink-0" />
                        <span>
                          {quote.vehicleYear || ""} {quote.vehicleMake || "Universal Vehicle"} {quote.vehicleModel || ""}
                        </span>
                      </div>
                      {quote.vinNumber && (
                        <div className="text-xs font-mono text-zinc-700 mt-1">
                          VIN: <span className="font-semibold text-zinc-900">{quote.vinNumber}</span>
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1 font-medium bg-emerald-50 border border-emerald-200/60 rounded px-2 py-1 w-fit">
                        <CheckCircle2Icon className="size-3 text-emerald-600 shrink-0" />
                        <span>OEM Fitment Verified Against Parts Catalog</span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile swipe hint */}
                  <div className="sm:hidden flex items-center justify-end text-[10px] text-zinc-400 mb-1 gap-1">
                    <span>Swipe table horizontally to view all columns &rarr;</span>
                  </div>

                  {/* Line Items Table with Horizontal Scroll Support */}
                  <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 mb-6">
                    <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-100 text-zinc-700 border-b border-zinc-200 font-semibold text-[11px]">
                          <th className="py-2.5 px-3 w-8">#</th>
                          <th className="py-2.5 px-3 w-36">SKU / Code</th>
                          <th className="py-2.5 px-3">Description &amp; Specifications</th>
                          <th className="py-2.5 px-3 text-center w-12">Qty</th>
                          <th className="py-2.5 px-3 text-right w-28">Unit (ZAR)</th>
                          <th className="py-2.5 px-3 text-right w-28">Total (ZAR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 text-zinc-800">
                        {quote.items.map((item, index) => (
                          <tr key={index} className={index % 2 === 1 ? "bg-zinc-50/50" : "bg-white"}>
                            <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">{index + 1}</td>
                            <td className="py-3 px-3 font-mono font-medium text-sky-800">{item.sku}</td>
                            <td className="py-3 px-3 font-medium text-zinc-900">
                              <div>{item.description}</div>
                              {item.coreDeposit ? (
                                <div className="text-[10px] text-amber-700 mt-0.5">
                                  + ZAR {item.coreDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })} Core Deposit (Fully Refundable)
                                </div>
                              ) : null}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-semibold">{item.quantity}</td>
                            <td className="py-3 px-3 text-right font-mono text-zinc-700">
                              {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-zinc-950">
                              {(item.unitPrice * item.quantity).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Banking Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 pt-4 border-t border-zinc-200">
                    {/* Banking Details (Left) */}
                    <div className="text-xs text-zinc-600 space-y-2">
                      <div className="font-bold text-zinc-900 text-xs">FNB Commercial Banking Details (EFT):</div>
                      <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 font-mono text-[11px] space-y-1">
                        <p><span className="text-zinc-500">Bank:</span> First National Bank (FNB)</p>
                        <p><span className="text-zinc-500">Account Name:</span> AutoPulse Auto Parts (Pty) Ltd</p>
                        <p><span className="text-zinc-500">Account No:</span> 62894109214</p>
                        <p><span className="text-zinc-500">Branch Code:</span> 250655 (Midrand)</p>
                        <p><span className="text-zinc-500">Reference:</span> <strong className="text-zinc-900">{quote.quoteNumber}</strong></p>
                      </div>

                      <div className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                        • 12-Month manufacturer warranty on mechanical and electronic parts.<br />
                        • Express courier dispatch via The Courier Guy (24–48h nationwide).<br />
                        • Payment must reflect prior to warehouse parts dispatch.
                      </div>
                    </div>

                    {/* Totals Breakdown (Right) */}
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 text-zinc-600">
                        <span>Subtotal (Excl. VAT):</span>
                        <span className="font-mono text-zinc-900 font-medium">
                          ZAR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-zinc-600">
                        <span>VAT (15.0% SARS Statutory):</span>
                        <span className="font-mono text-zinc-900 font-medium">
                          ZAR {vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {coreTotal > 0 && (
                        <div className="flex justify-between py-1 text-amber-700">
                          <span>Core Exchange Deposit (Refundable):</span>
                          <span className="font-mono font-medium">
                            ZAR {coreTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 pb-1 border-t-2 border-zinc-900 text-sm font-bold text-zinc-950">
                        <span>TOTAL PAYABLE (ZAR):</span>
                        <span className="font-mono text-base font-black text-zinc-950">
                          ZAR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Payment Link Card */}
                      <div className="mt-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-zinc-900">Online Payment &amp; Card Portal</div>
                          <div className="text-[10px] text-zinc-500 truncate max-w-44">
                            {quote.paymentLink || `autopulse.co.za/pay/${quote.quoteNumber}`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={copyPaymentLink}
                          className="h-7 text-[11px] border-zinc-300 text-zinc-800 hover:bg-zinc-100 gap-1 shrink-0"
                        >
                          {hasCopiedLink ? <CheckIcon className="size-3 text-emerald-600" /> : <CopyIcon className="size-3" />}
                          <span>{hasCopiedLink ? "Copied" : "Copy"}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PDF Footer Authentication */}
                <div className="pt-6 sm:pt-8 mt-6 sm:mt-8 border-t border-zinc-200 flex flex-col sm:flex-row justify-between items-center text-[10px] text-zinc-400 gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheckIcon className="size-3.5 text-zinc-500" />
                    <span>AutoPulse Verified Document • SHA256 Signature Valid</span>
                  </div>
                  <div>Page 1 of 1 • System Generated by AutoPulse Ops Engine</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP DOCUMENT DISPATCH */}
          {activeTab === "whatsapp" && (
            <div className="w-full max-w-2xl space-y-5 px-1 sm:px-0">
              {/* Header card */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <MessageSquareIcon className="size-4" />
                  WhatsApp Quotation PDF Attachment Dispatch
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Send the official branded PDF file directly to <strong>{quote.clientName}</strong> ({quote.clientPhone}) as an authentic WhatsApp document attachment.
                </p>
              </div>

              {/* Realistic WhatsApp Document Message Preview */}
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5 shadow-2xl">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>WhatsApp Document Attachment Preview</span>
                  <span className="text-[10px] text-emerald-400 font-normal flex items-center gap-1">
                    <CheckCircle2Icon className="size-3" /> Ready to Attach
                  </span>
                </div>

                {/* WhatsApp Chat Bubble */}
                <div className="max-w-md mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-lg text-zinc-100 space-y-3">
                  {/* Top document attachment bar */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                    <div className="flex size-11 items-center justify-center rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 shrink-0">
                      <FileTextIcon className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        AutoPulse-Quotation-{quote.quoteNumber}.pdf
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                        <span>1 page</span>
                        <span>•</span>
                        <span>PDF Document</span>
                        <span>•</span>
                        <span className="text-emerald-400">Verified</span>
                      </div>
                    </div>
                  </div>

                  {/* Caption & payment details */}
                  <div className="text-xs text-zinc-300 space-y-1 pt-1 leading-relaxed">
                    <p className="font-semibold text-zinc-100">
                      AutoPulse Official Quotation • {quote.quoteNumber}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Client: {quote.clientName} {quote.companyName ? `(${quote.companyName})` : ""}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Vehicle: {quote.vehicleYear || ""} {quote.vehicleMake || ""} {quote.vehicleModel || ""}
                    </p>
                    <p className="text-xs font-mono font-bold text-emerald-400 pt-1">
                      Grand Total: ZAR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Incl. 15% VAT)
                    </p>
                  </div>

                  {/* Message bubble timestamp and ticks */}
                  <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500 pt-1">
                    <span>Just now</span>
                    <span className="text-sky-400 font-bold">✓✓</span>
                  </div>
                </div>
              </div>

              {/* Recipient Details & Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-xs text-zinc-400 flex items-center gap-1.5 w-full sm:w-auto">
                  <ShieldCheckIcon className="size-4 text-emerald-400 shrink-0" />
                  <span>Recipient: <strong>{quote.clientName}</strong> ({quote.clientPhone})</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownload}
                    className="h-10 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer gap-1.5 flex-1 sm:flex-initial"
                  >
                    <DownloadIcon className="size-3.5" />
                    <span>Download File</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={handleSendPdfToWhatsApp}
                    disabled={isSendingWhatsApp}
                    className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs cursor-pointer shadow-lg px-5 flex-1 sm:flex-initial"
                  >
                    {isSendingWhatsApp ? (
                      <span className="animate-spin size-3.5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Share2Icon className="size-4" />
                    )}
                    <span>Send PDF via WhatsApp</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CLIENT FOLLOW-UP ENGINE */}
          {activeTab === "followup" && (
            <div className="w-full max-w-2xl space-y-4 px-1 sm:px-0">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                  <ClockIcon className="size-4" />
                  Automated Quote Conversion &amp; Follow-up Sequences
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Strategic follow-ups sent before warehouse parts reservations expire.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(["24h", "48h", "72h"] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setFollowUpPeriod(period)
                      setFollowUpMsg(getFollowUpTemplate(period))
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${followUpPeriod === period
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    <div className="font-semibold text-xs capitalize">{period} Follow-up</div>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {period === "24h" ? "Stock hold" : period === "48h" ? "Fitment check" : "Expiry warning"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Follow-up Message Template</label>
                <textarea
                  value={followUpMsg}
                  onChange={(e) => setFollowUpMsg(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-200 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => handleSendWhatsApp(followUpMsg)}
                  className="w-full sm:w-auto h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs cursor-pointer px-4"
                >
                  <SendIcon className="size-3.5" />
                  Dispatch Follow-up
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
