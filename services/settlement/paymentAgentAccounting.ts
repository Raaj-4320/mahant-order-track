import { orderTotal, type Customer, type Order, type PaymentAgent, type PaymentAgentLedgerEntry, type PaymentAgentOrderSplit } from "@/lib/types";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";
import { measurePerfSync } from "@/lib/perfDebug";
import { isPaymentAgentActive, resolveOrderPaymentAgentMatch } from "@/lib/orderDisplay";
import { getOrderPaymentAgentSplits, getPaymentAgentSplitAgentId } from "@/services/settlement/paymentAgentSplits";

const clamp = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const entryTime = (entry: PaymentAgentLedgerEntry) => entry.paymentDate || entry.updatedAt || entry.createdAt || "";
const createdSortTime = (value?: string) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const sortableTime = (value?: string) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const PAYMENT_AGENT_ACCOUNTING_AUDIT_ENABLED = process.env.NODE_ENV !== "production";
const warnedAccountingKeys = new Set<string>();

export type PaymentAgentAccountingTransactionType =
  | "Advance Given"
  | "Credit Used For Order"
  | "Pending Order Amount"
  | "Credit Returned"
  | "Balance Adjustment";

export type PaymentAgentAccountingSummary = {
  agent: PaymentAgent;
  customers: Customer[];
  matchedOrders: Order[];
  matchedEntries: PaymentAgentLedgerEntry[];
  activeSettlementEntries: PaymentAgentLedgerEntry[];
  activePaymentEntries: PaymentAgentLedgerEntry[];
  reversalEntries: PaymentAgentLedgerEntry[];
  totalAdvanced: number;
  totalUsed: number;
  creditLeft: number;
  duePending: number;
  paymentsMade: number;
  totalOrders: number;
  totalOrderAmount: number;
  paymentApplied: number;
};

export type PaymentAgentAccountingTransactionRow = {
  id: string;
  date: string;
  orderNumber: string;
  customer: string;
  type: PaymentAgentAccountingTransactionType;
  amount: number;
  notes: string;
  runningCreditLeft: number;
  createdSortAt?: string;
};

export type PaymentAgentAccountingPaymentRow = {
  id: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  runningCreditLeft: number;
  canDelete: boolean;
  createdSortAt?: string;
};

export type PaymentAgentOrderRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  productImage: string;
  marka: string;
  details: string;
  totalCtns: number;
  pcsPerCtn: number;
  totalPcs: number;
  rate: number;
  amount: number;
  customer: string;
  loadingDate: string;
};

const isEntryActive = (entry: PaymentAgentLedgerEntry) => entry.active !== false && entry.isReversed !== true;

const pickLatestByKey = (entries: PaymentAgentLedgerEntry[], keyBuilder: (entry: PaymentAgentLedgerEntry) => string) => {
  const byKey = new Map<string, PaymentAgentLedgerEntry>();
  [...entries]
    .sort((left, right) => entryTime(right).localeCompare(entryTime(left)))
    .forEach((entry) => {
      const key = keyBuilder(entry);
      if (!byKey.has(key)) byKey.set(key, entry);
    });
  return Array.from(byKey.values());
};

const getOrderCustomerSummary = (order?: Order | null, customers: Customer[] = []) => {
  if (!order) return "—";
  const names = Array.from(new Set((order.lines || []).map((line) => getLineCustomerDisplay(line, customers)).filter(Boolean)));
  return names.length > 0 ? names.join(", ") : "—";
};

const warnAccounting = (key: string, message: string, meta: Record<string, unknown>) => {
  if (!PAYMENT_AGENT_ACCOUNTING_AUDIT_ENABLED) return;
  if (warnedAccountingKeys.has(key)) return;
  warnedAccountingKeys.add(key);
  console.warn(`[PaymentAgent Accounting Audit] ${message}`, meta);
};

const normalizeText = (value?: string | null) => (value || "").trim().toLowerCase();
const normalizeOrderStatus = (value?: string | null) => (value || "").trim().toLowerCase();
const isLiveAccountingOrder = (order: Order) => {
  const status = normalizeOrderStatus(order.status);
  if (status === "saved") return true;
  if (status === "draft" || status === "archived") return false;
  return status === "";
};

