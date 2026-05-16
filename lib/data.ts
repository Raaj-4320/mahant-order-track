import { Customer, Order, PaymentAgent, Product, Supplier } from "./types";

const now = "2026-05-01T00:00:00.000Z";

export const suppliers: Supplier[] = [
  { id: "sup-1", supplierCode: "SUP-001", name: "ABC Fashion Co.", displayName: "ABC Fashion", logoInitials: "AF", contactPerson: "Ahmed Karim", phone: "+86-138-1000-0001", email: "ops@abcfashion.co", wechatId: "abc.fashion88", country: "China", city: "Guangzhou", status: "active", totalOrders: 14, totalOrderAmount: 324500, createdAt: now, updatedAt: now },
  { id: "sup-2", supplierCode: "SUP-002", name: "Best Apparel Ltd.", displayName: "Best Apparel", logoInitials: "BA", contactPerson: "Liu Wen", phone: "+86-138-1000-0002", wechatId: "best.apparel", country: "China", city: "Shenzhen", status: "active", totalOrders: 10, totalOrderAmount: 218200, createdAt: now, updatedAt: now },
  { id: "sup-3", supplierCode: "SUP-003", name: "Trendy Wear Inc.", displayName: "Trendy Wear", logoInitials: "TW", contactPerson: "Mina Zhao", phone: "+86-138-1000-0003", wechatId: "trendy.wear.co", country: "China", city: "Dongguan", status: "active", totalOrders: 8, totalOrderAmount: 176300, createdAt: now, updatedAt: now },
  { id: "sup-4", supplierCode: "SUP-004", name: "Urban Threads", displayName: "Urban Threads", logoInitials: "UT", contactPerson: "Rayan Ali", phone: "+86-138-1000-0004", country: "China", city: "Foshan", status: "inactive", totalOrders: 4, totalOrderAmount: 90800, createdAt: now, updatedAt: now },
  { id: "sup-5", supplierCode: "SUP-005", name: "Coastal Garments", displayName: "Coastal", logoInitials: "CG", contactPerson: "Chen Li", phone: "+86-138-1000-0005", country: "China", city: "Ningbo", status: "active", totalOrders: 6, totalOrderAmount: 116400, createdAt: now, updatedAt: now },
];

export const customers: Customer[] = [
  { id: "cus-1", customerCode: "CUS-001", name: "John Trading Co.", displayName: "John Trading", phone: "+971-50-000-0001", status: "active", totalOrders: 11, totalSpent: 221700, outstandingAmount: 40200, createdAt: now, updatedAt: now },
  { id: "cus-2", customerCode: "CUS-002", name: "Global Retailers", displayName: "Global Retailers", phone: "+971-50-000-0002", status: "active", totalOrders: 12, totalSpent: 268500, outstandingAmount: 38200, createdAt: now, updatedAt: now },
  { id: "cus-3", customerCode: "CUS-003", name: "Mike Imports", displayName: "Mike Imports", phone: "+971-50-000-0003", status: "active", totalOrders: 8, totalSpent: 182900, outstandingAmount: 21400, createdAt: now, updatedAt: now },
  { id: "cus-4", customerCode: "CUS-004", name: "Retail Hub", displayName: "Retail Hub", status: "active", totalOrders: 5, totalSpent: 76300, outstandingAmount: 12300, createdAt: now, updatedAt: now },
  { id: "cus-5", customerCode: "CUS-005", name: "Skyline Stores", displayName: "Skyline", status: "inactive", totalOrders: 2, totalSpent: 20900, outstandingAmount: 0, createdAt: now, updatedAt: now },
];

export const products: Product[] = [
  { id: "prd-1", productCode: "PRD-001", sku: "TS-COT-SS-001", name: "Short sleeve cotton t-shirt", marka: "MARKA-1", category: "Tops", unit: "pcs", photo: "👕", defaultDim: "32 × 24 × 18 cm", supplierId: "sup-1", sellingPrice: 12.5, defaultRmbPerPcs: 12.5, status: "active", createdAt: now, updatedAt: now },
  { id: "prd-2", productCode: "PRD-002", sku: "JK-DNM-001", name: "Denim jacket", marka: "MARKA-2", category: "Outerwear", unit: "pcs", photo: "🧥", defaultDim: "40 × 30 × 20 cm", supplierId: "sup-2", sellingPrice: 45, defaultRmbPerPcs: 45, status: "active", createdAt: now, updatedAt: now },
  { id: "prd-3", productCode: "PRD-003", sku: "HD-FLC-001", name: "Hoodie fleece", marka: "MARKA-3", category: "Outerwear", unit: "pcs", photo: "🧥", defaultDim: "28 × 20 × 15 cm", supplierId: "sup-3", sellingPrice: 38, defaultRmbPerPcs: 38, status: "active", createdAt: now, updatedAt: now },
  { id: "prd-4", productCode: "PRD-004", sku: "PT-CGO-001", name: "Cargo pants", marka: "MARKA-4", category: "Bottoms", unit: "pcs", photo: "👖", defaultDim: "30 × 22 × 16 cm", supplierId: "sup-5", sellingPrice: 22, defaultRmbPerPcs: 22, status: "active", createdAt: now, updatedAt: now },
  { id: "prd-5", productCode: "PRD-005", sku: "CP-BNI-001", name: "Beanie cap", marka: "MARKA-5", category: "Accessories", unit: "pcs", photo: "🧢", defaultDim: "18 × 14 × 10 cm", supplierId: "sup-4", sellingPrice: 9.5, defaultRmbPerPcs: 9.5, status: "active", createdAt: now, updatedAt: now },
];

