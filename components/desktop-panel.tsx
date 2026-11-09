"use client"

import * as React from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { ExternalLinkIcon, RotateCwIcon, XIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import {
  GmailConnectModal,
  GoogleMark,
  formatGoogleAccountLabel,
} from "@/components/gmail-connect-modal"
import { QuotePdfModal, type QuoteData } from "@/components/quote-pdf-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

export type DesktopPanelTab = "browser" | "actions" | "desktop" | "terminal" | "specs"

export type ActionSubView =
  | "overview"
  | "quotecraft"
  | "aerocomm"
  | "supplyhunter"
  | "socialdms"
  | "ads"

export type DesktopPanelContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  currentUrl: string
  setCurrentUrl: (url: string) => void
  activeTab: DesktopPanelTab
  setActiveTab: (tab: DesktopPanelTab) => void
  actionSubView: ActionSubView
  setActionSubView: (view: ActionSubView) => void
  launchCloudDesktop: (target?: string) => Promise<void>
  desktopVncUrl: string | null
  isStartingDesktop: boolean
  isGmailModalOpen: boolean
  setIsGmailModalOpen: (open: boolean) => void
  openGmailModal: () => void
  isGmailActive: boolean
  gmailAccountLabel: string | null
  syncIntegrations: () => Promise<void>
  isQuoteModalOpen: boolean
  setIsQuoteModalOpen: (open: boolean) => void
  selectedQuote: QuoteData | null
  setSelectedQuote: (quote: QuoteData | null) => void
  openQuoteModal: (quote?: QuoteData) => void
}

const DesktopPanelContext =
  React.createContext<DesktopPanelContextValue | null>(null)

export function useDesktopPanel() {
  return React.useContext(DesktopPanelContext)
}

