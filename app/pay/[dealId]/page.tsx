"use client"

import { use, useState } from "react"
import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react"
import {
  Building2,
  Car,
  CheckCircle2,
  CreditCard,
  RefreshCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react"

import { FALLBACK_PIPELINE } from "@/components/autopulse/fallback-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim()
const publicConvexClient = convexUrl ? new ConvexReactClient(convexUrl) : null

interface QuoteViewData {
  _id: string
  status: string
  vinNumber?: string
  vehicle?: {
    make?: string
    model?: string
    year?: number
    engineCode?: string
  }
  requestedParts: {
    sku?: string
    description: string
    quantity: number
    unitPrice?: number
    coreDeposit?: number
  }[]
  totalAmount: number
  coreDepositTotal: number
  currency: string
  customerName: string
  companyName?: string
  customerType: string
}

export default function QuoteCheckoutPage({
  params,
}: {
  params: Promise<{ dealId: string }>
}) {
  const { dealId } = use(params)

  if (publicConvexClient) {
    return (
      <ConvexProvider client={publicConvexClient}>
        <LiveCheckout dealId={dealId} />
      </ConvexProvider>
    )
  }

  return <PreviewCheckout dealId={dealId} />
}

function LiveCheckout({ dealId }: { dealId: string }) {
  const quote = useQuery(api.crm.getPublicQuote, { dealId })
  const confirmPayment = useMutation(api.crm.confirmQuotePayment)

  if (quote === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <Skeleton className="h-6 w-48 bg-slate-800" />
          <Skeleton className="h-20 w-full rounded-xl bg-slate-850" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full bg-slate-800/60" />
            <Skeleton className="h-4 w-3/4 bg-slate-800/40" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg bg-slate-800" />
        </div>
      </div>
    )
  }

  if (quote === null) {
    return <PreviewCheckout dealId={dealId} />
  }

  return (
    <CheckoutInvoiceCard
      quote={quote}
      onPay={async (poRef) => {
        await confirmPayment({
          dealId,
          poReference: poRef || undefined,
        })
      }}
    />
  )
}

function PreviewCheckout({ dealId }: { dealId: string }) {
  type FallbackDealShape = {
    _id: string
    status: string
    vinNumber?: string
    vehicle?: {
      make?: string
      model?: string
      year?: number
      engineCode?: string
    }
    requestedParts: {
      sku?: string
      description: string
      quantity: number
      unitPrice?: number
      coreDeposit?: number
    }[]
    totalAmount: number
    coreDepositTotal?: number
    currency: string
    contact?: {
      name: string
      companyName?: string
      type: string
    }
  }

  const fallbackDeals: FallbackDealShape[] = []
  for (const col of FALLBACK_PIPELINE) {
    for (const d of col.deals) {
      fallbackDeals.push(d as FallbackDealShape)
    }
  }

  const matched =
    fallbackDeals.find((d) => d._id === dealId) ??
    fallbackDeals.find((d) => d.status === "quoted") ??
    fallbackDeals[0]

  const [paid, setPaid] = useState(matched.status === "paid")

  const quote: QuoteViewData = {
    _id: dealId,
    status: paid ? "paid" : matched.status,
    vinNumber: matched.vinNumber,
    vehicle: matched.vehicle,
    requestedParts: matched.requestedParts,
    totalAmount: matched.totalAmount || 22770,
    coreDepositTotal: matched.coreDepositTotal ?? 0,
    currency: matched.currency,
    customerName: matched.contact?.name ?? "Workshop Buyer",
    companyName: matched.contact?.companyName,
    customerType: matched.contact?.type ?? "workshop_b2b",
  }

  return (
    <CheckoutInvoiceCard
      quote={quote}
      onPay={async () => {
        setPaid(true)
      }}
    />
  )
}

