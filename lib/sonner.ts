"use client"

import { toast as baseToast } from "@/components/ui/toast"

export type SonnerOptions = {
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export const toast = {
  success: (title: string, opts?: SonnerOptions) => {
    baseToast.add({
      type: "success",
      title,
      description: opts?.description,
    })
  },
  error: (title: string, opts?: SonnerOptions) => {
    baseToast.add({
      type: "error",
      title,
      description: opts?.description,
    })
  },
  info: (title: string, opts?: SonnerOptions) => {
    baseToast.add({
      type: "info",
      title,
      description: opts?.description,
    })
  },
  warning: (title: string, opts?: SonnerOptions) => {
    baseToast.add({
      type: "warning",
      title,
      description: opts?.description,
    })
  },
  message: (title: string, opts?: SonnerOptions) => {
    baseToast.add({
      type: "info",
      title,
      description: opts?.description,
    })
  },
}

export default toast
