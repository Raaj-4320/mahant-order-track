"use client";

import { useEffect, useState } from "react";
import { PaymentAgentSplitsEditor } from "@/components/orders/PaymentAgentSplitsEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatWholeMoney } from "@/lib/numbers";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";

type Props = {
  lineTotal: number;
  shippingPrice: number;
  total: number;
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
    <div className="px-1.5 py-0.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div
        className={cn(
          "text-[13px] font-semibold tabular-nums",
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

  useEffect(() => {
    setShippingInput(shippingPrice ? String(shippingPrice) : "");
  }, [shippingPrice]);

  return (
    <footer className="border-t border-border/70 bg-bg-card px-3 py-1">
      <div className="space-y-1.5">
        <PaymentAgentSplitsEditor
          splits={paymentAgentSplits}
          paymentAgents={paymentAgents}
          totalAmount={total}
          onChange={onPaymentAgentSplitsChange}
        />

        <div className="flex flex-wrap items-end justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap items-end gap-1.5">
            <Metric label="Lines" value={fmtFinal(lineTotal)} zeroDanger />
            <div className="px-1.5 py-0.5">
              <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Shipping</div>
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
                  "no-spinner mt-0.5 h-8 w-20 rounded-lg border border-border/60 bg-bg-card px-2 text-[12px] font-medium tabular-nums outline-none transition-colors focus:border-brand",
                  shippingPrice > 0 ? "text-fg" : "text-rose-600",
                )}
                placeholder="0"
              />
            </div>
            <Metric label="Total" value={fmtFinal(total)} tone="warning" zeroDanger />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-l border-border/40 pl-2">
            <Button size="sm" variant="secondary" onClick={onSaveDraft} disabled={disableSaveDraft}>{saveDraftLabel}</Button>
            <Button size="sm" variant="secondary" onClick={onViewDetails}>View Order Details -&gt;</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={onSaveOrder}
              disabled={disableSaveOrder}
              title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}
            >
              {saveOrderLabel}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
