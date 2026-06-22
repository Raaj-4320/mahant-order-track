import type { Customer, Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { buildPaymentAgentAccountingSummary } from "@/services/settlement/paymentAgentAccounting";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

export function getPaymentAgentFinanceSummary(agents: PaymentAgent[], orders: Order[], entries: PaymentAgentLedgerEntry[] = [], customers: Customer[] = []) {
  return agents.map((agent) => {
    const summary = buildPaymentAgentAccountingSummary(agent, orders, entries, customers);
    const finance = getPaymentAgentDirectFinance(agent);
    return {
      agent,
      orders: summary.matchedOrders,
      totalOrders: finance.totalOrders,
      totalOrderAmount: summary.totalOrderAmount,
      totalPaidAmount: finance.paymentsMade,
      totalPayableAmount: finance.totalPayable,
      currentDuePayable: finance.duePending,
      currentCredit: finance.creditLeft,
      totalAdvanced: finance.totalAdvanced,
      totalUsed: finance.totalUsed,
      paymentsMade: finance.paymentsMade,
    };
  });
}
