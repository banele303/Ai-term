"use client"

import * as React from "react"
import {
  DownloadIcon,
  FileTextIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  CarIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  type QuoteData,
  QuotePdfModal,
} from "@/components/quote-pdf-modal"
import { downloadQuotePdf } from "@/lib/quote-pdf"

export function ChatQuoteCard({ quote }: { quote: QuoteData }) {
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)

  const subtotal = quote.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const coreTotal = quote.items.reduce((s, it) => s + (it.coreDeposit || 0) * it.quantity, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const grandTotal = Math.round((subtotal + vat + coreTotal) * 100) / 100

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDownloading(true)
    try {
      downloadQuotePdf(quote)
      toast.add({
        type: "success",
        title: "PDF Quotation Downloaded",
        description: `Saved AutoPulse-Quotation-${quote.quoteNumber}.pdf to your device.`,
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Error creating PDF",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleOpenWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cleanPhone = quote.clientPhone.replace(/[^0-9]/g, "")
    const text = `Hi! Here is your official AutoPulse quotation *${quote.quoteNumber}* for ${quote.items[0]?.description || "parts"} (Total: ZAR ${grandTotal.toLocaleString()}).\nView & confirm: ${quote.paymentLink || "https://autopulse.co.za"}`
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, "_blank", "noopener,noreferrer")
    toast.add({
      type: "success",
      title: "WhatsApp Dispatch Opened",
      description: `Draft prepared for ${quote.clientName}.`,
    })
  }

  return (
    <>
      <div className="my-3 w-full max-w-xl rounded-xl border border-zinc-200/90 bg-white p-4 text-zinc-900 shadow-sm transition hover:shadow-md">
        {/* Top Header: Brand Emblem & Quote Reference */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.svg"
              alt="AutoPulse Logo"
              className="size-9 rounded-lg border border-zinc-200 bg-zinc-950 p-1.5 shadow-xs shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs tracking-tight text-zinc-950">
                  AUTOPULSE<span className="text-sky-600">.AI</span>
                </span>
                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200/60">
                  Official PDF Quote
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Modern White Tax Invoice • 15% VAT Compliant
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-block rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-800 border border-zinc-200">
              {quote.quoteNumber}
            </span>
            <div className="text-[10px] text-zinc-400 mt-1">
              Valid until {quote.validUntil}
            </div>
          </div>
        </div>

        {/* Content Body: Vehicle & Line Items Summary */}
        <div className="py-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-50/80 rounded-lg px-2.5 py-1.5 border border-zinc-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <CarIcon className="size-3.5 text-zinc-500 shrink-0" />
              <span className="font-medium text-zinc-800 truncate">
                {quote.vehicleYear || ""} {quote.vehicleMake} {quote.vehicleModel}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 shrink-0 font-medium">
              <CheckCircle2Icon className="size-3" />
              <span>OEM Verified</span>
            </div>
          </div>

          {/* Items breakdown list */}
          <div className="space-y-1.5">
            {quote.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs py-1 px-1 border-b border-dashed border-zinc-100 last:border-0"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-medium text-zinc-900 truncate">
                    {item.description}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400">
                    SKU: {item.sku} • Qty {item.quantity}
                  </div>
                </div>
                <div className="font-mono font-medium text-zinc-800 shrink-0">
                  ZAR {(item.unitPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>

          {/* Totals Summary Box */}
          <div className="rounded-lg bg-zinc-50 border border-zinc-200/80 p-2.5 space-y-1 text-xs">
            <div className="flex justify-between text-zinc-500 text-[11px]">
              <span>Subtotal (Excl. VAT)</span>
              <span className="font-mono">
                ZAR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-zinc-500 text-[11px]">
              <span>15% South African VAT</span>
              <span className="font-mono">
                ZAR {vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            {coreTotal > 0 && (
              <div className="flex justify-between text-amber-700 text-[11px]">
                <span>Core Exchange Deposit</span>
                <span className="font-mono">
                  ZAR {coreTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-zinc-200 pt-1.5 font-bold text-zinc-950 text-xs">
              <span>Grand Total</span>
              <span className="font-mono text-sm text-zinc-950">
                ZAR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls: Download PDF, Preview A4, WhatsApp */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
              className="h-8 gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium px-3 shadow-xs cursor-pointer"
            >
              <DownloadIcon className="size-3.5" />
              <span>{isDownloading ? "Generating..." : "Download PDF"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="h-8 gap-1.5 border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-xs cursor-pointer px-2.5"
            >
              <FileTextIcon className="size-3.5 text-zinc-500" />
              <span>Preview &amp; Print</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenWhatsApp}
            className="h-8 gap-1.5 border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100 text-xs cursor-pointer px-2.5 ml-auto sm:ml-0"
          >
            <MessageSquareIcon className="size-3.5 text-emerald-600" />
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>
        </div>
      </div>

      {/* Full A4 White Preview and Print Modal */}
      <QuotePdfModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        quote={quote}
      />
    </>
  )
}
