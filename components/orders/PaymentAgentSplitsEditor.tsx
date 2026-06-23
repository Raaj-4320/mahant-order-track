"use client";

import { ChevronUp } from "lucide-react";
import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

type Props = {
  splits: PaymentAgentOrderSplit[];
  paymentAgents: PaymentAgent[];
  totalAmount: number;
  onChange: (splits: PaymentAgentOrderSplit[]) => void;
  onManualAmountEdit?: (splitId: string) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();
const fmt = (value: number) => formatAmount(value);
const SPLIT_GRID = "grid grid-cols-[minmax(220px,1.4fr)_minmax(110px,132px)_minmax(120px,140px)] items-center gap-3";
const PILL_CLASS = "rounded-full border border-border/60 bg-bg-card px-3 py-1.5 font-medium text-fg";
const VALUE_BOX_CLASS = "rounded-xl px-3 py-2 text-right text-[12px] font-semibold";

const getSplitLabel = (split: PaymentAgentOrderSplit) =>
  split.paymentAgentSnapshot?.name?.trim()
  || split.paymentAgentName?.trim()
  || split.paymentBy?.trim()
  || "";

export function PaymentAgentSplitsEditor({
  splits,
  paymentAgents,
  totalAmount,
  onChange,
  onManualAmountEdit,
  expanded = false,
  onToggleExpand,
}: Props) {
  const visibleSplits = useMemo(() => {
    const hasMeaningfulSplit = (split: PaymentAgentOrderSplit) =>
      Boolean(getSplitLabel(split) || (Number(split.assignedAmount) || 0) > 0 || (Number(split.paidNow) || 0) > 0);
    if (!splits.some(hasMeaningfulSplit)) {
      return splits.slice(0, 1);
    }
    return splits.filter(hasMeaningfulSplit);
  }, [splits]);

  const totalAssigned = useMemo(
    () => splits.reduce((sum, split) => sum + (Number(split.paidNow) || 0), 0),
    [splits],
  );

  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let duplicates = 0;
    for (const split of splits) {
      const key = split.paymentAgentId || normalizeValue(getSplitLabel(split));
      if (!key) continue;
      if (seen.has(key)) duplicates += 1;
      seen.add(key);
    }
    return duplicates;
  }, [splits]);

  const amountLeft = Number((Math.max(0, totalAmount - totalAssigned)).toFixed(2));

  const updateSplit = (splitId: string, updater: (split: PaymentAgentOrderSplit) => PaymentAgentOrderSplit) => {
    onChange(splits.map((split) => (split.id === splitId ? updater(split) : split)));
  };

  return (
    <div className={cn("rounded-xl bg-bg-subtle/10 px-2.5 py-2", expanded && "bg-bg-card px-3 py-2.5")}>
      <button
        type="button"
        onClick={onToggleExpand}
        className={cn(
          "mb-1.5 flex w-full items-center justify-between gap-3 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-bg-subtle/30",
          !onToggleExpand && "pointer-events-none",
        )}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Payment Agent Breakdown</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="block h-1 w-10 rounded-full bg-border/80" />
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-bg-card text-fg shadow-sm">
            <ChevronUp size={16} className={cn("transition-transform duration-300", !expanded && "rotate-180")} />
          </span>
        </div>
      </button>

      {duplicateCount > 0 ? <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-600">Duplicate payment agents must be removed before saving.</div> : null}

      {visibleSplits.length === 0 ? (
        <div className="py-2 text-[11px] text-fg-subtle">No payment agent selected</div>
      ) : null}

      <div className={cn("mt-1 space-y-2", expanded && "space-y-2.5")}>
        {visibleSplits.length > 0 ? (
          <div className="space-y-2 px-2 py-0.5">
            <div className={`${SPLIT_GRID} text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle`}>
              <span>Agent Name</span>
              <span className="text-center">Paid Amount</span>
              <span className="text-right">Credit Left</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
              <span className={PILL_CLASS}>Total: {fmt(totalAmount)}</span>
              <span className={PILL_CLASS}>Paid: {fmt(totalAssigned)}</span>
              <span className={cn("rounded-full border px-3 py-1.5 font-medium", amountLeft === 0 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700")}>
                Order Due: {fmt(amountLeft)}
              </span>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-hidden">
          {visibleSplits.map((split, index) => {
            const agent =
              paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
              ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
              ?? paymentAgents.find((candidate) => normalizeValue(candidate.name) === normalizeValue(getSplitLabel(split)))
              ?? null;
            const label = getSplitLabel(split) || "Select payment agent above";
            const existingCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
            const paidAmount = Number(split.paidNow) || 0;
            const remainingCredit = Math.max(0, existingCredit - paidAmount);

            return (
              <div key={split.id} className={cn(`${SPLIT_GRID} rounded-xl border border-border/60 bg-bg-card px-3 py-2`, expanded && "px-4 py-2.5")}>
                <div className="min-w-0 pr-1">
                  <div className={cn("truncate text-[13px] font-semibold text-fg", expanded && "text-[14px]")}>{label}</div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">{index === 0 ? "Primary payment agent" : `Payment agent ${index + 1}`}</div>
                </div>

                <label className="block min-w-0">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={split.paidNow ? String(split.paidNow) : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                        onManualAmountEdit?.(split.id);
                        updateSplit(split.id, (current) => ({
                          ...current,
                          assignedAmount: nextValue === "" ? 0 : Number(nextValue),
                          paidNow: nextValue === "" ? 0 : Number(nextValue),
                        }));
                      }
                    }}
                    placeholder="0"
                    className={cn("h-9 w-full min-w-0 rounded-xl border-border/55 bg-bg-card px-3 text-[12px] shadow-none", expanded && "h-10 text-[13px]")}
                  />
                </label>

                <div className={cn(VALUE_BOX_CLASS, "min-w-0 border border-sky-500/20 bg-sky-500/10 text-sky-700", expanded && "py-2.5 text-[13px]")}>{fmt(remainingCredit)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
