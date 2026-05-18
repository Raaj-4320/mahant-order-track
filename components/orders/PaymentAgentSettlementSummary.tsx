"use client";

import type { PaymentAgent } from "@/lib/types";
import type { PaymentAgentSettlementResult } from "@/services/settlement/paymentAgentSettlement";

type Props = {
  paymentAgent: PaymentAgent | null;
  settlement: PaymentAgentSettlementResult;
  paidNow: number;
  onPaidNowChange: (value: number) => void;
};

const badgeTone: Record<PaymentAgentSettlementResult["status"], string> = {
  unpaid: "bg-rose-50 text-rose-700 border-rose-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  credit: "bg-sky-50 text-sky-700 border-sky-200",
};
const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PaymentAgentSettlementSummary({ paymentAgent, settlement, paidNow, onPaidNowChange }: Props) {
  if (!paymentAgent) return <div className="rounded border border-border bg-bg-subtle p-3 text-[12px] text-fg-subtle">Select a payment agent to preview payable/credit adjustment.</div>;

  return (
    <div className="rounded border border-border bg-bg-subtle p-3 space-y-2 text-[12px]">
      <div className="flex items-center justify-between">
        <div className="font-medium">Payment Agent: {paymentAgent.name} ({paymentAgent.agentCode})</div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${badgeTone[settlement.status]}`}>{settlement.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>Existing Credit</div><div className="text-right font-medium">{fmt(settlement.existingCredit)}</div>
        <div>Current Order Total</div><div className="text-right font-medium">{fmt(settlement.orderTotal)}</div>
        <div>Credit Used</div><div className="text-right font-medium">{fmt(settlement.creditUsed)}</div>
        <div>Payable Now</div><div className="text-right font-medium">{fmt(settlement.payableAfterCredit)}</div>
        <label htmlFor="paid-now">Paid Now to Payment Agent</label>
        <input id="paid-now" type="number" min={0} value={paidNow} onChange={(e) => onPaidNowChange(Math.max(0, Number(e.target.value) || 0))} className="input h-8 text-right" />
        <div>Remaining Payable</div><div className="text-right font-medium">{fmt(settlement.remainingPayable)}</div>
        <div>New Credit Created</div><div className="text-right font-medium">{fmt(settlement.newCreditCreated)}</div>
        <div>Resulting Agent Credit</div><div className="text-right font-semibold">{fmt(settlement.resultingCreditBalance)}</div>
      </div>
    </div>
  );
}
