import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { OrdersService } from "@/services/contracts";
import { ordersMockService } from "@/services/mock/ordersMockService";

const ORDERS_SOURCE = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock";

export function getOrdersService(): OrdersService {
  if (ORDERS_SOURCE !== "firebase") return ordersMockService;
  if (!isFirebaseConfigured()) return ordersMockService;
  return {
    async listOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listOrders(); },
    async getOrderById(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.getOrderById(id); },
    async upsertOrder(order) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.upsertOrder(order); },
    async archiveOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
    async listDraftOrders() { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.listDraftOrders?.() ?? []; },
    async autosaveDraft(order) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.autosaveDraft?.(order) ?? order; },
    async deleteOrder(id) { const { ordersFirebaseService } = await import("@/services/firebase/ordersFirebaseService"); return ordersFirebaseService.archiveOrder(id); },
  };
}