const splitBelongsToAgent = (agent: PaymentAgent, split: PaymentAgentOrderSplit) => {
  const agentId = normalizeText(agent.id);
  const agentName = normalizeText(agent.name);
  const splitAgentId = normalizeText(getPaymentAgentSplitAgentId(split));
  const splitName = normalizeText(split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy);
  return splitAgentId === agentId || (!splitAgentId && splitName === agentName);
};

const buildFallbackSettlementEntries = (order: Order, agent: PaymentAgent): PaymentAgentLedgerEntry[] => {
  const matchedSplits = getOrderPaymentAgentSplits(order).filter((split) => splitBelongsToAgent(agent, split));
  return matchedSplits.flatMap((split) => {
    const orderPortionTotal = clamp(
      split.settlementSnapshot?.orderPortionTotal
      ?? split.assignedAmount
      ?? split.paidNow
      ?? (matchedSplits.length === 1 ? orderTotal(order) : 0),
    );
    const creditUsed = clamp(split.settlementSnapshot?.creditUsed ?? split.paidNow ?? 0);
    const remainingPayable = clamp(split.settlementSnapshot?.remainingPayable ?? Math.max(0, orderPortionTotal - creditUsed));
    if (orderPortionTotal <= 0 && creditUsed <= 0 && remainingPayable <= 0) {
      return [];
    }
    return [{
      id: `snapshot-${order.id}-${split.id}`,
      settlementEntryKey: `${order.id}:${split.id}`,
      sourcePaymentAgentSplitId: split.id,
      agentId: getPaymentAgentSplitAgentId(split) || agent.id,
      type: "order_settlement",
      sourceOrderId: order.id,
      sourceOrderNumber: order.number || order.orderNumber,
      amount: orderPortionTotal,
      creditUsed,
      payableAfterCredit: clamp(split.settlementSnapshot?.payableAfterCredit ?? remainingPayable),
      paidNow: clamp(split.settlementSnapshot?.paidNow ?? 0),
      remainingPayable,
      newCreditCreated: clamp(split.settlementSnapshot?.newCreditCreated ?? 0),
      resultingCreditBalance: clamp(split.settlementSnapshot?.resultingCreditBalance ?? 0),
      active: true,
      isReversed: false,
      createdAt: split.settlementSnapshot?.createdAt || split.createdAt || order.updatedAt || order.createdAt || order.date || new Date().toISOString(),
      updatedAt: split.settlementSnapshot?.updatedAt || split.updatedAt || order.updatedAt,
    }];
  });
};

export const isOrderMatchedToPaymentAgent = (order: Order, agent: PaymentAgent) => {
  const matchedSplits = getOrderPaymentAgentSplits(order).filter((split) => splitBelongsToAgent(agent, split));
  if (matchedSplits.length > 0) {
    return true;
  }
  const resolution = resolveOrderPaymentAgentMatch(order, [agent]);
  if (resolution.agent?.id === agent.id) {
    if (resolution.isLegacyNameFallback) {
      warnAccounting(
        `legacy-name-fallback:${order.id}:${agent.id}`,
        "Legacy payment-agent name fallback matched an order during accounting summary.",
        { orderId: order.id, paymentAgentId: agent.id, orderNumber: order.number || order.orderNumber || "" },
      );
    }
    return true;
  }
  if (resolution.matchType === "blocked" || !isPaymentAgentActive(agent)) return false;
  return false;
};

