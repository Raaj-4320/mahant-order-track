import type { Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";

const clamp = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

export function recalculateAgentFromOpeningAndOrders(agent: PaymentAgent, orders: Order[]): PaymentAgent {
  const own = orders.filter((o) => (o.paymentAgentId || o.paymentBy) === agent.id && o.paymentAgentSettlementSnapshot);
  let creditBalance = clamp(agent.openingCreditBalance ?? agent.creditBalance ?? 0);
  let totalOrderAmount = 0; let totalPaidAmount = 0; let currentDuePayable = 0;
  for (const o of own) {
    const s = o.paymentAgentSettlementSnapshot!;
    totalOrderAmount += clamp((s as any).orderTotal);
    totalPaidAmount += clamp(s.paidNow);
    currentDuePayable += clamp(s.remainingPayable);
    creditBalance = clamp(creditBalance - clamp(s.creditUsed) + clamp(s.newCreditCreated));
  }
  return { ...agent, creditBalance, totalOrderAmount, totalPaidAmount, currentDuePayable, updatedAt: new Date().toISOString() };
}

export function applyOrderSettlementToAgent(agent: PaymentAgent, order: Order, settlement: NonNullable<Order["paymentAgentSettlementSnapshot"]>) {
  const updated = { ...agent, creditBalance: clamp(settlement.resultingCreditBalance), totalOrderAmount: clamp((agent.totalOrderAmount ?? 0) + (settlement as any).orderTotal), totalPaidAmount: clamp((agent.totalPaidAmount ?? 0) + settlement.paidNow), currentDuePayable: clamp((agent.currentDuePayable ?? 0) + settlement.remainingPayable), updatedAt: new Date().toISOString() };
  const entry: PaymentAgentLedgerEntry = { id: `led-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, agentId: agent.id, type: "order_settlement", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, amount: clamp((settlement as any).orderTotal), creditUsed: settlement.creditUsed, paidNow: settlement.paidNow, payableAfterCredit: settlement.payableAfterCredit, remainingPayable: settlement.remainingPayable, newCreditCreated: settlement.newCreditCreated, resultingCreditBalance: settlement.resultingCreditBalance, createdAt: new Date().toISOString() };
  return { updatedAgent: updated, ledgerEntry: entry };
}
