import { orderTotal, type Order, type PaymentAgentOrderSplit } from "@/lib/types";

const normalizeAmount = (value: number | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const trimValue = (value?: string | null) => (value || "").trim();

export type PaymentAgentSplitValidationResult = {
  isValid: boolean;
  issues: string[];
  totalAssignedAmount: number;
  expectedAmount: number;
};

export const isVirtualLegacyPaymentAgentSplit = (order: Pick<Order, "paymentAgentSplits">, split: Pick<PaymentAgentOrderSplit, "id">) =>
  !hasRealPaymentAgentSplits(order) && split.id === "legacy-primary";

export const getPaymentAgentSplitAgentId = (split: Pick<PaymentAgentOrderSplit, "paymentAgentId" | "paymentBy" | "paymentAgentSnapshot">) =>
  trimValue(split.paymentAgentId) || trimValue(split.paymentBy) || trimValue(split.paymentAgentSnapshot?.id);

export const getOrderPaymentAgentSplitSettlementEntryId = (
  orderId: string,
  splitId: string,
  useLegacySingleEntry = false,
) => {
  if (useLegacySingleEntry || splitId === "legacy-primary") {
    return `order-settlement-${orderId}`;
  }
  return `order-settlement-${orderId}-${splitId}`;
};

export const getOrderPaymentAgentLedgerEntryIds = (order: Order) =>
  getOrderPaymentAgentSplits(order).map((split) =>
    getOrderPaymentAgentSplitSettlementEntryId(order.id, split.id, isVirtualLegacyPaymentAgentSplit(order, split)),
  );

export const getOrderPaymentAgentLinkedAgentIds = (order: Order) =>
  Array.from(new Set(getOrderPaymentAgentSplits(order).map((split) => getPaymentAgentSplitAgentId(split)).filter(Boolean)));

const createVirtualLegacySplit = (order: Order): PaymentAgentOrderSplit | null => {
  const paymentAgentId = trimValue(order.paymentAgentId);
  const paymentBy = trimValue(order.paymentBy);
  const paymentAgentName =
    trimValue(order.paymentAgentSnapshot?.name)
    || trimValue(order.paymentByName)
    || trimValue(order.paymentAgentName)
    || paymentBy;

  if (!paymentAgentId && !paymentBy && !paymentAgentName) {
    return null;
  }

  const settlement = order.paymentAgentSettlementSnapshot;
  const assignedAmount = settlement?.orderTotal ?? orderTotal(order);

  return {
    id: "legacy-primary",
    paymentAgentId,
    paymentBy,
    paymentAgentName,
    paymentAgentSnapshot: order.paymentAgentSnapshot
      ? {
          id: trimValue(order.paymentAgentSnapshot.id),
          name: trimValue(order.paymentAgentSnapshot.name),
          code: trimValue(order.paymentAgentSnapshot.code) || undefined,
        }
      : undefined,
    assignedAmount,
    paidNow: settlement?.paidNow ?? order.paidToPaymentAgentNow ?? 0,
    settlementSnapshot: settlement
      ? {
          orderPortionTotal: normalizeAmount(settlement.orderTotal),
          existingCredit: normalizeAmount(settlement.existingCredit),
          creditUsed: normalizeAmount(settlement.creditUsed),
          payableAfterCredit: normalizeAmount(settlement.payableAfterCredit),
          remainingPayable: normalizeAmount(settlement.remainingPayable),
          newCreditCreated: normalizeAmount(settlement.newCreditCreated),
          resultingCreditBalance: normalizeAmount(settlement.resultingCreditBalance),
          paidNow: normalizeAmount(settlement.paidNow),
          status: settlement.status,
          createdAt: settlement.createdAt,
          updatedAt: settlement.updatedAt,
        }
      : undefined,
    createdAt: settlement?.createdAt ?? order.createdAt,
    updatedAt: settlement?.updatedAt ?? order.updatedAt,
  };
};

export function hasRealPaymentAgentSplits(order: Pick<Order, "paymentAgentSplits">): boolean {
  return Array.isArray(order.paymentAgentSplits) && order.paymentAgentSplits.length > 0;
}

export function getOrderPaymentAgentSplits(order: Order): PaymentAgentOrderSplit[] {
  if (hasRealPaymentAgentSplits(order)) {
    return order.paymentAgentSplits!
      .filter((split) => split && trimValue(split.id))
      .map((split) => ({
        ...split,
        paymentAgentId: trimValue(split.paymentAgentId),
        paymentBy: trimValue(split.paymentBy),
        paymentAgentName: trimValue(split.paymentAgentName),
        paymentAgentSnapshot: split.paymentAgentSnapshot
          ? {
              id: trimValue(split.paymentAgentSnapshot.id),
              name: trimValue(split.paymentAgentSnapshot.name),
              code: trimValue(split.paymentAgentSnapshot.code) || undefined,
            }
          : undefined,
        assignedAmount: normalizeAmount(split.assignedAmount),
        paidNow: split.paidNow === undefined ? undefined : normalizeAmount(split.paidNow),
        note: trimValue(split.note) || undefined,
        settlementSnapshot: split.settlementSnapshot
          ? {
              ...split.settlementSnapshot,
              orderPortionTotal: normalizeAmount(split.settlementSnapshot.orderPortionTotal),
              existingCredit: normalizeAmount(split.settlementSnapshot.existingCredit),
              creditUsed: normalizeAmount(split.settlementSnapshot.creditUsed),
              payableAfterCredit: normalizeAmount(split.settlementSnapshot.payableAfterCredit),
              remainingPayable: normalizeAmount(split.settlementSnapshot.remainingPayable),
              newCreditCreated: normalizeAmount(split.settlementSnapshot.newCreditCreated),
              resultingCreditBalance: normalizeAmount(split.settlementSnapshot.resultingCreditBalance),
              paidNow: normalizeAmount(split.settlementSnapshot.paidNow),
            }
          : undefined,
      }));
  }

  const legacySplit = createVirtualLegacySplit(order);
  return legacySplit ? [legacySplit] : [];
}

export function getPaymentAgentSplitTotal(order: Order): number {
  return getOrderPaymentAgentSplits(order).reduce((sum, split) => sum + normalizeAmount(split.assignedAmount), 0);
}

export function validatePaymentAgentSplits(order: Order): PaymentAgentSplitValidationResult {
  const splits = getOrderPaymentAgentSplits(order);
  const issues: string[] = [];
  const expectedAmount = orderTotal(order);
  const totalAssignedAmount = getPaymentAgentSplitTotal(order);
  const seenAgents = new Set<string>();

  splits.forEach((split, index) => {
    const agentKey = trimValue(split.paymentAgentId) || trimValue(split.paymentBy) || trimValue(split.paymentAgentName);
    if (!agentKey) {
      issues.push(`Split ${index + 1}: payment agent is missing.`);
    }
    if (normalizeAmount(split.assignedAmount) < 0) {
      issues.push(`Split ${index + 1}: assigned amount cannot be negative.`);
    }
    if (agentKey) {
      if (seenAgents.has(agentKey.toLowerCase())) {
        issues.push(`Split ${index + 1}: duplicate payment agent split.`);
      }
      seenAgents.add(agentKey.toLowerCase());
    }
  });

  if (splits.length > 0 && totalAssignedAmount !== expectedAmount) {
    issues.push(`Split total ${totalAssignedAmount} does not match expected amount ${expectedAmount}.`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    totalAssignedAmount,
    expectedAmount,
  };
}

export function formatPaymentAgentSplitsDisplay(order: Order): string {
  const splits = getOrderPaymentAgentSplits(order);
  if (splits.length === 0) return "";
  return splits
    .map((split) => {
      const name = trimValue(split.paymentAgentName) || trimValue(split.paymentAgentSnapshot?.name) || trimValue(split.paymentBy) || trimValue(split.paymentAgentId);
      const amount = normalizeAmount(split.assignedAmount);
      return splits.length === 1 && !hasRealPaymentAgentSplits(order) ? name : `${name} ${amount}`;
    })
    .filter(Boolean)
    .join(" / ");
}
