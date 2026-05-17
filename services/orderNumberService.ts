import type { Order } from "@/lib/types";
import { getOrdersService } from "@/services/ordersService";
import { logDataFlow, logError } from "@/lib/logger";

const ORDER_NO_RE = /^YY-(\d+)$/;

export const isValidFinalOrderNumber = (value?: string | null): boolean => {
  if (!value) return false;
  return ORDER_NO_RE.test(value.trim());
};

export async function ensureFinalOrderNumber(order: Order): Promise<string> {
  const service = getOrdersService();
  const current = (order.number || order.orderNumber || "").trim();
  if (order.status === "saved" && isValidFinalOrderNumber(current)) {
    const all = await service.listOrders();
    const duplicate = all.some((o) => o.id !== order.id && (o.number === current || o.orderNumber === current));
    if (!duplicate) return current;
  }
  logDataFlow("Orders", JSON.stringify({ event: "order_number_allocate_start", orderId: order.id, status: order.status }, null, 2));
  try {
    if (!service.allocateNextOrderNumber) throw new Error("Order number allocator is not available for this data source.");
    const orderNumber = await service.allocateNextOrderNumber();
    logDataFlow("Orders", JSON.stringify({ event: "order_number_allocate_success", orderId: order.id, orderNumber }, null, 2));
    return orderNumber;
  } catch (e) {
    logError("order_number_allocate_failure", { orderId: order.id, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}


export async function peekNextOrderNumber(): Promise<string> {
  const service = getOrdersService();
  logDataFlow("Orders", JSON.stringify({ event: "order_number_peek_start" }, null, 2));
  try {
    if (!service.peekNextOrderNumber) throw new Error("Order number preview is not available for this data source.");
    const orderNumber = await service.peekNextOrderNumber();
    logDataFlow("Orders", JSON.stringify({ event: "order_number_peek_success", orderNumber }, null, 2));
    return orderNumber;
  } catch (e) {
    logError("order_number_peek_failure", { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
