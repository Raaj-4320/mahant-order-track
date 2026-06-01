"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FloatingPortal } from "@/components/ui/FloatingPortal";
import type { Order } from "@/lib/types";

const STATUS_OPTIONS: Array<{ value: Order["status"]; label: string }> = [
  { value: "saved", label: "Saved" },
  { value: "packed", label: "Loaded" },
  { value: "received", label: "Received" },
  { value: "delayed", label: "Delayed" },
  { value: "cancelled", label: "Cancelled" },
];

const statusClasses: Record<string, string> = {
  saved: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-amber-100 text-amber-700 border-amber-200",
  pending: "bg-blue-100 text-blue-700 border-blue-200",
  packed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  delayed: "bg-red-100 text-red-700 border-red-200",
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  archived: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

type Props = {
  value: Order["status"];
  onChange: (next: Order["status"]) => void;
  disabled?: boolean;
  debugOrderId?: string;
  options?: Array<{ value: Order["status"]; label: string }>;
};

export function OrderStatusControl({ value, onChange, disabled = false, debugOrderId, options }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resolvedOptions = options && options.length ? options : STATUS_OPTIONS;
  const selected = resolvedOptions.find((s) => s.value === value) ?? STATUS_OPTIONS.find((s) => s.value === value);
  const handleSelectStatus = (status: Order["status"]) => {
    console.log("[ORDER_DATE_STATUS_TRACE] status_selected_in_control", {
      orderId: debugOrderId,
      selectedStatus: status,
    });
    onChange(status);
    setOpen(false);
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={rootRef} className="inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => {
          const nextOpen = !v;
          if (nextOpen) {
            console.log("[ORDER_DATE_STATUS_TRACE] status_dropdown_open", {
              orderId: debugOrderId,
              currentStatus: value,
            });
          }
          return nextOpen;
        })}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
          statusClasses[value] || statusClasses.saved,
          disabled ? "cursor-not-allowed opacity-60" : "hover:brightness-95",
        )}
      >
        <span>{selected?.label || value}</span>
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      <FloatingPortal anchorRef={rootRef as any} open={open && !disabled} width={176}>
        <div className="rounded-xl border border-border bg-bg-card p-1.5 shadow-card">
          {resolvedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                if (option.value !== value) handleSelectStatus(option.value);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px]",
                option.value === value ? "bg-bg-subtle font-medium" : "hover:bg-bg-subtle"
              )}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={13} className="text-fg-subtle" /> : null}
            </button>
          ))}
        </div>
      </FloatingPortal>
    </div>
  );
}
