import type { Customer, DashboardOrderRow, Order, OrderNumberSeries, PaymentAgent, PaymentAgentLedgerEntry, Product, Supplier } from "@/lib/types";

export type DashboardStats = {
  totalOrders: number;
  totalOrderAmount: number;
  ordersLoadingToday: number;
  pendingPayments: number;
  delayedShipments: number;
};

export interface ProductsService {
  listProducts(): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  upsertProduct(product: Product): Promise<Product>;
  archiveProduct(id: string): Promise<void>;
}
export interface CustomersService {
  listCustomers(): Promise<Customer[]>;
  getCustomerById(id: string): Promise<Customer | null>;
  upsertCustomer?(customer: Customer): Promise<Customer>;
  recordPaymentToCustomer?(customerId: string, input: { amount: number; paymentDate?: string; note?: string }): Promise<Customer>;
  deleteCustomer?(id: string): Promise<void>;
}
export interface SuppliersService {
  listSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | null>;
}
export interface PaymentAgentsService {
  listPaymentAgents(): Promise<PaymentAgent[]>;
  getPaymentAgentById(id: string): Promise<PaymentAgent | null>;
  upsertPaymentAgent(agent: PaymentAgent): Promise<PaymentAgent>;
  recalculatePaymentAgentsFromOrders(orders: Order[]): Promise<PaymentAgent[]>;
  repairPaymentAgentsFromSavedOrders?(): Promise<{
    paymentAgentsScanned: number;
    openingBalancesBackfilled: number;
    openingEntriesCreatedOrUpdated: number;
    duplicateOpeningEntriesDeactivated: number;
    settlementEntriesCreatedOrUpdated: number;
    paymentAgentsRecalculated: number;
  }>;
  applyTestingPaymentAgentRepair?(): Promise<{
    repairedOrders: number;
    repairedSplits: number;
    repairedLedgerRows: number;
    recomputedAgents: number;
    logs: Array<{
      collection: "orders" | "paymentAgentLedger" | "paymentAgents";
      orderId?: string;
      orderNumber?: string;
      agentId?: string;
      agentName?: string;
      targetId?: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }>;
  }>;
  recordPaymentToAgent(agentId: string, payment: { amount: number; paymentDate: string; note?: string; paymentMethod?: string }): Promise<PaymentAgent>;
  deletePaymentAgentLedgerEntry?(entryId: string): Promise<PaymentAgent>;
  listPaymentAgentLedger(agentId?: string): Promise<PaymentAgentLedgerEntry[]>;
  deletePaymentAgent?(id: string): Promise<void>;
  applyOrderSettlement?(order: Order): Promise<void>;
  reverseOrderSettlement?(order: Order): Promise<void>;
}
export interface OrdersService {
  listOrders(): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | null>;
  upsertOrder(order: Order): Promise<Order>;
  archiveOrder(id: string): Promise<void>;
  deleteOrder?(id: string): Promise<void>;
  listDraftOrders?(): Promise<Order[]>;
  autosaveDraft?(order: Order): Promise<Order>;
  peekNextOrderNumber?(): Promise<string>;
  allocateNextOrderNumber?(): Promise<string>;
}
export interface OrderNumberSeriesService {
  listOrderNumberSeries(orders?: Order[]): Promise<OrderNumberSeries[]>;
  createOrderNumberSeries(input: { label: string; startNumber: number }, orders?: Order[]): Promise<OrderNumberSeries>;
  syncOrderNumberSeriesFromOrder(order: Order, orders?: Order[]): Promise<OrderNumberSeries | null>;
  deleteOrderNumberSeries?(id: string, orders?: Order[]): Promise<void>;
}
export interface DashboardReadService {
  getDashboardStats(): Promise<DashboardStats>;
  getDashboardRows(): Promise<DashboardOrderRow[]>;
}
