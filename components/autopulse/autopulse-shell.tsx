"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import {
  Bot,
  Database,
  Gauge,
  Kanban,
  LogOut,
  PlugZap,
  UserCheck,
  Users2,
  Wrench,
} from "lucide-react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Command Center",
    sublabel: "Sales, Cores & Margins",
    icon: Gauge,
    exact: true,
  },
  {
    href: "/",
    label: "AI Bots & Teammates",
    sublabel: "Gaze Avatars & Personas",
    icon: Users2,
    exact: true,
  },
  {
    href: "/dashboard/chat",
    label: "Agent Workspace",
    sublabel: "Parts & Ops Assistant",
    icon: Bot,
  },
  {
    href: "/dashboard/crm",
    label: "Customer Pipeline",
    sublabel: "WhatsApp · Email · Social",
    icon: Kanban,
  },
  {
    href: "/dashboard/knowledge-base",
    label: "Parts & VIN Lookup",
    sublabel: "Catalog & Fitment",
    icon: Database,
  },
  {
    href: "/dashboard/integrations",
    label: "Channels & Schedules",
    sublabel: "Accounts & Automations",
    icon: PlugZap,
  },
]

export function AutopulseShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const convexReady = useConvexReady()
  const isChatPage = pathname === "/dashboard/chat"
  const isCrmPage = pathname === "/dashboard/crm" || pathname.startsWith("/dashboard/crm/")

  return (
    <div
      className={cn(
        "dark flex w-full bg-zinc-950 text-zinc-100 selection:bg-sky-500/30 selection:text-sky-100",
        isChatPage ? "h-svh overflow-hidden" : "min-h-svh"
      )}
    >
      {/* Sidebar — Hidden on CRM page for maximum Kanban workspace */}
      {!isCrmPage && (
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/95 backdrop-blur xl:flex">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 px-5 py-4">
            <div className="flex size-9 items-center justify-center rounded-xl border border-sky-500/40 bg-gradient-to-br from-sky-500/20 via-zinc-900 to-emerald-500/20 shadow-[0_0_24px_-4px_rgba(14,165,233,0.45)]">
              <Wrench className="size-4 text-sky-400" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold tracking-tight text-zinc-50">
                AutoPulse
              </span>
              <p className="truncate text-[11px] text-zinc-400">
                Car Parts &amp; Workshop Desk
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                    active
                      ? "border-sky-500/40 bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent text-zinc-50 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.2)]"
                      : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/70 hover:text-zinc-100"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      active
                        ? "border-sky-400/40 bg-sky-500/20 text-sky-300"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 group-hover:text-zinc-200"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.label}</div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {item.sublabel}
                    </div>
                  </div>
                  {active && (
                    <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  )}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-3">
            {convexReady ? <StaffFooter /> : <PreviewStaffFooter />}
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          isChatPage && "h-full overflow-hidden"
        )}
      >
        {/* Mobile / Tablet Navigation Bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 overflow-x-auto border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2.5 backdrop-blur xl:hidden">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                  active
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-200"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </header>

        <main
          className={cn(
            "flex-1",
            isChatPage
              ? "flex min-h-0 flex-col overflow-hidden px-4 py-3 lg:px-6 lg:py-4"
              : isCrmPage
                ? "p-0"
                : "px-4 py-6 lg:px-8"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function StaffFooter() {
  const user = useQuery(api.auth.currentUser, {})
  const { signOut } = useAuthActions()
  const label =
    (user && "name" in user && user.name) ||
    (user && "email" in user && user.email) ||
    "Parts Desk"

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
          <UserCheck className="size-4" />
        </div>
        <div className="min-w-0 text-xs">
          <div className="truncate font-medium text-zinc-200">{label}</div>
          <div className="text-[10px] text-emerald-400">Online</div>
        </div>
      </div>

      <button
        type="button"
        title="Sign out"
        onClick={() => void signOut()}
        className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition hover:border-zinc-700 hover:text-rose-300"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  )
}

function PreviewStaffFooter() {
  return (
    <div className="flex w-full items-center gap-2.5 text-xs">
      <div className="flex size-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300">
        <UserCheck className="size-4" />
      </div>
      <div>
        <div className="font-medium text-zinc-200">Parts Desk</div>
        <div className="text-[10px] text-zinc-500">Offline</div>
      </div>
    </div>
  )
}