export const paymentAgents: PaymentAgent[] = [
  { id: "pa-1", agentCode: "AG-01", name: "Alipay Agent A", initials: "AA", phone: "+86-139-2000-0001", wechatId: "agent.alipay.a", country: "China", city: "Guangzhou", status: "active", totalOrdersPaid: 16, totalPaidAmount: 332000, creditBalance: 0, currency: "CNY", createdAt: now, updatedAt: now },
  { id: "pa-2", agentCode: "AG-02", name: "WeChat Pay Agent B", initials: "WB", phone: "+86-139-2000-0002", wechatId: "agent.wechat.b", country: "China", city: "Shenzhen", status: "active", totalOrdersPaid: 11, totalPaidAmount: 246800, creditBalance: 20000, currency: "CNY", createdAt: now, updatedAt: now },
  { id: "pa-3", agentCode: "AG-03", name: "Bank Wire Agent C", initials: "BC", phone: "+86-139-2000-0003", wechatId: "agent.bank.c", country: "China", status: "active", totalOrdersPaid: 7, totalPaidAmount: 142300, creditBalance: 5000, currency: "CNY", createdAt: now, updatedAt: now },
  { id: "pa-4", agentCode: "AG-04", name: "Hawala Agent D", initials: "HD", phone: "+86-139-2000-0004", wechatId: "agent.hawala.d", country: "China", status: "inactive", totalOrdersPaid: 3, totalPaidAmount: 57100, createdAt: now, updatedAt: now },
];

export const initialOrders: Order[] = [
  { id: "ord-25-301", orderNumber: "25-301", number: "25-301", date: "2025-05-23", loadingDate: "2025-05-25", paymentAgentId: "pa-1", paymentBy: "pa-1", wechatId: "abc.fashion88", status: "draft", paymentStatus: "pending", subtotal: 33990, grandTotal: 33990, paidAmount: 0, dueAmount: 33990, lines: [{ id: "ln-1", supplierId: "sup-1", picDim: "32 × 24 × 18 cm", productId: "prd-1", marka: "MARKA-1", details: "Short sleeve cotton t-shirt", totalCtns: 10, pcsPerCtn: 100, rmbPerPcs: 12.5, customerId: "cus-1" }] },
  { id: "ord-25-300", orderNumber: "25-300", number: "25-300", date: "2025-05-22", loadingDate: "2025-05-24", paymentAgentId: "pa-2", paymentBy: "pa-2", wechatId: "best.apparel", status: "scheduled", paymentStatus: "partial", lines: [{ id: "ln-4", supplierId: "sup-2", picDim: "36 × 28 × 18 cm", productId: "prd-4", marka: "MARKA-4", details: "Cargo pants", totalCtns: 12, pcsPerCtn: 80, rmbPerPcs: 22, customerId: "cus-2" }] },
  { id: "ord-25-299", orderNumber: "25-299", number: "25-299", date: "2025-05-21", loadingDate: "2025-05-23", paymentAgentId: "pa-3", paymentBy: "pa-3", wechatId: "trendy.wear.co", status: "packed", paymentStatus: "paid", lines: [{ id: "ln-6", supplierId: "sup-3", picDim: "28 × 20 × 15 cm", productId: "prd-3", marka: "MARKA-3", details: "Hoodie fleece", totalCtns: 7, pcsPerCtn: 60, rmbPerPcs: 38, customerId: "cus-3" }] },
  { id: "ord-25-298", orderNumber: "25-298", number: "25-298", date: "2025-05-20", loadingDate: "2025-05-22", paymentAgentId: "pa-1", paymentBy: "pa-1", wechatId: "abc.fashion88", status: "delayed", paymentStatus: "unpaid", lines: [{ id: "ln-8", supplierId: "sup-1", picDim: "32 × 24 × 18 cm", productId: "prd-1", marka: "MARKA-1", details: "Short sleeve cotton t-shirt", totalCtns: 6, pcsPerCtn: 100, rmbPerPcs: 12.5, customerId: "cus-4" }] },
];

export function formatAmount(value: number | string | undefined | null): string {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const formatCNY = formatAmount;
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
