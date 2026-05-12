"use client";

import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-medium text-fg-muted">{label}</div>
          <div className="mt-1 text-[24px] font-semibold tabular-nums">{value}</div>
        </div>
        {icon && (
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-bg-subtle text-fg-muted">
            {icon}
          </div>
        )}
      </div>
      {hint && <div className="mt-3 text-[12px] text-fg-subtle">{hint}</div>}
    </div>
  );
}
