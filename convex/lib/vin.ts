// VIN decoding via the NHTSA vPIC API (free, no key). Coverage is best for
// North American VINs; for other markets it still resolves the manufacturer
// (WMI) and model year, and the agent falls back to asking for the model.

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

// Model-year character at position 10 (30-year cycle; ambiguous years resolve
// to the most recent cycle that isn't in the future)
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"

export function normalizeVin(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[IOQ]/g, (c) => (c === "I" ? "1" : "0"))
}

export function isValidVin(vin: string) {
  return VIN_RE.test(vin)
}

function modelYearFromVin(vin: string) {
  const idx = YEAR_CODES.indexOf(vin[9])
  if (idx < 0) return undefined
  const maxYear = new Date().getFullYear() + 1
  let year = 1980 + idx
  while (year + 30 <= maxYear) year += 30
  return year
}

export type DecodedVin = {
  vin: string
  valid: boolean
  make?: string
  model?: string
  year?: number
  engineCode?: string
  displacementL?: string
  fuelType?: string
  bodyClass?: string
  driveType?: string
  plantCountry?: string
  source: "nhtsa_vpic" | "vin_structure"
  note?: string
}

export async function decodeVin(raw: string): Promise<DecodedVin> {
  const vin = normalizeVin(raw)
  if (!isValidVin(vin)) {
    return { vin, valid: false, source: "vin_structure", note: "Not a valid 17-character VIN" }
  }

  const fallback: DecodedVin = {
    vin,
    valid: true,
    year: modelYearFromVin(vin),
    source: "vin_structure",
  }

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
    )
    if (!res.ok) return { ...fallback, note: `vPIC returned ${res.status}` }
    const data = (await res.json()) as { Results?: Record<string, string>[] }
    const r = data.Results?.[0]
    if (!r) return fallback
    const val = (k: string) => (r[k] && r[k] !== "Not Applicable" ? r[k].trim() || undefined : undefined)
    const year = Number(val("ModelYear")) || fallback.year
    return {
      vin,
      valid: true,
      make: val("Make"),
      model: val("Model"),
      year,
      engineCode: val("EngineModel") ?? val("EngineConfiguration"),
      displacementL: val("DisplacementL"),
      fuelType: val("FuelTypePrimary"),
      bodyClass: val("BodyClass"),
      driveType: val("DriveType"),
      plantCountry: val("PlantCountry"),
      source: "nhtsa_vpic",
      note: val("Model") ? undefined : "Model not in vPIC for this market; confirm the model with the customer",
    }
  } catch (error) {
    return { ...fallback, note: `vPIC unreachable: ${(error as Error).message}` }
  }
}
