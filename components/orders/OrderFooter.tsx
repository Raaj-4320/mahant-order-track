"use client";

import { Button } from "@/components/ui/Button";
import type { PaymentAgent } from "@/lib/types";
import type { PaymentAgentSettlementResult } from "@/services/settlement/paymentAgentSettlement";

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

const fmt = (v: number) => (Number(v || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Metric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${emphasize ? "text-[var(--success)]" : "text-fg"}`}>{value}</div>
    </div>
  );
}

export function OrderFooter({ total, onCancel, onSaveDraft, onSaveOrder, saveOrderLabel = "Save Order", disableSaveOrder = false, paymentAgent, settlement, paidNow, onViewDetails }: Props) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-card px-5 py-2.5">
      <div className="rounded-xl border border-border bg-bg-subtle px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center divide-x divide-border/70">
            <Metric label="Agent Credit" value={paymentAgent ? fmt(settlement.existingCredit) : "0.00"} />
            <Metric label="Order Total" value={fmt(total)} />
            <Metric label="Pay Now" value={fmt(paidNow)} />
            <Metric label="Remaining Credit" value={fmt(settlement.resultingCreditBalance)} emphasize={settlement.resultingCreditBalance > 0} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button size="sm" variant="secondary" onClick={onSaveDraft}>Save as Draft</Button>
            <Button size="sm" variant="secondary" onClick={onViewDetails}>View Order Details →</Button>
            <Button size="sm" variant="primary" onClick={onSaveOrder} disabled={disableSaveOrder} title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}>{saveOrderLabel}</Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
