"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm } from "react-hook-form"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { botInsertSchema } from "@/db/schema"

export type TeammateBotRecord = {
  id: string
  name: string
  avatar: string
  job: string
  instructions?: string | null
}

const presets = [
  {
    job: "AutoPulse Ops Agent",
    instructions:
      "Monitor parts stock, review customer emails and WhatsApp inquiries, draft quotes, and flag low inventory thresholds.",
  },
  {
    job: "Parts & Fitment Specialist",
    instructions:
      "Decode VIN numbers, check catalog inventory, quote trade vs retail pricing, and recommend OEM vs aftermarket parts.",
  },
  {
    job: "Customer Support & Quotes",
    instructions:
      "Draft prompt, friendly responses to customer emails and WhatsApp messages, calculate quote totals in ZAR, and assist checkout.",
  },
  {
    job: "Research assistant",
    instructions:
      "Find reliable sources, summarize what they say, and cite every claim. Say so when the evidence is thin.",
  },
  {
    job: "Code reviewer",
    instructions:
      "Review changes for bugs, security issues, and unclear code. Point to the exact lines and suggest a fix.",
  },
]

// Asks for confirmation, then deletes the bot and leaves its chat
function BotDeleteButton({
  bot,
  onDeleted,
}: {
  bot: TeammateBotRecord
  onDeleted: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteBotMut = useMutation(api.teammates.deleteBot)

  const onDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteBotMut({ botId: bot.id as Id<"teammate_bots"> })
      toast.add({ type: "success", title: `${bot.name} is deleted` })
      onDeleted()
      router.push("/")
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't delete the bot",
        description: "Something went wrong. Try again.",
      })
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => !isDeleting && setOpen(open)}
    >
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" className="sm:mr-auto cursor-pointer" />
        }
      >
        <Trash2Icon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bot and your chat with it. It can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting && <Skeleton className="mr-2 size-4 rounded-full bg-white/70" />}
            Delete bot
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// With a `bot` it edits that bot, without one it creates a new bot
function BotForm({
  bot,
  onSaved,
}: {
  bot?: TeammateBotRecord
  onSaved: () => void
}) {
  const router = useRouter()
  const createBotMut = useMutation(api.teammates.createBot)
  const updateBotMut = useMutation(api.teammates.updateBot)

  const [initialSeed] = useState(() => bot?.avatar ?? nanoid())
  const form = useForm({
    resolver: zodResolver(botInsertSchema),
    defaultValues: {
      name: bot?.name ?? "",
      avatar: initialSeed,
      job: bot?.job ?? "",
      instructions: bot?.instructions ?? "",
    },
  })
  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (bot) {
        const updated = await updateBotMut({
          botId: bot.id as Id<"teammate_bots">,
          name: values.name,
          avatar: values.avatar ?? initialSeed,
          job: values.job,
          instructions: values.instructions || undefined,
        })
        toast.add({ type: "success", title: `${updated.name} is updated` })
        onSaved()
      } else {
        const created = await createBotMut({
          name: values.name,
          avatar: values.avatar ?? initialSeed,
          job: values.job,
          instructions: values.instructions || undefined,
        })
        toast.add({ type: "success", title: `${created.name} is ready` })
        onSaved()
        router.push(`/chats/${created.chatId}`)
      }
    } catch {
      toast.add({
        type: "error",
        title: bot ? "Couldn't update the bot" : "Couldn't create the bot",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.job}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full cursor-pointer"
            onClick={() => {
              form.setValue("job", preset.job, {
                shouldDirty: true,
                shouldValidate: true,
              })
              form.setValue("instructions", preset.instructions, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }}
          >
            {preset.job}
          </Button>
        ))}
      </div>
      <FieldGroup>
        <Controller
          name="avatar"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <ChatAvatar
                seed={field.value ?? initialSeed}
                className="size-10"
              />
              <FieldContent>
                <FieldTitle>Face</FieldTitle>
                <FieldDescription>
                  Shuffle until you find one you like.
                </FieldDescription>
              </FieldContent>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => field.onChange(nanoid())}
              >
                <ShuffleIcon data-icon="inline-start" />
                Shuffle
              </Button>
            </Field>
          )}
        />
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-name">Name</FieldLabel>
              <Input
                {...field}
                id="bot-name"
                placeholder="Ada"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="job"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-job">Job</FieldLabel>
              <Input
                {...field}
                id="bot-job"
                placeholder="Research assistant"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="instructions"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-instructions">
                How it should work
              </FieldLabel>
              <Textarea
                {...field}
                value={field.value ?? ""}
                id="bot-instructions"
                placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                className="min-h-24"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        {bot && <BotDeleteButton bot={bot} onDeleted={onSaved} />}
        <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
          {isSubmitting && <Skeleton className="mr-2 size-4 rounded-full bg-white/70" />}
          {bot ? "Save changes" : "Create bot"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function BotDialog({
  bot,
  trigger = <Button variant="secondary" className="cursor-pointer" />,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  bot?: TeammateBotRecord
  trigger?: React.ReactElement
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={trigger}>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Change its face, its name, or the job it does."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <BotForm bot={bot} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
