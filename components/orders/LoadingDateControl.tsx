"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatIndianDate } from "@/lib/dateFormat";
import { cn } from "@/lib/cn";
import { FloatingPortal } from "@/components/ui/FloatingPortal";

type Props = {
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
};

export function LoadingDateControl({ value, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const label = useMemo(() => (value ? formatIndianDate(value) : "Set date"), [value]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="inline-block" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-card px-3 text-[12px] text-fg",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-fg-subtle"
        )}
      >
        <CalendarDays size={13} className="text-fg-subtle" />
        <span>{label}</span>
        <ChevronDown size={13} className="text-fg-subtle" />
      </button>
      <FloatingPortal anchorRef={rootRef as any} open={open && !disabled} width={220}><div className="rounded-xl border border-border bg-bg-card p-2 shadow-card"><input
        ref={inputRef}
        type="date"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value || undefined); setOpen(false); }}
        className="input h-9 w-full text-[13px]"
      /></div></FloatingPortal>
    </div>
  );
}
