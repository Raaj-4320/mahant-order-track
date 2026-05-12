"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderToolbar } from "@/components/orders/OrderToolbar";
import { OrderForm } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { suppliers, customers, formatCNY, formatDate } from "@/lib/data";
import { Order, orderTotal } from "@/lib/types";
import { cn } from "@/lib/cn";

type View = "list" | "grid" | "calendar";

export default function OrdersPage() {
  const { orders, selectedOrderId, selectOrder, upsertOrder, pushToast } = useStore();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("list");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter((o) => {
      const supNames = o.lines
        .map((l) => suppliers.find((s) => s.id === l.supplierId)?.name ?? "")
        .join(" ");
      const cusNames = o.lines
        .map((l) => customers.find((c) => c.id === l.customerId)?.name ?? "")
        .join(" ");
      return (
        o.number.toLowerCase().includes(q) ||
        supNames.toLowerCase().includes(q) ||
        cusNames.toLowerCase().includes(q)
      );
    });
  }, [orders, query]);

  const current = orders.find((o) => o.id === selectedOrderId) ?? orders[0];

  const [draft, setDraft] = useState<Order | null>(current ?? null);
  useEffect(() => {
    if (current) setDraft(current);
  }, [current?.id]);

  const total = useMemo(() => (draft ? orderTotal(draft) : 0), [draft]);

  const onSave = (status: Order["status"]) => {
    if (!draft) return;
    upsertOrder({ ...draft, status });
    pushToast({
      tone: "success",
      text:
        status === "draft"
          ? `Draft ${draft.number} saved`
          : `Order ${draft.number} saved · ${formatCNY(total)}`,
    });
  };

  const onCancel = () => {
    if (!current) return;
    setDraft(current);
    pushToast({ tone: "info", text: "Changes reverted" });
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <OrderToolbar
        query={query}
        setQuery={setQuery}
        view={view}
        setView={setView}
      />

      <main className="min-h-0 flex-1 overflow-y-auto animate-fadeSlide">
        {view === "list" && draft && (
          <div key={draft.id} className="animate-fadeSlide">
            <OrderForm draft={draft} setDraft={(u) => setDraft((d) => (d ? u(d) : d))} />
          </div>
        )}

        {view === "grid" && (
          <GridView orders={filtered} onSelect={selectOrder} selectedId={current?.id} />
        )}

        {view === "calendar" && <CalendarView orders={filtered} />}
      </main>

      {view === "list" && draft && (
        <OrderFooter
          total={total}
          onCancel={onCancel}
          onSaveDraft={() => onSave("draft")}
          onSaveOrder={() => onSave("saved")}
        />
      )}
    </div>
  );
}

function GridView({
  orders,
  onSelect,
  selectedId,
}: {
  orders: Order[];
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3 animate-fadeSlide">
      {orders.map((o) => {
        const total = orderTotal(o);
        const supplierNames = Array.from(
          new Set(o.lines.map((l) => suppliers.find((s) => s.id === l.supplierId)?.name).filter(Boolean))
        ).join(", ");
        return (
          <button
            key={o.id}
            onClick={() => onSelect(o.id)}
            className={cn(
              "card text-left p-5 transition-all hover:border-fg-subtle hover:shadow-card",
              selectedId === o.id && "ring-1 ring-fg/10 border-fg"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">{o.number}</span>
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-[11px] uppercase tracking-wide text-fg-muted">
                {o.status}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-fg-subtle">{formatDate(o.date)}</div>
            <div className="mt-3 text-[13px] text-fg-muted line-clamp-1">{supplierNames || "—"}</div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-[11.5px] text-fg-subtle">{o.lines.length} line{o.lines.length === 1 ? "" : "s"}</span>
              <span className="text-[18px] font-semibold text-[var(--success)] tabular-nums">
                {formatCNY(total)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CalendarView({ orders }: { orders: Order[] }) {
  const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
    (acc[o.date] = acc[o.date] || []).push(o);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));
  return (
    <div className="p-6 animate-fadeSlide">
      <div className="space-y-4">
        {dates.map((d) => (
          <div key={d} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold">{formatDate(d)}</h4>
              <span className="text-[12px] text-fg-subtle">
                {grouped[d].length} order{grouped[d].length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[d].map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-[12.5px] flex items-center justify-between"
                >
                  <span className="font-medium">{o.number}</span>
                  <span className="font-semibold text-[var(--success)] tabular-nums">
                    {formatCNY(orderTotal(o))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {dates.length === 0 && (
          <div className="card p-10 text-center text-fg-subtle">No orders to show.</div>
        )}
      </div>
    </div>
  );
}
