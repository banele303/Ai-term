import { cn } from "cn"

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton-spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-pulse rounded-full bg-muted-foreground/40 shrink-0",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
