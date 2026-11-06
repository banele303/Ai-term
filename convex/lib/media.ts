import { generateText, Output, transcribe } from "ai"
import { z } from "zod"

import { transcriptionModel, visionModel } from "./ai"
import { isValidVin, normalizeVin } from "./vin"

export type MediaBytes = { bytes: Uint8Array; mimeType: string }

const imageExtractionSchema = z.object({
  imageType: z
    .enum(["vin_plate", "license_disc", "part_photo", "part_label", "invoice_or_list", "other"])
    .describe("What the photo mainly shows"),
  vin: z
    .string()
    .nullable()
    .describe("17-character VIN if clearly legible, else null. Never guess characters."),
  partNumbers: z
    .array(z.string())
    .describe("OEM / aftermarket part numbers printed on the part, box or label"),
  vehicle: z
    .object({
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
      engineCode: z.string().optional(),
      registration: z.string().optional(),
    })
    .nullable()
    .describe("Vehicle details visible (license discs show make, model and VIN)"),
  description: z
    .string()
    .describe("One or two sentences: what part this is, its condition/damage, or what document it is"),
})
export type ImageExtraction = z.infer<typeof imageExtractionSchema>

const VISION_PROMPT = `You read photos sent to an auto-parts counter on WhatsApp.
They are usually: a VIN plate or windscreen VIN, a vehicle license disc, a photo of a worn or broken part, a part label/box, or a handwritten parts list.
Extract only what is legible. VINs are 17 characters and never contain I, O or Q.`

export async function extractFromImage(image: MediaBytes, caption?: string): Promise<ImageExtraction> {
  const { output } = await generateText({
    model: visionModel(),
    output: Output.object({ schema: imageExtractionSchema }),
    instructions: VISION_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: caption ? `Customer caption: ${caption}` : "No caption." },
          { type: "image", image: image.bytes, mediaType: image.mimeType },
        ],
      },
    ],
  })

  // Validate the VIN structurally; drop it rather than act on a misread
  const vin = output.vin ? normalizeVin(output.vin) : null
  return { ...output, vin: vin && isValidVin(vin) ? vin : null }
}

export async function transcribeAudio(audio: MediaBytes): Promise<string> {
  const { text } = await transcribe({
    model: transcriptionModel(),
    audio: audio.bytes,
  })
  return text.trim()
}
