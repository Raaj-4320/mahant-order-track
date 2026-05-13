import type { Customer, Order, PaymentAgent, Product, Supplier } from "@/lib/types";

const asNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const asStr = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const asStatus = (v: unknown): "active" | "inactive" => (v === "inactive" ? "inactive" : "active");

export const productFromFirestore = (doc: unknown): Product => {
  const p = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const selling = asNum(p.sellingPrice) ?? asNum(p.defaultRmbPerPcs) ?? asNum(p.rmbPerPcs);
  return {
    id: asStr(p.id),
    productCode: asStr(p.productCode) || asStr(p.sku),
    sku: asStr(p.sku) || asStr(p.productCode),
    name: asStr(p.name),
    marka: asStr(p.marka),
    category: asStr(p.category),
    unit: asStr(p.unit, "pcs"),
    defaultDim: asStr(p.defaultDim) || undefined,
    photo: asStr(p.photo),
    supplierId: asStr(p.supplierId) || undefined,
    purchasePrice: asNum(p.purchasePrice),
    sellingPrice: selling,
    defaultRmbPerPcs: selling,
    stockQty: asNum(p.stockQty),
    lowStockLimit: asNum(p.lowStockLimit),
    status: asStatus(p.status),
    createdAt: asStr(p.createdAt, now),
    updatedAt: asStr(p.updatedAt, now),
    source: p.source === "order-line" ? "order-line" : (p.source === "manual" ? "manual" : undefined),
    sourceOrderId: asStr(p.sourceOrderId) || undefined,
    sourceOrderNumber: asStr(p.sourceOrderNumber) || undefined,
    sourceLineId: asStr(p.sourceLineId) || undefined,
    sourceOrderIds: Array.isArray(p.sourceOrderIds) ? p.sourceOrderIds.filter((x): x is string => typeof x === "string") : undefined,
    sourceLineIds: Array.isArray(p.sourceLineIds) ? p.sourceLineIds.filter((x): x is string => typeof x === "string") : undefined,
    catalogKey: asStr(p.catalogKey) || undefined,
    generatedFromOrderLines: typeof p.generatedFromOrderLines === "boolean" ? p.generatedFromOrderLines : undefined,
    lastSeenAt: asStr(p.lastSeenAt) || undefined,
    lastLineTotalPcs: asNum(p.lastLineTotalPcs),
  };
};

export const productToFirestore = (entity: Product): Record<string, unknown> => ({
  ...entity,
  status: entity.status === "inactive" ? "inactive" : "active",
  purchasePrice: entity.purchasePrice ?? null,
  sellingPrice: entity.sellingPrice ?? entity.defaultRmbPerPcs ?? null,
  defaultRmbPerPcs: entity.defaultRmbPerPcs ?? entity.sellingPrice ?? null,
  stockQty: entity.stockQty ?? null,
  lowStockLimit: entity.lowStockLimit ?? null,
  defaultDim: entity.defaultDim ?? null,
  supplierId: entity.supplierId ?? null,
  source: entity.source ?? null,
  sourceOrderId: entity.sourceOrderId ?? null,
  sourceOrderNumber: entity.sourceOrderNumber ?? null,
  sourceLineId: entity.sourceLineId ?? null,
  sourceOrderIds: entity.sourceOrderIds ?? null,
  sourceLineIds: entity.sourceLineIds ?? null,
  catalogKey: entity.catalogKey ?? null,
  generatedFromOrderLines: entity.generatedFromOrderLines ?? null,
  lastSeenAt: entity.lastSeenAt ?? null,
  lastLineTotalPcs: entity.lastLineTotalPcs ?? null,
});

export const customerFromFirestore = (doc: unknown): Customer => doc as Customer;
export const customerToFirestore = (entity: Customer): Record<string, unknown> => ({ ...entity });
export const supplierFromFirestore = (doc: unknown): Supplier => doc as Supplier;
export const supplierToFirestore = (entity: Supplier): Record<string, unknown> => ({ ...entity });
export const paymentAgentFromFirestore = (doc: unknown): PaymentAgent => doc as PaymentAgent;
export const paymentAgentToFirestore = (entity: PaymentAgent): Record<string, unknown> => ({ ...entity });
export const orderFromFirestore = (doc: unknown): Order => doc as Order;
export const orderToFirestore = (entity: Order): Record<string, unknown> => ({ ...entity });
