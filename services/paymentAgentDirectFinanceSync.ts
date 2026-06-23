import type { Order, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit } from "@/lib/types";
import { getOrderPaymentAgentSplits, getPaymentAgentSplitAgentId } from "@/services/settlement/paymentAgentSplits";

const clamp = (value: number | undefined | null) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const normalizeText = (value?: string | null) => (value || "").trim().toLowerCase();

export type PaymentAgentDirectFinanceFields = {
  totalOrdersPaid: number;
  creditBalance: number;
  totalOrderAmount: number;
  totalPaidAmount: number;
  totalPayableAmount: number;
  currentDuePayable: number;
  totalUsedAmount: number;
  currentPayable: number;
};

const splitBelongsToAgent = (agent: PaymentAgent, split: PaymentAgentOrderSplit) => {
  const agentId = normalizeText(agent.id);
  const agentName = normalizeText(agent.name);
  const splitAgentId = normalizeText(getPaymentAgentSplitAgentId(split));
  const splitName = normalizeText(split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy);
  return splitAgentId === agentId || (!splitAgentId && splitName === agentName);
};

const splitOrderPortionAmount = (order: Order, split: PaymentAgentOrderSplit) => {
  const fromSnapshot = clamp(split.settlementSnapshot?.orderPortionTotal);
  if (fromSnapshot > 0) return fromSnapshot;
  const fromAssigned = clamp(split.assignedAmount);
  if (fromAssigned > 0) return fromAssigned;
  const fromPaidNow = clamp(split.paidNow);
  if (fromPaidNow > 0) return fromPaidNow;
  return getOrderPaymentAgentSplits(order).length === 1 ? clamp(order.grandTotal ?? order.subtotal ?? 0) : 0;
};

const splitUsedAmount = (split: PaymentAgentOrderSplit) => {
  const fromCreditUsed = clamp(split.settlementSnapshot?.creditUsed);
  if (fromCreditUsed > 0) return fromCreditUsed;
  const paidNow = clamp(split.paidNow);
  if (paidNow > 0) return paidNow;
  return clamp(split.settlementSnapshot?.paidNow);
};

export function computePaymentAgentDirectFinance(
  agent: PaymentAgent,
  orders: Order[],
  ledger: PaymentAgentLedgerEntry[],
): PaymentAgentDirectFinanceFields {
  const savedOrders = orders.filter((order) => order.status === "saved");
  const agentOrders = savedOrders.flatMap((order) =>
    getOrderPaymentAgentSplits(order)
      .filter((split) => splitBelongsToAgent(agent, split))
      .map((split) => ({
        orderId: order.id,
        orderPortionAmount: splitOrderPortionAmount(order, split),
        usedAmount: splitUsedAmount(split),
      })),
  );

  const uniqueOrderIds = new Set(agentOrders.map((entry) => entry.orderId));
  const totalOrderAmount = agentOrders.reduce((sum, entry) => sum + clamp(entry.orderPortionAmount), 0);
  const totalUsedAmount = agentOrders.reduce((sum, entry) => sum + clamp(entry.usedAmount), 0);
  const totalPaidAmount = ledger
    .filter((entry) => entry.agentId === agent.id && entry.type === "agent_payment" && entry.active !== false && entry.isReversed !== true)
    .reduce((sum, entry) => sum + clamp(entry.amount), 0);

  const openingCredit = clamp(agent.openingCreditBalance);
  const creditBalance = clamp(openingCredit + totalPaidAmount - totalUsedAmount);

  return {
    totalOrdersPaid: uniqueOrderIds.size,
    creditBalance,
    totalOrderAmount,
    totalPaidAmount,
    totalPayableAmount: 0,
    currentDuePayable: 0,
    totalUsedAmount,
    currentPayable: 0,
  };
}
