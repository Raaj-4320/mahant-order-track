"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", className, children, ...rest },
  ref
) {
  const v =
    variant === "primary"
      ? "btn-primary"
      : variant === "ghost"
      ? "btn-ghost"
      : variant === "danger"
      ? "bg-transparent text-[var(--danger)] hover:bg-[var(--danger)]/10 border border-transparent"
      : "btn-secondary";

  const s = size === "sm" ? "py-1.5 px-3 text-[13px] rounded-lg" : "";

  return (
    <button ref={ref} className={cn("btn", v, s, className)} {...rest}>
      {children}
    </button>
  );
});
