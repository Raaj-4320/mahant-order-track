import type { Order, PaymentAgent } from "@/lib/types";
import { formatPaymentAgentSplitsDisplay, hasRealPaymentAgentSplits } from "@/services/settlement/paymentAgentSplits";

export const PAYMENT_AGENT_NOT_LINKED = "Not Linked";
export const PAYMENT_AGENT_DELETED = "Deleted Payment Agent";
export const PAYMENT_AGENT_INVALID = "Invalid Payment Agent Reference";
export const PAYMENT_AGENT_UNKNOWN = "Unknown Payment Agent";

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();
const PAYMENT_AGENT_RESOLUTION_AUDIT_ENABLED = process.env.NODE_ENV !== "production";
const warnedPaymentAgentResolutionKeys = new Set<string>();

export type PaymentAgentResolutionMatchType =
  | "paymentAgentId"
  | "paymentAgentSnapshotId"
  | "paymentById"
  | "nameFallback"
  | "none"
  | "blocked";

export type PaymentAgentResolution = {
  agent: PaymentAgent | null;
  matchType: PaymentAgentResolutionMatchType;
  isLegacyNameFallback: boolean;
  blockedReason?: "missing_id" | "inactive_id" | "inactive_name_fallback";
  blockedReference?: string;
};

export const isPaymentAgentActive = (agent: PaymentAgent | null | undefined) =>
  Boolean(agent && agent.status !== "inactive" && agent.lifecycle?.status !== "deleted");

const warnPaymentAgentResolution = (key: string, message: string, meta: Record<string, unknown>) => {
  if (!PAYMENT_AGENT_RESOLUTION_AUDIT_ENABLED) return;
  if (warnedPaymentAgentResolutionKeys.has(key)) return;
  warnedPaymentAgentResolutionKeys.add(key);
  console.warn(`[PaymentAgent Audit] ${message}`, meta);
};

const getOrderResolverDebugId = (order: Partial<Order>) =>
  (typeof order.id === "string" && order.id.trim()) ||
  (typeof order.orderNumber === "string" && order.orderNumber.trim()) ||
  (typeof order.number === "string" && order.number.trim()) ||
  "unknown-order";

const getOrderPaymentAgentFallbackNames = (
  order: Order | (Partial<Order> & { paymentByName?: string; paymentAgentName?: string }),
) => {
  const paymentBy = typeof order.paymentBy === "string" ? order.paymentBy.trim() : "";
  const snapshotName = typeof order.paymentAgentSnapshot?.name === "string" ? order.paymentAgentSnapshot.name.trim() : "";
  const paymentByName = typeof (order as { paymentByName?: string }).paymentByName === "string" ? (order as { paymentByName?: string }).paymentByName!.trim() : "";
  const paymentAgentName = typeof (order as { paymentAgentName?: string }).paymentAgentName === "string" ? (order as { paymentAgentName?: string }).paymentAgentName!.trim() : "";
  return [paymentBy, snapshotName, paymentByName, paymentAgentName].filter(Boolean);
};

