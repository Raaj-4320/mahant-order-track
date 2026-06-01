import type { Order } from "@/lib/types";

const CREDIT_ACTIVE_STATUSES: Array<Order["status"]> = ["packed", "received", "delayed"];

export function getOrderCreditExclusionReason(order: Order): string | null {
  if (!order) return "missing_order";
  if (!order.loadingDate) return "missing_loading_date";
  if (order.status === "draft") return "draft";
  if (order.status === "saved") return "saved_without_operational_state";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "archived") return "archived";
  if (!CREDIT_ACTIVE_STATUSES.includes(order.status as Order["status"])) return "status_not_credit_consuming";
  return null;
}

export function isOrderEligibleForCreditSettlement(order: Order): boolean {
  return getOrderCreditExclusionReason(order) === null;
}
