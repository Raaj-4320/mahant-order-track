import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { PaymentAgentsService } from "@/services/contracts";
import { paymentAgentsMockService } from "@/services/mock/paymentAgentsMockService";
import { paymentAgentsDataSourceSelection } from "@/lib/runtimeConfig";

export function getPaymentAgentsService(): PaymentAgentsService {
  const selection = paymentAgentsDataSourceSelection();
  if (selection.source !== "firebase") return paymentAgentsMockService;
  if (!isFirebaseConfigured()) {
    return paymentAgentsMockService;
  }
  return {
    async listPaymentAgents() {
      const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService");
      return paymentAgentsFirebaseService.listPaymentAgents();
    },
    async getPaymentAgentById(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.getPaymentAgentById(id); },
    async upsertPaymentAgent(agent) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.upsertPaymentAgent(agent); },
    async repairPaymentAgentsFromSavedOrders() {
      const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService");
      if (!paymentAgentsFirebaseService.repairPaymentAgentsFromSavedOrders) {
        throw new Error("Payment-agent repair is not enabled for this data source.");
      }
      return paymentAgentsFirebaseService.repairPaymentAgentsFromSavedOrders();
    },
    async applyTestingPaymentAgentRepair() {
      const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService");
      if (!paymentAgentsFirebaseService.applyTestingPaymentAgentRepair) {
        throw new Error("Testing payment-agent repair apply is not enabled for this data source.");
      }
      return paymentAgentsFirebaseService.applyTestingPaymentAgentRepair();
    },
    async recordPaymentToAgent(agentId, payment) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recordPaymentToAgent(agentId, payment); },
    async deletePaymentAgentLedgerEntry(entryId) {
      const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService");
      if (!paymentAgentsFirebaseService.deletePaymentAgentLedgerEntry) throw new Error("Ledger delete flow is not enabled for this data source.");
      return paymentAgentsFirebaseService.deletePaymentAgentLedgerEntry(entryId);
    },
    async listPaymentAgentLedger(agentId) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.listPaymentAgentLedger(agentId); },
    async recalculatePaymentAgentsFromOrders(orders) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.recalculatePaymentAgentsFromOrders(orders); },
    async deletePaymentAgent(id) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.deletePaymentAgent?.(id); },
    async applyOrderSettlement(order) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.applyOrderSettlement?.(order); },
    async reverseOrderSettlement(order) { const { paymentAgentsFirebaseService } = await import("@/services/firebase/paymentAgentsFirebaseService"); return paymentAgentsFirebaseService.reverseOrderSettlement?.(order); },
  };
}
