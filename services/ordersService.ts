import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import type { OrdersService } from "@/services/contracts";
import { ordersMockService } from "@/services/mock/ordersMockService";

export function getOrdersService(): OrdersService {
  const selection = ordersDataSourceSelection();
  console.log("[DATA_SOURCE_TRACE] selected_source", JSON.stringify({ service: "orders", selectedSource: selection.source, reason: selection.reason, explicitSource: selection.explicitSource, explicitMockEnabled: selection.explicitMockEnabled }, null, 2));
  console.log("[DATA_SOURCE_TRACE] firebase_config_check", JSON.stringify({ service: "orders", hasFirebaseConfig: selection.hasFirebaseConfig, missingFirebaseKeys: selection.missingFirebaseKeys, hasBusinessId: selection.hasBusinessId, businessId: selection.businessId }, null, 2));
  if (selection.source !== "firebase") {
    if (!selection.hasFirebaseConfig) console.warn("Firebase is not configured; app is running in mock mode and data will not persist.");
    return ordersMockService;
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for orders but Firebase is not configured.");
  return {
    async listOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listOrders(); },
    async getOrderById(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.getOrderById(id); },
    async upsertOrder(order) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.upsertOrder(order); },
    async archiveOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
    async listDraftOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listDraftOrders?.() ?? []; },
    async autosaveDraft(order) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.autosaveDraft?.(order) ?? order; },
    async deleteOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
    async peekNextOrderNumber() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.peekNextOrderNumber!(); },
    async allocateNextOrderNumber() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.allocateNextOrderNumber!(); },
  };
}
