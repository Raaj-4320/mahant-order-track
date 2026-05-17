import type { Customer, CustomerLedgerEntry } from "@/lib/types";

export function buildCustomerSummaryFromLedger(customer: Customer, ledgerEntries: CustomerLedgerEntry[]) {
  const active = [...ledgerEntries].filter((e) => e.active !== false).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  let totalReceivableGenerated = 0;
  let totalReceived = 0;
  const sourceOrderIds = new Set<string>();

  for (const e of active) {
    if (e.type === "order_receivable") {
      totalReceivableGenerated += e.amount || 0;
      if (e.sourceOrderId) sourceOrderIds.add(e.sourceOrderId);
    } else if (e.type === "order_receivable_reversal") {
      totalReceivableGenerated -= e.amount || 0;
    } else if (e.type === "customer_payment") {
      totalReceived += e.amount || 0;
    } else if (e.type === "customer_payment_reversal") {
      totalReceived -= e.amount || 0;
    }
  }

  totalReceivableGenerated = Math.max(0, totalReceivableGenerated);
  totalReceived = Math.max(0, totalReceived);
  const currentReceivable = Math.max(0, totalReceivableGenerated - totalReceived);
  const storeCreditBalance = Math.max(0, totalReceived - totalReceivableGenerated);
  const totalOrders = sourceOrderIds.size;

  return {
    totalReceivableGenerated,
    totalReceived,
    currentReceivable,
    storeCreditBalance,
    totalOrders,
    sourceOrderIds: Array.from(sourceOrderIds),
    outstandingAmount: currentReceivable,
    totalSpent: totalReceivableGenerated,
  };
}
