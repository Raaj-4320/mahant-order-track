import { initialOrders } from "@/lib/data";
import type { OrdersService } from "@/services/contracts";
import type { Order } from "@/lib/types";
import { deepClone } from "./utils";
import { isDemoDataEnabled } from "@/lib/runtimeConfig";

let mockOrders: Order[] = deepClone(isDemoDataEnabled() ? initialOrders : []);

const ORDER_NO_RE = /^YY-(\d+)$/;
const parseOrderNo = (value?: string | null): number | null => {
  if (!value) return null;
  const m = value.trim().match(ORDER_NO_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

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
  async deleteOrder(id) { mockOrders = mockOrders.map((x) => x.id === id ? { ...x, status: "archived", updatedAt: new Date().toISOString() } : x); },
  async listDraftOrders() { return deepClone(mockOrders.filter((x) => x.status === "draft")); },
  async autosaveDraft(order) { return this.upsertOrder({ ...order, status: "draft", draftAutosavedAt: new Date().toISOString() } as any); },
  async peekNextOrderNumber() {
    let maxExisting = 300;
    for (const o of mockOrders) {
      const a = parseOrderNo(o.number);
      const b = parseOrderNo(o.orderNumber);
      if (a && a > maxExisting) maxExisting = a;
      if (b && b > maxExisting) maxExisting = b;
    }
    return `YY-${Math.max(maxExisting + 1, 301)}`;
  },
  async allocateNextOrderNumber() {
    let maxExisting = 300;
    for (const o of mockOrders) {
      const a = parseOrderNo(o.number);
      const b = parseOrderNo(o.orderNumber);
      if (a && a > maxExisting) maxExisting = a;
      if (b && b > maxExisting) maxExisting = b;
    }
    return `YY-${Math.max(maxExisting + 1, 301)}`;
  },
};