const resolveNameFallback = (
  order: Order | (Partial<Order> & { paymentByName?: string; paymentAgentName?: string }),
  paymentAgents: PaymentAgent[],
  debugOrderId: string,
): PaymentAgentResolution => {
  const rawNames = getOrderPaymentAgentFallbackNames(order);
  if (rawNames.length === 0) {
    return { agent: null, matchType: "none", isLegacyNameFallback: false };
  }

  const normalizedNames = rawNames.map((value) => normalizeValue(value));
  const activeMatch = paymentAgents.find((agent) => isPaymentAgentActive(agent) && normalizedNames.includes(normalizeValue(agent.name)));
  if (activeMatch) {
    warnPaymentAgentResolution(
      `legacy-name-fallback:${debugOrderId}:${activeMatch.id}`,
      "Legacy payment-agent name fallback matched an active agent.",
      { orderId: debugOrderId, paymentAgentId: activeMatch.id, candidateNames: rawNames },
    );
    return { agent: activeMatch, matchType: "nameFallback", isLegacyNameFallback: true };
  }

  const inactiveMatch = paymentAgents.find((agent) => !isPaymentAgentActive(agent) && normalizedNames.includes(normalizeValue(agent.name)));
  if (inactiveMatch) {
    warnPaymentAgentResolution(
      `inactive-name-fallback-blocked:${debugOrderId}:${inactiveMatch.id}`,
      "Payment-agent name fallback matched an archived/deleted agent and was blocked.",
      { orderId: debugOrderId, paymentAgentId: inactiveMatch.id, candidateNames: rawNames },
    );
    return {
      agent: null,
      matchType: "blocked",
      isLegacyNameFallback: false,
      blockedReason: "inactive_name_fallback",
      blockedReference: inactiveMatch.id,
    };
  }

  return { agent: null, matchType: "none", isLegacyNameFallback: false };
};

export function resolveOrderPaymentAgentMatch(
  order: Order | (Partial<Order> & { paymentByName?: string; paymentAgentName?: string }),
  paymentAgents: PaymentAgent[] = [],
): PaymentAgentResolution {
  const paymentAgentId = typeof order.paymentAgentId === "string" ? order.paymentAgentId.trim() : "";
  const paymentBy = typeof order.paymentBy === "string" ? order.paymentBy.trim() : "";
  const snapshotId = typeof order.paymentAgentSnapshot?.id === "string" ? order.paymentAgentSnapshot.id.trim() : "";
  const debugOrderId = getOrderResolverDebugId(order);

  if (paymentAgentId) {
    const directMatch = paymentAgents.find((agent) => agent.id.trim() === paymentAgentId) ?? null;
    if (directMatch && isPaymentAgentActive(directMatch)) {
      return { agent: directMatch, matchType: "paymentAgentId", isLegacyNameFallback: false };
    }
    const activeNameCandidate = paymentAgents.find((agent) => isPaymentAgentActive(agent) && getOrderPaymentAgentFallbackNames(order).map(normalizeValue).includes(normalizeValue(agent.name))) ?? null;

    warnPaymentAgentResolution(
      `paymentAgentId-blocked:${debugOrderId}:${paymentAgentId}`,
      "Order has paymentAgentId, but the linked agent is missing or inactive. Name fallback was blocked.",
      { orderId: debugOrderId, paymentAgentId, foundAgent: directMatch?.id || null, status: directMatch?.status || null, lifecycleStatus: directMatch?.lifecycle?.status || null, blockedNameFallbackAgentId: activeNameCandidate?.id || null },
    );
    return {
      agent: null,
      matchType: "blocked",
      isLegacyNameFallback: false,
      blockedReason: directMatch ? "inactive_id" : "missing_id",
      blockedReference: paymentAgentId,
    };
  }

  if (snapshotId) {
    const snapshotMatch = paymentAgents.find((agent) => agent.id.trim() === snapshotId) ?? null;
    if (snapshotMatch && isPaymentAgentActive(snapshotMatch)) {
      return { agent: snapshotMatch, matchType: "paymentAgentSnapshotId", isLegacyNameFallback: false };
    }
    const activeNameCandidate = paymentAgents.find((agent) => isPaymentAgentActive(agent) && getOrderPaymentAgentFallbackNames(order).map(normalizeValue).includes(normalizeValue(agent.name))) ?? null;

    warnPaymentAgentResolution(
      `paymentAgentSnapshotId-blocked:${debugOrderId}:${snapshotId}`,
      "Order has paymentAgentSnapshot.id, but the linked agent is missing or inactive. Name fallback was blocked.",
      { orderId: debugOrderId, paymentAgentSnapshotId: snapshotId, foundAgent: snapshotMatch?.id || null, status: snapshotMatch?.status || null, lifecycleStatus: snapshotMatch?.lifecycle?.status || null, blockedNameFallbackAgentId: activeNameCandidate?.id || null },
    );
    return {
      agent: null,
      matchType: "blocked",
      isLegacyNameFallback: false,
      blockedReason: snapshotMatch ? "inactive_id" : "missing_id",
      blockedReference: snapshotId,
    };
  }

  if (paymentBy) {
    const paymentByIdMatch = paymentAgents.find((agent) => agent.id.trim() === paymentBy) ?? null;
    if (paymentByIdMatch) {
      if (isPaymentAgentActive(paymentByIdMatch)) {
        return { agent: paymentByIdMatch, matchType: "paymentById", isLegacyNameFallback: false };
      }
      warnPaymentAgentResolution(
        `paymentById-blocked:${debugOrderId}:${paymentBy}`,
        "Legacy paymentBy id points to an inactive agent. Name fallback was blocked.",
        { orderId: debugOrderId, paymentBy, foundAgent: paymentByIdMatch.id, status: paymentByIdMatch.status, lifecycleStatus: paymentByIdMatch.lifecycle?.status || null },
      );
      return {
        agent: null,
        matchType: "blocked",
        isLegacyNameFallback: false,
        blockedReason: "inactive_id",
        blockedReference: paymentBy,
      };
    }
  }

  return resolveNameFallback(order, paymentAgents, debugOrderId);
}

