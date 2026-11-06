"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function OAuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toolkit = searchParams.get("toolkit") ?? "gmail"
  const returnTo = searchParams.get("returnTo") ?? "/"

  useEffect(() => {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: "COMPOSIO_OAUTH_COMPLETE", toolkit },
          window.location.origin
        )
        window.close()
        return
      }
    } catch {
      // Ignore cross-window errors and fall back to redirect
    }

    const separator = returnTo.includes("?") ? "&" : "?"
    router.replace(`${returnTo}${separator}oauth_connected=${encodeURIComponent(toolkit)}`)
  }, [router, returnTo, toolkit])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
      <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
        <span className="size-2 rounded-full bg-emerald-400" />
        Authorization complete
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        Returning to workspace...
      </p>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-zinc-950 text-xs text-zinc-500">
          Completing authorization...
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}

