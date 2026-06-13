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
  PaymentAgentLedgerEntry,
  CustomerLedgerEntry,
  OrderLine,
  Order,
  DashboardOrderRow,
  PaginationState,
  FilterState,
} from "@/types/domain";

import type { Order, OrderLine } from "@/types/domain";
import { addNumbers, multiplyNumbers } from "@/lib/numbers";

export const lineTotalPcs = (l: OrderLine) =>
  multiplyNumbers(l.totalCtns, l.pcsPerCtn);

export const lineTotalRmb = (l: OrderLine) =>
  multiplyNumbers(lineTotalPcs(l), l.rmbPerPcs);

export const orderTotal = (o: Order) =>
  addNumbers(o.lines.map((l) => lineTotalRmb(l)));
