"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentAgentSplitsEditor } from "@/components/orders/PaymentAgentSplitsEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";
import type { PaymentAgent, PaymentAgentOrderSplit, PaymentAgentPaymentEvent } from "@/lib/types";

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
  paymentAgentEvents: PaymentAgentPaymentEvent[];
  onPaymentAgentEventsChange: (events: PaymentAgentPaymentEvent[]) => void;
  onPaymentAgentEventManualAmountEdit?: (eventId: string) => void;
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
  paymentAgentEvents,
  onPaymentAgentEventsChange,
  onPaymentAgentEventManualAmountEdit,
  onViewDetails,
  onShippingPriceChange,
}: Props) {
  const [shippingInput, setShippingInput] = useState(shippingPrice ? String(shippingPrice) : "");
  const splitSummaries = useMemo(() => {
    return paymentAgentSplits
      .map((split, index) => {
        const agent =
          paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
          ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
          ?? null;
        const agentEvents = paymentAgentEvents.filter((event) =>
          (event.paymentAgentId || event.paymentBy || event.paymentAgentName) &&
          (event.paymentAgentId === split.paymentAgentId
            || event.paymentBy === split.paymentBy
            || event.paymentAgentName === split.paymentAgentName),
        );
        const paidNow = agentEvents.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
        const existingCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
        const creditUsed = Math.min(paidNow, existingCredit);
        const payable = Math.max(0, paidNow - creditUsed);
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
          creditUsed,
          payable,
          creditLeft: Math.max(0, existingCredit - creditUsed),
        };
      })
      .filter((entry) => entry.label || entry.paidNow > 0 || entry.creditUsed > 0 || entry.creditLeft > 0);
  }, [paymentAgentSplits, paymentAgentEvents, paymentAgents, total]);
  const summary = useMemo(() => {
    const totals = paymentAgentSplits.reduce(
      (acc, split) => {
        const agent =
          paymentAgents.find((candidate) => candidate.id === split.paymentAgentId)
          ?? paymentAgents.find((candidate) => candidate.id === split.paymentBy)
          ?? null;
        const availableCredit = agent ? getPaymentAgentDirectFinance(agent).creditLeft : 0;
        const enteredAmount = paymentAgentEvents
          .filter((event) => event.paymentAgentId === split.paymentAgentId || event.paymentBy === split.paymentBy || event.paymentAgentName === split.paymentAgentName)
          .reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
        const usedAmount = Math.min(enteredAmount, availableCredit);
        const payableAmount = Math.max(0, enteredAmount - usedAmount);
        acc.agentCredit += availableCredit;
        acc.creditUsed += usedAmount;
        acc.payable += payableAmount;
        acc.creditLeft += Math.max(0, availableCredit - usedAmount);
        return acc;
      },
      { agentCredit: 0, creditUsed: 0, payable: 0, creditLeft: 0 },
    );

    return {
      agentCredit: totals.agentCredit,
      orderTotal: total,
      creditUsed: totals.creditUsed,
      pendingDue: totals.payable,
      creditLeft: totals.creditLeft,
    };
  }, [paymentAgentSplits, paymentAgentEvents, paymentAgents, total]);

  useEffect(() => {
    setShippingInput(shippingPrice ? String(shippingPrice) : "");
  }, [shippingPrice]);

  return (
    <footer className="relative border-t border-border/70 bg-bg-card px-4 py-3">
      <div className="rounded-2xl border border-border/60 bg-bg-card p-3">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.92fr] xl:items-start">
          <div className="min-w-0 overflow-x-hidden">
            <PaymentAgentSplitsEditor
              splits={paymentAgentSplits}
              events={paymentAgentEvents}
              paymentAgents={paymentAgents}
              totalAmount={total}
              onChange={onPaymentAgentEventsChange}
              onManualAmountEdit={onPaymentAgentEventManualAmountEdit}
              expanded
            />
          </div>

          <div className="min-w-0 rounded-xl border border-border/60 bg-bg-subtle/10 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Settlement Summary</div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[520px] grid-cols-[minmax(144px,1.2fr)_repeat(4,minmax(72px,1fr))] items-center gap-2 border-b border-border/60 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
                <span>Agent</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Used</span>
                <span className="text-right">Payable</span>
                <span className="text-right">Left</span>
              </div>
              <div className="min-w-[520px]">
                {splitSummaries.length > 0 ? splitSummaries.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[minmax(144px,1.2fr)_repeat(4,minmax(72px,1fr))] items-center gap-2 border-b border-border/40 py-1.5 text-[13px] last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-fg">{entry.label}</div>
                      <div className="text-[11px] text-fg-subtle">Paid: {fmtFinal(entry.paidNow)}</div>
                    </div>
                    <div className="text-right font-semibold tabular-nums text-sky-600">{fmtFinal(entry.existingCredit)}</div>
                    <div className="text-right font-semibold tabular-nums text-sky-600">{fmtFinal(entry.creditUsed)}</div>
                    <div className="text-right font-semibold tabular-nums text-amber-600">{fmtFinal(entry.payable)}</div>
                    <div className="text-right font-semibold tabular-nums text-[var(--success)]">{fmtFinal(entry.creditLeft)}</div>
                  </div>
                )) : <div className="py-3 text-[12px] text-fg-subtle">No payment allocations yet.</div>}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
              <Metric label="Agent Credit" value={fmtFinal(summary.agentCredit)} tone="info" />
              <Metric label="Order Total" value={fmtFinal(summary.orderTotal)} tone="warning" zeroDanger />
              <Metric label="Credit Used" value={fmtFinal(summary.creditUsed)} tone="info" />
              <Metric label="Payable" value={fmtFinal(summary.pendingDue)} tone="warning" />
              <Metric label="Credit Left" value={fmtFinal(summary.creditLeft)} tone="info" />
            </div>
          </div>
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
    </footer>
  );
}
