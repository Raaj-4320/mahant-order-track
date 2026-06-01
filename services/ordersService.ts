import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import type { OrdersService } from "@/services/contracts";
import { ordersMockService } from "@/services/mock/ordersMockService";

export function getOrdersService(): OrdersService {
  const selection = ordersDataSourceSelection();
  if (selection.source !== "firebase") {
    if (!selection.hasFirebaseConfig) console.warn("Firebase is not configured; app is running in mock mode and data will not persist.");
    return ordersMockService;
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for orders but Firebase is not configured.");
  return {
    async listOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listOrders(); },
    async getOrderById(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.getOrderById(id); },
    async upsertOrder(order) {
      const path = selection.businessId ? `businesses/${selection.businessId}/orders/${order.id}` : null;
      console.log("[ORDER_DATE_STATUS_TRACE] service_update_start", {
        orderId: order.id,
        path,
        payload: { loadingDate: order.loadingDate, status: order.status },
        source: selection.source,
      });
      const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService");
      return ordersFirebaseService.upsertOrder(order);
    },
    async archiveOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
    async listDraftOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listDraftOrders?.() ?? []; },
    async autosaveDraft(order) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.autosaveDraft?.(order) ?? order; },
    async deleteOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
    async peekNextOrderNumber() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.peekNextOrderNumber!(); },
    async allocateNextOrderNumber() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.allocateNextOrderNumber!(); },
  };
}
