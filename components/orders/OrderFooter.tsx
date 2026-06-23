"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentAgentSplitsEditor } from "@/components/orders/PaymentAgentSplitsEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";
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
  onPaymentAgentSplitManualAmountEdit?: (splitId: string) => void;
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
  onPaymentAgentSplitManualAmountEdit,
  onViewDetails,
  onShippingPriceChange,
}: Props) {
  const [shippingInput, setShippingInput] = useState(shippingPrice ? String(shippingPrice) : "");
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const splitSummaries = useMemo(() => {
    return paymentAgentSplits
      .map((split, index) => {
        const agent =
          paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
          ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
          ?? null;
        const paidNow = Number(split.paidNow) || 0;
        const existingCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
        const label =
          split.paymentAgentSnapshot?.name?.trim()
          || split.paymentAgentName?.trim()
          || split.paymentBy?.trim()
          || (index === 0 ? "Primary payment agent" : `Payment agent ${index + 1}`);

        return {
          id: split.id,
          label,
          paidNow,
          existingCredit,
          creditUsed: paidNow,
          payable: Math.max(0, total - paidNow),
          creditLeft: Math.max(0, existingCredit - paidNow),
        };
      })
      .filter((entry) => entry.label || entry.paidNow > 0 || entry.creditUsed > 0 || entry.creditLeft > 0);
  }, [paymentAgentSplits, paymentAgents, total]);
  const summary = useMemo(() => {
    const paidNow = paymentAgentSplits.reduce((sum, split) => sum + (Number(split.paidNow) || 0), 0);
    const totals = paymentAgentSplits.reduce(
      (acc, split) => {
        const agent =
          paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
          ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
          ?? null;
        const availableCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
        const usedAmount = Number(split.paidNow) || 0;
        acc.agentCredit += availableCredit;
        acc.creditUsed += usedAmount;
        acc.creditLeft += Math.max(0, availableCredit - usedAmount);
        return acc;
      },
      { agentCredit: 0, creditUsed: 0, creditLeft: 0 },
    );

    return {
      agentCredit: totals.agentCredit,
      orderTotal: total,
      creditUsed: totals.creditUsed,
      pendingDue: Math.max(0, total - paidNow),
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
                onManualAmountEdit={onPaymentAgentSplitManualAmountEdit}
                expanded={isBreakdownExpanded}
                onToggleExpand={() => setIsBreakdownExpanded((current) => !current)}
              />
            </div>
          </div>
        </div>

        <div className="relative min-w-0 lg:h-[192px] lg:w-[48%] lg:pl-4">
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-2xl border border-border/60 bg-bg-card transition-all duration-300 ease-out lg:left-4",
              isSummaryExpanded ? "z-30 shadow-[0_-24px_80px_rgba(15,23,42,0.12)]" : "z-10",
            )}
          >
            <div className={cn("transition-[max-height] duration-300 ease-out", isSummaryExpanded ? "max-h-[44vh] overflow-y-auto p-3" : "max-h-[192px] overflow-hidden p-3")}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Settlement Summary</div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-bg-card text-fg shadow-sm transition-colors hover:bg-bg-subtle"
                  onClick={() => setIsSummaryExpanded((current) => !current)}
                  aria-label={isSummaryExpanded ? "Collapse settlement summary" : "Expand settlement summary"}
                  title={isSummaryExpanded ? "Collapse settlement summary" : "Expand settlement summary"}
                >
                  <span className={cn("block h-2 w-2 rotate-45 border-b-2 border-r-2 border-current transition-transform duration-300", isSummaryExpanded ? "translate-y-0 rotate-[225deg]" : "translate-y-[-1px] rotate-45")} />
                </button>
              </div>

              {isSummaryExpanded ? (
                <div className="mb-3 rounded-xl border border-border/60 bg-bg-subtle/10 p-3">
                  <div className="grid grid-cols-[minmax(160px,1.2fr)_repeat(4,minmax(88px,1fr))] items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    <span>Agent</span>
                    <span className="text-right">Credit</span>
                    <span className="text-right">Used</span>
                    <span className="text-right">Payable</span>
                    <span className="text-right">Left</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {splitSummaries.length > 0 ? splitSummaries.map((entry) => (
                        <div key={entry.id} className="grid grid-cols-[minmax(160px,1.2fr)_repeat(4,minmax(88px,1fr))] items-center gap-3 rounded-xl border border-border/60 bg-bg-card px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-fg">{entry.label}</div>
                          <div className="mt-0.5 text-[11px] text-fg-subtle">Paid: {fmtFinal(entry.paidNow)}</div>
                        </div>
                        <div className="text-right text-[12px] font-semibold tabular-nums text-sky-600">{fmtFinal(entry.existingCredit)}</div>
                        <div className="text-right text-[12px] font-semibold tabular-nums text-sky-600">{fmtFinal(entry.creditUsed)}</div>
                        <div className="text-right text-[12px] font-semibold tabular-nums text-amber-600">{fmtFinal(entry.payable)}</div>
                        <div className="text-right text-[12px] font-semibold tabular-nums text-[var(--success)]">{fmtFinal(entry.creditLeft)}</div>
                      </div>
                    )) : <div className="rounded-xl border border-border/60 bg-bg-card px-3 py-3 text-[12px] text-fg-subtle">No payment allocations yet.</div>}
                  </div>
                </div>
              ) : null}

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
      </div>
    </footer>
  );
}
