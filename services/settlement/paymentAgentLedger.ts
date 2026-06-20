import type { Order, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit } from "@/lib/types";
import { getOrderCreditExclusionReason, isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import {
  getOrderPaymentAgentSplitSettlementEntryId,
  getPaymentAgentSplitAgentId,
  getOrderPaymentAgentSplits,
  isVirtualLegacyPaymentAgentSplit,
} from "@/services/settlement/paymentAgentSplits";

const clamp = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

const getSplitSettlement = (split: PaymentAgentOrderSplit) => split.settlementSnapshot;

const getSplitSettlementHash = (order: Order, split: PaymentAgentOrderSplit) => {
  const settlement = getSplitSettlement(split);
  if (!settlement) return "";
  return [
    getPaymentAgentSplitAgentId(split),
    split.id,
    settlement.orderPortionTotal,
    settlement.existingCredit,
    settlement.creditUsed,
    settlement.payableAfterCredit,
    settlement.paidNow,
    settlement.remainingPayable,
    settlement.newCreditCreated,
    settlement.resultingCreditBalance,
    order.id,
  ].join("|");
};

export function recalculateAgentFromOpeningAndOrders(agent: PaymentAgent, orders: Order[]): PaymentAgent {
  const own = orders.filter((o) => (o.paymentAgentId || o.paymentBy) === agent.id && o.paymentAgentSettlementSnapshot);
  const eligible = own.filter((order) => isOrderEligibleForCreditSettlement(order));
  let creditBalance = clamp(agent.openingCreditBalance ?? agent.creditBalance ?? 0);
  let totalOrderAmount = 0;
  let totalPaidAmount = 0;
  let currentDuePayable = 0;

  for (const o of eligible) {
    const s = o.paymentAgentSettlementSnapshot!;
    totalOrderAmount += clamp(s.orderTotal);
    totalPaidAmount += clamp(s.paidNow);
    currentDuePayable += clamp(s.remainingPayable);
    creditBalance = clamp(creditBalance - clamp(s.creditUsed) + clamp(s.newCreditCreated));
  }

  return { ...agent, creditBalance, totalOrderAmount, totalPaidAmount, currentDuePayable, updatedAt: new Date().toISOString() };
}

export function applyOrderSettlementToAgent(
  agent: PaymentAgent,
  order: Order,
  settlement: NonNullable<Order["paymentAgentSettlementSnapshot"]>,
) {
  const updated = {
    ...agent,
    creditBalance: clamp(settlement.resultingCreditBalance),
    totalOrderAmount: clamp((agent.totalOrderAmount ?? 0) + settlement.orderTotal),
    totalPaidAmount: clamp((agent.totalPaidAmount ?? 0) + settlement.paidNow),
    currentDuePayable: clamp((agent.currentDuePayable ?? 0) + settlement.remainingPayable),
    updatedAt: new Date().toISOString(),
  };
  const entry: PaymentAgentLedgerEntry = {
    id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agentId: agent.id,
    type: "order_settlement",
    sourceOrderId: order.id,
    sourceOrderNumber: order.number || order.orderNumber,
    amount: clamp(settlement.orderTotal),
    creditUsed: settlement.creditUsed,
    paidNow: settlement.paidNow,
    payableAfterCredit: settlement.payableAfterCredit,
    remainingPayable: settlement.remainingPayable,
    newCreditCreated: settlement.newCreditCreated,
    resultingCreditBalance: settlement.resultingCreditBalance,
    createdAt: new Date().toISOString(),
  };
  return { updatedAgent: updated, ledgerEntry: entry };
}

export function createSettlementHash(order: Order) {
  const split = getOrderPaymentAgentSplits(order)[0];
  return split ? getSplitSettlementHash(order, split) : "";
}

export function buildOrderSplitSettlementEntry(order: Order, split: PaymentAgentOrderSplit): PaymentAgentLedgerEntry {
  const settlement = getSplitSettlement(split);
  if (!settlement) {
    throw new Error(`Settlement snapshot missing for payment split ${split.id}.`);
  }
  const now = new Date().toISOString();
  const useLegacySingleEntry = isVirtualLegacyPaymentAgentSplit(order, split);
  return {
    id: getOrderPaymentAgentSplitSettlementEntryId(order.id, split.id, useLegacySingleEntry),
    settlementEntryKey: `${order.id}:${split.id}`,
    sourcePaymentAgentSplitId: split.id,
    agentId: getPaymentAgentSplitAgentId(split),
    type: "order_settlement",
    sourceOrderId: order.id,
    sourceOrderNumber: order.number || order.orderNumber,
    amount: settlement.orderPortionTotal,
    creditUsed: settlement.creditUsed,
    payableAfterCredit: settlement.payableAfterCredit,
    paidNow: settlement.paidNow,
    remainingPayable: settlement.remainingPayable,
    newCreditCreated: settlement.newCreditCreated,
    resultingCreditBalance: settlement.resultingCreditBalance,
    settlementHash: getSplitSettlementHash(order, split),
    active: true,
    isReversed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOrderSettlementEntry(order: Order): PaymentAgentLedgerEntry {
  const split = getOrderPaymentAgentSplits(order)[0];
  if (!split) {
    throw new Error("Order has no payment-agent settlement split.");
  }
  return buildOrderSplitSettlementEntry(order, split);
}

export function buildOrderSplitSettlementReversalEntry(
  order: Order,
  previous: PaymentAgentLedgerEntry,
): PaymentAgentLedgerEntry {
  const now = new Date().toISOString();
  return {
    id: `order-settlement-reversal-${previous.id}-${Date.now()}`,
    settlementEntryKey: previous.settlementEntryKey ?? (previous.sourcePaymentAgentSplitId ? `${order.id}:${previous.sourcePaymentAgentSplitId}` : undefined),
    sourcePaymentAgentSplitId: previous.sourcePaymentAgentSplitId,
    agentId: previous.agentId,
    type: "order_settlement_reversal",
    sourceOrderId: order.id,
    sourceOrderNumber: order.number || order.orderNumber,
    amount: previous.amount,
    creditUsed: previous.creditUsed,
    payableAfterCredit: previous.payableAfterCredit,
    paidNow: previous.paidNow,
    remainingPayable: previous.remainingPayable,
    newCreditCreated: previous.newCreditCreated,
    resultingCreditBalance: previous.resultingCreditBalance,
    reversalOfId: previous.id,
    note: "Reversal of previous order settlement",
    active: true,
    isReversed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOrderSettlementReversalEntry(order: Order, previous: PaymentAgentLedgerEntry): PaymentAgentLedgerEntry {
  return buildOrderSplitSettlementReversalEntry(order, previous);
}

export const orderSettlementExclusionReason = (order: Order) => getOrderCreditExclusionReason(order);
