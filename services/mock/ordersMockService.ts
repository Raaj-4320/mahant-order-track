import { initialOrders } from "@/lib/data";
import type { OrdersService } from "@/services/contracts";
import type { Order } from "@/lib/types";
import { deepClone } from "./utils";

let mockOrders: Order[] = deepClone(initialOrders);

export const ordersMockService: OrdersService = {
  async listOrders() { return deepClone(mockOrders); },
  async getOrderById(id) { return deepClone(mockOrders.find((x) => x.id === id) ?? null); },
  async upsertOrder(order) {
    const idx = mockOrders.findIndex((x) => x.id === order.id);
    if (idx >= 0) mockOrders[idx] = deepClone(order);
    else mockOrders.unshift(deepClone(order));
    return deepClone(order);
  },
  async archiveOrder(id) { mockOrders = mockOrders.map((x) => x.id === id ? { ...x, status: "archived", updatedAt: new Date().toISOString() } : x); },
  async deleteOrder(id) { mockOrders = mockOrders.filter((x) => x.id !== id); },
  async listDraftOrders() { return deepClone(mockOrders.filter((x) => x.status === "draft")); },
  async autosaveDraft(order) { return this.upsertOrder({ ...order, status: "draft", draftAutosavedAt: new Date().toISOString() } as any); },
};