export const buildPaymentAgentAccountingSummary = (
  agent: PaymentAgent,
  orders: Order[],
  entries: PaymentAgentLedgerEntry[],
  customers: Customer[] = [],
): PaymentAgentAccountingSummary => {
  return measurePerfSync("calc", "paymentAgentAccounting.buildSummary", { agentId: agent.id, ordersCount: orders.length, entriesCount: entries.length }, () => {
  const matchedOrders = orders.filter((order) => isLiveAccountingOrder(order) && isOrderMatchedToPaymentAgent(order, agent));
  const matchedOrderIds = new Set(matchedOrders.map((order) => order.id));
  const matchedOrderNumbers = new Set(matchedOrders.map((order) => order.number || order.orderNumber).filter(Boolean));

  const matchedEntries = entries.filter((entry) => {
    const normalizedAgentId = normalizeText(entry.agentId);
    const byAgentId = Boolean(normalizedAgentId && normalizedAgentId === normalizeText(agent.id));
    const canUseLegacyOrderFallback = !normalizedAgentId;
    const byOrderId = canUseLegacyOrderFallback && Boolean(entry.sourceOrderId && matchedOrderIds.has(entry.sourceOrderId));
    const byOrderNumber = canUseLegacyOrderFallback && Boolean(entry.sourceOrderNumber && matchedOrderNumbers.has(entry.sourceOrderNumber));
    return byAgentId || byOrderId || byOrderNumber;
  });

  const activeSettlementSourceEntries = matchedEntries.filter((entry) => entry.type === "order_settlement" && isEntryActive(entry));
  const activeSettlementGroups = new Map<string, PaymentAgentLedgerEntry[]>();
  activeSettlementSourceEntries.forEach((entry) => {
    const key =
      entry.settlementEntryKey
      || (entry.sourceOrderId && entry.sourcePaymentAgentSplitId ? `${entry.sourceOrderId}:${entry.sourcePaymentAgentSplitId}` : "")
      || entry.sourceOrderId
      || entry.sourceOrderNumber
      || entry.id;
    const existing = activeSettlementGroups.get(key) ?? [];
    existing.push(entry);
    activeSettlementGroups.set(key, existing);
  });
  activeSettlementGroups.forEach((group, key) => {
    if (group.length > 1) {
      warnAccounting(
        `multiple-active-settlements:${agent.id}:${key}`,
        "Multiple active settlement entries exist for one order.",
        { paymentAgentId: agent.id, settlementKey: key, entryIds: group.map((entry) => entry.id) },
      );
    }
  });
  const activeSettlementEntries = pickLatestByKey(
    activeSettlementSourceEntries,
    (entry) =>
      entry.settlementEntryKey
      || (entry.sourceOrderId && entry.sourcePaymentAgentSplitId ? `${entry.sourceOrderId}:${entry.sourcePaymentAgentSplitId}` : "")
      || entry.sourceOrderId
      || entry.sourceOrderNumber
      || entry.id,
  );

  const settlementKeys = new Set(
    activeSettlementEntries.map((entry) =>
      entry.settlementEntryKey
      || (entry.sourceOrderId && entry.sourcePaymentAgentSplitId ? `${entry.sourceOrderId}:${entry.sourcePaymentAgentSplitId}` : "")
      || entry.sourceOrderId
      || entry.sourceOrderNumber
      || entry.id,
    ),
  );
  const fallbackSettlementEntries = matchedOrders
    .flatMap((order) => buildFallbackSettlementEntries(order, agent))
    .filter((entry) =>
      !settlementKeys.has(
        entry.settlementEntryKey
        || (entry.sourceOrderId && entry.sourcePaymentAgentSplitId ? `${entry.sourceOrderId}:${entry.sourcePaymentAgentSplitId}` : "")
        || entry.sourceOrderId
        || entry.sourceOrderNumber
        || entry.id,
      ),
    );

  const netSettlementEntries = [...activeSettlementEntries, ...fallbackSettlementEntries];
  const reversalEntries = pickLatestByKey(
    matchedEntries.filter((entry) => entry.type === "order_settlement_reversal" && isEntryActive(entry)),
    (entry) => entry.reversalOfId || entry.sourceOrderId || entry.sourceOrderNumber || entry.id,
  );
  const activePaymentEntries = pickLatestByKey(
    matchedEntries.filter((entry) => (entry.type === "agent_payment" || entry.type === "opening_credit") && isEntryActive(entry)),
    (entry) => entry.reversalOfId || entry.id,
  );

  const openingEntryTotal = activePaymentEntries
    .filter((entry) => entry.type === "opening_credit")
    .reduce((sum, entry) => sum + clamp(entry.amount), 0);
  const openingAdvanced = Math.max(clamp(agent.openingCreditBalance ?? 0), openingEntryTotal);
  const paymentCredits = activePaymentEntries.reduce((sum, entry) => {
    if (entry.type === "opening_credit") return sum;
    const directCredit = clamp(entry.creditCreated ?? Math.max(clamp(entry.amount) - clamp(entry.dueReduced ?? 0), 0));
    return sum + directCredit;
  }, 0);
  const totalAdvanced = openingAdvanced + paymentCredits;
  const totalUsed = netSettlementEntries.reduce((sum, entry) => sum + clamp(entry.creditUsed ?? 0), 0);
  const totalOrderAmount = netSettlementEntries.reduce((sum, entry) => sum + clamp(entry.amount), 0);
  const grossDue = netSettlementEntries.reduce((sum, entry) => sum + clamp(entry.remainingPayable ?? 0), 0);
  const paymentApplied = activePaymentEntries.reduce((sum, entry) => sum + clamp(entry.dueReduced ?? 0), 0);
  const duePending = Math.max(0, grossDue - paymentApplied);
  const paymentsMade = activePaymentEntries.filter((entry) => entry.type === "agent_payment").reduce((sum, entry) => sum + clamp(entry.amount), 0);
  const settlementPaidNowTotal = netSettlementEntries.reduce((sum, entry) => sum + clamp(entry.paidNow ?? 0), 0);
  const derivedTotalPaidAmount = settlementPaidNowTotal + paymentsMade;

  const creditLeft = Math.max(0, totalAdvanced - totalUsed);

  matchedOrders.forEach((order) => {
    const settlement = order.paymentAgentSettlementSnapshot;
    if (!settlement) return;
    const activeSettlement = activeSettlementEntries.find((entry) =>
      (entry.sourceOrderId && entry.sourceOrderId === order.id)
      || (entry.sourceOrderNumber && entry.sourceOrderNumber === (order.number || order.orderNumber))
    );
    if (!activeSettlement) return;
    const snapshotMismatch =
      clamp(settlement.orderTotal || orderTotal(order)) !== clamp(activeSettlement.amount)
      || clamp(settlement.creditUsed || 0) !== clamp(activeSettlement.creditUsed ?? 0)
      || clamp(settlement.paidNow || 0) !== clamp(activeSettlement.paidNow ?? 0)
      || clamp(settlement.remainingPayable || 0) !== clamp(activeSettlement.remainingPayable ?? 0)
      || clamp(settlement.newCreditCreated || 0) !== clamp(activeSettlement.newCreditCreated ?? 0)
      || clamp(settlement.resultingCreditBalance || 0) !== clamp(activeSettlement.resultingCreditBalance ?? 0);
    if (snapshotMismatch) {
      warnAccounting(
        `snapshot-drift:${agent.id}:${order.id}`,
        "Order payment-agent settlement snapshot differs from the latest active settlement entry.",
        { paymentAgentId: agent.id, orderId: order.id, settlementEntryId: activeSettlement.id },
      );
    }
  });

  if (
    clamp(agent.creditBalance ?? 0) !== clamp(creditLeft)
    || clamp(agent.currentDuePayable ?? 0) !== clamp(duePending)
    || clamp(agent.totalOrderAmount ?? 0) !== clamp(totalOrderAmount)
    || clamp(agent.totalPaidAmount ?? 0) !== clamp(derivedTotalPaidAmount)
  ) {
    warnAccounting(
      `aggregate-drift:${agent.id}`,
      "Payment-agent aggregate fields differ from ledger-derived totals.",
      {
        paymentAgentId: agent.id,
        aggregate: {
          creditBalance: clamp(agent.creditBalance ?? 0),
          currentDuePayable: clamp(agent.currentDuePayable ?? 0),
          totalOrderAmount: clamp(agent.totalOrderAmount ?? 0),
          totalPaidAmount: clamp(agent.totalPaidAmount ?? 0),
        },
        derived: {
          creditLeft: clamp(creditLeft),
          duePending: clamp(duePending),
          totalOrderAmount: clamp(totalOrderAmount),
          totalPaidAmount: clamp(derivedTotalPaidAmount),
        },
      },
    );
  }

  return {
    agent,
    customers,
    matchedOrders,
    matchedEntries,
    activeSettlementEntries: netSettlementEntries,
    activePaymentEntries,
    reversalEntries,
    totalAdvanced,
    totalUsed,
    creditLeft,
    duePending,
    paymentsMade,
    totalOrders: matchedOrders.length,
    totalOrderAmount,
    paymentApplied,
  };
  });
};

