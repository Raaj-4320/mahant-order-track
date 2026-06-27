import type { Order, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit } from "@/lib/types";
import { getOrderPaymentAgentSplits, getPaymentAgentSplitAgentId } from "@/services/settlement/paymentAgentSplits";
import { orderTotal } from "@/lib/types";

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

export type PaymentAgentDirectOrderFact = {
  order: Order;
  split: PaymentAgentOrderSplit;
  orderPortionAmount: number;
  usedAmount: number;
  eventDate: string;
};

export type PaymentAgentLiveOrderRow = {
  id: string;
  order: Order;
  split: PaymentAgentOrderSplit;
  orderId: string;
  splitId: string;
  orderNumber: string;
  orderDate: string;
  assigned: number;
  creditUsed: number;
  remaining: number;
};

export type PaymentAgentLiveFinance = {
  openingBalance: number;
  manualPayments: number;
  advance: number;
  assigned: number;
  creditUsed: number;
  pending: number;
  available: number;
  ordersCount: number;
  orderRows: PaymentAgentLiveOrderRow[];
};

export const splitBelongsToAgent = (agent: PaymentAgent, split: PaymentAgentOrderSplit) => {
  const agentId = normalizeText(agent.id);
  const agentName = normalizeText(agent.name);
  const splitAgentId = normalizeText(getPaymentAgentSplitAgentId(split));
  const splitName = normalizeText(split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy);
  return splitAgentId === agentId || (!splitAgentId && splitName === agentName);
};

export const splitOrderPortionAmount = (order: Order, split: PaymentAgentOrderSplit) => {
  const fromSnapshot = clamp(split.settlementSnapshot?.orderPortionTotal);
  if (fromSnapshot > 0) return fromSnapshot;
  const fromAssigned = clamp(split.assignedAmount);
  if (fromAssigned > 0) return fromAssigned;
  const fromPaidNow = clamp(split.paidNow);
  if (fromPaidNow > 0) return fromPaidNow;
  return getOrderPaymentAgentSplits(order).length === 1 ? clamp(order.grandTotal ?? order.subtotal ?? 0) : 0;
};

export const splitUsedAmount = (split: PaymentAgentOrderSplit) => {
  const fromCreditUsed = clamp(split.settlementSnapshot?.creditUsed);
  if (fromCreditUsed > 0) return fromCreditUsed;
  const paidNow = clamp(split.paidNow);
  if (paidNow > 0) return paidNow;
  return clamp(split.settlementSnapshot?.paidNow);
};

const isLivePaymentAgentOrder = (order: Order) => {
  const status = normalizeText(order.status);
  return status === "saved" || status === "";
};

const splitAssignedAmount = (order: Order, split: PaymentAgentOrderSplit) => {
  const assigned = clamp(split.assignedAmount);
  if (assigned > 0) return assigned;
  const orderPortionTotal = clamp(split.settlementSnapshot?.orderPortionTotal);
  if (orderPortionTotal > 0) return orderPortionTotal;
  return getOrderPaymentAgentSplits(order).length === 1 ? clamp(orderTotal(order)) : 0;
};

const splitRemainingAmount = (split: PaymentAgentOrderSplit, assigned: number, creditUsed: number) => {
  const snapshotRemaining = split.settlementSnapshot?.remainingPayable;
  if (snapshotRemaining !== undefined && snapshotRemaining !== null) {
    return clamp(snapshotRemaining);
  }
  const payableAfterCredit = split.settlementSnapshot?.payableAfterCredit;
  if (payableAfterCredit !== undefined && payableAfterCredit !== null) {
    return clamp(payableAfterCredit);
  }
  return Math.max(0, clamp(assigned) - clamp(creditUsed));
};

export function calculatePaymentAgentLiveFinance(
  agent: PaymentAgent,
  orders: Order[],
  ledger: PaymentAgentLedgerEntry[],
): PaymentAgentLiveFinance {
  const orderRows = orders
    .filter(isLivePaymentAgentOrder)
    .flatMap((order) =>
      getOrderPaymentAgentSplits(order)
        .filter((split) => splitBelongsToAgent(agent, split))
        .map((split) => {
          const assigned = splitAssignedAmount(order, split);
          const creditUsed = splitUsedAmount(split);
          const remaining = splitRemainingAmount(split, assigned, creditUsed);
          return {
            id: `${order.id}:${split.id}`,
            order,
            split,
            orderId: order.id,
            splitId: split.id,
            orderNumber: order.number || order.orderNumber || "-",
            orderDate: order.date || order.updatedAt || order.createdAt || "",
            assigned,
            creditUsed,
            remaining,
          };
        }),
    )
    .sort((left, right) =>
      right.orderDate.localeCompare(left.orderDate)
      || right.orderNumber.localeCompare(left.orderNumber, undefined, { numeric: true, sensitivity: "base" }),
    );

  const manualPayments = ledger
    .filter((entry) => entry.agentId === agent.id && entry.type === "agent_payment" && entry.active !== false && entry.isReversed !== true)
    .reduce((sum, entry) => sum + clamp(entry.amount), 0);
  const openingBalance = clamp(agent.openingCreditBalance);
  const advance = openingBalance + manualPayments;
  const assigned = orderRows.reduce((sum, row) => sum + clamp(row.assigned), 0);
  const creditUsed = orderRows.reduce((sum, row) => sum + clamp(row.creditUsed), 0);
  const pending = Math.max(0, assigned - advance);
  const available = Math.max(0, advance - assigned);
  const ordersCount = new Set(orderRows.map((row) => row.orderId)).size;

  return {
    openingBalance,
    manualPayments,
    advance,
    assigned,
    creditUsed,
    pending,
    available,
    ordersCount,
    orderRows,
  };
}

