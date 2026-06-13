"use client";

import { Button } from "@/components/ui/Button";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent } from "@/lib/types";
import type { PaymentAgentSettlementResult } from "@/services/settlement/paymentAgentSettlement";

type Props = {
  total: number;
  onSaveDraft: () => void;
  onSaveOrder: () => void;
  saveOrderLabel?: string;
  saveDraftLabel?: string;
  disableSaveOrder?: boolean;
  disableSaveDraft?: boolean;
  paymentAgent: PaymentAgent | null;
  settlement: PaymentAgentSettlementResult;
  paidNow: number;
  onPaidNowChange: (value: number) => void;
  onViewDetails: () => void;
};

const fmt = (value: number) => formatAmount(value);

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "info" }) {
  return (
    <div className="px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`text-[16px] font-semibold tabular-nums ${tone === "success" ? "text-[var(--success)]" : tone === "warning" ? "text-amber-600" : tone === "info" ? "text-sky-600" : "text-fg"}`}>{value}</div>
    </div>
  );
}

export function OrderFooter({ total, onSaveDraft, onSaveOrder, saveOrderLabel = "Save Order", saveDraftLabel = "Save as Draft", disableSaveOrder = false, disableSaveDraft = false, paymentAgent, settlement, paidNow, onViewDetails }: Props) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-card px-5 py-2.5">
      <div className="rounded-xl border border-border bg-bg-subtle px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center divide-x divide-border/70">
            <Metric label="Agent Credit" value={paymentAgent ? fmt(settlement.existingCredit) : "—"} />
            <Metric label="Order Total" value={fmt(total)} />
            <Metric label="Credit Used" value={paymentAgent ? fmt(settlement.creditUsed) : "0"} tone="info" />
            <Metric label="Payable" value={paymentAgent ? fmt(settlement.remainingPayable) : fmt(total)} tone={(paymentAgent ? settlement.remainingPayable : total) > 0 ? "warning" : "default"} />
            <Metric label="Credit Left" value={paymentAgent ? fmt(settlement.resultingCreditBalance) : "—"} tone={paymentAgent && settlement.resultingCreditBalance > 0 ? "success" : "default"} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onSaveDraft} disabled={disableSaveDraft}>{saveDraftLabel}</Button>
            <Button size="sm" variant="secondary" onClick={onViewDetails}>View Order Details →</Button>
            <Button size="sm" variant="primary" onClick={onSaveOrder} disabled={disableSaveOrder} title={disableSaveOrder ? "Complete required fields before saving as order." : undefined}>{saveOrderLabel}</Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