export const buildPaymentAgentTransactionRows = (summary: PaymentAgentAccountingSummary): PaymentAgentAccountingTransactionRow[] => {
  const orderById = new Map(summary.matchedOrders.map((order) => [order.id, order]));
  const rows: Array<PaymentAgentAccountingTransactionRow & { creditDelta: number }> = [];
  const openingAdvanced = Math.max(clamp(summary.agent.openingCreditBalance ?? 0), 0);

  summary.activeSettlementEntries.forEach((entry) => {
    const linkedOrder = orderById.get(entry.sourceOrderId || "") || null;
    const orderNumber = entry.sourceOrderNumber || linkedOrder?.number || linkedOrder?.orderNumber || "—";
    const customer = getOrderCustomerSummary(linkedOrder, summary.customers);
    if (clamp(entry.creditUsed ?? 0) > 0) {
      rows.push({
        id: `${entry.id}-usage`,
        date: entryTime(entry),
        orderNumber,
        customer,
        type: "Credit Used For Order",
        amount: clamp(entry.creditUsed ?? 0),
        notes: `Credit used for order ${orderNumber}`,
        runningCreditLeft: 0,
        creditDelta: -clamp(entry.creditUsed ?? 0),
        createdSortAt: entry.createdAt || entry.updatedAt || entryTime(entry),
      });
    }
    if (clamp(entry.remainingPayable ?? 0) > 0) {
      rows.push({
        id: `${entry.id}-due`,
        date: entryTime(entry),
        orderNumber,
        customer,
        type: "Pending Order Amount",
        amount: clamp(entry.remainingPayable ?? 0),
        notes: `Pending amount after credit/payment for order ${orderNumber}`,
        runningCreditLeft: 0,
        creditDelta: 0,
        createdSortAt: entry.createdAt || entry.updatedAt || entryTime(entry),
      });
    }
    if (clamp(entry.newCreditCreated ?? 0) > 0) {
      rows.push({
        id: `${entry.id}-adjustment`,
        date: entryTime(entry),
        orderNumber,
        customer,
        type: "Balance Adjustment",
        amount: clamp(entry.newCreditCreated ?? 0),
        notes: `Order created additional advance balance for ${orderNumber}`,
        runningCreditLeft: 0,
        creditDelta: clamp(entry.newCreditCreated ?? 0),
        createdSortAt: entry.createdAt || entry.updatedAt || entryTime(entry),
      });
    }
  });

  summary.reversalEntries.forEach((entry) => {
    const linkedOrder = orderById.get(entry.sourceOrderId || "") || null;
    rows.push({
      id: entry.id,
      date: entryTime(entry),
      orderNumber: entry.sourceOrderNumber || linkedOrder?.number || linkedOrder?.orderNumber || "—",
      customer: getOrderCustomerSummary(linkedOrder, summary.customers),
      type: "Credit Returned",
      amount: clamp(entry.creditUsed ?? entry.amount),
      notes: entry.note?.trim() || "Reversal of previous settlement",
      runningCreditLeft: 0,
      creditDelta: clamp(entry.creditUsed ?? 0) - clamp(entry.newCreditCreated ?? 0),
      createdSortAt: entry.createdAt || entry.updatedAt || entryTime(entry),
    });
  });

  const ordered = [...rows].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  let runningCredit = openingAdvanced;
  ordered.forEach((row) => {
    runningCredit = Math.max(0, runningCredit + row.creditDelta);
    row.runningCreditLeft = runningCredit;
  });

  return ordered
    .sort((left, right) => createdSortTime(right.createdSortAt) - createdSortTime(left.createdSortAt) || sortableTime(right.date) - sortableTime(left.date) || right.id.localeCompare(left.id))
    .map(({ creditDelta: _creditDelta, ...row }) => row);
};

