import { AppSidebar } from "@/components/app-sidebar"
import { AutopulseConvexProvider } from "@/components/autopulse/convex-provider"
import { ConvexAuthGate } from "@/components/autopulse/convex-auth-gate"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AgentRunnerProvider } from "@/components/agent-runner-provider"

export default function TeammatesLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AutopulseConvexProvider>
      <ConvexAuthGate>
        <AgentRunnerProvider>
          <div className="dark flex h-svh w-full bg-zinc-950 text-zinc-100 selection:bg-sky-500/30 selection:text-sky-100">
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset className="overflow-hidden bg-zinc-950 text-zinc-100">
                {children}
              </SidebarInset>
            </SidebarProvider>
          </div>
        </AgentRunnerProvider>
      </ConvexAuthGate>
    </AutopulseConvexProvider>
  )
}
