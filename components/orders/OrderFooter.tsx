"use client";

import { Button } from "@/components/ui/Button";
import { useEffect } from "react";
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

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "info" }) {
  return (
    <div className="px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`text-[16px] font-semibold tabular-nums ${tone === "success" ? "text-[var(--success)]" : tone === "warning" ? "text-amber-600" : tone === "info" ? "text-sky-600" : "text-fg"}`}>{value}</div>
    </div>
  );
}

export function OrderFooter({ total, onCancel, onSaveDraft, onSaveOrder, saveOrderLabel = "Save Order", disableSaveOrder = false, paymentAgent, settlement, paidNow, onViewDetails }: Props) {
  useEffect(() => {
    console.debug("[ORDER_FOOTER_SETTLEMENT_PREVIEW]", {
      existingCredit: settlement.existingCredit,
      orderTotal: settlement.orderTotal,
      creditUsed: settlement.creditUsed,
      payableNow: settlement.payableAfterCredit,
      remainingPayable: settlement.remainingPayable,
      resultingCreditBalance: settlement.resultingCreditBalance,
      paidNow,
    });
  }, [settlement, paidNow]);

  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-card px-5 py-2.5">
      <div className="rounded-xl border border-border bg-bg-subtle px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center divide-x divide-border/70">
            <Metric label="Agent Credit" value={paymentAgent ? fmt(settlement.existingCredit) : "0.00"} />
            <Metric label="Order Total" value={fmt(total)} />
            <Metric label="Credit Used" value={fmt(settlement.creditUsed)} tone="info" />
            <Metric label="Payable" value={fmt(settlement.remainingPayable)} tone={settlement.remainingPayable > 0 ? "warning" : "default"} />
            <Metric label="Credit Left" value={fmt(settlement.resultingCreditBalance)} tone={settlement.resultingCreditBalance > 0 ? "success" : "default"} />
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
