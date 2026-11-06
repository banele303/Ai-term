"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { LogOut, User } from "lucide-react"

import { api } from "@/convex/_generated/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"

function UserMenu() {
  const user = useQuery(api.auth.currentUser, {})
  const { signOut } = useAuthActions()

  const displayName =
    (user && "name" in user && user.name) ||
    (user && "email" in user && user.email) ||
    "Signed In Staff"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          />
        }
      >
        <div className="flex size-7 items-center justify-center rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
          <User className="size-4" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">{displayName}</span>
          <span className="truncate text-xs text-muted-foreground">Active Session</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <div className="flex size-8 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
              <User className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {(user && "email" in user && user.email) || "Staff"}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-rose-500 focus:text-rose-500 focus:bg-rose-500/10"
          onClick={() => void signOut()}
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { UserMenu }
