"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useMemo, useRef } from "react";
import { formatIndianDate } from "@/lib/dateFormat";
import { cn } from "@/lib/cn";

type Props = {
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
};

export function LoadingDateControl({ value, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const label = useMemo(() => (value ? formatIndianDate(value) : "Set date"), [value]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-card px-3 text-[12px] text-fg",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-fg-subtle"
        )}
      >
        <CalendarDays size={13} className="text-fg-subtle" />
        <span>{label}</span>
        <ChevronDown size={13} className="text-fg-subtle" />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
