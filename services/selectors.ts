import type { Customer, DashboardOrderRow, Order, PaymentAgent, Product, Supplier } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import type { DashboardStats } from "./contracts";

const uniqNames = (ids: string[], rows: { id: string; name: string }[]) =>
  Array.from(new Set(ids.map((id) => rows.find((x) => x.id === id)?.name).filter(Boolean) as string[]));

export function getDashboardStats(orders: Order[]): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);
  const savedOrders = orders.filter((o) => o.status === "saved");
  return {
    totalOrders: savedOrders.length,
    totalOrderAmount: savedOrders.reduce((s, o) => s + orderTotal(o), 0),
    ordersLoadingToday: savedOrders.filter((o) => o.loadingDate === today).length,
    pendingPayments: savedOrders.filter((o) => o.paymentStatus === "pending" || o.paymentStatus === "partial").length,
    delayedShipments: savedOrders.filter((o) => o.status === "delayed").length,
  };
}

export function getDashboardRows(orders: Order[], suppliers: Supplier[], customers: Customer[], paymentAgents: PaymentAgent[]): DashboardOrderRow[] {
  return orders.filter((o) => o.status === "saved").map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber || o.number,
    supplierSummary: uniqNames(o.lines.map((l) => l.supplierId), suppliers).join(", ") || "—",
    customerSummary: uniqNames(o.lines.map((l) => l.customerId), customers).join(", ") || "—",
    totalUniqueItems: new Set(o.lines.map((l) => l.productId)).size,
    orderTotal: orderTotal(o),
    paidBy: paymentAgents.find((a) => a.id === (o.paymentAgentId || o.paymentBy))?.name ?? "—",
    loadingDate: o.loadingDate,
    status: o.status,
  }));
}

export function getSupplierStats(suppliers: Supplier[], orders: Order[]) {
  return suppliers.map((s) => {
    const lines = orders.flatMap((o) => o.lines.filter((l) => l.supplierId === s.id));
    const total = lines.reduce((sum, l) => sum + l.totalCtns * l.pcsPerCtn * l.rmbPerPcs, 0);
    return { supplier: s, totalOrders: lines.length, totalOrderAmount: total };
  });
}

export function getPaymentAgentStats(paymentAgents: PaymentAgent[], orders: Order[]) {
  return paymentAgents.map((a) => {
    const own = orders.filter((o) => (o.paymentAgentId || o.paymentBy) === a.id);
    return { agent: a, totalOrdersPaid: own.length, totalPaidAmount: own.reduce((s, o) => s + (o.paidAmount ?? 0), 0) };
  });
}

export function getCustomerStats(customers: Customer[], orders: Order[]) {
  return customers.map((c) => {
    const involved = orders.filter((o) => o.lines.some((l) => l.customerId === c.id));
    const totalSpent = involved.reduce((s, o) => s + o.lines.filter((l) => l.customerId === c.id).reduce((x, l) => x + l.totalCtns * l.pcsPerCtn * l.rmbPerPcs, 0), 0);
    return { customer: c, totalOrders: involved.length, totalSpent, outstandingAmount: c.outstandingAmount ?? 0 };
  });
}

export function getProductStats(products: Product[], orders: Order[]) {
  return products.map((p) => {
    const lines = orders.flatMap((o) => o.lines.filter((l) => l.productId === p.id));
    const totalQtyPcs = lines.reduce((s, l) => s + l.totalCtns * l.pcsPerCtn, 0);
    const totalAmount = lines.reduce((s, l) => s + l.totalCtns * l.pcsPerCtn * l.rmbPerPcs, 0);
    const catalogValue = (p.stockQty ?? 0) * (p.sellingPrice ?? p.defaultRmbPerPcs ?? 0);
    const isLowStock = typeof p.stockQty === "number" && typeof p.lowStockLimit === "number" && p.stockQty <= p.lowStockLimit;
    return { product: p, totalQtyPcs, totalAmount, catalogValue, isLowStock };
  });
}
