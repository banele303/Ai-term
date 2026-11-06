"use client"

import { useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MapPin,
  PackagePlus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import { FALLBACK_PARTS } from "@/components/autopulse/fallback-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { decodeVin, type DecodedVin } from "@/convex/lib/vin"

const skuFormSchema = z.object({
  sku: z.string().trim().min(3, "SKU must be at least 3 characters"),
  oemNumber: z.string().trim(),
  crossRefs: z.string().trim(),
  name: z.string().trim().min(3, "Part name is required"),
  category: z.string().trim().min(2, "Category is required"),
  brand: z.string().trim().min(2, "Brand is required"),
  tier: z.enum(["oem", "aftermarket"]),
  make: z.string().trim(),
  model: z.string().trim(),
  yearFrom: z.string().trim(),
  yearTo: z.string().trim(),
  engineCode: z.string().trim(),
  price: z.string().trim().min(1, "Retail price required"),
  tradePrice: z.string().trim(),
  costPrice: z.string().trim().min(1, "Cost price required"),
  stockQuantity: z.string().trim().min(1, "Stock quantity required"),
  warehouseLocation: z.string().trim(),
  coreDepositAmount: z.string().trim(),
})

type SkuFormValues = z.infer<typeof skuFormSchema>

interface CatalogPartItem {
  _id: string
  sku: string
  oemNumber?: string
  crossReferenceNumbers: string[]
  name: string
  category: string
  brand: string
  tier: "oem" | "aftermarket"
  compatibleVehicles: {
    make: string
    model: string
    yearRange: { from: number; to: number }
    engineCode?: string
  }[]
  price: number
  tradePrice?: number
  costPrice: number
  stockQuantity: number
  minReorderThreshold: number
  warehouseLocation?: string
  coreDepositAmount?: number
  isServiceKit: boolean
  fitmentVerdict?: "fits" | "no_fit" | "unknown"
  fitmentNote?: string
}

interface KbDocItem {
  _id: string
  title: string
  fileName: string
  status: "processing" | "ready" | "failed"
  chunkCount: number
  error?: string
  createdAt: number
}

export default function KnowledgeBasePage() {
  const convexReady = useConvexReady()
  return convexReady ? <LiveKnowledgeBase /> : <PreviewKnowledgeBase />
}

function LiveKnowledgeBase() {
  const catalogList = useQuery(api.parts.list, { limit: 150 })
  const kbDocs = useQuery(api.dashboard.listKbDocuments, {})
  const searchPartsAction = useAction(api.parts.search)
  const upsertPartMutation = useMutation(api.parts.upsert)
  const decodeVinServer = useAction(api.dashboard.decodeVinAction)
  const generateUploadUrl = useMutation(api.dashboard.generateUploadUrl)
  const registerKbDoc = useMutation(api.dashboard.registerKbDocument)
  const searchKbChunks = useAction(api.dashboard.searchKnowledgeChunks)

  const [semanticHits, setSemanticHits] = useState<CatalogPartItem[] | null>(
    null
  )

  const handleHybridSearch = async (params: {
    query: string
    category?: string
    vehicle?: {
      make?: string
      model?: string
      year?: number
      engineCode?: string
    }
  }) => {
    if (!params.query.trim()) {
      setSemanticHits(null)
      return
    }
    const hits = await searchPartsAction(params)
    setSemanticHits(
      hits.map((h) => ({
        ...(h.part as unknown as CatalogPartItem),
        fitmentVerdict: h.fitment.verdict,
        fitmentNote: h.fitment.matched
          ? `${h.fitment.matched.make} ${h.fitment.matched.model}`
          : undefined,
      }))
    )
  }

  const handleUpsertPart = async (values: SkuFormValues) => {
    const retail = Number(values.price)
    const trade = values.tradePrice ? Number(values.tradePrice) : undefined
    const cost = Number(values.costPrice)
    const stock = Number(values.stockQuantity)
    const core = values.coreDepositAmount
      ? Number(values.coreDepositAmount)
      : 0

    const vehicles =
      values.make && values.model
        ? [
            {
              make: values.make,
              model: values.model,
              yearRange: {
                from: Number(values.yearFrom) || 2015,
                to: Number(values.yearTo) || 2026,
              },
              engineCode: values.engineCode || undefined,
            },
          ]
        : []

    await upsertPartMutation({
      sku: values.sku,
      oemNumber: values.oemNumber || undefined,
      crossReferenceNumbers: values.crossRefs
        ? values.crossRefs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      name: values.name,
      category: values.category,
      brand: values.brand,
      tier: values.tier,
      compatibleVehicles: vehicles,
      price: retail,
      tradePrice: trade,
      costPrice: cost,
      stockQuantity: stock,
      minReorderThreshold: 5,
      warehouseLocation: values.warehouseLocation || undefined,
      coreDepositAmount: core > 0 ? core : undefined,
      isServiceKit: /filter|pad|oil|kit/i.test(values.name),
    })
  }

  const handleUploadFile = async (file: File) => {
    const uploadUrl = await generateUploadUrl({})
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "text/plain" },
      body: file,
    })
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`)
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
    await registerKbDoc({
      title: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      mimeType: file.type || "text/plain",
      storageId,
    })
  }

  return (
    <KnowledgeBaseUI
      liveMode
      parts={
        semanticHits ??
        ((catalogList as CatalogPartItem[] | undefined) ?? [])
      }
      showingSemanticResults={semanticHits !== null}
      onResetSemantic={() => setSemanticHits(null)}
      onHybridSearch={handleHybridSearch}
      onUpsertPart={handleUpsertPart}
      onDecodeVin={(vin) => decodeVinServer({ vin })}
      kbDocs={(kbDocs as KbDocItem[] | undefined) ?? []}
      onUploadFile={handleUploadFile}
      onSearchKbChunks={(query) => searchKbChunks({ query })}
    />
  )
}

function PreviewKnowledgeBase() {
  const [parts, setParts] = useState<CatalogPartItem[]>(
    () => FALLBACK_PARTS as CatalogPartItem[]
  )
  const [filteredHits, setFilteredHits] = useState<CatalogPartItem[] | null>(
    null
  )
  const [kbDocs, setKbDocs] = useState<KbDocItem[]>([
    {
      _id: "kb_1",
      title: "Toyota Hilux 1GD-FTV Service Torque & Fitment Bulletin",
      fileName: "hilux-1gd-ftv-fitment.md",
      status: "ready",
      chunkCount: 14,
      createdAt: Date.now() - 86_400_000,
    },
    {
      _id: "kb_2",
      title: "Bosch Alternator & Garrett Turbo Reman Core Policy",
      fileName: "core-return-inspection-spec.txt",
      status: "ready",
      chunkCount: 8,
      createdAt: Date.now() - 172_800_000,
    },
  ])

  const handleHybridSearch = async (params: {
    query: string
    category?: string
    vehicle?: {
      make?: string
      model?: string
      year?: number
      engineCode?: string
    }
  }) => {
    const q = params.query.trim().toLowerCase()
    if (!q) {
      setFilteredHits(null)
      return
    }
    const matches = parts.filter((p) => {
      if (params.category && p.category !== params.category) return false
      const hay = [
        p.sku,
        p.oemNumber,
        ...p.crossReferenceNumbers,
        p.name,
        p.brand,
        p.category,
        ...p.compatibleVehicles.map(
          (v) => `${v.make} ${v.model} ${v.engineCode ?? ""}`
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return q.split(/\s+/).some((tok) => hay.includes(tok))
    })
    setFilteredHits(
      matches.map((m) => ({
        ...m,
        fitmentVerdict: params.vehicle?.make ? "fits" : undefined,
      }))
    )
  }

  const handleUpsertPart = async (values: SkuFormValues) => {
    const newItem: CatalogPartItem = {
      _id: `part_${Date.now()}`,
      sku: values.sku,
      oemNumber: values.oemNumber || undefined,
      crossReferenceNumbers: values.crossRefs
        ? values.crossRefs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      name: values.name,
      category: values.category,
      brand: values.brand,
      tier: values.tier,
      compatibleVehicles:
        values.make && values.model
          ? [
              {
                make: values.make,
                model: values.model,
                yearRange: {
                  from: Number(values.yearFrom) || 2016,
                  to: Number(values.yearTo) || 2025,
                },
                engineCode: values.engineCode || undefined,
              },
            ]
          : [],
      price: Number(values.price),
      tradePrice: values.tradePrice ? Number(values.tradePrice) : undefined,
      costPrice: Number(values.costPrice),
      stockQuantity: Number(values.stockQuantity),
      minReorderThreshold: 5,
      warehouseLocation: values.warehouseLocation || "Aisle A1 · Bin 01",
      coreDepositAmount: Number(values.coreDepositAmount) || 0,
      isServiceKit: /filter|pad|oil|kit/i.test(values.name),
    }
    setParts((prev) => [newItem, ...prev.filter((p) => p.sku !== newItem.sku)])
  }

  const handleUploadFile = async (file: File) => {
    const text = await file.text()
    const chunks = Math.max(1, Math.ceil(text.length / 800))
    setKbDocs((prev) => [
      {
        _id: `kb_${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        status: "ready",
        chunkCount: chunks,
        createdAt: Date.now(),
      },
      ...prev,
    ])
  }

  return (
    <KnowledgeBaseUI
      liveMode={false}
      parts={filteredHits ?? parts}
      showingSemanticResults={filteredHits !== null}
      onResetSemantic={() => setFilteredHits(null)}
      onHybridSearch={handleHybridSearch}
      onUpsertPart={handleUpsertPart}
      onDecodeVin={(vin) => decodeVin(vin)}
      kbDocs={kbDocs}
      onUploadFile={handleUploadFile}
      onSearchKbChunks={async (q) => [
        {
          id: "chunk_demo" as Id<"kb_chunks">,
          docTitle: "Toyota Hilux 1GD-FTV Service Torque & Fitment Bulletin",
          text: `Matched "${q}": OEM 04465-0K240 ceramic pads fit 2016–2025 Hilux 2.8 GD-6 (1GD-FTV) with 319mm ventilated front discs. Caliper slide pin torque: 34 Nm.`,
        },
      ]}
    />
  )
}

