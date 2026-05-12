"use client";

import { List } from "lucide-react";
import { customers, formatCNY, formatDate, suppliers } from "@/lib/data";
import { useStore } from "@/lib/store";
import { orderTotal } from "@/lib/types";
import { cn } from "@/lib/cn";

export function OrdersSidebar() {
  const { orders, selectedOrderId, selectOrder } = useStore();

  const summarize = (ids: string[], items: { id: string; name: string }[]) => {
    const names = Array.from(new Set(ids.map((id) => items.find((x) => x.id === id)?.name).filter(Boolean))) as string[];
    if (names.length === 0) return "—";
    if (names.length === 1) return names[0];
    return `${names[0]} & ${names.length - 1} more`;
  };

  return (
    <aside className="w-[260px] shrink-0 border-l border-border bg-bg-subtle">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[13.5px] font-semibold">Orders ({orders.length})</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {orders.map((o) => {
            const active = o.id === selectedOrderId;
            const supplierNames = summarize(o.lines.map((l) => l.supplierId), suppliers);
            const customerNames = summarize(o.lines.map((l) => l.customerId), customers);
            const total = orderTotal(o);
            return (
              <button
                key={o.id}
                onClick={() => selectOrder(o.id)}
                className={cn(
                  "w-full text-left rounded-lg border border-border bg-bg-card px-3 py-2.5 transition-all",
                  "hover:border-fg-subtle hover:shadow-soft",
                  active && "border-fg ring-1 ring-fg/10 shadow-card"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{o.number}</span>
                  <span className="text-[10.5px] text-fg-subtle">{formatDate(o.date)}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-fg-muted">{supplierNames}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] text-fg-muted">{customerNames}</span>
                  <span className="text-[12px] font-semibold text-[var(--success)] tabular-nums whitespace-nowrap">
                    {formatCNY(total)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border p-2">
          <button className="w-full btn btn-secondary py-1.5 px-3 text-[12.5px] rounded-lg">
            <List size={14} /> View All Orders
          </button>
        </div>
      </div>
    </aside>
  );
}
