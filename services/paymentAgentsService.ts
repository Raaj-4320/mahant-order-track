import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { PaymentAgentsService } from "@/services/contracts";
import { paymentAgentsMockService } from "@/services/mock/paymentAgentsMockService";

const PAYMENT_AGENTS_SOURCE = process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? "mock";

export function getPaymentAgentsService(): PaymentAgentsService {
  if (PAYMENT_AGENTS_SOURCE !== "firebase") return paymentAgentsMockService;
  if (!isFirebaseConfigured()) {
    console.warn("[paymentAgentsService] Firebase mode requested but Firebase env missing. Falling back to mock service.");
    return paymentAgentsMockService;
  }
  return {
    async listPaymentAgents() { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.listPaymentAgents(); },
    async getPaymentAgentById(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.getPaymentAgentById(id); },
    async upsertPaymentAgent(agent) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.upsertPaymentAgent(agent); },
    async recordPaymentToAgent(agentId, payment) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recordPaymentToAgent(agentId, payment); },
    async listPaymentAgentLedger(agentId) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.listPaymentAgentLedger(agentId); },
    async recalculatePaymentAgentsFromOrders(orders) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recalculatePaymentAgentsFromOrders(orders); },
    async archivePaymentAgent(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.archivePaymentAgent?.(id); },
  };
}
