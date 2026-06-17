"use client";

import { List } from "lucide-react";
import { formatDate } from "@/lib/data";
import { useStore } from "@/lib/store";
import { orderTotal } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
import type { Order, OrderLine } from "@/lib/types";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";

export function OrdersSidebar() {
  const { orders, selectedOrderId, selectOrder } = useStore();

  const summarize = (namesInput: string[]) => {
    const names = Array.from(new Set(namesInput.map((value) => value.trim()).filter(Boolean)));
    if (names.length === 0) return "—";
    if (names.length === 1) return names[0];
    return `${names[0]} & ${names.length - 1} more`;
  };

  const resolveCustomerName = (line: OrderLine) => getLineCustomerDisplay(line);
  const resolveSupplierName = (line: OrderLine) =>
    line.supplierSnapshot?.name?.trim() || line.supplierName?.trim() || (line.supplierId?.trim() ? "Invalid Supplier Reference" : "Not Linked");
  const getOrderCustomerNames = (order: Order) => summarize(order.lines.map(resolveCustomerName));
  const getOrderSupplierNames = (order: Order) => summarize(order.lines.map(resolveSupplierName));
  const getOrderPaymentAgentName = (order: Order) => getOrderPaymentAgentDisplay(order).value;

  return (
    <aside className="w-[260px] shrink-0 border-l border-border bg-bg-subtle">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[13.5px] font-semibold">Orders ({orders.length})</h3>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
          {orders.map((order) => {
            const active = order.id === selectedOrderId;
            const supplierNames = getOrderSupplierNames(order);
            const customerNames = getOrderCustomerNames(order);
            const paymentAgentName = getOrderPaymentAgentName(order);
            const total = orderTotal(order);
            return (
              <button
                key={order.id}
                onClick={() => selectOrder(order.id)}
                className={cn(
                  "w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-left transition-all",
                  "hover:border-fg-subtle hover:shadow-soft",
                  active && "border-fg ring-1 ring-fg/10 shadow-card",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{order.number}</span>
                  <span className="text-[10.5px] text-fg-subtle">{formatDate(order.date)}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-fg-muted">{supplierNames}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] text-fg-muted">{customerNames}</span>
                  <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-[var(--success)]">
                    {formatWholeMoney(total)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-fg-subtle">{paymentAgentName}</div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border p-2">
          <button className="btn btn-secondary w-full rounded-lg px-3 py-1.5 text-[12.5px]">
            <List size={14} /> View All Orders
          </button>
        </div>
      </div>
    </aside>
  );
}
