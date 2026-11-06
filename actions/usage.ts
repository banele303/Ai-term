"use server"

import { usageKind, type UsageKind } from "@/db/schema"

// Whether the signed-in user's billing period has any of this allowance left
export async function hasUsageLeft(kind: UsageKind) {
  if (!usageKind.enumValues.includes(kind)) throw new Error("Unknown usage")
  // Unlimited in workspace mode
  return true
}
