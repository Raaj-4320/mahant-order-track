import type { Order } from "@/lib/types";
import { getOrdersService } from "@/services/ordersService";
import { logDataFlow, logError } from "@/lib/logger";

const ORDER_NO_RE = /^YY-(\d+)$/;

export const isValidFinalOrderNumber = (value?: string | null): boolean => {
  if (!value) return false;
  return ORDER_NO_RE.test(value.trim());
};

export async function ensureFinalOrderNumber(order: Order): Promise<string> {
  if (order.status === "saved" && isValidFinalOrderNumber(order.number || order.orderNumber)) {
    return (order.number || order.orderNumber).trim();
  }
  logDataFlow("Orders", { event: "order_number_allocate_start", orderId: order.id, status: order.status });
  try {
    const service = getOrdersService();
    if (!service.allocateNextOrderNumber) throw new Error("Order number allocator is not available for this data source.");
    const orderNumber = await service.allocateNextOrderNumber();
    logDataFlow("Orders", { event: "order_number_allocate_success", orderId: order.id, orderNumber });
    return orderNumber;
  } catch (e) {
    logError("order_number_allocate_failure", { orderId: order.id, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
