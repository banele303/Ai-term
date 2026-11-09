"use client"

import * as React from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import { KeyRound, Lock, Mail, Sparkles, User, Wrench, Zap } from "lucide-react"

import { useConvexReady } from "@/components/autopulse/convex-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"

export function ConvexAuthGate({ children }: { children: React.ReactNode }) {
  const convexReady = useConvexReady()
  if (!convexReady) {
    return <>{children}</>
  }
  return <LiveConvexAuthGate>{children}</LiveConvexAuthGate>
}

function LiveConvexAuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()

  const [flow, setFlow] = React.useState<"signIn" | "signUp">("signUp")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [demoLoading, setDemoLoading] = React.useState(false)

  if (isLoading) {
    return (
      <div className="dark flex min-h-svh flex-col items-center justify-center p-6 bg-zinc-950 text-zinc-200 select-none">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-zinc-800/60">
            <Skeleton className="size-11 rounded-2xl bg-sky-500/20" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-36 bg-zinc-800" />
              <Skeleton className="h-3 w-52 bg-zinc-800/60" />
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-16 bg-zinc-800" />
              <Skeleton className="h-10 w-full rounded-xl bg-zinc-850" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-16 bg-zinc-800" />
              <Skeleton className="h-10 w-full rounded-xl bg-zinc-850" />
            </div>
          </div>

          {/* Submit button & quick link */}
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-10 w-full rounded-xl bg-sky-500/20" />
            <Skeleton className="h-10 w-full rounded-xl bg-zinc-800/60" />
          </div>

          <div className="flex justify-center pt-2">
            <Skeleton className="h-2.5 w-40 bg-zinc-850" />
          </div>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <>{children}</>
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || password.length < 8) {
      toast.add({
        type: "error",
        title: "Invalid credentials",
        description: "Enter a valid email and a password of at least 8 characters.",
      })
      return
    }
    setSubmitting(true)
    try {
      await signIn("password", {
        flow,
        email: email.trim().toLowerCase(),
        password,
        ...(flow === "signUp" && name.trim() ? { name: name.trim() } : {}),
      })
      toast.add({
        type: "success",
        title: flow === "signUp" ? "Account created" : "Signed in",
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: flow === "signUp" ? "Could not sign up" : "Sign-in failed",
        description:
          flow === "signIn"
            ? "Check your email/password, or switch to 'Create Account' if this is your first login."
            : (error as Error).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleInstantDemo = async () => {
    setDemoLoading(true)
    try {
      await signIn("anonymous")
      toast.add({
        type: "success",
        title: "Welcome back",
      })
    } catch (error) {
      toast.add({
        type: "error",
        title: "Quick sign-in failed",
        description: (error as Error).message,
      })
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="dark relative flex min-h-svh items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[38rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-72 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-900/85 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border border-sky-500/40 bg-gradient-to-br from-sky-500/20 via-zinc-900 to-emerald-500/20 shadow-[0_0_24px_-4px_rgba(14,165,233,0.45)]">
            <Wrench className="size-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-50">
              AutoPulse
            </h1>
            <p className="text-xs text-zinc-400">
              Car Parts &amp; Workshop Management
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-200">
            <Sparkles className="size-3.5 text-emerald-400" />
            Quick Staff Access
          </span>
          <Button
            type="button"
            disabled={demoLoading || submitting}
            onClick={handleInstantDemo}
            className="mt-2.5 h-9 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            {demoLoading ? (
              <Skeleton className="mr-1.5 size-3.5 rounded-full bg-white/70" />
            ) : (
              <Zap className="mr-1.5 size-3.5" />
            )}
            Enter Command Center Immediately
          </Button>
        </div>

        <div className="my-5 flex items-center gap-3 text-[11px] text-zinc-500">
          <div className="h-px flex-1 bg-zinc-800" />
          <span>OR EMAIL &amp; PASSWORD</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => setFlow("signUp")}
            className={`cursor-pointer rounded-md py-1.5 text-xs font-medium transition ${
              flow === "signUp"
                ? "bg-sky-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => setFlow("signIn")}
            className={`cursor-pointer rounded-md py-1.5 text-xs font-medium transition ${
              flow === "signIn"
                ? "bg-sky-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          {flow === "signUp" && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-300">
                Staff Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-zinc-500" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Banele — Parts Desk Lead"
                  className="border-zinc-800 bg-zinc-950 pl-8 text-xs text-zinc-100"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-300">
              Work Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-zinc-500" />
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parts@autopulse.co.za"
                className="border-zinc-800 bg-zinc-950 pl-8 text-xs text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-300">
              Password (min. 8 characters)
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-zinc-500" />
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="border-zinc-800 bg-zinc-950 pl-8 text-xs text-zinc-100"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting || demoLoading}
            className="h-9 w-full bg-sky-600 text-xs font-semibold text-white hover:bg-sky-500"
          >
            {submitting ? (
              <Skeleton className="mr-1.5 size-3.5 rounded-full bg-white/70" />
            ) : (
              <KeyRound className="mr-1.5 size-3.5" />
            )}
            {flow === "signUp" ? "Create Account" : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  )
}
