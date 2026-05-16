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


export function createSettlementHash(order: Order) {
  const s = order.paymentAgentSettlementSnapshot; if (!s) return "";
  return [order.paymentAgentId || order.paymentBy || "", s.orderTotal, s.existingCredit, s.creditUsed, s.payableAfterCredit, s.paidNow, s.remainingPayable, s.newCreditCreated, s.resultingCreditBalance].join("|");
}

export function buildOrderSettlementEntry(order: Order): PaymentAgentLedgerEntry {
  const s = order.paymentAgentSettlementSnapshot!; const now = new Date().toISOString();
  return { id: `order-settlement-${order.id}`, agentId: order.paymentAgentId || order.paymentBy, type: "order_settlement", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, amount: s.orderTotal, creditUsed: s.creditUsed, payableAfterCredit: s.payableAfterCredit, paidNow: s.paidNow, remainingPayable: s.remainingPayable, newCreditCreated: s.newCreditCreated, resultingCreditBalance: s.resultingCreditBalance, settlementHash: createSettlementHash(order), active: true, isReversed: false, createdAt: now, updatedAt: now };
}

export function buildOrderSettlementReversalEntry(order: Order, prev: PaymentAgentLedgerEntry): PaymentAgentLedgerEntry {
  const now = new Date().toISOString();
  return { id: `order-settlement-reversal-${order.id}-${Date.now()}`, agentId: prev.agentId, type: "order_settlement_reversal", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, amount: prev.amount, creditUsed: prev.creditUsed, payableAfterCredit: prev.payableAfterCredit, paidNow: prev.paidNow, remainingPayable: prev.remainingPayable, newCreditCreated: prev.newCreditCreated, resultingCreditBalance: prev.resultingCreditBalance, reversalOfId: prev.id, note: "Reversal of previous order settlement", active: true, isReversed: false, createdAt: now, updatedAt: now };
}