export const buildPaymentAgentOrderRows = (summary: PaymentAgentAccountingSummary): PaymentAgentOrderRow[] => {
  return summary.matchedOrders
    .flatMap((order) =>
      (order.lines || []).map((line, index) => ({
        id: `${order.id}-${line.id || index}`,
        orderId: order.id,
        orderNumber: order.number || order.orderNumber || "—",
        orderDate: order.date || order.createdAt || order.updatedAt || "",
        productImage: line.productPhotoUrl || line.photoUrl || "",
        marka: line.marka?.trim() || "—",
        details: [line.detail1, line.detail2, line.detail3].filter(Boolean).join(" ").trim() || line.details?.trim() || "—",
        totalCtns: Number(line.totalCtns) || 0,
        pcsPerCtn: Number(line.pcsPerCtn) || 0,
        totalPcs: (Number(line.totalCtns) || 0) * (Number(line.pcsPerCtn) || 0),
        rate: Number(line.rmbPerPcs) || 0,
        amount: (Number(line.totalCtns) || 0) * (Number(line.pcsPerCtn) || 0) * (Number(line.rmbPerPcs) || 0),
        customer: getLineCustomerDisplay(line, summary.customers),
        loadingDate: order.loadingDate || "",
      })),
    )
    .sort((left, right) => {
      const dateDiff = (right.orderDate || "").localeCompare(left.orderDate || "");
      if (dateDiff !== 0) return dateDiff;
      return right.orderNumber.localeCompare(left.orderNumber, undefined, { numeric: true, sensitivity: "base" });
    });
};

