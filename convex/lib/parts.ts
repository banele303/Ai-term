import type { Doc } from "../_generated/dataModel"
import type { VehicleFitment } from "../schema"

export type VehicleQuery = {
  make?: string
  model?: string
  year?: number
  engineCode?: string
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, " ")

// Part numbers are matched without separators: "04465-0K240" == "044650K240"
export const normPartNumber = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")

export function fitmentMatches(f: VehicleFitment, q: VehicleQuery) {
  if (q.make && norm(f.make) !== norm(q.make)) return false
  if (q.model && !norm(f.model).includes(norm(q.model)) && !norm(q.model).includes(norm(f.model)))
    return false
  if (q.year && (q.year < f.yearRange.from || q.year > f.yearRange.to)) return false
  if (q.engineCode && f.engineCode && normPartNumber(f.engineCode) !== normPartNumber(q.engineCode))
    return false
  return true
}

export type FitmentVerdict = "fits" | "no_fit" | "unknown"

export function checkFitment(
  part: Pick<Doc<"parts_catalog">, "compatibleVehicles">,
  vehicle: VehicleQuery | undefined
): { verdict: FitmentVerdict; matched?: VehicleFitment } {
  if (!vehicle || (!vehicle.make && !vehicle.model)) return { verdict: "unknown" }
  const matched = part.compatibleVehicles.find((f) => fitmentMatches(f, vehicle))
  return matched ? { verdict: "fits", matched } : { verdict: "no_fit" }
}

// Text fed to the full-text index. Part numbers appear both raw and normalized
// so "04465-0K240" and "044650K240" both hit.
export function buildSearchText(p: {
  sku: string
  oemNumber?: string
  crossReferenceNumbers: string[]
  name: string
  brand: string
  category: string
  compatibleVehicles: VehicleFitment[]
}) {
  const numbers = [p.sku, p.oemNumber, ...p.crossReferenceNumbers].filter(
    (n): n is string => !!n
  )
  const vehicles = p.compatibleVehicles.map(
    (f) =>
      `${f.make} ${f.model} ${f.yearRange.from}-${f.yearRange.to}${f.engineCode ? ` ${f.engineCode}` : ""}`
  )
  return [
    p.name,
    p.brand,
    p.category,
    ...numbers,
    ...numbers.map(normPartNumber),
    ...vehicles,
  ].join(" ")
}

// Text that gets embedded for semantic search
export function buildEmbeddingText(p: Doc<"parts_catalog">) {
  const vehicles = p.compatibleVehicles
    .map(
      (f) =>
        `${f.make} ${f.model} (${f.yearRange.from}-${f.yearRange.to}${f.engineCode ? `, ${f.engineCode}` : ""})`
    )
    .join("; ")
  return [
    `${p.name} — ${p.brand} ${p.tier === "oem" ? "OEM" : "aftermarket"} ${p.category}`,
    p.oemNumber ? `OEM number: ${p.oemNumber}` : "",
    p.crossReferenceNumbers.length ? `Cross references: ${p.crossReferenceNumbers.join(", ")}` : "",
    vehicles ? `Fits: ${vehicles}` : "",
    p.specsJson ? `Specs: ${p.specsJson}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

// What the agent / UI sees for a part. Cost price never leaves the server.
export function publicPart(p: Doc<"parts_catalog">, audience: "b2b" | "b2c") {
  return {
    id: p._id,
    sku: p.sku,
    oemNumber: p.oemNumber,
    crossReferenceNumbers: p.crossReferenceNumbers,
    name: p.name,
    brand: p.brand,
    tier: p.tier,
    category: p.category,
    price: audience === "b2b" ? (p.tradePrice ?? p.price) : p.price,
    inStock: p.stockQuantity > 0,
    stockQuantity: p.stockQuantity,
    warehouseLocation: p.warehouseLocation,
    coreDepositAmount: p.coreDepositAmount ?? 0,
    compatibleVehicles: p.compatibleVehicles,
  }
}
export type PublicPart = ReturnType<typeof publicPart>

// Reciprocal rank fusion over several ranked id lists
export function reciprocalRankFusion<T extends string>(lists: T[][], k = 60) {
  const scores = new Map<T, number>()
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)))
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }))
}
