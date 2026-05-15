"use client";

import { Button } from "@/components/ui/Button";
import { formatCNY } from "@/lib/data";
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
};

export function OrderFooter({ total, onCancel, onSaveDraft, onSaveOrder, saveOrderLabel = "Save Order", disableSaveOrder = false, paymentAgent, settlement, paidNow, onPaidNowChange }: Props) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-card/95 backdrop-blur px-5 py-3">
      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="secondary" onClick={onSaveDraft}>
            Save as Draft
          </Button>
          <Button size="sm" variant="primary" onClick={onSaveOrder} disabled={disableSaveOrder} title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}>
            {saveOrderLabel}
          </Button>
        </div>
        <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5">
          <div className="w-full sm:w-[360px] mb-2">
            <PaymentAgentSettlementSummary paymentAgent={paymentAgent} settlement={settlement} paidNow={paidNow} onPaidNowChange={onPaidNowChange} />
          </div>
          <div className="text-[11.5px] text-fg-muted">Total Order Amount</div>
          <div className="text-[22px] font-semibold tracking-tight tabular-nums">
            {formatCNY(total)}
          </div>
        </div>
      </div>
    </footer>
  );
}
