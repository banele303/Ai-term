"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { groupChatInsertSchema } from "@/db/schema"

type GroupChatBot = {
  id: string
  name: string
  avatar: string
}

type GroupChat = {
  id: string
  name?: string
  bots: { id: string }[]
}

// Asks for confirmation, then deletes the group chat and leaves it
function GroupChatDeleteButton({
  chat,
  onDeleted,
}: {
  chat: GroupChat
  onDeleted: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteGroupChatMut = useMutation(api.teammates.deleteGroupChat)

  const onDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteGroupChatMut({ chatId: chat.id as Id<"teammate_chats"> })
      toast.add({ type: "success", title: `${chat.name ?? "Group"} is deleted` })
      onDeleted()
      router.push("/")
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't delete the group chat",
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
          <AlertDialogTitle>Delete {chat.name ?? "Group"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the group chat and its messages. The bots in it stay.
            It can&apos;t be undone.
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
            Delete group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// With a `chat` it edits that group chat, without one it creates a new one
function GroupChatForm({
  chat,
  bots,
  onSaved,
}: {
  chat?: GroupChat
  bots: GroupChatBot[]
  onSaved: () => void
}) {
  const router = useRouter()
  const createGroupChatMut = useMutation(api.teammates.createGroupChat)
  const updateGroupChatMut = useMutation(api.teammates.updateGroupChat)

  const form = useForm({
    resolver: zodResolver(groupChatInsertSchema),
    defaultValues: {
      name: chat?.name ?? "",
      botIds: chat?.bots.map((bot) => bot.id) ?? [],
    },
  })
  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (chat) {
        const updated = await updateGroupChatMut({
          chatId: chat.id as Id<"teammate_chats">,
          name: values.name,
          botIds: values.botIds as Id<"teammate_bots">[],
        })
        toast.add({ type: "success", title: `${updated.name} is updated` })
        onSaved()
      } else {
        const created = await createGroupChatMut({
          name: values.name,
          botIds: values.botIds as Id<"teammate_bots">[],
        })
        toast.add({ type: "success", title: `${created.name} is ready` })
        onSaved()
        router.push(`/chats/${created.chatId}`)
      }
    } catch {
      toast.add({
        type: "error",
        title: chat
          ? "Couldn't update the group chat"
          : "Couldn't create the group chat",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="group-chat-name">Name</FieldLabel>
              <Input
                {...field}
                id="group-chat-name"
                placeholder="Weekend plans"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="botIds"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid}>
              <FieldLegend variant="label">Bots</FieldLegend>
              {bots.length < 2 && (
                <FieldDescription>
                  A group needs at least two bots. Create more bots first.
                </FieldDescription>
              )}
              <FieldGroup data-slot="checkbox-group">
                {bots.map((bot) => (
                  <Field
                    key={bot.id}
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                  >
                    <Checkbox
                      id={`group-chat-bot-${bot.id}`}
                      name={field.name}
                      aria-invalid={fieldState.invalid}
                      checked={field.value.includes(bot.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, bot.id]
                            : field.value.filter((id) => id !== bot.id)
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`group-chat-bot-${bot.id}`}
                      className="min-w-0 items-center font-normal cursor-pointer"
                    >
                      <ChatAvatar seed={bot.avatar} className="size-6" />
                      <span className="truncate">{bot.name}</span>
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </FieldSet>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        {chat && <GroupChatDeleteButton chat={chat} onDeleted={onSaved} />}
        <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
          {isSubmitting && <Skeleton className="mr-2 size-4 rounded-full bg-white/70" />}
          {chat ? "Save changes" : "Create group"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function GroupChatDialog({
  chat,
  bots,
  trigger = <Button variant="secondary" className="cursor-pointer" />,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  chat?: GroupChat
  bots: GroupChatBot[]
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
          <DialogTitle>
            {chat ? "Edit group chat" : "New group chat"}
          </DialogTitle>
          <DialogDescription>
            {chat
              ? "Change its name or which bots are in it."
              : "Name the group and pick which bots are in it."}
          </DialogDescription>
        </DialogHeader>
        <GroupChatForm chat={chat} bots={bots} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export { GroupChatDialog }