export function DesktopPanelProvider({
  children,
}: {
  chatId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [currentUrl, setCurrentUrl] = React.useState("https://www.cars.co.za")
  const [activeTab, setActiveTab] = React.useState<DesktopPanelTab>("actions")
  const [actionSubView, setActionSubView] = React.useState<ActionSubView>("overview")
  const [desktopVncUrl, setDesktopVncUrl] = React.useState<string | null>(null)
  const [isStartingDesktop, setIsStartingDesktop] = React.useState(false)
  const [isGmailModalOpen, setIsGmailModalOpen] = React.useState(false)
  const [isQuoteModalOpen, setIsQuoteModalOpen] = React.useState(false)
  const [selectedQuote, setSelectedQuote] = React.useState<QuoteData | null>(null)

  const connections = useQuery(api.composioTools.listConnections, {})
  const syncConnectionsAction = useAction(api.composioTools.syncConnections)

  const gmailConnection = connections?.toolkits?.find((t) => t.toolkit === "gmail")?.connection
  const isGmailActive = gmailConnection?.status === "active"
  const gmailAccountLabel = gmailConnection?.accountLabel ?? null

  const syncIntegrations = React.useCallback(async () => {
    try {
      await syncConnectionsAction({})
    } catch {
      // Ignore background sync failures when offline or unconfigured
    }
  }, [syncConnectionsAction])

  // Sync Composio connections on mount, OAuth return query param, and postMessage
  React.useEffect(() => {
    void syncIntegrations()

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const connectedToolkit = params.get("oauth_connected")
      if (connectedToolkit) {
        setOpen(true)
        setActiveTab("actions")
        if (connectedToolkit === "gmail") {
          setActionSubView("aerocomm")
        } else if (connectedToolkit === "tiktok" || connectedToolkit === "instagram") {
          setActionSubView("socialdms")
        }
        params.delete("oauth_connected")
        const nextQuery = params.toString()
        const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`
        window.history.replaceState({}, "", cleanUrl)
      }
    }

    const handleWindowMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "COMPOSIO_OAUTH_COMPLETE"
      ) {
        void syncIntegrations()
      }
    }

    const handleFocus = () => {
      void syncIntegrations()
    }

    window.addEventListener("message", handleWindowMessage)
    window.addEventListener("focus", handleFocus)
    return () => {
      window.removeEventListener("message", handleWindowMessage)
      window.removeEventListener("focus", handleFocus)
    }
  }, [syncIntegrations])

  const openGmailModal = React.useCallback(() => {
    setIsGmailModalOpen(true)
  }, [])

  const toggle = React.useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const launchCloudDesktop = React.useCallback(
    async (target?: string) => {
      const dest = target || currentUrl
      setOpen(true)
      setIsStartingDesktop(true)
      setActiveTab("desktop")

      try {
        const res = await fetch("/api/daytona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "launch_browser",
            command: dest,
          }),
        })

        const data = await res.json()
        if (res.ok && data.desktopUrl) {
          setDesktopVncUrl(data.desktopUrl)
          toast.add({
            type: "success",
            title: "Cloud desktop connected",
            description: `Browser session started for ${dest}.`,
          })
        } else {
          toast.add({
            type: "error",
            title: "Desktop launch failed",
            description: data.error || "Could not start cloud desktop",
          })
        }
      } catch (err) {
        toast.add({
          type: "error",
          title: "Desktop connection error",
          description: err instanceof Error ? err.message : "Network error",
        })
      } finally {
        setIsStartingDesktop(false)
      }
    },
    [currentUrl]
  )

  React.useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "SWITCH_TAB" && e.data?.tab) {
        setOpen(true)
        setActiveTab(e.data.tab)
        if (e.data.tab === "desktop" && !desktopVncUrl && !isStartingDesktop) {
          void launchCloudDesktop()
        }
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [desktopVncUrl, isStartingDesktop, launchCloudDesktop])

  const openQuoteModal = React.useCallback((quoteData?: QuoteData) => {
    if (quoteData) {
      setSelectedQuote(quoteData)
    }
    setIsQuoteModalOpen(true)
  }, [])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      currentUrl,
      setCurrentUrl,
      activeTab,
      setActiveTab,
      actionSubView,
      setActionSubView,
      launchCloudDesktop,
      desktopVncUrl,
      isStartingDesktop,
      isGmailModalOpen,
      setIsGmailModalOpen,
      openGmailModal,
      isGmailActive,
      gmailAccountLabel,
      syncIntegrations,
      isQuoteModalOpen,
      setIsQuoteModalOpen,
      selectedQuote,
      setSelectedQuote,
      openQuoteModal,
    }),
    [
      open,
      toggle,
      currentUrl,
      activeTab,
      actionSubView,
      launchCloudDesktop,
      desktopVncUrl,
      isStartingDesktop,
      isGmailModalOpen,
      openGmailModal,
      isGmailActive,
      gmailAccountLabel,
      syncIntegrations,
      isQuoteModalOpen,
      selectedQuote,
      openQuoteModal,
    ]
  )

  return (
    <DesktopPanelContext.Provider value={value}>
      {children}
      <GmailConnectModal
        open={isGmailModalOpen}
        onOpenChange={setIsGmailModalOpen}
      />
      <QuotePdfModal
        open={isQuoteModalOpen}
        onOpenChange={setIsQuoteModalOpen}
        quote={selectedQuote}
      />
    </DesktopPanelContext.Provider>
  )
}

const ACTION_NAV_ITEMS: ReadonlyArray<{ id: ActionSubView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "quotecraft", label: "Quotes" },
  { id: "aerocomm", label: "Email & WhatsApp" },
  { id: "supplyhunter", label: "Sourcing" },
  { id: "socialdms", label: "Social DMs" },
  { id: "ads", label: "Ads" },
]

export function DesktopPanel({
  name,
  job,
}: {
  name: string
  job?: string
  instructions?: string
}) {
  const desktop = useDesktopPanel()
  const open = desktop?.open ?? false
  const setOpen = desktop?.setOpen ?? (() => { })
  const currentUrl = desktop?.currentUrl ?? "https://www.cars.co.za"
  const setCurrentUrl = desktop?.setCurrentUrl ?? (() => { })
  const activeTab = desktop?.activeTab ?? "actions"
  const setActiveTab = desktop?.setActiveTab ?? (() => { })
  const actionSubView = desktop?.actionSubView ?? "overview"
  const setActionSubView = desktop?.setActionSubView ?? (() => { })
  const handleLaunchCloudDesktop =
    desktop?.launchCloudDesktop ?? (() => Promise.resolve())
  const desktopVncUrl = desktop?.desktopVncUrl ?? null
  const isStartingDesktop = desktop?.isStartingDesktop ?? false
  const openGmailModal = desktop?.openGmailModal ?? (() => { })
  const syncIntegrations = desktop?.syncIntegrations ?? (() => Promise.resolve())
  const openQuoteModal = desktop?.openQuoteModal ?? (() => { })

  const [urlInput, setUrlInput] = React.useState(currentUrl)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  React.useEffect(() => {
    setUrlInput(currentUrl)
  }, [currentUrl])

  // Live Convex data & actions
  const storeContext = useQuery(api.dashboard.botStoreContext, {})
  const connections = useQuery(api.composioTools.listConnections, {})
  const initiateConnectionAction = useAction(api.composioTools.initiateConnection)
  const disconnectToolkitAction = useAction(api.composioTools.disconnectToolkit)
  const disconnectGmailMut = useMutation(api.composioTools.disconnectGmailAccount)
  const recordOutreachMut = useMutation(api.teammates.recordCustomerOutreach)
  const recordSupplierRfqMut = useMutation(api.teammates.recordSupplierRFQ)
  const recordCampaignMut = useMutation(api.teammates.recordCampaignUpdate)
  const createQuoteAndDealMut = useMutation(api.crm.createQuoteAndDeal)

  const gmailConnection = connections?.toolkits?.find((t) => t.toolkit === "gmail")?.connection
  const tiktokConnection = connections?.toolkits?.find((t) => t.toolkit === "tiktok")?.connection
  const instagramConnection = connections?.toolkits?.find((t) => t.toolkit === "instagram")?.connection

  const isGmailActive = gmailConnection?.status === "active"
  const isTiktokActive = tiktokConnection?.status === "active"
  const isInstagramActive = instagramConnection?.status === "active"

  // Determine default sub-view from current bot
  const initialSubView: ActionSubView = React.useMemo(() => {
    const n = name.toLowerCase()
    const j = (job || "").toLowerCase()
    if (n.includes("fame") || n.includes("whatsapp") || j.includes("whatsapp") || j.includes("client")) {
      return "aerocomm"
    }
    if (n.includes("quote") || n.includes("craft") || j.includes("quote") || j.includes("pdf") || j.includes("estimator")) {
      return "quotecraft"
    }
    if (n.includes("aero") || n.includes("comm") || j.includes("email") || j.includes("customer")) {
      return "aerocomm"
    }
    if (n.includes("supply") || n.includes("hunter") || j.includes("sourcing") || j.includes("inventory")) {
      return "supplyhunter"
    }
    if (n.includes("omni") || n.includes("pulse") || j.includes("social") || j.includes("tiktok")) {
      return "socialdms"
    }
    return "overview"
  }, [name, job])

  const initializedBotRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (initializedBotRef.current !== name) {
      initializedBotRef.current = name
      setActionSubView(initialSubView)
    }
  }, [name, initialSubView, setActionSubView])

  // ==========================================
  // OAuth Connection Helper (Google / TikTok / Instagram)
  // ==========================================
  const [connectingToolkit, setConnectingToolkit] = React.useState<
    "gmail" | "tiktok" | "instagram" | null
  >(null)
  const [disconnectingToolkit, setDisconnectingToolkit] = React.useState<
    "gmail" | "tiktok" | "instagram" | null
  >(null)
  const [customAuthToolkit, setCustomAuthToolkit] = React.useState<
    "tiktok" | "instagram" | null
  >(null)
  const [customAuthMode, setCustomAuthMode] = React.useState<
    "credentials" | "configId"
  >("credentials")
  const [customClientId, setCustomClientId] = React.useState("")
  const [customClientSecret, setCustomClientSecret] = React.useState("")
  const [customAuthConfigId, setCustomAuthConfigId] = React.useState("")
  const [customRedirectUri, setCustomRedirectUri] = React.useState(
    "https://backend.composio.dev/api/v1/auth-apps/add"
  )
  const [copiedRedirectUri, setCopiedRedirectUri] = React.useState(false)
  const oauthPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    return () => {
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    }
  }, [])

  const formatCleanError = (raw: string) => {
    const jsonIdx = raw.indexOf("{")
    if (jsonIdx !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(jsonIdx)) as {
          error?: { message?: string }
        }
        if (parsed?.error?.message) return parsed.error.message
      } catch {
        // Ignore parse failure
      }
    }
    return raw
  }

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(customRedirectUri)
      setCopiedRedirectUri(true)
      setTimeout(() => setCopiedRedirectUri(false), 1800)
    } catch {
      // Ignore clipboard failure
    }
  }

  const handleConnectOAuth = async (
    toolkit: "gmail" | "tiktok" | "instagram",
    options?: {
      clientId?: string
      clientSecret?: string
      authConfigId?: string
    }
  ) => {
    setConnectingToolkit(toolkit)
    try {
      const callbackUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/oauth-callback?toolkit=${toolkit}&returnTo=${encodeURIComponent(
            window.location.pathname + window.location.search
          )}`
          : undefined

      const res = (await initiateConnectionAction({
        toolkit,
        callbackUrl,
        ...(options?.clientId ? { clientId: options.clientId.trim() } : {}),
        ...(options?.clientSecret
          ? { clientSecret: options.clientSecret.trim() }
          : {}),
        ...(options?.authConfigId
          ? { authConfigId: options.authConfigId.trim() }
          : {}),
      })) as {
        connectedAccountId: string
        redirectUrl: string | null
        requiresCustomAuth?: boolean
        oauthRedirectUri?: string
        error?: string
      }

      if (
        res.requiresCustomAuth ||
        (res.error &&
          (res.error.includes("does not have managed credentials") ||
            res.error.includes("Default auth config not found")))
      ) {
        if (toolkit === "tiktok") {
          if (res.oauthRedirectUri) {
            setCustomRedirectUri(res.oauthRedirectUri)
          }
          setCustomAuthToolkit("tiktok")
          return
        }
      }

      if (res.error) {
        if (toolkit === "gmail" && (res.error.includes("401") || res.error.includes("API"))) {
          openGmailModal()
        }
        toast.add({
          type: "error",
          title: "Connection failed",
          description: formatCleanError(res.error),
        })
        return
      }

      if (toolkit === customAuthToolkit) {
        setCustomAuthToolkit(null)
        setCustomClientId("")
        setCustomClientSecret("")
        setCustomAuthConfigId("")
      }

      if (res.redirectUrl) {
        const popup = window.open(
          res.redirectUrl,
          `${toolkit}_oauth_popup`,
          "width=520,height=660,menubar=no,status=no,toolbar=no"
        )
        if (!popup) {
          window.location.href = res.redirectUrl
          return
        }

        if (oauthPollRef.current) clearInterval(oauthPollRef.current)
        oauthPollRef.current = setInterval(() => {
          void syncIntegrations()
          if (popup.closed) {
            if (oauthPollRef.current) clearInterval(oauthPollRef.current)
            oauthPollRef.current = null
            void syncIntegrations()
          }
        }, 2500)
      } else {
        await syncIntegrations()
      }
    } catch (err) {
      const rawMsg =
        err instanceof Error ? err.message : "Could not start authorization"
      if (
        toolkit === "tiktok" &&
        (rawMsg.includes("does not have managed credentials") ||
          rawMsg.includes("Default auth config not found"))
      ) {
        setCustomAuthToolkit("tiktok")
        return
      }
      toast.add({
        type: "error",
        title: "Connection error",
        description: formatCleanError(rawMsg),
      })
    } finally {
      setConnectingToolkit(null)
    }
  }

  const handleDisconnectOAuth = async (toolkit: "gmail" | "tiktok" | "instagram") => {
    setDisconnectingToolkit(toolkit)
    try {
      await disconnectToolkitAction({ toolkit }).catch(() => null)
      if (toolkit === "gmail") {
        await disconnectGmailMut()
      }
      toast.add({
        type: "info",
        title: "Account disconnected",
      })
    } catch (err) {
      toast.add({
        type: "error",
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "Could not disconnect account",
      })
    } finally {
      setDisconnectingToolkit(null)
    }
  }

  // ==========================================
  // Social DMs Auto-Reply State (TikTok & Instagram ONLY)
  // ==========================================
  const [dmAutoReplyEnabled, setDmAutoReplyEnabled] = React.useState(true)
  const [dmReplyInstructions, setDmReplyInstructions] = React.useState(
    "Check live parts stock, reply clearly in under 3 sentences, and request a 17-digit VIN when vehicle fitment needs confirmation."
  )

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("autopulse.dmAutoReply")
      if (saved) {
        const parsed = JSON.parse(saved) as {
          enabled?: boolean
          instructions?: string
        }
        if (typeof parsed.enabled === "boolean") setDmAutoReplyEnabled(parsed.enabled)
        if (typeof parsed.instructions === "string" && parsed.instructions.trim()) {
          setDmReplyInstructions(parsed.instructions)
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const handleSaveDmSettings = (nextEnabled?: boolean) => {
    const enabledVal = typeof nextEnabled === "boolean" ? nextEnabled : dmAutoReplyEnabled
    try {
      window.localStorage.setItem(
        "autopulse.dmAutoReply",
        JSON.stringify({
          enabled: enabledVal,
          instructions: dmReplyInstructions.trim(),
        })
      )
      toast.add({
        type: "success",
        title: "DM auto-reply updated",
      })
    } catch {
      // Ignore storage errors
    }
  }

  const recentSocialDms = React.useMemo(
    () =>
      (storeContext?.messages ?? []).filter(
        (m) => m.channel === "instagram" || m.channel === "tiktok_lead"
      ),
    [storeContext?.messages]
  )

  // ==========================================
  // 1. Email & WhatsApp State
  // ==========================================
  const [aeroChannel, setAeroChannel] = React.useState<"email" | "whatsapp">("email")
  const [aeroRecipient, setAeroRecipient] = React.useState("workshop@apexautos.co.za")
  const [aeroSubject, setAeroSubject] = React.useState("AutoPulse Quote: Bosch 140A Alternators (Fleet Pricing)")
  const [aeroQuoteRef, setAeroQuoteRef] = React.useState("QT-2026-0881")
  const [aeroBody, setAeroBody] = React.useState(
    "Hi Apex Autos team,\n\nFollowing your inquiry for Bosch 140A Alternators (SKU: BOS-ALT-140A), we can supply 2x units at ZAR 3,850 each (Excl. VAT) with guaranteed same-day dispatch.\n\nPlease find your formal quote attached or reply to confirm order.\n\nBest regards,\nAutoPulse Operations"
  )
  const [aeroStatus, setAeroStatus] = React.useState<"idle" | "submitting" | "success">("idle")
  const [aeroReceipt, setAeroReceipt] = React.useState<string | null>(null)

  const handleDispatchAeroComm = async () => {
    setAeroStatus("submitting")
    try {
      const res = await recordOutreachMut({
        recipient: aeroRecipient,
        channel: aeroChannel,
        subject: aeroChannel === "email" ? aeroSubject : undefined,
        body: aeroBody,
        quoteRef: aeroQuoteRef || undefined,
      })
      setAeroReceipt(res.receipt)
      setAeroStatus("success")
      toast.add({
        type: "success",
        title: aeroChannel === "email" ? "Email dispatched" : "WhatsApp dispatched",
        description: `Reference #${res.receipt} logged.`,
      })
    } catch (err) {
      setAeroStatus("idle")
      toast.add({
        type: "error",
        title: "Dispatch failed",
        description: err instanceof Error ? err.message : "Error sending message",
      })
    }
  }

  // ==========================================
  // 2. Parts Sourcing & RFQs State
  // ==========================================
  const [rfqSupplier, setRfqSupplier] = React.useState("Masterparts SA (Johannesburg)")
  const [rfqSku, setRfqSku] = React.useState("BOS-ALT-140A")
  const [rfqPartName, setRfqPartName] = React.useState("Bosch 140A Alternator")
  const [rfqQuantity, setRfqQuantity] = React.useState(5)
  const [rfqTargetPrice, setRfqTargetPrice] = React.useState(2950)
  const [rfqNotes, setRfqNotes] = React.useState("Urgent replenishment: low threshold reached. Delivery needed by tomorrow 10:00 AM.")
  const [rfqStatus, setRfqStatus] = React.useState<"idle" | "submitting" | "success">("idle")
  const [rfqReceipt, setRfqReceipt] = React.useState<string | null>(null)

  const handleDispatchRfq = async () => {
    setRfqStatus("submitting")
    try {
      const res = await recordSupplierRfqMut({
        supplier: rfqSupplier,
        sku: rfqSku,
        partName: rfqPartName,
        quantity: Number(rfqQuantity),
        targetPrice: Number(rfqTargetPrice),
        notes: rfqNotes || undefined,
      })
      setRfqReceipt(res.poNumber)
      setRfqStatus("success")
      toast.add({
        type: "success",
        title: "Purchase order dispatched",
        description: `Order #${res.poNumber} sent to ${rfqSupplier}.`,
      })
    } catch (err) {
      setRfqStatus("idle")
      toast.add({
        type: "error",
        title: "RFQ creation failed",
        description: err instanceof Error ? err.message : "Error issuing RFQ",
      })
    }
  }

  const handleSelectLowStockPart = (part: { sku: string; name: string; price: number }) => {
    setRfqSku(part.sku)
    setRfqPartName(part.name)
    setRfqTargetPrice(Math.round(part.price * 0.72))
    setRfqQuantity(4)
    setActionSubView("supplyhunter")
  }

  // ==========================================
  // 3. Ads Campaign State (Separated from Social DMs)
  // ==========================================
  const [adPlatform, setAdPlatform] = React.useState<"tiktok_ads" | "facebook_ads">("tiktok_ads")
  const [adCampaignName, setAdCampaignName] = React.useState("TikTok High-Intent VIN Lead Form - Cape Town & Gauteng")
  const [adBudget, setAdBudget] = React.useState(1500)
  const [adHook, setAdHook] = React.useState("Stop buying cheap brake pads before checking OEM thermal specs.")
  const [adScript, setAdScript] = React.useState(
    "Hook: Why brake rotors warp within 2,000 km on commercial bakkies.\n\nBody: Certified Brembo OEM rotors and Ferodo heavy-duty pads dissipate heat faster under load.\n\nCTA: Submit your VIN for 24-hour nationwide delivery."
  )
  const [adStatus, setAdStatus] = React.useState<"idle" | "submitting" | "success">("idle")
  const [adReceipt, setAdReceipt] = React.useState<string | null>(null)

  const handleDispatchCampaign = async () => {
    setAdStatus("submitting")
    try {
      const res = await recordCampaignMut({
        platform: adPlatform,
        campaignName: adCampaignName,
        budget: Number(adBudget),
        hook: adHook,
        script: adScript,
      })
      setAdReceipt(res.campaignId)
      setAdStatus("success")
      toast.add({
        type: "success",
        title: "Campaign deployed",
        description: `Campaign #${res.campaignId} scheduled at ZAR ${adBudget}/day.`,
      })
    } catch (err) {
      setAdStatus("idle")
      toast.add({
        type: "error",
        title: "Campaign launch failed",
        description: err instanceof Error ? err.message : "Error creating campaign",
      })
    }
  }

  // ==========================================
  // 4. Quotes & Deals State
  // ==========================================
  const [qcSubTab, setQcSubTab] = React.useState<"create" | "deals">("create")
  const [qcClientName, setQcClientName] = React.useState("Apex Commercial Fleet")
  const [qcClientEmail, setQcClientEmail] = React.useState("workshop@apexautos.co.za")
  const [qcClientPhone, setQcClientPhone] = React.useState("+27 82 459 1044")
  const [qcCompanyName, setQcCompanyName] = React.useState("Apex Autos Ltd")
  const [qcVehicleMake, setQcVehicleMake] = React.useState("Toyota")
  const [qcVehicleModel, setQcVehicleModel] = React.useState("Hilux 2.8 GD-6")
  const [qcVehicleYear, setQcVehicleYear] = React.useState("2022")
  const [qcVehicleVin, setQcVehicleVin] = React.useState("AHTBA3CD409128456")
  const [qcNotes] = React.useState("Commercial fleet quote with 14-day price guarantee and priority dispatch.")
  const [qcItems, setQcItems] = React.useState<
    Array<{
      sku: string
      description: string
      quantity: number
      unitPrice: number
      partCatalogId?: unknown
    }>
  >([
    {
      sku: "BOS-ALT-140A",
      description: "Bosch 140A Alternator (OEM Spec)",
      quantity: 2,
      unitPrice: 3850,
    },
    {
      sku: "FER-BRK-D440",
      description: "Ferodo Premier Heavy-Duty Front Brake Pads",
      quantity: 2,
      unitPrice: 1250,
    },
  ])
  const [qcCustomSku, setQcCustomSku] = React.useState("")
  const [qcCustomDesc, setQcCustomDesc] = React.useState("")
  const [qcCustomQty, setQcCustomQty] = React.useState(1)
  const [qcCustomPrice, setQcCustomPrice] = React.useState(500)
  const [qcStatus, setQcStatus] = React.useState<"idle" | "submitting" | "success">("idle")

  const handleAddCustomItem = () => {
    if (!qcCustomDesc.trim()) return
    setQcItems((prev) => [
      ...prev,
      {
        sku: qcCustomSku.trim() || `ITEM-${Date.now().toString().slice(-4)}`,
        description: qcCustomDesc.trim(),
        quantity: Math.max(1, Number(qcCustomQty) || 1),
        unitPrice: Math.max(0, Number(qcCustomPrice) || 0),
      },
    ])
    setQcCustomSku("")
    setQcCustomDesc("")
    setQcCustomQty(1)
    setQcCustomPrice(500)
  }

  const handleRemoveQcItem = (index: number) => {
    setQcItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddFromCatalog = (part: {
    sku: string
    name: string
    brand: string
    price: number
    _id?: unknown
  }) => {
    setQcItems((prev) => [
      ...prev,
      {
        sku: part.sku,
        description: `${part.name} (${part.brand})`,
        quantity: 1,
        unitPrice: part.price,
        partCatalogId: part._id,
      },
    ])
    toast.add({
      type: "info",
      title: "Part added",
      description: `${part.name} added at ZAR ${part.price.toLocaleString("en-ZA")}.`,
    })
  }

  const handleCreateQuote = async () => {
    if (!qcClientName.trim()) {
      toast.add({
        type: "error",
        title: "Client name required",
      })
      return
    }
    if (qcItems.length === 0) {
      toast.add({
        type: "error",
        title: "Add at least one line item",
      })
      return
    }

    setQcStatus("submitting")
    try {
      const res = await createQuoteAndDealMut({
        clientName: qcClientName.trim(),
        clientEmail: qcClientEmail.trim() || undefined,
        clientPhone: qcClientPhone.trim() || undefined,
        companyName: qcCompanyName.trim() || undefined,
        channel: "dashboard",
        vehicleMake: qcVehicleMake.trim() || undefined,
        vehicleModel: qcVehicleModel.trim() || undefined,
        vehicleYear: qcVehicleYear ? Number(qcVehicleYear) : undefined,
        vinNumber: qcVehicleVin.trim() || undefined,
        notes: qcNotes.trim() || undefined,
        parts: qcItems.map((item) => ({
          sku: item.sku,
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          partId: (item.partCatalogId as never) || undefined,
        })),
      })

      const quoteObject: QuoteData = {
        id: res.dealId,
        quoteNumber: res.quoteNumber,
        date: new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }),
        validUntil: new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }),
        clientName: qcClientName,
        clientPhone: qcClientPhone,
        clientEmail: qcClientEmail,
        companyName: qcCompanyName || undefined,
        vehicleMake: qcVehicleMake || undefined,
        vehicleModel: qcVehicleModel || undefined,
        vehicleYear: qcVehicleYear ? Number(qcVehicleYear) : undefined,
        vinNumber: qcVehicleVin || undefined,
        channel: "dashboard",
        items: qcItems.map((it) => ({
          sku: it.sku,
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        notes: qcNotes,
        paymentLink: res.paymentLink,
      }

      setQcStatus("success")
      toast.add({
        type: "success",
        title: "Quotation generated",
        description: `Reference #${res.quoteNumber} saved to pipeline.`,
      })
      openQuoteModal(quoteObject)
    } catch (err) {
      setQcStatus("idle")
      toast.add({
        type: "error",
        title: "Quote generation failed",
        description: err instanceof Error ? err.message : "Error generating quote",
      })
    }
  }

  const handleOpenDealInModal = (deal: {
    id: string
    updatedAt?: number
    quoteExpiresAt?: number
    contactName?: string
    contactPhone?: string
    contactEmail?: string
    companyName?: string
    vehicle?: { make?: string; model?: string; year?: number } | null
    vinNumber?: string
    channel?: string
    requestedParts?: Array<{
      sku?: string
      description?: string
      quantity?: number
      unitPrice?: number
      coreDeposit?: number
    }>
    partsSummary?: string
    totalAmount: number
    notes?: string
    paymentLink?: string
  }) => {
    const quoteObject: QuoteData = {
      id: deal.id,
      quoteNumber: `QT-${deal.id.slice(-6).toUpperCase()}`,
      date: new Date(deal.updatedAt || Date.now()).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }),
      validUntil: deal.quoteExpiresAt
        ? new Date(deal.quoteExpiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })
        : new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }),
      clientName: deal.contactName || "Customer",
      clientPhone: deal.contactPhone || "+27",
      clientEmail: deal.contactEmail || "",
      companyName: deal.companyName || undefined,
      vehicleMake: deal.vehicle?.make || undefined,
      vehicleModel: deal.vehicle?.model || undefined,
      vehicleYear: deal.vehicle?.year || undefined,
      vinNumber: deal.vinNumber || undefined,
      channel: deal.channel === "whatsapp" ? "whatsapp" : deal.channel === "email" ? "email" : "dashboard",
      items:
        deal.requestedParts && deal.requestedParts.length > 0
          ? deal.requestedParts.map((p) => ({
            sku: p.sku || "PART-01",
            description: p.description || "Replacement Part",
            quantity: p.quantity || 1,
            unitPrice: p.unitPrice || 0,
            coreDeposit: p.coreDeposit,
          }))
          : [
            {
              sku: "PART-GEN",
              description: deal.partsSummary || "Commercial Auto Parts",
              quantity: 1,
              unitPrice: Math.round(deal.totalAmount / 1.15),
            },
          ],
      notes: deal.notes || undefined,
      paymentLink: deal.paymentLink
        ? deal.paymentLink.startsWith("http")
          ? deal.paymentLink
          : `http://localhost:3000${deal.paymentLink}`
        : `http://localhost:3000/pay/${deal.id}`,
    }
    openQuoteModal(quoteObject)
  }

  // ==========================================
  // 6. Daytona Terminal State
  // ==========================================
  const [commandInput, setCommandInput] = React.useState(
    "python3 -c 'print(\"Daytona sandbox ready\")'"
  )
  const [terminalLogs, setTerminalLogs] = React.useState<string[]>([
    "Daytona Linux sandbox ready",
    "Python 3.14 · Chromium available",
  ])
  const [isRunningCommand, setIsRunningCommand] = React.useState(false)

  const handleNavigate = (target?: string) => {
    let dest = (target || urlInput).trim()
    if (!dest.startsWith("http://") && !dest.startsWith("https://")) {
      dest = `https://${dest}`
    }
    setUrlInput(dest)
    setCurrentUrl(dest)
  }

  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun || commandInput).trim()
    if (!cmd) return

    setIsRunningCommand(true)
    setTerminalLogs((prev) => [...prev, `\n$ ${cmd}`])

    try {
      const res = await fetch("/api/daytona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exec",
          command: cmd,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setTerminalLogs((prev) => [
          ...prev,
          data.result?.trim() || "(no output)",
          `[exit ${data.exitCode}]`,
        ])
      } else {
        setTerminalLogs((prev) => [
          ...prev,
          `Error: ${data.error || "Command execution failed"}`,
        ])
      }
    } catch (err) {
      setTerminalLogs((prev) => [
        ...prev,
        `Network error: ${err instanceof Error ? err.message : "Execution failed"}`,
      ])
    } finally {
      setIsRunningCommand(false)
    }
  }

  const proxyIframeSrc = `/api/proxy-web?url=${encodeURIComponent(currentUrl)}`
  const subtotalZar = qcItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0)

  // Keep right side completely unmounted when toggle icon is not active
  if (!open) return null

  return (
    <>
      <ResizableHandle className="bg-zinc-800/80 hover:bg-zinc-700 transition-colors" />
      <ResizablePanel id="desktop" defaultSize="44%" minSize="32%" maxSize="60%">
        <div className="flex h-full min-w-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
          {/* Top Antigravity Mode Bar — No bot name, no clutter icons */}
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 px-3">
            <div className="flex items-center gap-0.5 rounded-md border border-zinc-800/80 bg-zinc-900/50 p-0.5">
              {(
                [
                  { id: "actions", label: "Actions" },
                  { id: "browser", label: "Browser" },
                  { id: "desktop", label: "Desktop" },
                  { id: "terminal", label: "Terminal" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    if (tab.id === "desktop" && !desktopVncUrl && !isStartingDesktop) {
                      void handleLaunchCloudDesktop()
                    }
                  }}
                  className={cn(
                    "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {isGmailActive && (
                <button
                  type="button"
                  onClick={() => openGmailModal()}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/40 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span className="max-w-32 truncate">
                    {formatGoogleAccountLabel(gmailConnection?.accountLabel)}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close panel"
                className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: ACTIONS                                            */}
          {/* ========================================================= */}
          {activeTab === "actions" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
              {/* Compact Icon-Free Sub-Navigation — No horizontal scrollbar */}
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800/70 px-3 py-1.5">
                {ACTION_NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActionSubView(item.id)}
                    className={cn(
                      "h-6 rounded px-2 text-[11px] font-medium whitespace-nowrap transition-colors",
                      actionSubView === item.id
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-900/70 hover:text-zinc-300"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Content — Hidden Default Scrollbar */}
              <div className="no-scrollbar flex-1 overflow-x-hidden overflow-y-auto p-4">
                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: OVERVIEW                                       */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "overview" && (
                  <div className="flex flex-col gap-4">
                    <div className="border-b border-zinc-800/60 pb-3">
                      <h2 className="text-[13px] font-medium tracking-tight text-zinc-100">
                        Operations
                      </h2>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        Live workspace channels, quotations, inventory, and campaigns.
                      </p>
                    </div>

                    {/* Connected Channels Summary */}
                    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Connections
                        </span>
                        <button
                          type="button"
                          onClick={() => void syncIntegrations()}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300"
                        >
                          Sync
                        </button>
                      </div>

                      <div className="flex items-center justify-between py-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              isGmailActive ? "bg-emerald-400" : "bg-zinc-600"
                            )}
                          />
                          <span className="text-zinc-200">Gmail</span>
                        </div>
                        {isGmailActive ? (
                          <span className="text-[11px] text-emerald-400">
                            {formatGoogleAccountLabel(gmailConnection?.accountLabel)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openGmailModal()}
                            className="text-[11px] text-zinc-400 hover:text-zinc-100"
                          >
                            Connect Google
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-1 text-xs border-t border-zinc-800/60">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              isTiktokActive ? "bg-emerald-400" : "bg-zinc-600"
                            )}
                          />
                          <span className="text-zinc-200">TikTok DMs</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionSubView("socialdms")}
                          className={cn(
                            "text-[11px]",
                            isTiktokActive
                              ? "text-emerald-400"
                              : "text-zinc-400 hover:text-zinc-100"
                          )}
                        >
                          {isTiktokActive ? "Connected" : "Configure"}
                        </button>
                      </div>

                      <div className="flex items-center justify-between py-1 text-xs border-t border-zinc-800/60">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              isInstagramActive ? "bg-emerald-400" : "bg-zinc-600"
                            )}
                          />
                          <span className="text-zinc-200">Instagram DMs</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionSubView("socialdms")}
                          className={cn(
                            "text-[11px]",
                            isInstagramActive
                              ? "text-emerald-400"
                              : "text-zinc-400 hover:text-zinc-100"
                          )}
                        >
                          {isInstagramActive ? "Connected" : "Configure"}
                        </button>
                      </div>
                    </div>

                    {/* Clean Minimal Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setActionSubView("quotecraft")}
                        className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                      >
                        <span className="text-xs font-medium text-zinc-100">Quotes &amp; Deals</span>
                        <span className="mt-1 text-[11px] text-zinc-500">
                          {storeContext?.deals?.length || 0} active in pipeline
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionSubView("aerocomm")}
                        className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                      >
                        <span className="text-xs font-medium text-zinc-100">Email &amp; WhatsApp</span>
                        <span className="mt-1 text-[11px] text-zinc-500">
                          {storeContext?.messages?.length || 0} recent messages
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionSubView("supplyhunter")}
                        className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                      >
                        <span className="text-xs font-medium text-zinc-100">Parts Sourcing</span>
                        <span className="mt-1 text-[11px] text-zinc-500">
                          {storeContext?.lowStockParts?.length || 0} low-stock alerts
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionSubView("socialdms")}
                        className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                      >
                        <span className="text-xs font-medium text-zinc-100">Social DMs</span>
                        <span className="mt-1 text-[11px] text-zinc-500">
                          TikTok &amp; Instagram auto-reply
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionSubView("ads")}
                        className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                      >
                        <span className="text-xs font-medium text-zinc-100">Ads</span>
                        <span className="mt-1 text-[11px] text-zinc-500">
                          {storeContext?.campaigns?.length || 0} running campaigns
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: EMAIL & WHATSAPP (GOOGLE CONNECT ONLY)         */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "aerocomm" && (
                  <div className="flex flex-col gap-4">
                    <div className="border-b border-zinc-800/60 pb-3">
                      <h2 className="text-[13px] font-medium tracking-tight text-zinc-100">
                        Email &amp; WhatsApp
                      </h2>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        Google inbox connection and direct customer dispatch.
                      </p>
                    </div>

                    {/* Google Connect Card */}
                    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/35 p-3.5">
                      {isGmailActive ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-zinc-100">
                                {formatGoogleAccountLabel(gmailConnection?.accountLabel)}
                              </div>
                              <div className="text-[11px] text-emerald-400">
                                Connected via Google
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void syncIntegrations()}
                              className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-100"
                            >
                              Sync
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={disconnectingToolkit === "gmail"}
                              onClick={() => void handleDisconnectOAuth("gmail")}
                              className="h-7 px-2.5 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                            >
                              {disconnectingToolkit === "gmail" ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Disconnect
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-medium text-zinc-100">
                                Google Workspace / Gmail
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                Not connected
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openGmailModal()}
                              className="text-[11px] text-zinc-500 hover:text-zinc-300"
                            >
                              Options
                            </button>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            disabled={connectingToolkit === "gmail"}
                            onClick={() => void handleConnectOAuth("gmail")}
                            className="h-8 w-full gap-2 bg-white text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                          >
                            {connectingToolkit === "gmail" ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <GoogleMark className="size-3.5 shrink-0" />
                            )}
                            Continue with Google
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Recent Inbound Inquiries */}
                    {storeContext?.messages && storeContext.messages.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Recent Inquiries
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {storeContext.messages.slice(0, 3).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setAeroRecipient(m.from)
                                setAeroChannel(m.channel === "whatsapp" ? "whatsapp" : "email")
                                setAeroBody(
                                  `Hi ${m.from},\n\nRegarding your inquiry: "${m.body}"\n\nWe have confirmed availability and prepared your quotation below.\n\nBest regards,\nAutoPulse Operations`
                                )
                              }}
                              className="flex flex-col gap-1 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-zinc-200">{m.from}</span>
                                <span className="font-mono text-[10px] uppercase text-zinc-500">
                                  {m.channel}
                                </span>
                              </div>
                              <p className="line-clamp-1 text-[11px] text-zinc-500">
                                {m.body}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Composer */}
                    {aeroStatus === "success" ? (
                      <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                          <span className="size-2 rounded-full bg-emerald-400" />
                          Dispatched to {aeroRecipient}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          Receipt: {aeroReceipt}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAeroStatus("idle")
                            setAeroReceipt(null)
                          }}
                          className="h-7 px-2.5 text-xs border-zinc-800 bg-zinc-950 text-zinc-300"
                        >
                          New message
                        </Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleDispatchAeroComm()
                        }}
                        className="flex flex-col gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-400">Channel</span>
                          <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
                            <button
                              type="button"
                              onClick={() => setAeroChannel("email")}
                              className={cn(
                                "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                                aeroChannel === "email"
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              Email
                            </button>
                            <button
                              type="button"
                              onClick={() => setAeroChannel("whatsapp")}
                              className={cn(
                                "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                                aeroChannel === "whatsapp"
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              WhatsApp
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Recipient</label>
                          <Input
                            value={aeroRecipient}
                            onChange={(e) => setAeroRecipient(e.target.value)}
                            placeholder={aeroChannel === "email" ? "customer@example.com" : "+27 82 000 0000"}
                            className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            required
                          />
                        </div>

                        {aeroChannel === "email" && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Subject</label>
                            <Input
                              value={aeroSubject}
                              onChange={(e) => setAeroSubject(e.target.value)}
                              placeholder="Subject"
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                              required
                            />
                          </div>
                        )}

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Reference</label>
                          <Input
                            value={aeroQuoteRef}
                            onChange={(e) => setAeroQuoteRef(e.target.value)}
                            placeholder="QT-2026-0881"
                            className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Message</label>
                          <textarea
                            value={aeroBody}
                            onChange={(e) => setAeroBody(e.target.value)}
                            rows={5}
                            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={aeroStatus === "submitting"}
                          className="h-8 w-full bg-zinc-100 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                        >
                          {aeroStatus === "submitting" ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Send {aeroChannel === "email" ? "email" : "WhatsApp"}
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: SOCIAL DMS (TIKTOK & INSTAGRAM AUTO-REPLY ONLY) */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "socialdms" && (
                  <div className="flex flex-col gap-4">
                    <div className="border-b border-zinc-800/60 pb-3">
                      <h2 className="text-[13px] font-medium tracking-tight text-zinc-100">
                        Social DM Auto-Reply
                      </h2>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        Connect TikTok and Instagram to automatically reply to incoming direct messages.
                      </p>
                    </div>

                    {/* TikTok & Instagram Connections ONLY */}
                    <div className="flex flex-col divide-y divide-zinc-800/70 rounded-lg border border-zinc-800/80 bg-zinc-900/30">
                      {/* TikTok Row */}
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-3 p-3.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                isTiktokActive ? "bg-emerald-400" : "bg-zinc-600"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-zinc-100">
                                TikTok
                                {isTiktokActive &&
                                  tiktokConnection?.accountLabel &&
                                  !tiktokConnection.accountLabel.startsWith("ca_")
                                  ? ` · @${tiktokConnection.accountLabel.replace(/^@/, "")}`
                                  : ""}
                              </div>
                              <div
                                className={cn(
                                  "text-[11px]",
                                  isTiktokActive ? "text-emerald-400" : "text-zinc-500"
                                )}
                              >
                                {isTiktokActive
                                  ? "Connected · Auto-reply active"
                                  : customAuthToolkit === "tiktok"
                                    ? "Enter TikTok OAuth credentials"
                                    : "Not connected"}
                              </div>
                            </div>
                          </div>

                          {isTiktokActive ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={disconnectingToolkit === "tiktok"}
                              onClick={() => void handleDisconnectOAuth("tiktok")}
                              className="h-7 px-2.5 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                            >
                              {disconnectingToolkit === "tiktok" ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Disconnect
                            </Button>
                          ) : customAuthToolkit === "tiktok" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setCustomAuthToolkit(null)}
                              className="h-7 px-2.5 text-[11px] text-zinc-400 hover:text-zinc-100"
                            >
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={connectingToolkit === "tiktok"}
                              onClick={() => void handleConnectOAuth("tiktok")}
                              className="h-7 px-3 text-[11px] bg-zinc-100 font-medium text-zinc-950 hover:bg-zinc-200"
                            >
                              {connectingToolkit === "tiktok" ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Connect
                            </Button>
                          )}
                        </div>

                        {/* Inline TikTok Composio Connection Helper */}
                        {!isTiktokActive && customAuthToolkit === "tiktok" && (
                          <div className="flex flex-col gap-3 border-t border-zinc-800/60 bg-zinc-950/70 p-3.5">
                            <div className="flex flex-col gap-1">
                              <div className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                                <span>Connect TikTok via Composio</span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-relaxed">
                                Connect your TikTok account in Composio, then sync it here with 1 click.
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                              <a
                                href="https://app.composio.dev/apps/tiktok"
                                target="_blank"
                                rel="noreferrer"
                                className="h-8 flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                              >
                                <span>Open TikTok on Composio</span>
                                <ExternalLinkIcon className="size-3 text-zinc-400" />
                              </a>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void syncIntegrations()}
                                className="h-8 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium"
                              >
                                Sync with Composio
                              </Button>
                            </div>

                            <div className="pt-2 border-t border-zinc-800/60">
                              <div className="text-[10px] text-zinc-500 mb-1.5">
                                Or paste your Composio Auth Config ID:
                              </div>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  void handleConnectOAuth("tiktok", {
                                    authConfigId: customAuthConfigId,
                                  })
                                }}
                                className="flex gap-2"
                              >
                                <Input
                                  value={customAuthConfigId}
                                  onChange={(e) => setCustomAuthConfigId(e.target.value)}
                                  placeholder="ac_..."
                                  className="h-8 flex-1 border-zinc-800 bg-zinc-950 font-mono text-xs"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={connectingToolkit === "tiktok"}
                                  className="h-8 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700"
                                >
                                  {connectingToolkit === "tiktok" ? (
                                    <Spinner data-icon="inline-start" />
                                  ) : null}
                                  Connect
                                </Button>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Instagram Row (Pure Composio OAuth) */}
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-3 p-3.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                isInstagramActive ? "bg-emerald-400" : "bg-zinc-600"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                                <span>Instagram</span>
                                {isInstagramActive &&
                                  instagramConnection?.accountLabel &&
                                  !instagramConnection.accountLabel.startsWith("ca_") && (
                                    <span className="text-emerald-400 font-mono text-[11px]">
                                      @{instagramConnection.accountLabel.replace(/^@/, "")}
                                    </span>
                                  )}
                              </div>
                              <div
                                className={cn(
                                  "text-[11px]",
                                  isInstagramActive ? "text-emerald-400" : "text-zinc-500"
                                )}
                              >
                                {isInstagramActive
                                  ? "Connected via Composio • Auto-reply active"
                                  : "Powered by Composio • 1-Click Connect"}
                              </div>
                            </div>
                          </div>

                          {isInstagramActive ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={disconnectingToolkit === "instagram"}
                              onClick={() => void handleDisconnectOAuth("instagram")}
                              className="h-7 px-2.5 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                            >
                              {disconnectingToolkit === "instagram" ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={connectingToolkit === "instagram"}
                              onClick={() => void handleConnectOAuth("instagram")}
                              className="h-7 px-3 text-[11px] bg-zinc-100 font-medium text-zinc-950 hover:bg-zinc-200"
                            >
                              {connectingToolkit === "instagram" ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Auto-Reply Rule Card */}
                    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-zinc-100">
                            Automatic DM replies
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            Reply automatically to new TikTok and Instagram DMs
                          </div>
                        </div>
                        <Switch
                          checked={dmAutoReplyEnabled}
                          onCheckedChange={(checked) => {
                            const val = Boolean(checked)
                            setDmAutoReplyEnabled(val)
                            handleSaveDmSettings(val)
                          }}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 border-t border-zinc-800/60 pt-3">
                        <label className="text-[11px] text-zinc-400">
                          Reply behavior
                        </label>
                        <textarea
                          value={dmReplyInstructions}
                          onChange={(e) => setDmReplyInstructions(e.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                        />
                        <div className="flex justify-end pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveDmSettings()}
                            className="h-7 px-3 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                          >
                            Save rules
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Recent TikTok & Instagram DMs */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Recent Direct Messages
                        </span>
                        <button
                          type="button"
                          onClick={() => void syncIntegrations()}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300"
                        >
                          Refresh
                        </button>
                      </div>

                      {recentSocialDms.length === 0 ? (
                        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 px-3 py-4 text-center text-[11px] text-zinc-500">
                          No recent TikTok or Instagram DMs.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {recentSocialDms.slice(0, 5).map((dm) => (
                            <div
                              key={dm.id}
                              className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-zinc-200">{dm.from}</span>
                                <span className="font-mono text-[10px] uppercase text-zinc-500">
                                  {dm.channel === "tiktok_lead" ? "tiktok" : dm.channel}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">
                                {dm.body}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: ADS (SEPARATED FROM SOCIAL DMS)                */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "ads" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-3">
                      <div>
                        <h2 className="text-[13px] font-medium tracking-tight text-zinc-100">
                          Ad Campaigns
                        </h2>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Paid lead acquisition campaigns and budget allocation.
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {storeContext?.campaigns?.length || 0} active
                      </span>
                    </div>

                    {storeContext?.campaigns && storeContext.campaigns.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {storeContext.campaigns.map((c, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-zinc-100">
                                {c.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                Spend ZAR {c.spend.toLocaleString()} · {c.conversions} leads
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[10px] uppercase text-zinc-500">
                                {c.platform.replace("_ads", "")}
                              </span>
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {adStatus === "success" ? (
                      <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                          <span className="size-2 rounded-full bg-emerald-400" />
                          Campaign deployed
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          ID: {adReceipt} · ZAR {adBudget.toLocaleString()}/day
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAdStatus("idle")
                            setAdReceipt(null)
                          }}
                          className="h-7 px-2.5 text-xs border-zinc-800 bg-zinc-950 text-zinc-300"
                        >
                          New campaign
                        </Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleDispatchCampaign()
                        }}
                        className="flex flex-col gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-400">Network</span>
                          <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
                            <button
                              type="button"
                              onClick={() => setAdPlatform("tiktok_ads")}
                              className={cn(
                                "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                                adPlatform === "tiktok_ads"
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              TikTok Ads
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdPlatform("facebook_ads")}
                              className={cn(
                                "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                                adPlatform === "facebook_ads"
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              Meta Ads
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Campaign name</label>
                          <Input
                            value={adCampaignName}
                            onChange={(e) => setAdCampaignName(e.target.value)}
                            className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            required
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Daily budget</span>
                            <span className="font-mono text-zinc-200">
                              ZAR {Number(adBudget).toLocaleString()}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={250}
                            max={5000}
                            step={50}
                            value={adBudget}
                            onChange={(e) => setAdBudget(Number(e.target.value))}
                            className="w-full accent-zinc-200"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Headline / hook</label>
                          <Input
                            value={adHook}
                            onChange={(e) => setAdHook(e.target.value)}
                            className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            required
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Creative brief</label>
                          <textarea
                            value={adScript}
                            onChange={(e) => setAdScript(e.target.value)}
                            rows={4}
                            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={adStatus === "submitting"}
                          className="h-8 w-full bg-zinc-100 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                        >
                          {adStatus === "submitting" ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Launch campaign
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: SOURCING & RFQS                                */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "supplyhunter" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-3">
                      <div>
                        <h2 className="text-[13px] font-medium tracking-tight text-zinc-100">
                          Parts Sourcing
                        </h2>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Low-stock thresholds, distributor pricing, and purchase orders.
                        </p>
                      </div>
                      {storeContext?.lowStockParts && storeContext.lowStockParts.length > 0 && (
                        <span className="font-mono text-[11px] text-amber-400">
                          {storeContext.lowStockParts.length} low stock
                        </span>
                      )}
                    </div>

                    {storeContext?.lowStockParts && storeContext.lowStockParts.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {storeContext.lowStockParts.map((p) => (
                          <div
                            key={p.sku}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-zinc-100">
                                {p.name}{" "}
                                <span className="font-mono text-[10px] text-zinc-500">
                                  {p.sku}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                {p.stock} left (min {p.threshold}) · ZAR {p.price.toLocaleString()}
                              </div>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSelectLowStockPart(p)}
                              className="h-7 px-2.5 text-[11px] border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900 shrink-0"
                            >
                              Select
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: "Masterparts SA", loc: "Masterparts SA (Johannesburg)", price: 2950, meta: "24h courier" },
                        { name: "Goldwagen Hub", loc: "Goldwagen Distributor (Midrand)", price: 3100, meta: "Same-day pickup" },
                        { name: "Alert Engine Parts", loc: "Alert Engine Parts (Durban)", price: 2890, meta: "48h road freight" },
                        { name: "Midas Trade", loc: "Midas Trade Network (National)", price: 3200, meta: "Overnight air" },
                      ].map((sup) => (
                        <button
                          key={sup.name}
                          type="button"
                          onClick={() => {
                            setRfqSupplier(sup.loc)
                            setRfqTargetPrice(sup.price)
                          }}
                          className="flex flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/25 p-2.5 text-left hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
                        >
                          <span className="text-xs font-medium text-zinc-200">{sup.name}</span>
                          <span className="mt-0.5 font-mono text-[11px] text-zinc-400">
                            ZAR {sup.price.toLocaleString()}
                          </span>
                          <span className="mt-0.5 text-[10px] text-zinc-500">{sup.meta}</span>
                        </button>
                      ))}
                    </div>

                    {rfqStatus === "success" ? (
                      <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                          <span className="size-2 rounded-full bg-emerald-400" />
                          Purchase order issued
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          PO: {rfqReceipt} · {rfqQuantity}x {rfqPartName}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRfqStatus("idle")
                            setRfqReceipt(null)
                          }}
                          className="h-7 px-2.5 text-xs border-zinc-800 bg-zinc-950 text-zinc-300"
                        >
                          New RFQ
                        </Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleDispatchRfq()
                        }}
                        className="flex flex-col gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5"
                      >
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Supplier</label>
                          <Input
                            value={rfqSupplier}
                            onChange={(e) => setRfqSupplier(e.target.value)}
                            className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">SKU</label>
                            <Input
                              value={rfqSku}
                              onChange={(e) => setRfqSku(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Part name</label>
                            <Input
                              value={rfqPartName}
                              onChange={(e) => setRfqPartName(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Quantity</label>
                            <Input
                              type="number"
                              min={1}
                              value={rfqQuantity}
                              onChange={(e) => setRfqQuantity(Number(e.target.value))}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Target unit cost (ZAR)</label>
                            <Input
                              type="number"
                              min={10}
                              value={rfqTargetPrice}
                              onChange={(e) => setRfqTargetPrice(Number(e.target.value))}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-zinc-400">Notes</label>
                          <textarea
                            value={rfqNotes}
                            onChange={(e) => setRfqNotes(e.target.value)}
                            rows={2}
                            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-100 outline-none focus:border-zinc-700"
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={rfqStatus === "submitting"}
                          className="h-8 w-full bg-zinc-100 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                        >
                          {rfqStatus === "submitting" ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Issue purchase order
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {/* ------------------------------------------------------- */}
                {/* SUBVIEW: QUOTES & DEALS                                 */}
                {/* ------------------------------------------------------- */}
                {actionSubView === "quotecraft" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src="/logo.svg"
                          alt="AutoPulse Logo"
                          className="size-7 rounded-lg bg-zinc-950 border border-zinc-800 p-1 shrink-0"
                        />
                        <div>
                          <h2 className="text-[13px] font-medium tracking-tight text-zinc-100 flex items-center gap-2">
                            <span>Quotations &amp; Deals</span>
                            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-mono text-sky-400 border border-sky-500/20">
                              AutoPulse
                            </span>
                          </h2>
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            15% VAT quotations in ZAR with CRM pipeline sync.
                          </p>
                        </div>
                      </div>

                      <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
                        <button
                          type="button"
                          onClick={() => setQcSubTab("create")}
                          className={cn(
                            "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                            qcSubTab === "create"
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => setQcSubTab("deals")}
                          className={cn(
                            "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                            qcSubTab === "deals"
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          Deals ({storeContext?.deals?.length || 0})
                        </button>
                      </div>
                    </div>

                    {qcSubTab === "create" ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Client name</label>
                            <Input
                              value={qcClientName}
                              onChange={(e) => setQcClientName(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Phone</label>
                            <Input
                              value={qcClientPhone}
                              onChange={(e) => setQcClientPhone(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Email</label>
                            <Input
                              value={qcClientEmail}
                              onChange={(e) => setQcClientEmail(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Company</label>
                            <Input
                              value={qcCompanyName}
                              onChange={(e) => setQcCompanyName(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Make</label>
                            <Input
                              value={qcVehicleMake}
                              onChange={(e) => setQcVehicleMake(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Model</label>
                            <Input
                              value={qcVehicleModel}
                              onChange={(e) => setQcVehicleModel(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">Year</label>
                            <Input
                              value={qcVehicleYear}
                              onChange={(e) => setQcVehicleYear(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-zinc-400">VIN</label>
                            <Input
                              value={qcVehicleVin}
                              onChange={(e) => setQcVehicleVin(e.target.value)}
                              className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-zinc-300">
                              Line items ({qcItems.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => openQuoteModal()}
                              className="text-[11px] text-zinc-400 hover:text-zinc-100"
                            >
                              Preview PDF
                            </button>
                          </div>

                          <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800 bg-zinc-950">
                            {qcItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-zinc-200">{item.description}</div>
                                  <div className="font-mono text-[10px] text-zinc-500">
                                    {item.sku} · Qty {item.quantity}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-[11px] text-zinc-300">
                                    ZAR {(item.quantity * item.unitPrice).toLocaleString()}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveQcItem(idx)}
                                    className="text-[11px] text-zinc-500 hover:text-red-400"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {storeContext?.catalog && storeContext.catalog.length > 0 && (
                            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pt-0.5">
                              {storeContext.catalog.slice(0, 5).map((part) => (
                                <button
                                  key={part.sku}
                                  type="button"
                                  onClick={() => handleAddFromCatalog(part)}
                                  className="shrink-0 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-[11px] text-zinc-300 hover:border-zinc-700"
                                >
                                  + {part.name}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 pt-1">
                            <Input
                              value={qcCustomSku}
                              onChange={(e) => setQcCustomSku(e.target.value)}
                              placeholder="SKU"
                              className="h-7 w-20 border-zinc-800 bg-zinc-950 font-mono text-xs"
                            />
                            <Input
                              value={qcCustomDesc}
                              onChange={(e) => setQcCustomDesc(e.target.value)}
                              placeholder="Description"
                              className="h-7 flex-1 border-zinc-800 bg-zinc-950 text-xs"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={qcCustomQty}
                              onChange={(e) => setQcCustomQty(Number(e.target.value))}
                              className="h-7 w-14 border-zinc-800 bg-zinc-950 text-center font-mono text-xs"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={qcCustomPrice}
                              onChange={(e) => setQcCustomPrice(Number(e.target.value))}
                              className="h-7 w-20 border-zinc-800 bg-zinc-950 text-right font-mono text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleAddCustomItem}
                              className="h-7 px-2.5 text-xs border-zinc-800 bg-zinc-950 text-zinc-200"
                            >
                              Add
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-xs">
                          <div className="flex justify-between text-zinc-400">
                            <span>Subtotal</span>
                            <span className="font-mono">ZAR {subtotalZar.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>VAT (15%)</span>
                            <span className="font-mono">
                              ZAR {Math.round(subtotalZar * 0.15).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-800/70 pt-1.5 font-medium text-zinc-100">
                            <span>Total</span>
                            <span className="font-mono">
                              ZAR {Math.round(subtotalZar * 1.15).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          onClick={() => void handleCreateQuote()}
                          disabled={qcStatus === "submitting"}
                          className="h-8 w-full bg-zinc-100 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                        >
                          {qcStatus === "submitting" ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Generate PDF quotation
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {!storeContext?.deals || storeContext.deals.length === 0 ? (
                          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center text-xs text-zinc-500">
                            No active deals in pipeline.
                          </div>
                        ) : (
                          storeContext.deals.map((deal) => (
                            <div
                              key={deal.id}
                              className="flex flex-col gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate font-medium text-zinc-100">
                                  {deal.contactName}{" "}
                                  <span className="font-mono text-[10px] text-zinc-500">
                                    QT-{deal.id.slice(-6).toUpperCase()}
                                  </span>
                                </div>
                                <span className="font-mono text-zinc-200 shrink-0">
                                  ZAR {deal.totalAmount.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                <span className="font-mono uppercase text-[10px]">{deal.status}</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDealInModal(deal)}
                                  className="text-zinc-300 hover:text-zinc-100"
                                >
                                  Open PDF
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: BROWSER                                            */}
          {/* ========================================================= */}
          {activeTab === "browser" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-950 px-3 py-2 text-xs">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-zinc-400 hover:text-zinc-100"
                  onClick={() => {
                    setIsRefreshing(true)
                    setTimeout(() => setIsRefreshing(false), 400)
                  }}
                  title="Reload"
                >
                  <RotateCwIcon className={cn("size-3.5", isRefreshing && "opacity-50")} />
                </Button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleNavigate()
                  }}
                  className="flex flex-1 items-center rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1"
                >
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                  />
                </form>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => handleNavigate()}
                >
                  Go
                </Button>

                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>

              <div className="relative flex flex-1 flex-col overflow-hidden bg-zinc-900/40">
                <iframe
                  key={proxyIframeSrc + isRefreshing}
                  src={proxyIframeSrc}
                  title="Web preview"
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: CLOUD DESKTOP                                      */}
          {/* ========================================================= */}
          {activeTab === "desktop" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2 text-xs">
                <span className="text-[11px] text-zinc-400">
                  Cloud Desktop · Chromium
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] border-zinc-800 bg-zinc-900 text-zinc-300"
                    onClick={() => void handleLaunchCloudDesktop(currentUrl)}
                    disabled={isStartingDesktop}
                  >
                    Restart
                  </Button>
                  {desktopVncUrl && (
                    <a
                      href={desktopVncUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-6 items-center rounded border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-300 hover:text-zinc-100"
                    >
                      Open window
                    </a>
                  )}
                </div>
              </div>

              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-950">
                {isStartingDesktop ? (
                  <div className="flex h-full w-full flex-col p-4 space-y-3 select-none">
                    <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/80">
                      <div className="flex gap-1.5">
                        <Skeleton className="size-2.5 rounded-full bg-rose-500/30" />
                        <Skeleton className="size-2.5 rounded-full bg-amber-500/30" />
                        <Skeleton className="size-2.5 rounded-full bg-emerald-500/30" />
                      </div>
                      <Skeleton className="h-6 flex-1 rounded-md bg-zinc-900" />
                      <Skeleton className="h-6 w-20 rounded-md bg-sky-500/20" />
                    </div>
                    <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
                      <Skeleton className="h-6 w-48 bg-zinc-800" />
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-full bg-zinc-850" />
                        <Skeleton className="h-3 w-5/6 bg-zinc-850" />
                        <Skeleton className="h-3 w-2/3 bg-zinc-850" />
                      </div>
                      <div className="grid grid-cols-3 gap-3 pt-4">
                        <Skeleton className="h-24 rounded-lg bg-zinc-850" />
                        <Skeleton className="h-24 rounded-lg bg-zinc-850" />
                        <Skeleton className="h-24 rounded-lg bg-zinc-850" />
                      </div>
                    </div>
                  </div>
                ) : desktopVncUrl ? (
                  <iframe
                    src={desktopVncUrl}
                    title="Cloud desktop"
                    className="h-full w-full border-0"
                    allow="clipboard-read; clipboard-write"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                    <p className="text-xs text-zinc-500">
                      Start an isolated cloud browser session.
                    </p>
                    <Button
                      size="sm"
                      className="h-8 bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                      onClick={() => void handleLaunchCloudDesktop(currentUrl)}
                    >
                      Start session
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: TERMINAL                                           */}
          {/* ========================================================= */}
          {activeTab === "terminal" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
                <span className="font-sans text-[11px] text-zinc-400">Sandbox Terminal</span>
                <div className="flex gap-1.5 font-sans">
                  <button
                    type="button"
                    onClick={() => void handleRunCommand("python3 --version")}
                    className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    python3 --version
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunCommand("which chromium")}
                    className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    which chromium
                  </button>
                </div>
              </div>

              <div className="no-scrollbar flex-1 overflow-y-auto p-3 leading-relaxed text-zinc-300 select-text">
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
                {isRunningCommand && (
                  <div className="py-1">
                    <Skeleton className="h-3 w-40 bg-zinc-800" />
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleRunCommand()
                }}
                className="flex items-center gap-2 border-t border-zinc-800/80 bg-zinc-950 px-3 py-2"
              >
                <span className="text-zinc-500">$</span>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Enter command..."
                  className="flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={isRunningCommand}
                  className="h-7 px-2.5 font-sans text-xs border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                >
                  Run
                </Button>
              </form>
            </div>
          )}
        </div>
      </ResizablePanel>
    </>
  )
}
