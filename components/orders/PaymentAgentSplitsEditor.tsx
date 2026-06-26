"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent, PaymentAgentOrderSplit, PaymentAgentPaymentEvent } from "@/lib/types";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

type Props = {
  splits: PaymentAgentOrderSplit[];
  events: PaymentAgentPaymentEvent[];
  paymentAgents: PaymentAgent[];
  totalAmount: number;
  onChange: (events: PaymentAgentPaymentEvent[]) => void;
  onManualAmountEdit?: (eventId: string) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();
const fmt = (value: number) => formatAmount(value);
const EVENT_GRID = "grid grid-cols-[minmax(168px,1.2fr)_84px_minmax(110px,128px)_minmax(118px,138px)_92px] items-center gap-2";
const PILL_CLASS = "rounded-full border border-border/60 bg-bg-card px-3 py-1.5 font-medium text-fg";

const getSplitLabel = (split: PaymentAgentOrderSplit) =>
  split.paymentAgentSnapshot?.name?.trim()
  || split.paymentAgentName?.trim()
  || split.paymentBy?.trim()
  || "";

const getEventLabel = (event: PaymentAgentPaymentEvent) =>
  event.paymentAgentSnapshot?.name?.trim()
  || event.paymentAgentName?.trim()
  || event.paymentBy?.trim()
  || "";

const buildEventFromSplit = (split: PaymentAgentOrderSplit): PaymentAgentPaymentEvent => ({
  id: `pae-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  paymentAgentId: split.paymentAgentId,
  paymentBy: split.paymentBy,
  paymentAgentName: split.paymentAgentName,
  paymentAgentSnapshot: split.paymentAgentSnapshot,
  amount: 0,
});

export function PaymentAgentSplitsEditor({
  splits,
  events,
  paymentAgents,
  totalAmount,
  onChange,
  onManualAmountEdit,
  expanded = false,
  onToggleExpand,
}: Props) {
  const selectedSplits = useMemo(() => splits.filter((split) => Boolean(getSplitLabel(split) || split.paymentAgentId || split.paymentBy)), [splits]);
  const visibleEvents = useMemo(() => events.filter((event) => !(!(event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name || Number(event.amount) || (event.note || "").trim()))), [events]);
  const groupedAgents = useMemo(() => {
    return selectedSplits.map((split, index) => {
      const key = normalizeValue(split.paymentAgentId || split.paymentBy || getSplitLabel(split));
      const agent =
        paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
        ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
        ?? paymentAgents.find((candidate) => normalizeValue(candidate.name) === normalizeValue(getSplitLabel(split)))
        ?? null;
      const label = getSplitLabel(split) || "Select payment agent above";
      const agentEvents = visibleEvents.filter((event) => normalizeValue(event.paymentAgentId || event.paymentBy || getEventLabel(event)) === key);
      return { split, key, agent, label, index, agentEvents };
    });
  }, [selectedSplits, visibleEvents, paymentAgents]);
  const totalAssigned = useMemo(
    () => visibleEvents.reduce((sum, event) => sum + (Number(event.amount) || 0), 0),
    [visibleEvents],
  );
  const amountLeft = Number((Math.max(0, totalAmount - totalAssigned)).toFixed(2));

  const updateEvent = (eventId: string, updater: (event: PaymentAgentPaymentEvent) => PaymentAgentPaymentEvent) => {
    onChange(events.map((event) => (event.id === eventId ? updater(event) : event)));
  };
  const addEventForSplit = (split: PaymentAgentOrderSplit) => {
    onChange([...events, buildEventFromSplit(split)]);
  };
  const removeEvent = (eventId: string) => {
    const next = events.filter((event) => event.id !== eventId);
    onChange(next.length > 0 ? next : []);
  };

  return (
    <div className={cn("rounded-xl border border-border/60 bg-bg-card px-2 py-1.5", expanded && "px-2.5 py-2")}>
      <div className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Payment Agent Breakdown</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className={PILL_CLASS}>Total: {fmt(totalAmount)}</span>
            <span className={PILL_CLASS}>Paid: {fmt(totalAssigned)}</span>
            <span className={cn("rounded-full border px-2.5 py-1 font-medium", amountLeft === 0 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700")}>
              Order Due: {fmt(amountLeft)}
            </span>
          </div>
        </div>
      </div>

      {groupedAgents.length === 0 ? <div className="py-1.5 text-[11px] text-fg-subtle">No payment agent selected</div> : null}

      <div className={cn("mt-1", expanded && "mt-1.5")}>
        <div className="overflow-x-auto">
          {groupedAgents.length > 0 ? (
            <div className={`${EVENT_GRID} min-w-[640px] border-b border-border/60 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle`}>
              <span>Agent</span>
              <span>Event</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Credit Left</span>
              <span className="text-right">Action</span>
            </div>
          ) : null}
          <div className="min-w-[640px]">
          {groupedAgents.map(({ split, agent, label, index, agentEvents }) => {
            const existingCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
            const agentTotal = agentEvents.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
            const remainingCredit = Math.max(0, existingCredit - Math.min(existingCredit, agentTotal));

            return (
              <div key={split.id} className="border-b border-border/40 last:border-b-0">
                  {agentEvents.length === 0 ? (
                    <div className={`${EVENT_GRID} px-2 py-1.5 text-[13px]`}>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-fg">{label}</div>
                        <div className="text-[11px] text-fg-subtle">{index === 0 ? "Primary" : `Agent ${index + 1}`}</div>
                      </div>
                      <div className="text-fg-subtle">-</div>
                      <div className="text-right tabular-nums text-fg-subtle">0</div>
                      <div className="text-right font-semibold tabular-nums text-sky-700">{fmt(existingCredit)}</div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-bg-card px-2.5 text-[11px] font-medium text-fg transition-colors hover:bg-bg-subtle"
                          onClick={() => addEventForSplit(split)}
                        >
                          <Plus size={11} />
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {agentEvents.map((event, eventIndex) => {
                    const currentAmount = Number(event.amount) || 0;
                    const usedAfterRow = Math.min(
                      existingCredit,
                      agentEvents
                        .slice(0, eventIndex + 1)
                        .reduce((sum, currentEvent) => sum + (Number(currentEvent.amount) || 0), 0),
                    );
                    const projectedCreditLeft = Math.max(0, existingCredit - usedAfterRow);
                    return (
                      <div key={event.id} className={`${EVENT_GRID} px-2 py-1.5 text-[13px]`}>
                        <div className="min-w-0 pr-1">
                          <div className="truncate font-semibold text-fg">{label}</div>
                          <div className="text-[11px] text-fg-subtle">Group Total {fmt(agentTotal)}</div>
                        </div>
                        <div className="text-fg-subtle">#{eventIndex + 1}</div>
                        <label className="block min-w-0">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={currentAmount ? String(currentAmount) : ""}
                            onChange={(changeEvent) => {
                              const nextValue = changeEvent.target.value;
                              if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                                onManualAmountEdit?.(event.id);
                                updateEvent(event.id, (current) => ({
                                  ...current,
                                  amount: nextValue === "" ? 0 : Number(nextValue),
                                }));
                              }
                            }}
                            placeholder="0"
                            className={cn("h-8 w-full min-w-0 rounded-md border-border/55 bg-bg-card px-2.5 text-right text-[13px] shadow-none", expanded && "text-[13px]")}
                          />
                        </label>
                        <div className="text-right font-semibold tabular-nums text-sky-700">{fmt(projectedCreditLeft)}</div>
                        <div className="flex justify-end">
                          <div className="flex items-center justify-end gap-1">
                            {eventIndex === agentEvents.length - 1 ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-bg-card px-2.5 text-[11px] font-medium text-fg transition-colors hover:bg-bg-subtle"
                                onClick={() => addEventForSplit(split)}
                              >
                                <Plus size={11} />
                                Add
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-bg-card text-rose-600 transition-colors hover:bg-rose-50"
                              onClick={() => removeEvent(event.id)}
                              aria-label={`Delete payment row ${eventIndex + 1}`}
                              title="Delete payment row"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {agentEvents.length > 0 ? (
                    <div className="px-2 pb-1 text-right text-[11px] text-fg-subtle">
                      <span>Credit Left After Agent Total: {fmt(remainingCredit)}</span>
                    </div>
                  ) : null}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
