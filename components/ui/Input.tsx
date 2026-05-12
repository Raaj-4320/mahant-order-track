"use client";

import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  containerClassName?: string;
  compact?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { leadingIcon, trailingIcon, className, containerClassName, compact, ...rest },
  ref
) {
  const base = compact ? "field-input-sm" : "field-input";
  if (!leadingIcon && !trailingIcon) {
    return <input ref={ref} className={cn(base, className)} {...rest} />;
  }
  const padL = compact ? "pl-7" : "pl-9";
  const padR = compact ? "pr-7" : "pr-9";
  const offsetL = compact ? "left-2" : "left-3";
  const offsetR = compact ? "right-2" : "right-3";
  return (
    <div className={cn("relative", containerClassName)}>
      {leadingIcon && (
        <span className={cn("pointer-events-none absolute inset-y-0 flex items-center text-fg-subtle", offsetL)}>
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(base, leadingIcon && padL, trailingIcon && padR, className)}
        {...rest}
      />
      {trailingIcon && (
        <span className={cn("absolute inset-y-0 flex items-center text-fg-subtle", offsetR)}>
          {trailingIcon}
        </span>
      )}
    </div>
  );
});

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