function CheckoutInvoiceCard({
  quote,
  onPay,
}: {
  quote: QuoteViewData
  onPay: (poReference: string) => Promise<void>
}) {
  const [poReference, setPoReference] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const isPaid = quote.status === "paid" || quote.status === "dispatched"

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onPay(poReference.trim())
      toast.add({
        type: "success",
        title: "Payment confirmed — Dispatch queued",
        description:
          quote.coreDepositTotal > 0
            ? "Core deposit registered. Send a WhatsApp photo of the old unit to release your refund."
            : "Warehouse picking ticket generated.",
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not process checkout",
        description: (error as Error).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const subtotal = Math.max(0, quote.totalAmount - quote.coreDepositTotal)

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-400">
              <Wrench className="size-5" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">
                AutoPulse AI · Instant Parts Checkout
              </div>
              <div className="font-mono text-xs text-slate-400">
                Quote Ref #{quote._id}
              </div>
            </div>
          </div>

          <Badge
            variant="outline"
            className={
              isPaid
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/15 text-amber-300"
            }
          >
            {isPaid ? "PAID & QUEUED FOR DISPATCH" : "AWAITING PAYMENT"}
          </Badge>
        </div>

        {/* Customer & Vehicle Fitment Banner */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 uppercase">
              <Building2 className="size-3.5 text-sky-400" />
              Billed To
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {quote.companyName ?? quote.customerName}
            </div>
            <div className="text-slate-400">
              {quote.customerType === "workshop_b2b"
                ? "Verified B2B Trade Tier Pricing"
                : "Retail Direct Pricing"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 uppercase">
              <Car className="size-3.5 text-emerald-400" />
              Verified Fitment Vehicle
            </div>
            <div className="mt-1 font-semibold text-slate-100">
              {[
                quote.vehicle?.year,
                quote.vehicle?.make,
                quote.vehicle?.model,
                quote.vehicle?.engineCode && `(${quote.vehicle.engineCode})`,
              ]
                .filter(Boolean)
                .join(" ") || "Direct SKU Match"}
            </div>
            {quote.vinNumber && (
              <div className="font-mono text-[11px] text-sky-300">
                VIN: {quote.vinNumber}
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
          <div className="bg-slate-950/90 px-4 py-2.5 text-[11px] font-medium text-slate-400 uppercase">
            Quoted Parts & Rebuildable Core Deposits
          </div>
          <div className="divide-y divide-slate-800/80 bg-slate-950/40">
            {quote.requestedParts.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-medium text-slate-100">
                    {item.description}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                    {item.sku ? `SKU: ${item.sku} · ` : ""}Qty: {item.quantity}
                    {item.coreDeposit
                      ? ` · +${quote.currency} ${item.coreDeposit} refundable core/unit`
                      : ""}
                  </div>
                </div>
                <div className="font-mono font-semibold text-slate-100">
                  {item.unitPrice
                    ? `${quote.currency} ${(item.unitPrice * item.quantity).toLocaleString()}`
                    : "Included"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Parts Subtotal</span>
            <span className="font-mono">
              {quote.currency} {subtotal.toLocaleString()}
            </span>
          </div>
          {quote.coreDepositTotal > 0 && (
            <div className="flex justify-between text-amber-300">
              <span className="inline-flex items-center gap-1">
                <RefreshCcw className="size-3" />
                Refundable Old-Unit Core Deposit (14-Day Return Window)
              </span>
              <span className="font-mono">
                {quote.currency} {quote.coreDepositTotal.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-800 pt-2.5 text-sm font-semibold text-emerald-400">
            <span>Total Payable</span>
            <span className="font-mono">
              {quote.currency} {quote.totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Action */}
        {isPaid ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <div>
              <div className="font-semibold">
                Payment Verified — Warehouse Dispatch Triggered
              </div>
              <div className="mt-0.5 text-emerald-300/80">
                You will receive courier dispatch & core return photo instructions directly on WhatsApp.
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="mt-6 space-y-3">
            <Input
              value={poReference}
              onChange={(e) => setPoReference(e.target.value)}
              placeholder="Optional Workshop Purchase Order # (e.g. PO-APEX-4819)"
              className="border-slate-800 bg-slate-950 text-xs text-slate-100"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="h-10 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              {submitting ? (
                <Skeleton className="mr-2 size-4 rounded-full bg-white/70" />
              ) : (
                <CreditCard className="mr-2 size-4" />
              )}
              Pay {quote.currency} {quote.totalAmount.toLocaleString()} &
              Dispatch Now
            </Button>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="size-3.5 text-sky-400" />
              OEM Fitment Guaranteed · Instant Convex Stock Reservation
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
