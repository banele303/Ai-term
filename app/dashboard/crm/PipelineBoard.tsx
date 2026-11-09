"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import {
  ArrowUpRight,
  Car,
  ChevronDown,
  FileText,
  Flame,
  GripVertical,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  MousePointerClick,
  Search,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────── */
/* TYPES & CONSTANTS                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export type PipelineStageMeta = {
  id: string;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
};

type PipelineBoardProps = {
  contacts: any[];
  stages: PipelineStageMeta[];
  /** Persist a stage / position change. Throw to signal failure (UI will revert). */
  onMove: (contact: any, stage: string, order: number) => Promise<unknown> | void;
  onOpen: (contact: any) => void;
  onPriorityChange?: (contact: any, priority: string) => Promise<unknown> | void;
};

type DragState = {
  contact: any;
  originStage: string;
  originIndex: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

type DropTarget = { stage: string; index: number };

type PendingPress = {
  contact: any;
  startX: number;
  startY: number;
  el: HTMLElement;
  pointerType: string;
  timer?: number;
};

type Burst = {
  id: number;
  x: number;
  y: number;
  particles: { dx: number; dy: number; rot: number; color: string; size: number; delay: number }[];
};

type Override = { stage: string; order: number; seen: string[] };

const STAGE_HEX: Record<string, string> = {
  NEW_LEAD: "#38bdf8",
  CONTACTED: "#34d399",
  QUOTE_SENT: "#818cf8",
  FINANCE_APP: "#fbbf24",
  BANK_SUBMITTED: "#c084fc",
  CLOSED_WON: "#4ade80",
};
const hexFor = (id: string) => STAGE_HEX[id] || "#34d399";

const WON_STAGE = "CLOSED_WON";

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  HOT: { label: "Hot", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  WARM: { label: "Warm", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  NORMAL: { label: "Normal", className: "bg-[#2a2823] text-[#a09c94] border-[#3a362f]" },
};
const PRIORITY_CYCLE = ["HOT", "WARM", "NORMAL"];

const VIEW_STORAGE_KEY = "autofame_crm_pipeline_view";

const LIST_GRID =
  "grid-cols-[20px_minmax(200px,1.6fr)_minmax(170px,1.4fr)_120px_84px_170px_90px_110px_32px]";

const SCROLLBAR = "[scrollbar-width:thin] [scrollbar-color:#3a362f_transparent]";

const dealValue = (c: any) => Number(c?.dealValueZar) || 0;
const sumValue = (list: any[]) => list.reduce((s, c) => s + dealValue(c), 0);

const formatZar = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
const formatZarCompact = (n: number) => {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `R${Math.round(n / 1_000)}k`;
  return `R${Math.round(n)}`;
};

const initialsOf = (name: string) =>
  (name || "WA")
    .replace(/[^A-Za-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "WA";

/** Fractional ordering: returns a sort key that slots between two neighbours. */
const orderBetween = (prev?: number, next?: number) => {
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return (next as number) - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* PRESENTATIONAL PIECES                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function PriorityChip({
  priority,
  onClick,
}: {
  priority?: string;
  onClick?: () => void;
}) {
  const meta = PRIORITY_META[priority || "NORMAL"] || PRIORITY_META.NORMAL;
  return (
    <button
      type="button"
      data-no-drag
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={onClick ? "Click to change priority" : undefined}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md border text-[9px] font-semibold uppercase tracking-wide shrink-0 transition hover:brightness-125",
        meta.className
      )}
    >
      {priority === "HOT" && <Flame className="h-2.5 w-2.5" />}
      {meta.label}
    </button>
  );
}

function StageDots({
  stages,
  current,
  onMoveTo,
}: {
  stages: PipelineStageMeta[];
  current: string;
  onMoveTo?: (stageId: string) => void;
}) {
  return (
    <div data-no-drag className="flex items-center gap-[3px]">
      {stages.map((s) => {
        const active = s.id === current;
        const hex = hexFor(s.id);
        return (
          <button
            key={s.id}
            type="button"
            title={active ? s.label : `Move to ${s.label}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!active) onMoveTo?.(s.id);
            }}
            className="h-3.5 w-3.5 grid place-items-center rounded-full transition-transform hover:scale-[1.35]"
          >
            <span
              className="h-[7px] w-[7px] rounded-full transition-opacity"
              style={{
                background: hex,
                opacity: active ? 1 : 0.28,
                boxShadow: active ? `0 0 0 2px #1a1815, 0 0 0 3px ${hex}aa, 0 0 10px ${hex}` : undefined,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function BoardCardBody({
  contact,
  stages,
  onMoveTo,
  onPriority,
}: {
  contact: any;
  stages: PipelineStageMeta[];
  onMoveTo?: (stageId: string) => void;
  onPriority?: () => void;
}) {
  const hex = hexFor(contact.stage);
  const docs = Number(contact.ficaDocsCount || 0);
  return (
    <>
      <span
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
        style={{ background: hex, boxShadow: `0 0 12px ${hex}90` }}
      />
      <div className="flex items-start gap-2.5">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{
            background: `linear-gradient(135deg, ${hex}66, ${hex}12)`,
            border: `1px solid ${hex}45`,
          }}
        >
          {initialsOf(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#f5f2eb] truncate leading-tight">
              {contact.name}
            </p>
            <PriorityChip priority={contact.priority} onClick={onPriority} />
          </div>
          <p className="mt-0.5 text-[10px] font-mono text-[#8e8a82] truncate">
            {contact.phone}
            <span className="text-[#5d5a53]"> · </span>
            <span className="text-emerald-400/80">{contact.lastContactedLabel || "Synced"}</span>
          </p>
        </div>
      </div>

      {contact.assignedCarName && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#b5b1a8] min-w-0">
          <Car className="h-3 w-3 text-[#7d7970] shrink-0" />
          <span className="truncate">{contact.assignedCarName}</span>
        </div>
      )}

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.05] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-emerald-300">
            {formatZar(dealValue(contact))}
          </span>
          {docs > 0 && (
            <span
              title={`${docs}/5 FICA documents`}
              className="inline-flex items-center gap-0.5 text-[9px] font-mono text-[#a09c94]"
            >
              <FileText className="h-2.5 w-2.5" />
              {docs}/5
            </span>
          )}
        </div>
        <div className="opacity-60 group-hover:opacity-100 transition-opacity">
          <StageDots stages={stages} current={contact.stage} onMoveTo={onMoveTo} />
        </div>
      </div>
    </>
  );
}

function ListRowBody({
  contact,
  stages,
  onStageSelect,
  onPriority,
  onOpen,
}: {
  contact: any;
  stages: PipelineStageMeta[];
  onStageSelect?: (stageId: string) => void;
  onPriority?: () => void;
  onOpen?: () => void;
}) {
  const hex = hexFor(contact.stage);
  const docs = Math.min(5, Number(contact.ficaDocsCount || 0));
  return (
    <>
      <GripVertical className="h-4 w-4 text-[#5d5a53] group-hover:text-[#a09c94] transition-colors" />

      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{
            background: `linear-gradient(135deg, ${hex}66, ${hex}12)`,
            border: `1px solid ${hex}45`,
          }}
        >
          {initialsOf(contact.name)}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#f5f2eb] truncate">{contact.name}</p>
          <p className="text-[10px] font-mono text-[#8e8a82] truncate">{contact.phone}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-[#b5b1a8]">
        <Car className="h-3 w-3 text-[#7d7970] shrink-0" />
        <span className="truncate">{contact.assignedCarName || "—"}</span>
      </div>

      <span className="text-xs font-mono font-semibold text-emerald-300">
        {formatZar(dealValue(contact))}
      </span>

      <div>
        <PriorityChip priority={contact.priority} onClick={onPriority} />
      </div>

      <div data-no-drag className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full"
          style={{ background: hex, boxShadow: `0 0 8px ${hex}` }}
        />
        <select
          value={contact.stage}
          onChange={(e) => onStageSelect?.(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full appearance-none bg-[#1b1a17] hover:bg-[#211f1b] border border-[#33302a] rounded-lg pl-6 pr-6 py-1 text-[11px] font-semibold text-[#f5f2eb] focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#8e8a82]" />
      </div>

      <div className="flex items-center gap-[3px]" title={`${docs}/5 FICA documents`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-2.5 rounded-full"
            style={{ background: i < docs ? hex : "rgba(255,255,255,0.08)" }}
          />
        ))}
      </div>

      <span className="text-[10px] font-mono text-[#8e8a82] truncate">
        {contact.lastContactedLabel || "Synced"}
      </span>

      <button
        type="button"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
        title="Open in workspace"
        className="h-7 w-7 grid place-items-center rounded-lg text-[#8e8a82] hover:text-emerald-300 hover:bg-emerald-500/10 transition"
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* MAIN BOARD                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export default function PipelineBoard({
  contacts,
  stages,
  onMove,
  onOpen,
  onPriorityChange,
}: PipelineBoardProps) {
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HOT" | "WARM">("ALL");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);

  // Restore preferred view
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "board" || saved === "list") setViewMode(saved);
    } catch {}
  }, []);

  const changeView = (v: "board" | "list") => {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {}
  };

  // Drop optimistic overrides once the server has caught up (or changed elsewhere)
  useEffect(() => {
    setOverrides((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        const c = contacts.find((x) => x.contactKey === key);
        if (!c) continue;
        const o = prev[key];
        const synced = c.stage === o.stage && c.pipelineOrder === o.order;
        const external = c.stage !== o.stage && !o.seen.includes(c.stage);
        if (synced || external) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [contacts]);

  const stageIds = useMemo(() => new Set(stages.map((s) => s.id)), [stages]);

  const items = useMemo(
    () =>
      contacts.map((c, idx) => {
        const o = overrides[c.contactKey];
        const rawStage = o ? o.stage : c.stage;
        return {
          ...c,
          stage: stageIds.has(rawStage) ? rawStage : stages[0]?.id,
          _order: o
            ? o.order
            : typeof c.pipelineOrder === "number"
            ? c.pipelineOrder
            : idx * 1000,
        };
      }),
    [contacts, overrides, stageIds, stages]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (priorityFilter !== "ALL" && (c.priority || "NORMAL") !== priorityFilter) return false;
      if (!q) return true;
      return [c.name, c.phone, c.assignedCarName, c.lastMessage].some((v) =>
        String(v || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, priorityFilter]);

  const byStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    stages.forEach((s) => (map[s.id] = []));
    filtered.forEach((c) => {
      if (!map[c.stage]) map[c.stage] = [];
      map[c.stage].push(c);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a._order - b._order));
    return map;
  }, [filtered, stages]);

  const stats = useMemo(() => {
    const won = items.filter((c) => c.stage === WON_STAGE);
    const open = items.filter((c) => c.stage !== WON_STAGE);
    return {
      openValue: sumValue(open),
      openCount: open.length,
      wonValue: sumValue(won),
      wonCount: won.length,
      winRate: items.length ? Math.round((won.length / items.length) * 100) : 0,
    };
  }, [items]);

  const stageTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    stages.forEach((s) => (totals[s.id] = sumValue(byStage[s.id] || [])));
    return totals;
  }, [byStage, stages]);
  const maxStageTotal = Math.max(1, ...Object.values(stageTotals));

  /* ── Refs used by the drag engine (window listeners read latest values) ── */
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const byStageRef = useRef(byStage);
  byStageRef.current = byStage;
  const dragRef = useRef<DragState | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const pendingRef = useRef<PendingPress | null>(null);
  const droppingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const justDroppedRef = useRef<string | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Floating "lifted" card position + velocity-driven tilt
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const vx = useVelocity(px);
  const tiltRaw = useTransform(vx, [-1800, 0, 1800], [-12, 0, 12], { clamp: true });
  const tilt = useSpring(tiltRaw, { stiffness: 320, damping: 24 });
  const tiltSoft = useTransform(tilt, (r) => r * 0.25);

  /* ── Celebrations ── */
  const celebrate = (at?: { x: number; y: number }) => {
    let pos = at;
    if (!pos) {
      const col = document.querySelector<HTMLElement>(`[data-drop-stage="${WON_STAGE}"]`);
      const r = col?.getBoundingClientRect();
      pos = r
        ? { x: r.left + r.width / 2, y: r.top + 80 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    }
    const palette = ["#4ade80", "#34d399", "#fbbf24", "#38bdf8", "#c084fc", "#f5f2eb"];
    const id = Date.now() + Math.random();
    const particles = Array.from({ length: 28 }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 120;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist + 50,
        rot: (Math.random() - 0.5) * 720,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 5 + Math.random() * 6,
        delay: Math.random() * 0.08,
      };
    });
    setBursts((b) => [...b, { id, x: pos!.x, y: pos!.y, particles }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1500);
  };

  /* ── Core move commit (optimistic + persisted + undo) ── */
  const commitMove = (
    contact: any,
    stageId: string,
    order: number,
    opts: { toast?: boolean; celebrateAt?: { x: number; y: number } } = {}
  ) => {
    const key = contact.contactKey;
    const prevStage = contact.stage;
    const prevOrder = contact._order;
    const raw = contactsRef.current.find((x) => x.contactKey === key);

    setOverrides((o) => ({
      ...o,
      [key]: {
        stage: stageId,
        order,
        seen: Array.from(
          new Set([...(o[key]?.seen || []), raw?.stage, prevStage].filter(Boolean) as string[])
        ),
      },
    }));

    Promise.resolve(onMove(contact, stageId, order)).catch((err: any) => {
      setOverrides((o) => {
        const n = { ...o };
        delete n[key];
        return n;
      });
      toast.error(err?.message || "Could not move deal");
    });

    if (opts.toast && stageId !== prevStage) {
      const label = stages.find((s) => s.id === stageId)?.label || stageId;
      toast.success(`${contact.name} → ${label}`, {
        action: {
          label: "Undo",
          onClick: () =>
            commitMove({ ...contact, stage: stageId, _order: order }, prevStage, prevOrder),
        },
      });
    }

    if (stageId === WON_STAGE && prevStage !== WON_STAGE) {
      celebrate(opts.celebrateAt);
      toast.success(`🏆 Deal closed — ${contact.name}`, {
        description: formatZar(dealValue(contact)),
      });
    }
  };

  const refocus = (key: string) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`)?.focus()
      )
    );
  };

  const moveToStage = (contact: any, stageId: string, withToast = true) => {
    const list = (byStageRef.current[stageId] || []).filter(
      (c) => c.contactKey !== contact.contactKey
    );
    const order = orderBetween(undefined, list[0]?._order);
    commitMove(contact, stageId, order, { toast: withToast });
  };

  const nudge = (contact: any, dir: -1 | 1) => {
    const list = byStageRef.current[contact.stage] || [];
    const i = list.findIndex((c) => c.contactKey === contact.contactKey);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const others = list.filter((c) => c.contactKey !== contact.contactKey);
    commitMove(contact, contact.stage, orderBetween(others[j - 1]?._order, others[j]?._order));
  };

  const cyclePriority = (contact: any) => {
    if (!onPriorityChange) return;
    const i = PRIORITY_CYCLE.indexOf(contact.priority || "NORMAL");
    const next = PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length];
    Promise.resolve(onPriorityChange(contact, next)).catch((err: any) =>
      toast.error(err?.message || "Could not update priority")
    );
  };

  /* ── Drag engine ── */
  const beginDrag = (p: PendingPress, x: number, y: number) => {
    const originList = byStageRef.current[p.contact.stage] || [];
    const originIndex = Math.max(
      0,
      originList.findIndex((c) => c.contactKey === p.contact.contactKey)
    );
    const rect = p.el.getBoundingClientRect();
    const d: DragState = {
      contact: p.contact,
      originStage: p.contact.stage,
      originIndex,
      width: rect.width,
      height: rect.height,
      offsetX: x - rect.left,
      offsetY: y - rect.top,
    };
    dragRef.current = d;
    suppressClickRef.current = true;
    px.jump(rect.left);
    py.jump(rect.top);
    targetRef.current = { stage: d.originStage, index: d.originIndex };
    setTarget(targetRef.current);
    setDrag(d);
    document.body.style.cursor = "grabbing";
    if (p.pointerType === "touch") navigator.vibrate?.(12);
  };

  const updateTarget = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d || droppingRef.current) return;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zone = el?.closest<HTMLElement>("[data-drop-stage]");
    let next: DropTarget = { stage: d.originStage, index: d.originIndex };
    if (zone?.dataset.dropStage) {
      const cards = Array.from(zone.querySelectorAll<HTMLElement>("[data-card-key]")).filter(
        (c) => c.dataset.cardKey !== d.contact.contactKey
      );
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      next = { stage: zone.dataset.dropStage, index };
    }
    const prev = targetRef.current;
    if (prev?.stage !== next.stage || prev?.index !== next.index) {
      targetRef.current = next;
      setTarget(next);
    }
  };

  const finishDrag = async () => {
    const d = dragRef.current;
    if (!d || droppingRef.current) return;
    droppingRef.current = true;
    const t = targetRef.current || { stage: d.originStage, index: d.originIndex };

    // Magnetic snap of the floating card into its slot
    let center: { x: number; y: number } | undefined;
    const ph = document.querySelector<HTMLElement>("[data-drop-placeholder]");
    if (ph) {
      const r = ph.getBoundingClientRect();
      center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const spring = { type: "spring" as const, stiffness: 560, damping: 40, mass: 0.7 };
      await Promise.all([animate(px, r.left, spring), animate(py, r.top, spring)]);
    }

    justDroppedRef.current = d.contact.contactKey;
    const isNoop = t.stage === d.originStage && t.index === d.originIndex;
    if (!isNoop) {
      const list = (byStageRef.current[t.stage] || []).filter(
        (c) => c.contactKey !== d.contact.contactKey
      );
      const order = orderBetween(list[t.index - 1]?._order, list[t.index]?._order);
      commitMove(d.contact, t.stage, order, { toast: true, celebrateAt: center });
    }

    dragRef.current = null;
    targetRef.current = null;
    droppingRef.current = false;
    setDrag(null);
    setTarget(null);
    document.body.style.cursor = "";
  };

  const cancelDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    targetRef.current = { stage: d.originStage, index: d.originIndex };
    setTarget(targetRef.current);
    requestAnimationFrame(() => finishDrag());
  };

  const engine = useRef({ beginDrag, updateTarget, finishDrag, cancelDrag });
  engine.current = { beginDrag, updateTarget, finishDrag, cancelDrag };

  // Global pointer listeners (installed once)
  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      const p = pendingRef.current;
      if (p && !dragRef.current) {
        const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
        if (p.pointerType === "touch") {
          if (dist > 10) {
            window.clearTimeout(p.timer);
            pendingRef.current = null;
          }
          return;
        }
        if (dist > 5) {
          pendingRef.current = null;
          engine.current.beginDrag(p, e.clientX, e.clientY);
        }
        return;
      }
      const d = dragRef.current;
      if (d && !droppingRef.current) {
        px.set(e.clientX - d.offsetX);
        py.set(e.clientY - d.offsetY);
        engine.current.updateTarget(e.clientX, e.clientY);
      }
    };
    const onUp = () => {
      const p = pendingRef.current;
      if (p) {
        window.clearTimeout(p.timer);
        pendingRef.current = null;
      }
      if (dragRef.current) engine.current.finishDrag();
    };
    const onCancel = () => {
      const p = pendingRef.current;
      if (p) {
        window.clearTimeout(p.timer);
        pendingRef.current = null;
      }
      if (dragRef.current) engine.current.cancelDrag();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) engine.current.cancelDrag();
    };

    window.addEventListener("pointermove", onMoveEvt);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      document.body.style.cursor = "";
    };
  }, [px, py]);

  // Edge auto-scroll while dragging
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const EDGE = 80;
    const speed = (dist: number) => Math.ceil(((EDGE - dist) / EDGE) * 18);
    const tick = () => {
      const { x, y } = pointerRef.current;
      const container = scrollRef.current;
      if (container && !droppingRef.current) {
        const r = container.getBoundingClientRect();
        if (viewMode === "board") {
          if (x < r.left + EDGE) container.scrollLeft -= speed(x - r.left);
          else if (x > r.right - EDGE) container.scrollLeft += speed(r.right - x);
        } else {
          if (y < r.top + EDGE) container.scrollTop -= speed(y - r.top);
          else if (y > r.bottom - EDGE) container.scrollTop += speed(r.bottom - y);
        }
        const col = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
          "[data-scroll-col]"
        );
        if (col) {
          const cr = col.getBoundingClientRect();
          if (y < cr.top + 60) col.scrollTop -= speed(((y - cr.top) / 60) * EDGE);
          else if (y > cr.bottom - 60) col.scrollTop += speed(((cr.bottom - y) / 60) * EDGE);
        }
        engine.current.updateTarget(x, y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag, viewMode]);

  /* ── Card event handlers ── */
  const onCardPointerDown = (e: React.PointerEvent<HTMLElement>, contact: any) => {
    suppressClickRef.current = false;
    if (e.button !== 0 || droppingRef.current || dragRef.current) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    const p: PendingPress = {
      contact,
      startX: e.clientX,
      startY: e.clientY,
      el: e.currentTarget,
      pointerType: e.pointerType,
    };
    if (e.pointerType === "touch") {
      p.timer = window.setTimeout(() => {
        if (pendingRef.current === p) {
          pendingRef.current = null;
          engine.current.beginDrag(p, pointerRef.current.x, pointerRef.current.y);
        }
      }, 260);
    }
    pendingRef.current = p;
  };

  const onCardClick = (contact: any) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen(contact);
  };

  const onCardKeyDown = (e: React.KeyboardEvent<HTMLElement>, contact: any) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(contact);
      return;
    }
    if (!e.shiftKey) return;
    const idx = stages.findIndex((s) => s.id === contact.stage);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const ns = stages[idx + (e.key === "ArrowRight" ? 1 : -1)];
      if (ns) {
        e.preventDefault();
        moveToStage(contact, ns.id);
        refocus(contact.contactKey);
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(contact, e.key === "ArrowUp" ? -1 : 1);
      refocus(contact.contactKey);
    }
  };

  const cardInitial = (key: string) =>
    justDroppedRef.current === key ? false : { opacity: 0, scale: 0.97 };

  const layoutTransition = {
    layout: { type: "spring" as const, stiffness: 520, damping: 42 },
    default: { duration: 0.2 },
  };

  const placeholder = (stageId: string, height: number, rounded = "rounded-xl") => {
    const hex = hexFor(stageId);
    return (
      <motion.div
        key="__placeholder"
        data-drop-placeholder
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={layoutTransition}
        className={cn("shrink-0 border-2 border-dashed", rounded)}
        style={{
          height,
          borderColor: `${hex}70`,
          background: `repeating-linear-gradient(135deg, ${hex}10 0 8px, transparent 8px 16px)`,
          boxShadow: `inset 0 0 24px ${hex}20`,
        }}
      />
    );
  };

  /* ────────────────────────────────────────────────────────────────────── */
  /* RENDER                                                                 */
  /* ────────────────────────────────────────────────────────────────────── */

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#11100e]">
      {/* ── Toolbar ── */}
      <div className="shrink-0 px-3 sm:px-4 py-2.5 border-b border-[#25231f] bg-[#141310]/90 backdrop-blur flex flex-wrap items-center gap-2.5">
        {/* Board / List segmented switch */}
        <div className="relative flex items-center bg-[#0e0d0b] p-1 rounded-xl border border-[#292621]">
          {(
            [
              { id: "board", label: "Board", Icon: LayoutGrid },
              { id: "list", label: "List", Icon: ListIcon },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => changeView(id)}
                className={cn(
                  "relative px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors",
                  active ? "text-white" : "text-[#8e8a82] hover:text-white"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pipeline-view-pill"
                    className="absolute inset-0 rounded-lg bg-emerald-600 shadow-[0_0_22px_-4px_rgba(16,185,129,0.7)]"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60">
          <Search className="h-3.5 w-3.5 text-[#8e8a82] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter deals, cars, phones..."
            className="w-full bg-[#1b1a17] border border-[#33302a] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 select-text"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8e8a82] hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Priority filter */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "ALL", label: "All" },
              { id: "HOT", label: "Hot" },
              { id: "WARM", label: "Warm" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPriorityFilter(f.id)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1",
                priorityFilter === f.id
                  ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                  : "bg-[#1a1916] border-[#262420] text-[#8e8a82] hover:text-white"
              )}
            >
              {f.id === "HOT" && <Flame className="h-3 w-3" />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1a1916] border border-[#262420]">
            <Wallet className="h-3.5 w-3.5 text-sky-300" />
            <div className="leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-[#7d7970]">Open pipeline</p>
              <p className="text-xs font-mono font-semibold text-[#f5f2eb]">
                {formatZarCompact(stats.openValue)}
                <span className="text-[#7d7970] font-normal"> · {stats.openCount}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1a1916] border border-[#262420]">
            <Trophy className="h-3.5 w-3.5 text-emerald-300" />
            <div className="leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-[#7d7970]">Won</p>
              <p className="text-xs font-mono font-semibold text-emerald-300">
                {formatZarCompact(stats.wonValue)}
                <span className="text-[#7d7970] font-normal"> · {stats.wonCount}</span>
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1a1916] border border-[#262420]">
            <TrendingUp className="h-3.5 w-3.5 text-amber-300" />
            <div className="leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-[#7d7970]">Win rate</p>
              <p className="text-xs font-mono font-semibold text-[#f5f2eb]">{stats.winRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hint strip */}
      <div className="hidden lg:flex shrink-0 items-center gap-3 px-4 py-1.5 text-[10px] font-mono text-[#6f6b63] border-b border-[#1c1b18]">
        <MousePointerClick className="h-3 w-3 text-emerald-500/70" />
        <span>Drag cards to move or reorder</span>
        <span className="text-[#3a362f]">•</span>
        <span>Tap a stage dot to jump</span>
        <span className="text-[#3a362f]">•</span>
        <span>
          <kbd className="px-1 rounded bg-[#1f1d1a] border border-[#2e2b25]">Shift</kbd> +{" "}
          <kbd className="px-1 rounded bg-[#1f1d1a] border border-[#2e2b25]">← →</kbd> stage,{" "}
          <kbd className="px-1 rounded bg-[#1f1d1a] border border-[#2e2b25]">↑ ↓</kbd> reorder
        </span>
        <span className="text-[#3a362f]">•</span>
        <span>
          <kbd className="px-1 rounded bg-[#1f1d1a] border border-[#2e2b25]">Esc</kbd> cancels a drag
        </span>
      </div>

      {/* ── BOARD VIEW ── */}
      {viewMode === "board" && (
        <div
          ref={scrollRef}
          className={cn("flex-1 min-h-0 overflow-x-auto overflow-y-hidden", SCROLLBAR)}
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <div className="h-full flex gap-3 p-3 sm:p-4 w-max">
            {stages.map((stage) => {
              const hex = hexFor(stage.id);
              const all = byStage[stage.id] || [];
              const list = drag ? all.filter((c) => c.contactKey !== drag.contact.contactKey) : all;
              const isTarget = !!drag && target?.stage === stage.id;
              const total = stageTotals[stage.id] || 0;
              const pct = Math.round((total / maxStageTotal) * 100);

              const nodes: React.ReactNode[] = list.map((c) => (
                <motion.div
                  key={c.contactKey}
                  layout="position"
                  data-card-key={c.contactKey}
                  tabIndex={0}
                  initial={cardInitial(c.contactKey)}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -2 }}
                  transition={layoutTransition}
                  onPointerDown={(e) => onCardPointerDown(e, c)}
                  onClick={() => onCardClick(c)}
                  onKeyDown={(e) => onCardKeyDown(e, c)}
                  onContextMenu={(e) => {
                    if (pendingRef.current?.pointerType === "touch" || dragRef.current)
                      e.preventDefault();
                  }}
                  style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
                  className="group relative shrink-0 rounded-xl border border-[#2c2924] hover:border-[#403b34] bg-gradient-to-b from-[#1e1c19] to-[#181613] p-3 pl-3.5 cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_8px_20px_-12px_rgba(0,0,0,0.7)]"
                >
                  <BoardCardBody
                    contact={c}
                    stages={stages}
                    onMoveTo={(sid) => moveToStage(c, sid)}
                    onPriority={onPriorityChange ? () => cyclePriority(c) : undefined}
                  />
                </motion.div>
              ));
              if (isTarget && target) {
                nodes.splice(target.index, 0, placeholder(stage.id, drag!.height));
              }

              return (
                <div
                  key={stage.id}
                  data-drop-stage={stage.id}
                  className="w-[288px] sm:w-[300px] shrink-0 h-full flex flex-col rounded-2xl border transition-[border-color,box-shadow,background,opacity] duration-200"
                  style={
                    isTarget
                      ? {
                          borderColor: `${hex}66`,
                          background: `linear-gradient(180deg, ${hex}14, #14130f 45%)`,
                          boxShadow: `0 0 0 1px ${hex}30, 0 24px 60px -30px ${hex}aa`,
                        }
                      : {
                          borderColor: "#24221e",
                          background: "#14130fe6",
                          opacity: drag ? 0.82 : 1,
                        }
                  }
                >
                  {/* Column header */}
                  <div className="px-3.5 pt-3 pb-2.5 space-y-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: hex, boxShadow: `0 0 10px ${hex}` }}
                        />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#f5f2eb] truncate">
                          {stage.label}
                        </span>
                      </div>
                      <motion.span
                        key={all.length}
                        initial={{ scale: 1.35 }}
                        animate={{ scale: 1 }}
                        className="min-w-[22px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                        style={{ background: `${hex}1f`, color: hex }}
                      >
                        {all.length}
                      </motion.span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-semibold text-[#f5f2eb]">
                        {formatZarCompact(total)}
                      </span>
                      <span className="text-[9px] font-mono text-[#6f6b63]">ZAR</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${hex}88, ${hex})` }}
                        initial={false}
                        animate={{ width: `${pct}%` }}
                        transition={{ type: "spring", stiffness: 200, damping: 30 }}
                      />
                    </div>
                  </div>

                  {/* Cards */}
                  <motion.div
                    layoutScroll
                    data-scroll-col
                    className={cn(
                      "flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-2",
                      SCROLLBAR
                    )}
                  >
                    {nodes}
                    {nodes.length === 0 && (
                      <div className="flex-1 min-h-[120px] rounded-xl border border-dashed border-[#2e2b25] flex flex-col items-center justify-center gap-1.5 text-[#5d5a53]">
                        <Inbox className="h-5 w-5" />
                        <span className="text-[10px] font-mono">Drop deals here</span>
                      </div>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div ref={scrollRef} className={cn("flex-1 min-h-0 overflow-auto p-3 sm:p-4", SCROLLBAR)}>
          <div className="min-w-[1000px] max-w-[1400px] mx-auto space-y-3">
            <div
              className={cn(
                "sticky top-0 z-10 grid items-center gap-3 px-3 py-2 rounded-xl text-[9px] uppercase tracking-wider font-mono text-[#6f6b63] bg-[#11100e]/90 backdrop-blur border border-[#1f1d1a]",
                LIST_GRID
              )}
            >
              <span />
              <span>Client</span>
              <span>Vehicle</span>
              <span>Deal value</span>
              <span>Priority</span>
              <span>Stage</span>
              <span>FICA</span>
              <span>Last contact</span>
              <span />
            </div>

            {stages.map((stage) => {
              const hex = hexFor(stage.id);
              const all = byStage[stage.id] || [];
              const list = drag ? all.filter((c) => c.contactKey !== drag.contact.contactKey) : all;
              const isTarget = !!drag && target?.stage === stage.id;
              const isCollapsed = !!collapsed[stage.id] && !isTarget;
              const total = stageTotals[stage.id] || 0;
              const pct = Math.round((total / maxStageTotal) * 100);

              const rows: React.ReactNode[] = list.map((c) => (
                <motion.div
                  key={c.contactKey}
                  layout="position"
                  data-card-key={c.contactKey}
                  tabIndex={0}
                  initial={cardInitial(c.contactKey)}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={layoutTransition}
                  onPointerDown={(e) => onCardPointerDown(e, c)}
                  onClick={() => onCardClick(c)}
                  onKeyDown={(e) => onCardKeyDown(e, c)}
                  onContextMenu={(e) => {
                    if (pendingRef.current?.pointerType === "touch" || dragRef.current)
                      e.preventDefault();
                  }}
                  style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
                  className={cn(
                    "group relative grid items-center gap-3 px-3 py-2.5 rounded-lg cursor-grab hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-emerald-500/50",
                    LIST_GRID
                  )}
                >
                  <ListRowBody
                    contact={c}
                    stages={stages}
                    onStageSelect={(sid) => moveToStage(c, sid)}
                    onPriority={onPriorityChange ? () => cyclePriority(c) : undefined}
                    onOpen={() => onOpen(c)}
                  />
                </motion.div>
              ));
              if (isTarget && target) {
                rows.splice(target.index, 0, placeholder(stage.id, drag!.height, "rounded-lg"));
              }

              return (
                <section
                  key={stage.id}
                  data-drop-stage={stage.id}
                  className="rounded-2xl border overflow-hidden transition-[border-color,box-shadow] duration-200"
                  style={
                    isTarget
                      ? {
                          borderColor: `${hex}70`,
                          background: `linear-gradient(180deg, ${hex}0f, #151411 60%)`,
                          boxShadow: `0 0 0 1px ${hex}30, 0 14px 40px -24px ${hex}aa`,
                        }
                      : { borderColor: "#25231f", background: "#151411" }
                  }
                >
                  <button
                    type="button"
                    onClick={() => setCollapsed((s) => ({ ...s, [stage.id]: !s[stage.id] }))}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition"
                  >
                    <motion.span
                      animate={{ rotate: isCollapsed ? -90 : 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      <ChevronDown className="h-4 w-4 text-[#8e8a82]" />
                    </motion.span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: hex, boxShadow: `0 0 10px ${hex}` }}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#f5f2eb]">
                      {stage.label}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                      style={{ background: `${hex}1f`, color: hex }}
                    >
                      {all.length}
                    </span>
                    <span className="ml-auto text-xs font-mono font-semibold text-emerald-300">
                      {formatZar(total)}
                    </span>
                    <div className="w-28 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${hex}88, ${hex})` }}
                        initial={false}
                        animate={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 38 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-white/[0.05] p-1.5 flex flex-col gap-0.5">
                          {rows}
                          {rows.length === 0 && (
                            <div className="py-5 flex items-center justify-center gap-2 text-[11px] font-mono text-[#5d5a53]">
                              <Inbox className="h-4 w-4" />
                              No deals in this stage — drag one here
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Floating lifted card (follows pointer, tilts with velocity) ── */}
      <AnimatePresence>
        {drag && (
          <motion.div
            key={`overlay-${drag.contact.contactKey}`}
            className="fixed left-0 top-0 z-[100] pointer-events-none"
            style={{
              x: px,
              y: py,
              width: drag.width,
              rotate: viewMode === "board" ? tilt : tiltSoft,
              transformOrigin: `${drag.offsetX}px ${drag.offsetY}px`,
            }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <motion.div
              initial={{ scale: 1 }}
              animate={{
                scale: viewMode === "board" ? 1.05 : 1.015,
                boxShadow: `0 28px 70px -14px rgba(0,0,0,0.8), 0 0 0 1px ${hexFor(
                  target?.stage || drag.originStage
                )}88, 0 0 46px -6px ${hexFor(target?.stage || drag.originStage)}66`,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={cn(
                "relative bg-[#23211c] cursor-grabbing",
                viewMode === "board"
                  ? "rounded-xl p-3 pl-3.5"
                  : cn("grid items-center gap-3 px-3 py-2.5 rounded-lg", LIST_GRID)
              )}
            >
              {viewMode === "board" ? (
                <BoardCardBody
                  contact={{ ...drag.contact, stage: target?.stage || drag.originStage }}
                  stages={stages}
                />
              ) : (
                <ListRowBody
                  contact={{ ...drag.contact, stage: target?.stage || drag.originStage }}
                  stages={stages}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Closed-won confetti ── */}
      <div className="pointer-events-none fixed inset-0 z-[110]">
        {bursts.map((b) =>
          b.particles.map((p, i) => (
            <motion.span
              key={`${b.id}-${i}`}
              className="absolute rounded-[2px]"
              style={{
                left: b.x,
                top: b.y,
                width: p.size,
                height: p.size * 0.6,
                background: p.color,
              }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.rot, scale: 0.6 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: p.delay }}
            />
          ))
        )}
      </div>
    </div>
  );
}
