import type { Order, PaymentAgent } from "@/lib/types";

export const PAYMENT_AGENT_NOT_SET = "Not Set";

export function getOrderPaymentAgentDisplay(order: Order, paymentAgents: PaymentAgent[] = []) {
  const resolved =
    paymentAgents.find((p) => p.id === (order.paymentAgentId || order.paymentBy) || p.id === order.paymentBy)?.name ||
    order.paymentAgentSnapshot?.name ||
    (order as any).paymentByName ||
    (typeof order.paymentBy === "string" ? order.paymentBy.trim() : "") ||
    "";
  const value = resolved || PAYMENT_AGENT_NOT_SET;
  return { value, isMissing: !resolved };
}
