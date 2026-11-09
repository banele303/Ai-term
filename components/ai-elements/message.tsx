"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange]
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

const customMarkdownComponents: ComponentProps<typeof Streamdown>["components"] = {
  table: ({ children, className: tableClass, ...props }: any) => (
    <div className="my-3 w-full overflow-x-auto rounded-xl border border-zinc-800 bg-[#0d121a] shadow-md">
      <table className={cn("w-full text-left text-xs text-zinc-300 border-collapse", tableClass)} {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, className: theadClass, ...props }: any) => (
    <thead className={cn("border-b border-zinc-800 bg-[#141b24] text-[11px] font-semibold uppercase tracking-wider text-zinc-200", theadClass)} {...props}>
      {children}
    </thead>
  ),
  th: ({ children, className: thClass, ...props }: any) => (
    <th className={cn("px-3.5 py-2.5 text-left font-semibold text-zinc-200 whitespace-nowrap", thClass)} {...props}>
      {children}
    </th>
  ),
  tbody: ({ children, className: tbodyClass, ...props }: any) => (
    <tbody className={cn("divide-y divide-zinc-800/60", tbodyClass)} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, className: trClass, ...props }: any) => (
    <tr className={cn("hover:bg-zinc-850/50 transition-colors", trClass)} {...props}>
      {children}
    </tr>
  ),
  td: ({ children, className: tdClass, ...props }: any) => (
    <td className={cn("px-3.5 py-2 align-middle text-zinc-300", tdClass)} {...props}>
      {children}
    </td>
  ),
  ul: ({ children, className: ulClass, ...props }: any) => (
    <ul className={cn("my-2 ml-4 list-disc space-y-1 text-zinc-300", ulClass)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, className: olClass, ...props }: any) => (
    <ol className={cn("my-2 ml-4 list-decimal space-y-1 text-zinc-300", olClass)} {...props}>
      {children}
    </ol>
  ),
  li: ({ children, className: liClass, ...props }: any) => (
    <li className={cn("leading-relaxed", liClass)} {...props}>
      {children}
    </li>
  ),
  h1: ({ children, className: h1Class, ...props }: any) => (
    <h1 className={cn("text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-zinc-800", h1Class)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, className: h2Class, ...props }: any) => (
    <h2 className={cn("text-sm font-bold text-white mt-3.5 mb-1.5 flex items-center gap-1.5", h2Class)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, className: h3Class, ...props }: any) => (
    <h3 className={cn("text-xs font-semibold text-zinc-100 mt-2.5 mb-1", h3Class)} {...props}>
      {children}
    </h3>
  ),
  blockquote: ({ children, className: bqClass, ...props }: any) => (
    <blockquote className={cn("my-2.5 border-l-2 border-emerald-500 bg-emerald-950/20 px-3.5 py-2 rounded-r-lg text-xs italic text-zinc-300", bqClass)} {...props}>
      {children}
    </blockquote>
  ),
  hr: ({ className: hrClass, ...props }: any) => (
    <hr className={cn("my-4 border-zinc-800", hrClass)} {...props} />
  ),
  a: ({ children, className: aClass, ...props }: any) => (
    <a className={cn("text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors", aClass)} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  ),
  strong: ({ children, className: sClass, ...props }: any) => (
    <strong className={cn("font-semibold text-white", sClass)} {...props}>
      {children}
    </strong>
  ),
};

export const MessageResponse = memo(
  ({ className, components, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 chat-markdown-content leading-relaxed text-zinc-200",
        className
      )}
      plugins={streamdownPlugins}
      components={{
        ...customMarkdownComponents,
        ...components,
      }}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
