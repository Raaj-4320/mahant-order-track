"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";

type Props = {
  splits: PaymentAgentOrderSplit[];
  paymentAgents: PaymentAgent[];
  totalAmount: number;
  onChange: (splits: PaymentAgentOrderSplit[]) => void;
};

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();
const fmt = (value: number) => formatAmount(value);

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
    () => splits.reduce((sum, split) => sum + (Number(split.assignedAmount) || 0), 0),
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

  const amountLeft = Number((totalAmount - totalAssigned).toFixed(2));

  const updateSplit = (splitId: string, updater: (split: PaymentAgentOrderSplit) => PaymentAgentOrderSplit) => {
    onChange(splits.map((split) => (split.id === splitId ? updater(split) : split)));
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/45 pb-1 text-[11.5px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Distribution</span>
        <span className="font-medium text-fg">Total: {fmt(totalAmount)}</span>
        <span className="font-medium text-fg">Assigned: {fmt(totalAssigned)}</span>
        <span className={cn("font-medium", amountLeft === 0 ? "text-emerald-700" : "text-amber-700")}>
          Left: {fmt(amountLeft)}
        </span>
        {duplicateCount > 0 ? <span className="text-[11px] text-rose-600">Duplicate payment agents must be removed before saving.</span> : null}
      </div>

      {visibleSplits.length === 0 ? (
        <div className="py-1 text-[11px] text-fg-subtle">No payment agent selected</div>
      ) : null}

      <div className="space-y-0.5">
        {visibleSplits.length > 0 ? (
          <div className="grid grid-cols-[minmax(160px,1.35fr)_90px_90px_92px_92px] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            <span>Agent Name</span>
            <span>Assigned</span>
            <span>Paid Now</span>
            <span className="text-right">Pending Due</span>
            <span className="text-right">Credit Left</span>
          </div>
        ) : null}
        {visibleSplits.map((split, index) => {
          const agent =
            paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
            ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
            ?? paymentAgents.find((candidate) => normalizeValue(candidate.name) === normalizeValue(getSplitLabel(split)))
            ?? null;
          const settlement = calculatePaymentAgentSettlement({
            orderTotal: Number(split.assignedAmount) || 0,
            existingCredit: agent?.creditBalance ?? 0,
            paidNow: Number(split.paidNow) || 0,
          });
          const label = getSplitLabel(split) || "Select payment agent above";

          return (
            <div key={split.id} className="grid grid-cols-[minmax(160px,1.35fr)_90px_90px_92px_92px] items-center gap-2 border-b border-border/25 py-1 last:border-b-0">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-fg">{label}</div>
                <div className="truncate text-[10px] text-fg-subtle">{index === 0 ? "Primary" : `Agent ${index + 1}`}</div>
              </div>

              <label className="block">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={split.assignedAmount ? String(split.assignedAmount) : ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                      updateSplit(split.id, (current) => ({
                        ...current,
                        assignedAmount: nextValue === "" ? 0 : Number(nextValue),
                      }));
                    }
                  }}
                  placeholder="0"
                  className="h-8 rounded-lg border-border/55 bg-bg-card px-2 text-[12px] shadow-none"
                />
              </label>

              <label className="block">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={split.paidNow ? String(split.paidNow) : ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                      updateSplit(split.id, (current) => ({
                        ...current,
                        paidNow: nextValue === "" ? 0 : Number(nextValue),
                      }));
                    }
                  }}
                  placeholder="0"
                  className="h-8 rounded-lg border-border/55 bg-bg-card px-2 text-[12px] shadow-none"
                />
              </label>

              <div className="text-right text-[12px] font-medium text-fg">{fmt(settlement.remainingPayable)}</div>

              <div className="text-right text-[12px] font-medium text-fg">{fmt(settlement.resultingCreditBalance)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
