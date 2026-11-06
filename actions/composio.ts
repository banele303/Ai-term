"use server"

import fs from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export async function updateComposioApiKey(newKey: string) {
  const trimmed = newKey.trim()
  if (!trimmed || !(trimmed.startsWith("ak_") || trimmed.startsWith("ck_"))) {
    throw new Error("Invalid Composio API Key format. Keys must start with 'ak_' (or legacy 'ck_').")
  }

  // 1. Update .env.local
  const envPath = path.join(process.cwd(), ".env.local")
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf8")
    if (content.includes("COMPOSIO_API_KEY=")) {
      content = content.replace(/COMPOSIO_API_KEY=.*/, `COMPOSIO_API_KEY=${trimmed}`)
    } else {
      content += `\nCOMPOSIO_API_KEY=${trimmed}\n`
    }
    fs.writeFileSync(envPath, content, "utf8")
  }

  // 2. Set on Convex deployment
  try {
    await execAsync(`node node_modules/convex/bin/main.js env set COMPOSIO_API_KEY ${trimmed}`)
  } catch (err) {
    console.warn("Could not push COMPOSIO_API_KEY to Convex CLI:", err)
  }

  return { success: true }
}
