import type { Customer, Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { isOrderMatchedToPaymentAgent } from "@/services/settlement/paymentAgentAccounting";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

export function getPaymentAgentFinanceSummary(agents: PaymentAgent[], orders: Order[], entries: PaymentAgentLedgerEntry[] = [], customers: Customer[] = []) {
  return agents.map((agent) => {
    const matchedOrders = orders.filter((order) => order.status !== "archived" && isOrderMatchedToPaymentAgent(order, agent));
    const finance = getPaymentAgentDirectFinance(agent);
    return {
      agent,
      orders: matchedOrders,
      totalOrders: finance.totalOrders,
      totalOrderAmount: Math.max(0, Number(agent.totalOrderAmount) || 0),
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
