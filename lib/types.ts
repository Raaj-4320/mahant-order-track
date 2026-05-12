export type {
  EntityStatus,
  OrderStatus,
  PaymentStatus,
  LoadingStatus,
  EntitySnapshot,
  Supplier,
  Customer,
  Product,
  PaymentAgent,
  OrderLine,
  Order,
  DashboardOrderRow,
  PaginationState,
  FilterState,
} from "@/types/domain";

import type { Order, OrderLine } from "@/types/domain";

export const lineTotalPcs = (l: OrderLine) =>
  (Number(l.totalCtns) || 0) * (Number(l.pcsPerCtn) || 0);

export const lineTotalRmb = (l: OrderLine) =>
  lineTotalPcs(l) * (Number(l.rmbPerPcs) || 0);

export const orderTotal = (o: Order) =>
  o.lines.reduce((sum, l) => sum + lineTotalRmb(l), 0);
