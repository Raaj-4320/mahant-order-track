"use client";

import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string;
  compact?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { options, placeholder, className, compact, ...rest },
  ref
) {
  const base = compact ? "field-input-sm" : "field-input";
  const padR = compact ? "pr-6" : "pr-9";
  const offsetR = compact ? "right-1.5" : "right-3";
  const iconSize = compact ? 13 : 16;
  return (
    <div className="relative w-full min-w-0">
      <select
        ref={ref}
        className={cn(base, "appearance-none cursor-pointer truncate", padR, className)}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={iconSize}
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle",
          offsetR
        )}
      />
    </div>
  );
});
