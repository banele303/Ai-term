import { NextRequest, NextResponse } from "next/server"
import { Daytona } from "@daytona/sdk"

const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: "https://app.daytona.io/api",
})

export async function POST(req: NextRequest) {
  try {
    const { action, code, command, language = "python" } = await req.json()

    if (!process.env.DAYTONA_API_KEY) {
      return NextResponse.json(
        { error: "DAYTONA_API_KEY is not configured in .env.local" },
        { status: 500 }
      )
    }

    if (action === "desktop" || action === "launch_browser") {
      const targetUrl = (req as any).url || command || code || "https://www.cars.co.za"
      const sandbox = await daytona.create()
      try {
        await sandbox.computerUse.start()
        await sandbox.process.executeCommand(
          `DISPLAY=:0 chromium --no-sandbox --disable-dev-shm-usage "${targetUrl}" >/dev/null 2>&1 &`
        )
        const preview = await sandbox.getSignedPreviewUrl(6080, 60 * 60)
        return NextResponse.json({
          sandboxId: sandbox.id,
          desktopUrl: `${preview.url}/vnc.html?autoconnect=true&resize=scale`,
          previewUrl: preview.url,
          targetUrl,
        })
      } catch (err) {
        await daytona.delete(sandbox).catch(() => {})
        throw err
      }
    }

    if (action === "code_run" || code) {
      const sandbox = await daytona.create()
      try {
        const response = await sandbox.process.codeRun(code, language)
        return NextResponse.json({
          sandboxId: sandbox.id,
          exitCode: response.exitCode,
          result: response.result,
        })
      } finally {
        await daytona.delete(sandbox).catch(() => {})
      }
    }

    if (action === "exec" || command) {
      const sandbox = await daytona.create()
      try {
        const response = await sandbox.process.executeCommand(command)
        return NextResponse.json({
          sandboxId: sandbox.id,
          exitCode: response.exitCode,
          result: response.result,
        })
      } finally {
        await daytona.delete(sandbox).catch(() => {})
      }
    }

    return NextResponse.json({ error: "No code or command provided" }, { status: 400 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Daytona execution error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
