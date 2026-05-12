"use client";

import {
  ArrowUpDown,
  Bell,
  CalendarDays,
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  Moon,
  Plus,
  Search,
  Sun,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Order, orderTotal } from "@/lib/types";
import { formatCNY, formatDate } from "@/lib/data";
import { useTheme } from "@/components/ThemeProvider";

type View = "list" | "grid" | "calendar";

export function OrderToolbar({
  query,
  setQuery,
  view,
  setView,
}: {
  query: string;
  setQuery: (q: string) => void;
  view: View;
  setView: (v: View) => void;
}) {
  const { upsertOrder, pushToast, orders, selectedOrderId, selectOrder } = useStore();
  const { theme, toggle } = useTheme();
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    if (pickerOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const handleAddOrder = () => {
    const num = "25-" + Math.floor(300 + Math.random() * 99);
    const fresh: Order = {
      id: "ord-" + Math.random().toString(36).slice(2, 9),
      orderNumber: num,
      number: num,
      date: new Date().toISOString().slice(0, 10),
      loadingDate: new Date().toISOString().slice(0, 10),
      paymentAgentId: "pa-1",
      paymentBy: "pa-1",
      wechatId: "",
      status: "draft",
      paymentStatus: "pending",
      lines: [],
    };
    upsertOrder(fresh);
    pushToast({ tone: "success", text: `Created draft ${num}` });
  };

  const current = orders.find((o) => o.id === selectedOrderId);

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border bg-bg">
      <div className="min-w-[260px] flex-1 max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders, suppliers, customers..."
          leadingIcon={<Search size={15} strokeWidth={2} />}
        />
      </div>

      <div className="relative" ref={pickerRef}>
        <Button size="sm" onClick={() => setPickerOpen((v) => !v)}>
          <List size={14} />
          <span className="text-fg-muted">Order</span>
          <span className="font-semibold">{current?.number ?? "—"}</span>
          <ChevronDown size={13} />
        </Button>
        {pickerOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card animate-scaleIn max-h-[320px] overflow-y-auto">
            {orders.map((o) => {
              const active = o.id === selectedOrderId;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    selectOrder(o.id);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors",
                    active && "bg-bg-subtle"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.number}</span>
                    <span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[11.5px] text-fg-muted">
                      {o.lines.length} line{o.lines.length === 1 ? "" : "s"}
                    </span>
                    <span className="text-[12px] font-semibold text-[var(--success)] tabular-nums">
                      {formatCNY(orderTotal(o))}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative">
        <Button size="sm" onClick={() => setFilterOpen((v) => !v)}>
          <Filter size={14} />
          Filter
        </Button>
        {filterOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-bg-card p-2 shadow-card animate-scaleIn">
            {["All", "Saved", "Drafts", "This week"].map((f) => (
              <button
                key={f}
                onClick={() => setFilterOpen(false)}
                className="block w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-bg-subtle"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <Button size="sm" onClick={() => setSortOpen((v) => !v)}>
          <ArrowUpDown size={14} />
          Sort
        </Button>
        {sortOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-bg-card p-2 shadow-card animate-scaleIn">
            {["Newest first", "Oldest first", "Amount (high → low)", "Amount (low → high)"].map((f) => (
              <button
                key={f}
                onClick={() => setSortOpen(false)}
                className="block w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-bg-subtle"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-1 flex items-center gap-2">
        <span className="text-[11.5px] text-fg-subtle hidden sm:inline">View:</span>
        <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">
          {(
            [
              { v: "list", I: List },
              { v: "grid", I: LayoutGrid },
              { v: "calendar", I: CalendarDays },
            ] as const
          ).map(({ v, I }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={v}
              className={cn(
                "grid h-6 w-7 place-items-center rounded-md text-fg-muted transition-colors",
                view === v && "bg-brand text-brand-fg"
              )}
            >
              <I size={13} />
            </button>
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={handleAddOrder}>
          <Plus size={14} />
          Add Order
        </Button>
        <button
          aria-label="Notifications"
          className="relative grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"
        >
          <Bell size={14} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
        </button>
        <button
          aria-label="Toggle theme"
          onClick={toggle}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </div>
  );
}
