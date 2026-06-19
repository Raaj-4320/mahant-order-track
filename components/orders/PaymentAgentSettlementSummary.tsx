"use client";

import { formatAmount } from "@/lib/data";
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
const fmt = (v: number) => formatAmount(v);

export function PaymentAgentSettlementSummary({ paymentAgent, settlement, paidNow, onPaidNowChange }: Props) {
  if (!paymentAgent) return <div className="rounded border border-border/70 bg-bg-card p-3"><div className="flex items-center justify-between gap-2 mb-2"><div className="text-sm font-semibold">Payment Summary</div><span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-fg-subtle uppercase">No Agent</span></div><div className="text-[12px] text-fg-subtle">Select a payment agent to preview payable/credit adjustment.</div></div>;

  return (
    <div className="rounded border border-border/70 bg-bg-card p-3 text-[12px]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold">Payment Summary</div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-fg-subtle">Payment Agent: {paymentAgent.name}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${badgeTone[settlement.status]}`}>{settlement.status}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr] md:gap-3">
        <div className="space-y-1.5 md:pr-3 md:border-r md:border-border/70">
          <div className="flex items-center justify-between"><span className="text-fg-subtle">Existing Credit</span><span className="font-medium tabular-nums">{fmt(settlement.existingCredit)}</span></div>
          <div className="flex items-center justify-between"><span className="text-fg-subtle">Current Order Total</span><span className="font-medium tabular-nums">{fmt(settlement.orderTotal)}</span></div>
          <div className="flex items-center justify-between"><span className="text-fg-subtle">Credit Used</span><span className="font-medium tabular-nums">{fmt(settlement.creditUsed)}</span></div>
          <div className="flex items-center justify-between"><span className="text-fg-subtle">Payable Now</span><span className="font-medium tabular-nums">{fmt(settlement.payableAfterCredit)}</span></div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2"><label htmlFor="paid-now" className="text-fg-subtle">Paid Now to Payment Agent</label><input id="paid-now" type="number" min={0} value={paidNow} onChange={(e) => onPaidNowChange(Math.max(0, Number(e.target.value) || 0))} onWheel={(e) => e.currentTarget.blur()} className="input no-spinner h-7 w-[140px] text-right tabular-nums" /></div>
          <div className="flex items-center justify-between"><span className="text-fg-subtle">Remaining Payable</span><span className="font-medium tabular-nums">{fmt(settlement.remainingPayable)}</span></div>
          <div className="flex items-center justify-between"><span className="text-fg-subtle">New Credit Created</span><span className="font-medium tabular-nums">{fmt(settlement.newCreditCreated)}</span></div>
          <div className="mt-1 rounded border border-border bg-bg-subtle px-2 py-1.5 flex items-center justify-between"><span className="text-fg-subtle">Resulting Agent Credit</span><span className="font-semibold tabular-nums">{fmt(settlement.resultingCreditBalance)}</span></div>
        </div>
      </div>
    </div>
  );
}
