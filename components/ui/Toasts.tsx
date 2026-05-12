"use client";

import { useStore } from "@/lib/store";
import { Check, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 shadow-card animate-fadeSlide",
            "text-[13px]"
          )}
        >
          {t.tone === "success" && (
            <Check size={16} className="text-[var(--success)]" />
          )}
          {t.tone === "info" && <Info size={16} className="text-fg-muted" />}
          {t.tone === "danger" && (
            <AlertTriangle size={16} className="text-[var(--danger)]" />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
