import { orderTotal, type Order, type PaymentAgent } from "@/lib/types";

export function getPaymentAgentFinanceSummary(agents: PaymentAgent[], orders: Order[]) {
  return agents.map((agent) => {
    const own = orders.filter((o) => (o.paymentAgentId || o.paymentBy) === agent.id);
    const totalOrderAmount = own.reduce((s, o) => s + orderTotal(o), 0);
    const totalPaidAmount = own.reduce((s, o) => s + (o.paidToPaymentAgentNow ?? 0), 0);
    const totalPayableAmount = own.reduce((s, o) => s + ((o as any).paymentAgentSettlementSnapshot?.payableAfterCredit ?? 0), 0);
    const currentDuePayable = own.reduce((s, o) => s + ((o as any).paymentAgentSettlementSnapshot?.remainingPayable ?? 0), 0);
    return { agent, orders: own, totalOrders: own.length, totalOrderAmount, totalPaidAmount, totalPayableAmount, currentDuePayable, currentCredit: agent.creditBalance ?? agent.openingCreditBalance ?? 0 };
  });
}
