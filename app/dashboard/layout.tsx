import { AutopulseShell } from "@/components/autopulse/autopulse-shell"
import { ConvexAuthGate } from "@/components/autopulse/convex-auth-gate"
import { AutopulseConvexProvider } from "@/components/autopulse/convex-provider"

export const metadata = {
  title: "AutoPulse AI — Autonomous Car Parts Dashboard & Agentic CRM",
  description:
    "Enterprise B2B/B2C Car Parts Management Platform, Hybrid RAG Knowledge Base, Whapi.cloud WhatsApp Commerce & Composio Omnichannel CRM.",
}

export default function AutopulseDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AutopulseConvexProvider>
      <ConvexAuthGate>
        <AutopulseShell>{children}</AutopulseShell>
      </ConvexAuthGate>
    </AutopulseConvexProvider>
  )
}
