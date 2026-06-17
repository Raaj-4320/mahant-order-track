import { orderTotal, type Customer, type Order, type PaymentAgent, type PaymentAgentLedgerEntry } from "@/lib/types";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";

const clamp = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const normalize = (value?: string | null) => (value || "").trim().toLowerCase();
const entryTime = (entry: PaymentAgentLedgerEntry) => entry.paymentDate || entry.updatedAt || entry.createdAt || "";

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
};

export type PaymentAgentAccountingPaymentRow = {
  id: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  runningCreditLeft: number;
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

const createFallbackSettlementEntry = (order: Order, agent: PaymentAgent): PaymentAgentLedgerEntry | null => {
  const settlement = order.paymentAgentSettlementSnapshot;
  if (!settlement) return null;
  return {
    id: `snapshot-${order.id}`,
    agentId: order.paymentAgentId || order.paymentBy || agent.id,
    type: "order_settlement",
    sourceOrderId: order.id,
    sourceOrderNumber: order.number || order.orderNumber,
    amount: clamp(settlement.orderTotal || orderTotal(order)),
    creditUsed: clamp(settlement.creditUsed || 0),
    payableAfterCredit: clamp(settlement.payableAfterCredit || 0),
    paidNow: clamp(settlement.paidNow || 0),
    remainingPayable: clamp(settlement.remainingPayable || 0),
    newCreditCreated: clamp(settlement.newCreditCreated || 0),
    resultingCreditBalance: clamp(settlement.resultingCreditBalance || 0),
    active: true,
    isReversed: false,
    createdAt: settlement.createdAt || order.updatedAt || order.createdAt || order.date || new Date().toISOString(),
    updatedAt: settlement.updatedAt || order.updatedAt,
  };
};

const getOrderCustomerSummary = (order?: Order | null, customers: Customer[] = []) => {
  if (!order) return "—";
  const names = Array.from(new Set((order.lines || []).map((line) => getLineCustomerDisplay(line, customers)).filter(Boolean)));
  return names.length > 0 ? names.join(", ") : "—";
};

export const isOrderMatchedToPaymentAgent = (order: Order, agent: PaymentAgent) => {
  const agentName = normalize(agent.name);
  const references = [
    order.paymentAgentId,
    order.paymentAgentSnapshot?.id,
    order.paymentBy,
    order.paymentAgentSnapshot?.name,
    (order as Order & { paymentByName?: string }).paymentByName,
    (order as Order & { paymentAgentName?: string }).paymentAgentName,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim());
  return references.includes(agent.id) || references.some((value) => normalize(value) === agentName);
};

export const buildPaymentAgentAccountingSummary = (
  agent: PaymentAgent,
  orders: Order[],
  entries: PaymentAgentLedgerEntry[],
  customers: Customer[] = [],
): PaymentAgentAccountingSummary => {
  const matchedOrders = orders.filter((order) => order.status !== "archived" && isOrderMatchedToPaymentAgent(order, agent));
  const matchedOrderIds = new Set(matchedOrders.map((order) => order.id));
  const matchedOrderNumbers = new Set(matchedOrders.map((order) => order.number || order.orderNumber).filter(Boolean));

  const matchedEntries = entries.filter((entry) => {
    const byAgentId = Boolean(entry.agentId && entry.agentId === agent.id);
    const byOrderId = Boolean(entry.sourceOrderId && matchedOrderIds.has(entry.sourceOrderId));
    const byOrderNumber = Boolean(entry.sourceOrderNumber && matchedOrderNumbers.has(entry.sourceOrderNumber));
    return byAgentId || byOrderId || byOrderNumber;
  });

  const activeSettlementEntries = pickLatestByKey(
    matchedEntries.filter((entry) => entry.type === "order_settlement" && isEntryActive(entry)),
    (entry) => entry.sourceOrderId || entry.sourceOrderNumber || entry.id,
  );

  const settlementKeys = new Set(activeSettlementEntries.map((entry) => entry.sourceOrderId || entry.sourceOrderNumber || entry.id));
  const fallbackSettlementEntries = matchedOrders
    .map((order) => createFallbackSettlementEntry(order, agent))
    .filter((entry): entry is PaymentAgentLedgerEntry => Boolean(entry))
    .filter((entry) => !settlementKeys.has(entry.sourceOrderId || entry.sourceOrderNumber || entry.id));

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

  const legacyCreditFallback =
    totalAdvanced === 0 && totalUsed === 0 && duePending === 0 && paymentApplied === 0
      ? clamp(agent.creditBalance ?? 0)
      : 0;
  const creditLeft = legacyCreditFallback > 0 ? legacyCreditFallback : Math.max(0, totalAdvanced - totalUsed);

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
    });
  });

  const ordered = [...rows].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  let runningCredit = openingAdvanced;
  ordered.forEach((row) => {
    runningCredit = Math.max(0, runningCredit + row.creditDelta);
    row.runningCreditLeft = runningCredit;
  });

  return ordered
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
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
  let runningCredit = 0;
  [...events]
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .forEach((event) => {
      runningCredit = Math.max(0, runningCredit + event.delta);
      if (event.kind === "payment") {
        const paymentId = event.id.replace(/^payment-/, "");
        runningBalanceByPaymentId.set(paymentId, runningCredit);
      }
    });

  return summary.activePaymentEntries
    .filter((entry) => entry.type === "agent_payment")
    .map((entry) => ({
      id: entry.id,
      date: entry.paymentDate || entry.createdAt || "",
      amount: clamp(entry.amount),
      method: entry.paymentMethod?.trim() || "—",
      notes: entry.note?.trim() || "—",
      runningCreditLeft: runningBalanceByPaymentId.get(entry.id) ?? summary.creditLeft,
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
};