function AddSkuForm({
  onSubmitSku,
  onSaved,
}: {
  onSubmitSku: (values: SkuFormValues) => Promise<void>
  onSaved: () => void
}) {
  const form = useForm<SkuFormValues>({
    resolver: zodResolver(skuFormSchema),
    defaultValues: {
      sku: "",
      oemNumber: "",
      crossRefs: "",
      name: "",
      category: "Brakes",
      brand: "",
      tier: "oem",
      make: "",
      model: "",
      yearFrom: "2018",
      yearTo: "2025",
      engineCode: "",
      price: "",
      tradePrice: "",
      costPrice: "",
      stockQuantity: "12",
      warehouseLocation: "Aisle B1 · Bin 04",
      coreDepositAmount: "0",
    },
  })
  const { isSubmitting } = form.formState

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmitSku(values)
      toast.add({
        type: "success",
        title: `SKU ${values.sku} indexed`,
        description:
          "Catalog item saved and queued for 1536-dim OpenAI vector embedding.",
      })
      onSaved()
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not save SKU",
        description: (error as Error).message,
      })
    }
  })

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup className="max-h-[62vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="sku"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-code">Internal SKU</FieldLabel>
                <Input
                  {...field}
                  id="sku-code"
                  placeholder="AP-BMW-ZF-001"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="oemNumber"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-oem">OEM Part Number</FieldLabel>
                <Input
                  {...field}
                  id="sku-oem"
                  placeholder="24117571227"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </div>

        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sku-name">Part Description</FieldLabel>
              <Input
                {...field}
                id="sku-name"
                placeholder="ZF 6HP Sump Filter & Sleeve Service Kit"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="grid grid-cols-3 gap-3">
          <Controller
            name="brand"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-brand">Brand</FieldLabel>
                <Input
                  {...field}
                  id="sku-brand"
                  placeholder="ZF Friedrichshafen"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="category"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-cat">Category</FieldLabel>
                <Input
                  {...field}
                  id="sku-cat"
                  placeholder="Drivetrain"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="tier"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-tier">Quality Tier</FieldLabel>
                <select
                  id="sku-tier"
                  value={field.value}
                  onChange={(e) =>
                    field.onChange(e.target.value as "oem" | "aftermarket")
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-2.5 text-xs"
                >
                  <option value="oem" className="bg-slate-900">
                    OEM Genuine
                  </option>
                  <option value="aftermarket" className="bg-slate-900">
                    Aftermarket
                  </option>
                </select>
              </Field>
            )}
          />
        </div>

        <Controller
          name="crossRefs"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sku-xref">
                Cross-Reference Numbers (comma-separated)
              </FieldLabel>
              <Input
                {...field}
                id="sku-xref"
                placeholder="0501216243, HX185D, V20-0587"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="grid grid-cols-4 gap-2">
          <Controller
            name="make"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-make">Make</FieldLabel>
                <Input {...field} id="sku-make" placeholder="BMW" />
              </Field>
            )}
          />
          <Controller
            name="model"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-model">Model</FieldLabel>
                <Input {...field} id="sku-model" placeholder="330d" />
              </Field>
            )}
          />
          <Controller
            name="engineCode"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-eng">Engine</FieldLabel>
                <Input {...field} id="sku-eng" placeholder="M57N2" />
              </Field>
            )}
          />
          <Controller
            name="stockQuantity"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-stock">Stock Qty</FieldLabel>
                <Input
                  {...field}
                  id="sku-stock"
                  type="number"
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Controller
            name="price"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-retail">Retail B2C</FieldLabel>
                <Input
                  {...field}
                  id="sku-retail"
                  type="number"
                  placeholder="3450"
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
          <Controller
            name="tradePrice"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-trade">Trade B2B</FieldLabel>
                <Input
                  {...field}
                  id="sku-trade"
                  type="number"
                  placeholder="2890"
                />
              </Field>
            )}
          />
          <Controller
            name="costPrice"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sku-cost">Landed Cost</FieldLabel>
                <Input
                  {...field}
                  id="sku-cost"
                  type="number"
                  placeholder="2150"
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
          <Controller
            name="coreDepositAmount"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sku-core">Core Deposit</FieldLabel>
                <Input
                  {...field}
                  id="sku-core"
                  type="number"
                  placeholder="0"
                />
              </Field>
            )}
          />
        </div>
      </FieldGroup>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Skeleton className="mr-2 size-4 rounded-full bg-white/70" />}
          Save & Embed SKU
        </Button>
      </DialogFooter>
    </form>
  )
}

