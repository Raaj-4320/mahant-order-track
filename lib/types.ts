export type {
  EntityStatus,
  OrderStatus,
  PaymentStatus,
  LoadingStatus,
  LifecycleStatus,
  LifecycleSourceType,
  EntitySnapshot,
  LifecycleMetadata,
  OrderDependencyMap,
  ReferenceRecordType,
  ReferenceRecord,
  RecycleBinItemType,
  RecycleBinEntry,
  Supplier,
  Customer,
  Product,
  PaymentAgent,
  OrderNumberSeries,
  PaymentAgentSplitSettlementSnapshot,
  PaymentAgentOrderSplit,
  PaymentAgentLedgerEntry,
  CustomerLedgerEntry,
  OrderLine,
  Order,
  DashboardOrderRow,
  PaginationState,
  FilterState,
} from "@/types/domain";

import type { Order, OrderLine } from "@/types/domain";
import { addNumbers, floorMoney, floorWholeMoney, multiplyNumbers, toSafeNumber } from "@/lib/numbers";

export const lineTotalPcs = (l: OrderLine) =>
  multiplyNumbers(l.totalCtns, l.pcsPerCtn);

export const lineTotalRmb = (l: OrderLine) =>
  floorWholeMoney(multiplyNumbers(lineTotalPcs(l), l.rmbPerPcs));

export const orderLinesTotal = (o: Order) =>
  addNumbers(o.lines.map((l) => lineTotalRmb(l)));

export const orderShippingPrice = (o: Order) =>
  floorMoney(toSafeNumber(o.shippingPrice));

export const orderTotal = (o: Order) =>
  floorMoney(orderLinesTotal(o) + orderShippingPrice(o));