export function resolveOrderPaymentAgent(order: Order | (Partial<Order> & { paymentByName?: string; paymentAgentName?: string }), paymentAgents: PaymentAgent[] = []) {
  return resolveOrderPaymentAgentMatch(order, paymentAgents).agent;
}

export function getOrderPaymentAgentDisplay(order: Order, paymentAgents: PaymentAgent[] = []) {
  const resolution = resolveOrderPaymentAgentMatch(order, paymentAgents);
  const matchedAgent = resolution.agent;
  if (matchedAgent?.name) return { value: matchedAgent.name, isMissing: false };

  const paymentAgentId = typeof order.paymentAgentId === "string" ? order.paymentAgentId.trim() : "";
  const snapshotId = typeof order.paymentAgentSnapshot?.id === "string" ? order.paymentAgentSnapshot.id.trim() : "";
  const snapshotName = typeof order.paymentAgentSnapshot?.name === "string" ? order.paymentAgentSnapshot.name.trim() : "";
  const paymentByName = typeof (order as any).paymentByName === "string" ? (order as any).paymentByName.trim() : "";
  const paymentAgentName = typeof (order as any).paymentAgentName === "string" ? (order as any).paymentAgentName.trim() : "";
  const paymentBy = typeof order.paymentBy === "string" ? order.paymentBy.trim() : "";

  const hasLinkedId = Boolean(paymentAgentId || snapshotId);
  const hasStoredMetadata = Boolean(snapshotName || paymentByName || paymentAgentName);
  const hasAnyReference = hasLinkedId || Boolean(paymentBy) || hasStoredMetadata;

  if (!hasAnyReference) return { value: PAYMENT_AGENT_NOT_LINKED, isMissing: true };
  if (hasLinkedId) return { value: hasStoredMetadata ? PAYMENT_AGENT_DELETED : PAYMENT_AGENT_INVALID, isMissing: true };
  if (resolution.blockedReason === "inactive_id" || resolution.blockedReason === "inactive_name_fallback") {
    return { value: PAYMENT_AGENT_DELETED, isMissing: true };
  }
  if (resolution.blockedReason === "missing_id") return { value: PAYMENT_AGENT_INVALID, isMissing: true };
  return { value: PAYMENT_AGENT_UNKNOWN, isMissing: true };
}

export function getOrderPaymentAgentSplitDisplay(order: Order) {
  const value = formatPaymentAgentSplitsDisplay(order);
  return { value, hasRealSplits: hasRealPaymentAgentSplits(order) };
}