function KnowledgeBaseUI({
  liveMode,
  parts,
  showingSemanticResults,
  onResetSemantic,
  onHybridSearch,
  onUpsertPart,
  onDecodeVin,
  kbDocs,
  onUploadFile,
  onSearchKbChunks,
}: {
  liveMode: boolean
  parts: CatalogPartItem[]
  showingSemanticResults: boolean
  onResetSemantic: () => void
  onHybridSearch: (params: {
    query: string
    category?: string
    vehicle?: {
      make?: string
      model?: string
      year?: number
      engineCode?: string
    }
  }) => Promise<void>
  onUpsertPart: (values: SkuFormValues) => Promise<void>
  onDecodeVin: (vin: string) => Promise<DecodedVin>
  kbDocs: KbDocItem[]
  onUploadFile: (file: File) => Promise<void>
  onSearchKbChunks: (
    query: string
  ) => Promise<{ id: Id<"kb_chunks">; text: string; docTitle: string }[]>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [queryText, setQueryText] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [vehMake, setVehMake] = useState("")
  const [vehModel, setVehModel] = useState("")
  const [vehYear, setVehYear] = useState("")
  const [vehEngine, setVehEngine] = useState("")
  const [searching, setSearching] = useState(false)

  // VIN Decoder state
  const [vinInput, setVinInput] = useState("WVWZZZAUZHW123456")
  const [vinLoading, setVinLoading] = useState(false)
  const [decodedVin, setDecodedVin] = useState<DecodedVin | null>(null)

  // KB Uploader & Vector Chunk Search state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [kbQuery, setKbQuery] = useState("")
  const [kbSearching, setKbSearching] = useState(false)
  const [kbHits, setKbHits] = useState<
    { id: string; text: string; docTitle: string }[]
  >([])

  const categories = useMemo(
    () => [...new Set(parts.map((p) => p.category))].sort(),
    [parts]
  )

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    try {
      await onHybridSearch({
        query: queryText,
        category: categoryFilter || undefined,
        vehicle:
          vehMake || vehModel || vehYear || vehEngine
            ? {
                make: vehMake || undefined,
                model: vehModel || undefined,
                year: vehYear ? Number(vehYear) : undefined,
                engineCode: vehEngine || undefined,
              }
            : undefined,
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Hybrid vector search failed",
        description: (error as Error).message,
      })
    } finally {
      setSearching(false)
    }
  }

  const runDecodeVin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vinInput.trim()) return
    setVinLoading(true)
    try {
      const res = await onDecodeVin(vinInput.trim())
      setDecodedVin(res)
      if (res.valid) {
        if (res.make) setVehMake(res.make)
        if (res.model) setVehModel(res.model)
        if (res.year) setVehYear(String(res.year))
        if (res.engineCode) setVehEngine(res.engineCode)
        toast.add({
          type: "success",
          title: `VIN ${res.vin} decoded`,
          description: "Applied vehicle fitment filters to catalog search.",
        })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "VIN decode error",
        description: (error as Error).message,
      })
    } finally {
      setVinLoading(false)
    }
  }

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await onUploadFile(file)
      toast.add({
        type: "success",
        title: `${file.name} uploaded`,
        description: file.name.toLowerCase().endsWith(".csv")
          ? "CSV rows imported into parts_catalog + chunked into kb_chunks."
          : "Document chunked and embedded into 1536-dim RAG index.",
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Upload failed",
        description: (error as Error).message,
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const runKbSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kbQuery.trim()) return
    setKbSearching(true)
    try {
      const hits = await onSearchKbChunks(kbQuery.trim())
      setKbHits(hits)
    } catch (error) {
      toast.add({
        type: "error",
        title: "KB vector search failed",
        description: (error as Error).message,
      })
    } finally {
      setKbSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Parts Catalog &amp; VIN Lookup
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Search OEM numbers, aftermarket cross-references, vehicle fitment,
            and workshop manuals.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-sky-600 text-white hover:bg-sky-500" />
            }
          >
            <PackagePlus className="mr-1.5 size-4" />
            Add / Update SKU
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add or Update Part SKU</DialogTitle>
              <DialogDescription>
                Add a new part or update pricing and stock for an existing SKU.
              </DialogDescription>
            </DialogHeader>
            <AddSkuForm
              onSubmitSku={onUpsertPart}
              onSaved={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Top Row: VIN Decoder + Catalog Search Filter Bar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Live 17-Char VIN Decoder */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              <Cpu className="size-4 text-sky-400" />
              17-Character VIN Decoder
            </div>
          </div>

          <form onSubmit={runDecodeVin} className="mt-3 flex gap-2">
            <Input
              value={vinInput}
              onChange={(e) => setVinInput(e.target.value.toUpperCase())}
              maxLength={17}
              placeholder="Enter 17-char VIN (e.g. AHTBA3CD703219845)"
              className="border-slate-800 bg-slate-950 font-mono text-xs tracking-wider text-slate-100 uppercase"
            />
            <Button
              type="submit"
              size="sm"
              disabled={vinLoading}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {vinLoading && <Skeleton className="mr-1.5 size-3.5 rounded-full bg-white/70" />}
              Decode
            </Button>
          </form>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "Hilux GD6", vin: "AHTBA3CD703219845" },
              { label: "Ford F-150 5.0", vin: "1FTFW1E50MFA12345" },
              { label: "BMW 3-Series", vin: "WBA8E9G57GNU12345" },
            ].map((sample) => (
              <button
                key={sample.vin}
                type="button"
                onClick={() => setVinInput(sample.vin)}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-400 hover:border-sky-500/40 hover:text-sky-300"
              >
                {sample.label}: {sample.vin.slice(0, 8)}…
              </button>
            ))}
          </div>

          {decodedVin && (
            <div
              className={`mt-3 rounded-lg border p-3 text-xs ${
                decodedVin.valid
                  ? "border-emerald-500/30 bg-emerald-950/20"
                  : "border-rose-500/30 bg-rose-950/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-100">
                  {decodedVin.vin}
                </span>
                <span className="text-[10px] text-emerald-300 uppercase">
                  {decodedVin.valid ? decodedVin.source : "Invalid"}
                </span>
              </div>
              {decodedVin.valid ? (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-500">Make:</span>{" "}
                    {decodedVin.make ?? "WMI Market Specific"}
                  </div>
                  <div>
                    <span className="text-slate-500">Model:</span>{" "}
                    {decodedVin.model ?? "Confirm Trim"}
                  </div>
                  <div>
                    <span className="text-slate-500">Model Year:</span>{" "}
                    {decodedVin.year ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-500">Engine:</span>{" "}
                    {decodedVin.engineCode ??
                      (decodedVin.displacementL
                        ? `${decodedVin.displacementL}L`
                        : "—")}
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-rose-300">
                  {decodedVin.note}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Hybrid Semantic + Vehicle Fitment Search */}
        <form
          onSubmit={runSearch}
          className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-4 lg:col-span-7"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              <Sparkles className="size-4 text-emerald-400" />
              Part &amp; Fitment Search
            </div>
            {showingSemanticResults && (
              <button
                type="button"
                onClick={() => {
                  setQueryText("")
                  onResetSemantic()
                }}
                className="text-[11px] text-sky-400 hover:underline"
              >
                Reset search
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-slate-500" />
              <Input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search OEM # (04465-0K240), cross-ref (GDB3473), or symptom ('Hilux GD6 boost limp turbo')..."
                className="border-slate-800 bg-slate-950 pl-8 text-xs text-slate-100"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-200"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              size="sm"
              disabled={searching}
              className="bg-sky-600 text-white hover:bg-sky-500"
            >
              {searching && <Skeleton className="mr-1.5 size-3.5 rounded-full bg-white/70" />}
              Search Brain
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              value={vehMake}
              onChange={(e) => setVehMake(e.target.value)}
              placeholder="Fitment Make (Toyota)"
              className="h-8 border-slate-800 bg-slate-950 text-[11px]"
            />
            <Input
              value={vehModel}
              onChange={(e) => setVehModel(e.target.value)}
              placeholder="Model (Hilux)"
              className="h-8 border-slate-800 bg-slate-950 text-[11px]"
            />
            <Input
              value={vehYear}
              onChange={(e) => setVehYear(e.target.value)}
              placeholder="Year (2021)"
              type="number"
              className="h-8 border-slate-800 bg-slate-950 text-[11px]"
            />
            <Input
              value={vehEngine}
              onChange={(e) => setVehEngine(e.target.value)}
              placeholder="Engine Code (1GD-FTV)"
              className="h-8 border-slate-800 bg-slate-950 text-[11px]"
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Filter className="size-3 text-sky-400" />
            Verified vehicle matches rank first; incompatible parts are hidden.
          </div>
        </form>
      </div>

      {/* Main Grid: Catalog Table + Document Uploader */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Parts Catalog Results */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 xl:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-sky-400" />
              <span className="text-xs font-semibold text-slate-100">
                Parts Catalog ({parts.length} SKUs)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Trade &amp; Retail Pricing
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {parts.map((part) => {
              const lowStock = part.stockQuantity <= part.minReorderThreshold
              return (
                <div
                  key={part._id}
                  className="flex flex-col gap-3 p-4 transition hover:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-sky-300">
                        {part.sku}
                      </span>
                      {part.oemNumber && (
                        <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                          OEM: {part.oemNumber}
                        </span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          part.tier === "oem"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {part.tier}
                      </span>
                      {part.fitmentVerdict === "fits" && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          <ShieldCheck className="size-3" /> Verified Fitment
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-medium text-slate-100">
                      {part.brand} — {part.name}
                    </div>

                    {part.crossReferenceNumbers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                        <Layers className="size-3 text-slate-500" />
                        <span>Cross-Refs:</span>
                        {part.crossReferenceNumbers.map((xref) => (
                          <span
                            key={xref}
                            className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-slate-300"
                          >
                            {xref}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      {part.compatibleVehicles.map((v, idx) => (
                        <span key={idx} className="text-slate-300">
                          {v.make} {v.model} ({v.yearRange.from}–
                          {v.yearRange.to}
                          {v.engineCode ? ` · ${v.engineCode}` : ""})
                        </span>
                      ))}
                      {part.warehouseLocation && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <MapPin className="size-3" />
                          {part.warehouseLocation}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Pricing & Stock Box */}
                  <div className="flex shrink-0 items-center gap-4 rounded-lg border border-slate-800/90 bg-slate-950/75 px-3.5 py-2.5">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        B2B Trade
                      </div>
                      <div className="font-mono text-xs font-semibold text-emerald-400">
                        R{(part.tradePrice ?? part.price).toLocaleString()}
                      </div>
                    </div>
                    <div className="border-l border-slate-800 pl-3">
                      <div className="text-[10px] text-slate-500 uppercase">
                        B2C Retail
                      </div>
                      <div className="font-mono text-xs font-semibold text-slate-200">
                        R{part.price.toLocaleString()}
                      </div>
                    </div>
                    <div className="border-l border-slate-800 pl-3 text-right">
                      <div className="text-[10px] text-slate-500 uppercase">
                        Stock
                      </div>
                      <div
                        className={`font-mono text-xs font-semibold ${
                          lowStock ? "text-amber-400" : "text-sky-300"
                        }`}
                      >
                        {part.stockQuantity} u
                      </div>
                      {(part.coreDepositAmount ?? 0) > 0 && (
                        <div className="text-[9px] text-amber-300">
                          +R{part.coreDepositAmount} core
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Spec Sheet / CSV Catalog Uploader */}
        <div className="space-y-5 xl:col-span-4">
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <Upload className="size-4 text-emerald-400" />
                Catalog CSV &amp; Manual Uploader
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Upload `.csv` price lists (`sku,name,price,oem,brand,stock`) or
              workshop bulletins (`.txt`, `.md`).
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.md,.json"
              onChange={handleFilePicked}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="mt-3 w-full border-dashed border-sky-500/40 bg-sky-950/20 text-xs text-sky-300 hover:bg-sky-950/40"
            >
              {uploading ? (
                <Skeleton className="mr-1.5 size-4 rounded-full bg-sky-300/70" />
              ) : (
                <FileSpreadsheet className="mr-1.5 size-4" />
              )}
              {uploading ? "Uploading..." : "Upload CSV or Document"}
            </Button>

            <div className="mt-4 space-y-2">
              <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                Uploaded Documents ({kbDocs.length})
              </div>
              {kbDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-3.5 shrink-0 text-sky-400" />
                    <div className="truncate">
                      <div className="truncate font-medium text-slate-200">
                        {doc.title}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {doc.fileName}
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Technical Bulletin Search */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
            <div className="text-xs font-semibold text-slate-100">
              Search Workshop Manuals &amp; Bulletins
            </div>
            <form onSubmit={runKbSearch} className="mt-2.5 flex gap-2">
              <Input
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
                placeholder="Ask torque specs, core policy, oil viscosity..."
                className="border-slate-800 bg-slate-950 text-xs"
              />
              <Button type="submit" size="sm" disabled={kbSearching}>
                {kbSearching ? <Skeleton className="size-3.5 rounded-full bg-white/70" /> : "Ask"}
              </Button>
            </form>

            {kbHits.length > 0 && (
              <div className="mt-3 space-y-2">
                {kbHits.map((hit) => (
                  <div
                    key={hit.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]"
                  >
                    <div className="font-medium text-sky-300">
                      {hit.docTitle}
                    </div>
                    <p className="mt-1 leading-relaxed text-slate-300">
                      {hit.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
