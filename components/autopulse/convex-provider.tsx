"use client"

import * as React from "react"
import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { ConvexReactClient } from "convex/react"

const ConvexReadyContext = React.createContext<boolean>(false)

export function useConvexReady(): boolean {
  return React.useContext(ConvexReadyContext)
}

export function AutopulseConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim()

  const client = React.useMemo(() => {
    if (!convexUrl) return null
    return new ConvexReactClient(convexUrl)
  }, [convexUrl])

  if (!client) {
    return (
      <ConvexReadyContext.Provider value={false}>
        {children}
      </ConvexReadyContext.Provider>
    )
  }

  return (
    <ConvexReadyContext.Provider value={true}>
      <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>
    </ConvexReadyContext.Provider>
  )
}
