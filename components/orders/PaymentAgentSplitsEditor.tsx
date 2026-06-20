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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 border-b border-border/50 pb-2 text-[12px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Distribution</span>
        <span className="font-medium text-fg">Total: {fmt(totalAmount)}</span>
        <span className={cn("font-medium", amountLeft === 0 ? "text-emerald-700" : "text-amber-700")}>
          Left: {fmt(amountLeft)}
        </span>
        {duplicateCount > 0 ? <span className="text-[11px] text-rose-600">Duplicate payment agents must be removed before saving.</span> : null}
      </div>

      <div className="space-y-1.5">
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
            <div key={split.id} className="grid grid-cols-1 gap-2 border-b border-border/35 py-1.5 last:border-b-0 md:grid-cols-[minmax(170px,1.2fr)_120px_120px_100px_100px] md:items-center md:gap-3">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-fg">{label}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-fg-subtle">
                  <span>{index === 0 ? "Primary" : `Agent ${index + 1}`}</span>
                  <span>Credit used: {fmt(settlement.creditUsed)}</span>
                </div>
              </div>

                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-fg-subtle">Assigned</span>
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
                    className="h-8 rounded-lg border-border/60 bg-bg-card text-[12px] shadow-none"
                  />
                </label>

                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-fg-subtle">Paid now</span>
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
                    className="h-8 rounded-lg border-border/60 bg-bg-card text-[12px] shadow-none"
                  />
                </label>

                <div className="flex flex-col gap-0.5 text-[10px] text-fg-subtle md:items-end">
                  <span>Pending/Due</span>
                  <span className="text-[12px] font-medium text-fg">{fmt(settlement.remainingPayable)}</span>
                </div>

                <div className="flex flex-col gap-0.5 text-[10px] text-fg-subtle md:items-end">
                  <span>Credit left</span>
                  <span className="text-[12px] font-medium text-fg">{fmt(settlement.resultingCreditBalance)}</span>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
