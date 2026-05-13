import type { Customer, DashboardOrderRow, Order, PaymentAgent, Product, Supplier } from "@/lib/types";

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
}
export interface OrdersService {
  listOrders(): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | null>;
  upsertOrder(order: Order): Promise<Order>;
  deleteOrder(id: string): Promise<void>;
}
export interface DashboardReadService {
  getDashboardStats(): Promise<DashboardStats>;
  getDashboardRows(): Promise<DashboardOrderRow[]>;
}
