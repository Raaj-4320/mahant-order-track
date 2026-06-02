import { orderTotal, type Order, type PaymentAgent } from "@/lib/types";

const normalizeName = (value?: string) => (value || "").trim().toLowerCase();

const isCreditConsumingOrder = (order: Order) => {
  if (order.status === "packed" || order.status === "received" || order.status === "delayed") {
    return Boolean((order.loadingDate || "").trim());
  }
  return false;
};

const isOrderForPaymentAgent = (order: Order, agent: PaymentAgent) => {
  const agentName = normalizeName(agent.name);
  const byId =
    (order.paymentAgentId && order.paymentAgentId === agent.id) ||
    (order.paymentAgentSnapshot?.id && order.paymentAgentSnapshot.id === agent.id);
  const byName =
    normalizeName(order.paymentAgentSnapshot?.name) === agentName ||
    normalizeName((order as any).paymentByName) === agentName ||
    normalizeName((order as any).paymentAgentName) === agentName ||
    normalizeName(order.paymentBy) === agentName;
  return Boolean(byId || byName);
};

export function getPaymentAgentFinanceSummary(agents: PaymentAgent[], orders: Order[]) {
  return agents.map((agent) => {
    const own = orders.filter((order) => isOrderForPaymentAgent(order, agent));
    const included = own.filter((order) => isCreditConsumingOrder(order));
    const totalOrderAmount = included.reduce((sum, order) => sum + orderTotal(order), 0);
    const totalPaidAmount = included.reduce((sum, order) => sum + Number(order.paidToPaymentAgentNow ?? 0), 0);
    const totalPayableAmount = included.reduce((sum, order) => sum + Number((order as any).paymentAgentSettlementSnapshot?.payableAfterCredit ?? orderTotal(order)), 0);
    const currentDueFromSnapshot = included.reduce((sum, order) => sum + Number((order as any).paymentAgentSettlementSnapshot?.remainingPayable ?? 0), 0);
    const currentDuePayable = currentDueFromSnapshot > 0 ? currentDueFromSnapshot : Math.max(0, totalOrderAmount - totalPaidAmount);
    const currentCredit = agent.creditBalance ?? agent.openingCreditBalance ?? 0;
    return { agent, orders: included, totalOrders: included.length, totalOrderAmount, totalPaidAmount, totalPayableAmount, currentDuePayable, currentCredit };
  });
}
