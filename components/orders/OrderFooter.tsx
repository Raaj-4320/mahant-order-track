"use client";

import { Button } from "@/components/ui/Button";
import type { PaymentAgent } from "@/lib/types";
import type { PaymentAgentSettlementResult } from "@/services/settlement/paymentAgentSettlement";
import { PaymentAgentSettlementSummary } from "./PaymentAgentSettlementSummary";

type Props = {
  total: number;
  onCancel: () => void;
  onSaveDraft: () => void;
  onSaveOrder: () => void;
  saveOrderLabel?: string;
  disableSaveOrder?: boolean;
  paymentAgent: PaymentAgent | null;
  settlement: PaymentAgentSettlementResult;
  paidNow: number;
  onPaidNowChange: (value: number) => void;
  onViewDetails: () => void;
};

export function OrderFooter({ total, onCancel, onSaveDraft, onSaveOrder, saveOrderLabel = "Save Order", disableSaveOrder = false, paymentAgent, settlement, paidNow, onPaidNowChange, onViewDetails }: Props) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-card/95 backdrop-blur px-5 py-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded border border-border bg-bg-subtle p-3">
          <div className="text-sm font-semibold">Order Actions</div>
          <div className="text-[11.5px] text-fg-subtle mb-2">Save or review your order details.</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button size="sm" variant="secondary" onClick={onSaveDraft}>Save as Draft</Button>
            <Button size="sm" variant="primary" onClick={onSaveOrder} disabled={disableSaveOrder} title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}>{saveOrderLabel}</Button>
            <Button size="sm" variant="secondary" onClick={onViewDetails}>View Order Details</Button>
          </div>
        </div>
        <div className="rounded border border-border bg-bg-subtle p-3">
          <div className="text-sm font-semibold mb-2">Payment Summary</div>
          <div className="w-full">
            <PaymentAgentSettlementSummary paymentAgent={paymentAgent} settlement={settlement} paidNow={paidNow} onPaidNowChange={onPaidNowChange} />
          </div>
          <div className="mt-3 border-t border-border pt-2 flex items-end justify-between">
            <div className="text-[11.5px] text-fg-muted">Total Order Amount</div>
            <div className="text-[22px] font-semibold tracking-tight tabular-nums">
            {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