export function getPaymentAgentDirectOrderFacts(
  agent: PaymentAgent,
  orders: Order[],
): PaymentAgentDirectOrderFact[] {
  const liveOrders = orders.filter(isLivePaymentAgentOrder);
  return liveOrders.flatMap((order) =>
    getOrderPaymentAgentSplits(order)
      .filter((split) => splitBelongsToAgent(agent, split))
      .map((split) => ({
        order,
        split,
        orderPortionAmount: splitOrderPortionAmount(order, split),
        usedAmount: splitUsedAmount(split),
        eventDate: order.date || order.updatedAt || order.createdAt || "",
      })),
  );
}

export function computePaymentAgentDirectFinance(
  agent: PaymentAgent,
  orders: Order[],
  ledger: PaymentAgentLedgerEntry[],
): PaymentAgentDirectFinanceFields {
  const agentOrders = getPaymentAgentDirectOrderFacts(agent, orders).map((entry) => ({
    orderId: entry.order.id,
    orderPortionAmount: entry.orderPortionAmount,
    usedAmount: entry.usedAmount,
    eventDate: entry.eventDate,
  }));

  const uniqueOrderIds = new Set(agentOrders.map((entry) => entry.orderId));
  const totalOrderAmount = agentOrders.reduce((sum, entry) => sum + clamp(entry.orderPortionAmount), 0);
  const totalUsedAmount = agentOrders.reduce((sum, entry) => sum + clamp(entry.usedAmount), 0);
  const activeManualPayments = ledger
    .filter((entry) => entry.agentId === agent.id && entry.type === "agent_payment" && entry.active !== false && entry.isReversed !== true);
  const totalPaidAmount = activeManualPayments.reduce((sum, entry) => sum + clamp(entry.amount), 0);
  const openingCredit = clamp(agent.openingCreditBalance);

  const timeline: Array<
    | { kind: "opening"; date: string; amount: number }
    | { kind: "manual_payment"; date: string; amount: number; dueReduced: number }
    | { kind: "order_assignment"; date: string; amount: number }
  > = [];

  if (openingCredit > 0) {
    timeline.push({
      kind: "opening",
      date: agent.createdAt || agent.updatedAt || "",
      amount: openingCredit,
    });
  }

  activeManualPayments.forEach((entry) => {
    timeline.push({
      kind: "manual_payment",
      date: entry.paymentDate || entry.createdAt || entry.updatedAt || "",
      amount: clamp(entry.creditCreated ?? Math.max(clamp(entry.amount) - clamp(entry.dueReduced), 0)),
      dueReduced: clamp(entry.dueReduced),
    });
  });

  agentOrders.forEach((entry) => {
    timeline.push({
      kind: "order_assignment",
      date: entry.eventDate,
      amount: clamp(entry.orderPortionAmount),
    });
  });

  timeline.sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    const rank = { opening: 0, manual_payment: 1, order_assignment: 2 } as const;
    return rank[left.kind] - rank[right.kind];
  });

  let runningCredit = 0;
  let runningDue = 0;
  timeline.forEach((event) => {
    if (event.kind === "opening") {
      runningCredit += event.amount;
      return;
    }
    if (event.kind === "manual_payment") {
      const dueReduction = Math.min(runningDue, event.dueReduced);
      runningDue -= dueReduction;
      runningCredit += event.amount;
      return;
    }
    const coveredByCredit = Math.min(runningCredit, event.amount);
    runningCredit -= coveredByCredit;
    runningDue += event.amount - coveredByCredit;
  });

  return {
    totalOrdersPaid: uniqueOrderIds.size,
    creditBalance: clamp(runningCredit),
    totalOrderAmount,
    totalPaidAmount,
    totalPayableAmount: clamp(runningDue),
    currentDuePayable: clamp(runningDue),
    totalUsedAmount,
    currentPayable: clamp(runningDue),
  };
}
