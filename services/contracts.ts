import type { Customer, DashboardOrderRow, Order, PaymentAgent, PaymentAgentLedgerEntry, Product, Supplier } from "@/lib/types";

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
  recordPaymentToAgent(agentId: string, payment: { amount: number; paymentDate: string; note?: string }): Promise<PaymentAgent>;
  listPaymentAgentLedger(agentId: string): Promise<PaymentAgentLedgerEntry[]>;
  archivePaymentAgent?(id: string): Promise<void>;
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
}
export interface DashboardReadService {
  getDashboardStats(): Promise<DashboardStats>;
  getDashboardRows(): Promise<DashboardOrderRow[]>;
}
