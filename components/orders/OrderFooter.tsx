"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentAgentSplitsEditor } from "@/components/orders/PaymentAgentSplitsEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
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
  const settlementSummary = useMemo(() => {
    const paid = paymentAgentEvents.reduce((sum, event) => {
      const amount = Number(event.amount);
      return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
    }, 0);

    const paymentAgentsCount = new Set(
      paymentAgentSplits
        .map((split) => split.paymentAgentId || split.paymentBy || split.paymentAgentName)
        .filter(Boolean),
    ).size;

    return {
      orderTotal: total,
      paid,
      orderDue: Math.max(0, total - paid),
      shipping: Math.max(0, Number(shippingPrice) || 0),
      grandTotal: total,
      paymentAgentsCount,
    };
  }, [paymentAgentEvents, paymentAgentSplits, shippingPrice, total]);

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
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
              <Metric label="Order Total" value={fmtFinal(settlementSummary.orderTotal)} tone="warning" zeroDanger />
              <Metric label="Paid" value={fmtFinal(settlementSummary.paid)} tone="info" />
              <Metric label="Order Due" value={fmtFinal(settlementSummary.orderDue)} tone="warning" />
              <Metric label="Shipping" value={fmtFinal(settlementSummary.shipping)} tone="info" />
              <Metric label="Grand Total" value={fmtFinal(settlementSummary.grandTotal)} tone="warning" zeroDanger />
              <Metric label="Agents" value={String(settlementSummary.paymentAgentsCount)} tone="default" />
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
