"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentAgentSplitsEditor } from "@/components/orders/PaymentAgentSplitsEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";

type Props = {
  lineTotal: number;
  shippingPrice: number;
  total: number;
  onCancel: () => void;
  showCancel?: boolean;
  onSaveDraft: () => void;
  onSaveOrder: () => void;
  saveOrderLabel?: string;
  saveDraftLabel?: string;
  disableSaveOrder?: boolean;
  disableSaveDraft?: boolean;
  paymentAgents: PaymentAgent[];
  paymentAgentSplits: PaymentAgentOrderSplit[];
  onPaymentAgentSplitsChange: (splits: PaymentAgentOrderSplit[]) => void;
  onViewDetails: () => void;
  onShippingPriceChange: (value: number) => void;
};

const fmtFinal = (value: number) => formatWholeMoney(value);
const METRIC_LABEL_CLASS = "text-[10.5px] uppercase tracking-[0.08em] text-fg-subtle";
const ACTION_BUTTON_CLASS = "h-10 rounded-xl px-4 text-[13px]";

function Metric({
  label,
  value,
  tone = "default",
  zeroDanger = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info" | "danger";
  zeroDanger?: boolean;
}) {
  const isZero = zeroDanger && value.replace(/,/g, "") === "0";

  return (
    <div className="px-2 py-1">
      <div className={METRIC_LABEL_CLASS}>{label}</div>
      <div
        className={cn(
          "pt-0.5 text-[14px] font-semibold tabular-nums",
          isZero
            ? "text-[var(--danger)]"
            : tone === "success"
              ? "text-[var(--success)]"
              : tone === "warning"
                ? "text-amber-600"
                : tone === "info"
                  ? "text-sky-600"
                  : tone === "danger"
                    ? "text-rose-600"
                    : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function OrderFooter({
  lineTotal,
  shippingPrice,
  total,
  onCancel,
  showCancel = true,
  onSaveDraft,
  onSaveOrder,
  saveOrderLabel = "Save Order",
  saveDraftLabel = "Save as Draft",
  disableSaveOrder = false,
  disableSaveDraft = false,
  paymentAgents,
  paymentAgentSplits,
  onPaymentAgentSplitsChange,
  onViewDetails,
  onShippingPriceChange,
}: Props) {
  const [shippingInput, setShippingInput] = useState(shippingPrice ? String(shippingPrice) : "");
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);
  const summary = useMemo(() => {
    const assigned = paymentAgentSplits.reduce((sum, split) => sum + (Number(split.assignedAmount) || 0), 0);
    const paidNow = paymentAgentSplits.reduce((sum, split) => sum + (Number(split.paidNow) || 0), 0);
    const totals = paymentAgentSplits.reduce(
      (acc, split) => {
        const agent =
          paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
          ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
          ?? null;
        const settlement = calculatePaymentAgentSettlement({
          orderTotal: Number(split.assignedAmount) || 0,
          existingCredit: agent?.creditBalance ?? 0,
          paidNow: Number(split.paidNow) || 0,
        });
        acc.agentCredit += agent?.creditBalance ?? 0;
        acc.creditUsed += settlement.creditUsed;
        acc.pendingDue += settlement.remainingPayable;
        acc.creditLeft += settlement.resultingCreditBalance;
        return acc;
      },
      { agentCredit: 0, creditUsed: 0, pendingDue: 0, creditLeft: 0 },
    );

    return {
      agentCredit: totals.agentCredit,
      orderTotal: total,
      creditUsed: totals.creditUsed,
      pendingDue: totals.pendingDue,
      creditLeft: totals.creditLeft,
    };
  }, [paymentAgentSplits, paymentAgents, total]);

  useEffect(() => {
    setShippingInput(shippingPrice ? String(shippingPrice) : "");
  }, [shippingPrice]);

  return (
    <footer className="relative border-t border-border/70 bg-bg-card px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative min-w-0 lg:h-[192px] lg:w-[52%]">
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-2xl border border-border/60 bg-bg-card transition-all duration-300 ease-out",
              isBreakdownExpanded
                ? "z-30 shadow-[0_-24px_80px_rgba(15,23,42,0.12)]"
                : "z-10",
            )}
          >
            <div
              className={cn(
                "overflow-y-auto pr-1 transition-[max-height] duration-300 ease-out",
                isBreakdownExpanded ? "max-h-[44vh] p-3" : "max-h-[192px]",
              )}
            >
              <PaymentAgentSplitsEditor
                splits={paymentAgentSplits}
                paymentAgents={paymentAgents}
                totalAmount={total}
                onChange={onPaymentAgentSplitsChange}
                expanded={isBreakdownExpanded}
                onToggleExpand={() => setIsBreakdownExpanded((current) => !current)}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:w-[48%] lg:pl-4">
          <div className="rounded-2xl border border-border/60 bg-bg-subtle/10 p-3 lg:min-h-[192px]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
            <Metric label="Agent Credit" value={fmtFinal(summary.agentCredit)} tone="info" />
            <Metric label="Order Total" value={fmtFinal(summary.orderTotal)} tone="warning" zeroDanger />
            <Metric label="Credit Used" value={fmtFinal(summary.creditUsed)} tone="info" />
            <Metric label="Payable" value={fmtFinal(summary.pendingDue)} tone="warning" />
            <Metric label="Credit Left" value={fmtFinal(summary.creditLeft)} tone="info" />
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-end gap-2.5 border-t border-border/50 pt-3">
              <label className="mr-auto flex flex-col gap-1">
                <span className={METRIC_LABEL_CLASS}>Shipping</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={shippingInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                      setShippingInput(nextValue);
                      onShippingPriceChange(nextValue === "" ? 0 : Number(nextValue));
                    }
                  }}
                  onBlur={() => setShippingInput(shippingPrice ? String(shippingPrice) : "")}
                  onWheel={(event) => event.currentTarget.blur()}
                  className={cn(
                    "no-spinner h-10 w-[112px] rounded-xl border border-border/60 bg-bg-card px-3 text-[13px] font-semibold tabular-nums outline-none transition-colors focus:border-brand",
                    shippingPrice > 0 ? "text-fg" : "text-rose-600",
                  )}
                  placeholder="0"
                />
              </label>
              {showCancel ? <Button size="sm" variant="secondary" className={ACTION_BUTTON_CLASS} onClick={onCancel}>Cancel</Button> : null}
              <Button size="sm" variant="secondary" className={ACTION_BUTTON_CLASS} onClick={onSaveDraft} disabled={disableSaveDraft}>{saveDraftLabel}</Button>
              <Button size="sm" variant="secondary" className={ACTION_BUTTON_CLASS} onClick={onViewDetails}>View Order Details -&gt;</Button>
              <Button
                size="sm"
                variant="primary"
                className="h-10 rounded-xl px-5 text-[13px] font-semibold"
                onClick={onSaveOrder}
                disabled={disableSaveOrder}
                title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}
              >
                {saveOrderLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
