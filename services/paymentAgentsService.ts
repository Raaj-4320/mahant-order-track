import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { PaymentAgentsService } from "@/services/contracts";
import { paymentAgentsMockService } from "@/services/mock/paymentAgentsMockService";
import { selectDataSource } from "@/lib/runtimeConfig";
import { paymentAgentsPath } from "@/lib/firebase/paths";

export function getPaymentAgentsService(): PaymentAgentsService {
  const selection = selectDataSource(process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE);
  const businessId = selection.businessId || process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID || "mahant";
  if (selection.source !== "firebase") return paymentAgentsMockService;
  if (!isFirebaseConfigured()) {
    console.warn("[paymentAgentsService] Firebase mode requested but Firebase env missing. Falling back to mock service.");
    return paymentAgentsMockService;
  }
  return {
    async listPaymentAgents() {
      console.log("[PAYMENT_AGENT_FLOW_TRACE] service_list_start", {
        businessId,
        source: selection.source,
      });
      console.log("[PAYMENT_AGENT_FLOW_TRACE] firebase_path_resolved", {
        service: "paymentAgents",
        businessId,
        path: paymentAgentsPath(businessId),
      });
      try {
        const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService");
        const data = await paymentAgentsFirebaseService.listPaymentAgents();
        console.log("[PAYMENT_AGENT_FLOW_TRACE] service_list_success", {
          businessId,
          source: selection.source,
          count: data.length,
          sample: data.slice(0, 3).map((agent) => agent.name),
        });
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[PAYMENT_AGENT_FLOW_TRACE] service_list_failed", { businessId, source: selection.source, errorMessage: message });
        throw error;
      }
    },
    async getPaymentAgentById(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.getPaymentAgentById(id); },
    async upsertPaymentAgent(agent) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.upsertPaymentAgent(agent); },
    async recordPaymentToAgent(agentId, payment) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recordPaymentToAgent(agentId, payment); },
    async listPaymentAgentLedger(agentId) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.listPaymentAgentLedger(agentId); },
    async recalculatePaymentAgentsFromOrders(orders) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recalculatePaymentAgentsFromOrders(orders); },
    async deletePaymentAgent(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.deletePaymentAgent?.(id); },
    async applyOrderSettlement(order) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.applyOrderSettlement?.(order); },
    async reverseOrderSettlement(order) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.reverseOrderSettlement?.(order); },
  };
}
