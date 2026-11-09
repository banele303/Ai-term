"use client"

import * as React from "react"
import { cn } from "cn"

interface SkeletonProps extends React.ComponentProps<"div"> {
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-zinc-200/80 dark:bg-zinc-800/60 border border-black/[0.04] dark:border-white/[0.04] transition-all",
        shimmer ? "skeleton-wave" : "animate-pulse",
        className
      )}
      {...props}
    />
  )
}

/** Full-screen, rich conversational skeleton covering entire chat layout */
export function ChatPageSkeleton() {
  return (
    <div className="flex h-svh w-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-xl bg-zinc-800" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36 bg-zinc-800" />
              <Skeleton className="h-4 w-16 rounded-full bg-emerald-500/20" />
            </div>
            <Skeleton className="h-2.5 w-48 bg-zinc-850" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg bg-zinc-850" />
          <Skeleton className="h-8 w-8 rounded-lg bg-zinc-850" />
          <Skeleton className="h-8 w-8 rounded-lg bg-zinc-850" />
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6 flex flex-col justify-between max-w-5xl w-full mx-auto gap-6">
        <div className="space-y-6 overflow-hidden">
          {/* Fleet Status Badge */}
          <div className="mx-auto flex max-w-lg items-center justify-center gap-2 py-2">
            <Skeleton className="h-3 w-16 bg-zinc-850" />
            <Skeleton className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
            <Skeleton className="h-3 w-44 bg-zinc-850" />
          </div>

          {/* Message 1: Agent greeting bubble */}
          <div className="flex items-start gap-3">
            <Skeleton className="size-8 rounded-xl bg-zinc-800 shrink-0 mt-0.5" />
            <div className="space-y-2 max-w-2xl flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-28 bg-zinc-800" />
                <Skeleton className="h-3 w-16 bg-zinc-850" />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-zinc-800/70 bg-zinc-900/60 p-4 space-y-2.5 shadow-sm">
                <Skeleton className="h-3.5 w-full bg-zinc-800" />
                <Skeleton className="h-3.5 w-11/12 bg-zinc-800" />
                <Skeleton className="h-3.5 w-3/4 bg-zinc-800" />
              </div>
            </div>
          </div>

          {/* Message 2: Outbound user prompt bubble */}
          <div className="flex items-start justify-end gap-3">
            <div className="space-y-2 max-w-xl flex-1 flex flex-col items-end">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-14 bg-zinc-850" />
                <Skeleton className="h-3.5 w-20 bg-zinc-800" />
              </div>
              <div className="rounded-2xl rounded-tr-sm border border-emerald-500/20 bg-emerald-950/20 p-3.5 space-y-2 w-full max-w-md">
                <Skeleton className="h-3.5 w-full bg-emerald-500/20" />
                <Skeleton className="h-3.5 w-4/5 bg-emerald-500/20" />
              </div>
            </div>
            <Skeleton className="size-8 rounded-xl bg-zinc-800 shrink-0 mt-0.5" />
          </div>

          {/* Message 3: Agent action & quotation card skeleton */}
          <div className="flex items-start gap-3">
            <Skeleton className="size-8 rounded-xl bg-zinc-800 shrink-0 mt-0.5" />
            <div className="space-y-3 max-w-2xl flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-32 bg-zinc-800" />
                <Skeleton className="h-3 w-20 bg-zinc-850" />
              </div>

              {/* Tool Execution Pill */}
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1">
                <Skeleton className="size-2 rounded-full bg-sky-400" />
                <Skeleton className="h-3 w-48 bg-sky-500/30" />
              </div>

              {/* Rich Quotation Summary Card Skeleton */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="size-7 rounded-lg bg-zinc-800" />
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-36 bg-zinc-800" />
                      <Skeleton className="h-2.5 w-24 bg-zinc-850" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full bg-emerald-500/20" />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-16 bg-zinc-850" />
                    <Skeleton className="h-4 w-24 bg-zinc-800" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-16 bg-zinc-850" />
                    <Skeleton className="h-4 w-20 bg-zinc-800" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-16 bg-zinc-850" />
                    <Skeleton className="h-4 w-20 bg-zinc-800" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-16 bg-zinc-850" />
                    <Skeleton className="h-4 w-28 bg-emerald-500/30" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Omnichannel Composer Bar */}
        <div className="space-y-2 pt-2">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3 shadow-lg space-y-2.5">
            <Skeleton className="h-10 w-full rounded-xl bg-zinc-850" />
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-lg bg-zinc-800" />
                <Skeleton className="h-7 w-24 rounded-lg bg-zinc-800" />
              </div>
              <Skeleton className="h-8 w-24 rounded-xl bg-emerald-500/30" />
            </div>
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-2.5 w-72 bg-zinc-850" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Rich sidebar chat list skeleton */
export function SidebarChatListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1 p-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-lg p-2 border border-transparent"
        >
          <Skeleton className="size-8 rounded-full bg-zinc-800 shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 bg-zinc-800" />
              <Skeleton className="h-2.5 w-10 bg-zinc-850" />
            </div>
            <Skeleton className="h-2.5 w-36 bg-zinc-850" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Full-screen Kanban & CRM board skeleton */
export function CrmBoardSkeleton() {
  return (
    <div className="flex h-screen w-screen flex-col bg-[#11100e] text-[#eae7e1] overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-12 border-b border-[#25231f] bg-[#161512] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-20 rounded-lg bg-[#22201c]" />
          <Skeleton className="h-5 w-36 bg-[#262420]" />
          <Skeleton className="h-5 w-28 rounded-full bg-emerald-500/10" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24 rounded-lg bg-[#22201c]" />
          <Skeleton className="h-7 w-24 rounded-lg bg-emerald-600/30" />
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 border-b border-[#22201c] shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#262420] bg-[#161512] p-3 space-y-2">
            <Skeleton className="h-2.5 w-20 bg-[#2b2823]" />
            <Skeleton className="h-5 w-28 bg-[#332f28]" />
          </div>
        ))}
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, col) => (
          <div key={col} className="flex flex-col rounded-xl border border-[#25231f] bg-[#141310] p-3 gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#201e1a]">
              <Skeleton className="h-3.5 w-20 bg-[#282520]" />
              <Skeleton className="size-5 rounded-full bg-[#282520]" />
            </div>
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="rounded-xl border border-[#292621] bg-[#1a1916] p-3 space-y-2.5">
                <Skeleton className="h-3.5 w-3/4 bg-[#2e2a24]" />
                <Skeleton className="h-3 w-full bg-[#262420]" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-3.5 w-16 bg-emerald-500/20" />
                  <Skeleton className="h-3 w-10 bg-[#262420]" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { Skeleton }