type CreditEvent = {
  id: string;
  date: string;
  delta: number;
  kind: "opening" | "payment" | "usage" | "reversal" | "adjustment";
};

export const buildPaymentAgentPaymentRows = (summary: PaymentAgentAccountingSummary): PaymentAgentAccountingPaymentRow[] => {
  const events: CreditEvent[] = [];
  const openingAdvanced = clamp(summary.agent.openingCreditBalance ?? 0);
  if (openingAdvanced > 0) {
    events.push({
      id: `opening-${summary.agent.id}`,
      date: summary.agent.createdAt || summary.agent.updatedAt || "",
      delta: openingAdvanced,
      kind: "opening",
    });
  }

  summary.activePaymentEntries.forEach((entry) => {
    const creditCreated = entry.type === "opening_credit" ? clamp(entry.amount) : clamp(entry.creditCreated ?? Math.max(clamp(entry.amount) - clamp(entry.dueReduced ?? 0), 0));
    events.push({ id: `payment-${entry.id}`, date: entryTime(entry), delta: creditCreated, kind: "payment" });
  });

  summary.activeSettlementEntries.forEach((entry) => {
    const creditUsed = clamp(entry.creditUsed ?? 0);
    const newCreditCreated = clamp(entry.newCreditCreated ?? 0);
    if (creditUsed > 0) events.push({ id: `usage-${entry.id}`, date: entryTime(entry), delta: -creditUsed, kind: "usage" });
    if (newCreditCreated > 0) events.push({ id: `adjustment-${entry.id}`, date: entryTime(entry), delta: newCreditCreated, kind: "adjustment" });
  });

  summary.reversalEntries.forEach((entry) => {
    const creditRestored = clamp(entry.creditUsed ?? 0) - clamp(entry.newCreditCreated ?? 0);
    if (creditRestored !== 0) events.push({ id: `reversal-${entry.id}`, date: entryTime(entry), delta: creditRestored, kind: "reversal" });
  });

  const runningBalanceByPaymentId = new Map<string, number>();
  let openingRunningCredit = 0;
  let runningCredit = 0;
  [...events]
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .forEach((event) => {
      runningCredit = Math.max(0, runningCredit + event.delta);
      if (event.kind === "opening") {
        openingRunningCredit = runningCredit;
      }
      if (event.kind === "payment") {
        const paymentId = event.id.replace(/^payment-/, "");
        runningBalanceByPaymentId.set(paymentId, runningCredit);
      }
    });

  const rows: PaymentAgentAccountingPaymentRow[] = [];

  if (openingAdvanced > 0) {
    rows.push({
      id: `opening-${summary.agent.id}`,
      date: summary.agent.createdAt || summary.agent.updatedAt || "",
      amount: openingAdvanced,
      method: "Opening Balance",
      notes: "Opening advance balance",
      runningCreditLeft: openingRunningCredit || openingAdvanced,
      canDelete: false,
      createdSortAt: summary.agent.createdAt || summary.agent.updatedAt || "",
    });
  }

  summary.activePaymentEntries
    .filter((entry) => entry.type === "agent_payment")
    .forEach((entry) => {
      rows.push({
        id: entry.id,
        date: entry.paymentDate || entry.createdAt || "",
        amount: clamp(entry.amount),
        method: entry.paymentMethod?.trim() || "—",
        notes: entry.note?.trim() || "—",
        runningCreditLeft: runningBalanceByPaymentId.get(entry.id) ?? summary.creditLeft,
        canDelete: true,
        createdSortAt: entry.createdAt || entry.updatedAt || entry.paymentDate || "",
      });
    });

  return rows.sort((left, right) => createdSortTime(right.createdSortAt) - createdSortTime(left.createdSortAt) || sortableTime(right.date) - sortableTime(left.date) || right.id.localeCompare(left.id));
};
