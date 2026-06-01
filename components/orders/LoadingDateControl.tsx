"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatIndianDate } from "@/lib/dateFormat";
import { cn } from "@/lib/cn";
import { FloatingPortal } from "@/components/ui/FloatingPortal";

type Props = {
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
  debugOrderId?: string;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (iso?: string) => {
  if (!iso) return null;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

const sameDay = (left: Date | null, right: Date | null) =>
  Boolean(left && right && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate());

export function LoadingDateControl({ value, onChange, disabled = false, debugOrderId }: Props) {
  const label = useMemo(() => (value ? formatIndianDate(value) : "Set date"), [value]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const [viewMonth, setViewMonth] = useState(() => {
    const seed = parseIsoDate(value) ?? new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) {
      const seed = parseIsoDate(value) ?? new Date();
      setViewMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
    }
  }, [value, open]);

  const monthLabel = useMemo(
    () => viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [viewMonth]
  );
  const dayCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let index = 0; index < firstDay; index += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const handleSelectDate = (day: Date) => {
    const emitted = toIsoDate(day);
    console.log("[ORDER_DATE_STATUS_TRACE] date_selected_in_control", {
      orderId: debugOrderId,
      selectedDate: emitted,
      formattedValue: day.toLocaleDateString("en-US"),
    });
    onChange(emitted);
    console.log("[ORDER_DATE_STATUS_TRACE] date_onchange_emit", {
      orderId: debugOrderId,
      emittedValue: emitted,
    });
    setOpen(false);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="inline-block" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => {
            const nextOpen = !v;
            if (nextOpen) {
              console.log("[ORDER_DATE_STATUS_TRACE] date_picker_open", {
                orderId: debugOrderId,
                currentValue: value,
              });
            }
            return nextOpen;
          });
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-card px-3 text-[12px] text-fg",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-fg-subtle"
        )}
      >
        <CalendarDays size={13} className="text-fg-subtle" />
        <span>{label}</span>
        <ChevronDown size={13} className={cn("text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      <FloatingPortal anchorRef={rootRef as any} open={open && !disabled} width={260}>
        <div className="rounded-xl border border-border bg-bg-card p-2 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-subtle text-fg hover:border-fg-subtle"
              onMouseDown={(event) => {
                event.preventDefault();
                setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-[12.5px] font-medium">{monthLabel}</div>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-subtle text-fg hover:border-fg-subtle"
              onMouseDown={(event) => {
                event.preventDefault();
                setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-fg-subtle">
            {WEEKDAY_LABELS.map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dayCells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="h-8" />;
              const isSelected = sameDay(day, selectedDate);
              const isToday = sameDay(day, new Date());
              return (
                <button
                  key={toIsoDate(day)}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectDate(day);
                  }}
                  className={cn(
                    "h-8 rounded-md border text-[12px] transition-colors",
                    isSelected
                      ? "border-fg bg-fg text-bg"
                      : "border-border bg-bg-card text-fg hover:border-fg-subtle hover:bg-bg-subtle",
                    isToday && !isSelected && "border-emerald-400/70"
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-[11.5px] hover:bg-bg-subtle"
              onMouseDown={(event) => {
                event.preventDefault();
                console.log("[ORDER_DATE_STATUS_TRACE] date_onchange_emit", {
                  orderId: debugOrderId,
                  emittedValue: undefined,
                });
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-[11.5px] hover:bg-bg-subtle"
              onMouseDown={(event) => {
                event.preventDefault();
                const now = new Date();
                handleSelectDate(now);
                setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              Today
            </button>
          </div>
        </div>
      </FloatingPortal>
    </div>
  );
}
