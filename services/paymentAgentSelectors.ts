import type { Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { buildPaymentAgentAccountingSummary } from "@/services/settlement/paymentAgentAccounting";

export function getPaymentAgentFinanceSummary(agents: PaymentAgent[], orders: Order[], entries: PaymentAgentLedgerEntry[] = []) {
  return agents.map((agent) => {
    const summary = buildPaymentAgentAccountingSummary(agent, orders, entries);
    return {
      agent,
      orders: summary.matchedOrders,
      totalOrders: summary.totalOrders,
      totalOrderAmount: summary.totalOrderAmount,
      totalPaidAmount: summary.paymentsMade,
      totalPayableAmount: Math.max(0, summary.totalOrderAmount - summary.totalUsed),
      currentDuePayable: summary.duePending,
      currentCredit: summary.creditLeft,
      totalAdvanced: summary.totalAdvanced,
      totalUsed: summary.totalUsed,
      paymentsMade: summary.paymentsMade,
    };
  });
}
