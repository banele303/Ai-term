"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function AiTeammatesLogo({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl p-[1px] transition-all duration-300",
        "bg-gradient-to-br from-sky-400 via-indigo-500 to-emerald-400",
        "shadow-[0_0_12px_rgba(56,189,248,0.28)] hover:shadow-[0_0_18px_rgba(129,140,248,0.45)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      <div className="flex size-full items-center justify-center rounded-[11px] bg-zinc-950/95 backdrop-blur-md">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="size-5 transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            <linearGradient id="logo-cyan-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            <linearGradient id="logo-violet-grad" x1="28" y1="4" x2="4" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient id="logo-emerald-grad" x1="16" y1="12" x2="16" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
            <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Tri-Facet Autonomous Agent Nexus */}
          {/* Top-Right Facet (Ops & Sourcing) */}
          <path
            d="M16 4.5L25 9.8V17L16 11.7V4.5Z"
            fill="url(#logo-cyan-grad)"
            fillOpacity="0.95"
          />
          {/* Bottom-Right Facet (Comms & Social) */}
          <path
            d="M25 17L25 22.5L16 27.8V22.2L25 17Z"
            fill="url(#logo-violet-grad)"
            fillOpacity="0.95"
          />
          {/* Bottom-Left Facet (Quotes & WhatsApp) */}
          <path
            d="M16 27.8L7 22.5V17L16 22.2V27.8Z"
            fill="url(#logo-emerald-grad)"
            fillOpacity="0.95"
          />
          {/* Top-Left Facet */}
          <path
            d="M7 17L7 9.8L16 4.5V11.7L7 17Z"
            fill="url(#logo-cyan-grad)"
            fillOpacity="0.75"
          />
          {/* Center Nexus Shield */}
          <path
            d="M16 11.7L25 17L16 22.2L7 17L16 11.7Z"
            fill="#09090B"
            stroke="url(#logo-cyan-grad)"
            strokeWidth="0.8"
          />
          {/* Central Radiant Neural Core */}
          <circle cx="16" cy="17" r="2.8" fill="#38BDF8" filter="url(#logo-glow)" />
          <circle cx="16" cy="17" r="1.3" fill="#FFFFFF" />

          {/* Satellite Agent Nodes */}
          <circle cx="16" cy="4.5" r="1.1" fill="#38BDF8" />
          <circle cx="25" cy="22.5" r="1.1" fill="#C084FC" />
          <circle cx="7" cy="22.5" r="1.1" fill="#34D399" />
        </svg>
      </div>
    </div>
  )
}
