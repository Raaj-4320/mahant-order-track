import type { Order, PaymentAgent } from "@/lib/types";

export const PAYMENT_AGENT_NOT_SET = "Not Set";

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();

export function resolveOrderPaymentAgent(order: Order | (Partial<Order> & { paymentByName?: string; paymentAgentName?: string }), paymentAgents: PaymentAgent[] = []) {
  const paymentAgentId = typeof order.paymentAgentId === "string" ? order.paymentAgentId.trim() : "";
  const paymentBy = typeof order.paymentBy === "string" ? order.paymentBy.trim() : "";
  const paymentAgentSnapshotId = typeof order.paymentAgentSnapshot?.id === "string" ? order.paymentAgentSnapshot.id.trim() : "";
  const paymentAgentSnapshotName = typeof order.paymentAgentSnapshot?.name === "string" ? order.paymentAgentSnapshot.name.trim() : "";
  const paymentByName = typeof (order as any).paymentByName === "string" ? (order as any).paymentByName.trim() : "";
  const paymentAgentName = typeof (order as any).paymentAgentName === "string" ? (order as any).paymentAgentName.trim() : "";

  const references = [paymentAgentId, paymentBy, paymentAgentSnapshotId, paymentAgentSnapshotName, paymentByName, paymentAgentName].filter(Boolean);
  const normalizedReferences = references.map((value) => normalizeValue(value));

  return paymentAgents.find((agent) => {
    const agentId = agent.id.trim();
    const agentCode = (agent.agentCode || "").trim();
    const agentName = agent.name.trim();
    const normalizedAgentName = normalizeValue(agentName);

    return (
      references.includes(agentId) ||
      (agentCode && references.includes(agentCode)) ||
      normalizedReferences.includes(normalizedAgentName)
    );
  }) ?? null;
}

export function getOrderPaymentAgentDisplay(order: Order, paymentAgents: PaymentAgent[] = []) {
  const matchedAgent = resolveOrderPaymentAgent(order, paymentAgents);
  const resolved =
    matchedAgent?.name ||
    order.paymentAgentSnapshot?.name ||
    (order as any).paymentByName ||
    (order as any).paymentAgentName ||
    (typeof order.paymentBy === "string" ? order.paymentBy.trim() : "") ||
    "";
  const value = resolved || PAYMENT_AGENT_NOT_SET;
  return { value, isMissing: !resolved };
}
