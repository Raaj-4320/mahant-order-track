import type { Customer, CustomerLedgerEntry, Order, PaymentAgent, PaymentAgentLedgerEntry, Product, Supplier } from "@/lib/types";

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


type SanitizeOptions = { keepNullPaths?: string[] };

const shouldKeepNullAtPath = (path: string, options?: SanitizeOptions): boolean => {
  if (!options?.keepNullPaths?.length) return false;
  return options.keepNullPaths.includes(path);
};

export const sanitizeFirestorePayload = <T>(input: T, options?: SanitizeOptions): { value: T; removedUndefinedPaths: string[] } => {
  const removedUndefinedPaths: string[] = [];

  const walk = (value: unknown, path: string): unknown => {
    if (value === undefined) {
      removedUndefinedPaths.push(path || "<root>");
      return undefined;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const next = walk(value[i], `${path}[${i}]`);
        if (next !== undefined) out.push(next);
      }
      return out;
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const childPath = path ? `${path}.${k}` : k;
        const next = walk(v, childPath);
        if (next !== undefined) out[k] = next;
      }
      return out;
    }
    if (value === null && path && !shouldKeepNullAtPath(path, options)) return "";
    return value;
  };

  return { value: walk(input, "") as T, removedUndefinedPaths };
};

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

export const paymentAgentFromFirestore = (doc: unknown): PaymentAgent => {
  const p = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(p.id),
    agentCode: asStr(p.agentCode),
    name: asStr(p.name),
    initials: asStr(p.initials),
    phone: asStr(p.phone) || undefined,
    wechatId: asStr(p.wechatId) || undefined,
    country: asStr(p.country) || undefined,
    city: asStr(p.city) || undefined,
    status: asStatus(p.status),
    openingCreditBalance: asNum(p.openingCreditBalance) ?? 0,
    creditBalance: asNum(p.creditBalance) ?? 0,
    totalOrderAmount: asNum(p.totalOrderAmount) ?? 0,
    totalPaidAmount: asNum(p.totalPaidAmount) ?? 0,
    currentDuePayable: asNum(p.currentDuePayable) ?? 0,
    notes: asStr(p.notes) || undefined,
    createdAt: asStr(p.createdAt, now),
    updatedAt: asStr(p.updatedAt, now),
  };
};
export const paymentAgentToFirestore = (entity: PaymentAgent): Record<string, unknown> => ({ ...entity, phone: entity.phone ?? null, wechatId: entity.wechatId ?? null, country: entity.country ?? null, city: entity.city ?? null, notes: entity.notes ?? null, openingCreditBalance: entity.openingCreditBalance ?? 0, creditBalance: entity.creditBalance ?? 0, totalOrderAmount: entity.totalOrderAmount ?? 0, totalPaidAmount: entity.totalPaidAmount ?? 0, currentDuePayable: entity.currentDuePayable ?? 0 });

export const paymentAgentLedgerEntryFromFirestore = (doc: unknown): PaymentAgentLedgerEntry => {
  const e = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(e.id), agentId: asStr(e.agentId), type: (asStr(e.type) as PaymentAgentLedgerEntry["type"]) || "agent_payment",
    sourceOrderId: asStr(e.sourceOrderId) || undefined, sourceOrderNumber: asStr(e.sourceOrderNumber) || undefined,
    amount: asNum(e.amount) ?? 0, creditUsed: asNum(e.creditUsed), payableAfterCredit: asNum(e.payableAfterCredit), paidNow: asNum(e.paidNow), remainingPayable: asNum(e.remainingPayable), newCreditCreated: asNum(e.newCreditCreated), dueReduced: asNum(e.dueReduced), creditCreated: asNum(e.creditCreated), resultingCreditBalance: asNum(e.resultingCreditBalance), settlementHash: asStr(e.settlementHash) || undefined, isReversed: typeof e.isReversed === "boolean" ? e.isReversed : undefined, active: typeof e.active === "boolean" ? e.active : undefined, note: asStr(e.note) || undefined, createdAt: asStr(e.createdAt, now), updatedAt: asStr(e.updatedAt) || undefined, paymentDate: asStr(e.paymentDate) || undefined, reversalOfId: asStr(e.reversalOfId) || undefined
  };
};
export const paymentAgentLedgerEntryToFirestore = (entity: PaymentAgentLedgerEntry): Record<string, unknown> => ({ ...entity, sourceOrderId: entity.sourceOrderId ?? null, sourceOrderNumber: entity.sourceOrderNumber ?? null, creditUsed: entity.creditUsed ?? null, payableAfterCredit: entity.payableAfterCredit ?? null, paidNow: entity.paidNow ?? null, remainingPayable: entity.remainingPayable ?? null, newCreditCreated: entity.newCreditCreated ?? null, dueReduced: entity.dueReduced ?? null, creditCreated: entity.creditCreated ?? null, resultingCreditBalance: entity.resultingCreditBalance ?? null, settlementHash: entity.settlementHash ?? null, isReversed: entity.isReversed ?? null, active: entity.active ?? null, note: entity.note ?? null, updatedAt: entity.updatedAt ?? null, paymentDate: entity.paymentDate ?? null, reversalOfId: entity.reversalOfId ?? null });
export const customerLedgerEntryFromFirestore = (doc: unknown): CustomerLedgerEntry => {
  const e = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return { id: asStr(e.id), customerId: asStr(e.customerId), type: (asStr(e.type) as CustomerLedgerEntry["type"]) || "order_receivable", sourceOrderId: asStr(e.sourceOrderId) || undefined, sourceOrderNumber: asStr(e.sourceOrderNumber) || undefined, sourceLineId: asStr(e.sourceLineId) || undefined, amount: asNum(e.amount) ?? 0, debit: asNum(e.debit), credit: asNum(e.credit), balance: asNum(e.balance), receivableReduced: asNum(e.receivableReduced), creditCreated: asNum(e.creditCreated), resultingReceivable: asNum(e.resultingReceivable), resultingStoreCredit: asNum(e.resultingStoreCredit), note: asStr(e.note) || undefined, settlementHash: asStr(e.settlementHash) || undefined, active: typeof e.active === "boolean" ? e.active : undefined, isReversed: typeof e.isReversed === "boolean" ? e.isReversed : undefined, reversalOfId: asStr(e.reversalOfId) || undefined, paymentDate: asStr(e.paymentDate) || undefined, createdAt: asStr(e.createdAt, now), updatedAt: asStr(e.updatedAt) || undefined };
};
export const customerLedgerEntryToFirestore = (entity: CustomerLedgerEntry): Record<string, unknown> => ({ ...entity, sourceOrderId: entity.sourceOrderId ?? null, sourceOrderNumber: entity.sourceOrderNumber ?? null, sourceLineId: entity.sourceLineId ?? null, debit: entity.debit ?? null, credit: entity.credit ?? null, balance: entity.balance ?? null, receivableReduced: entity.receivableReduced ?? null, creditCreated: entity.creditCreated ?? null, resultingReceivable: entity.resultingReceivable ?? null, resultingStoreCredit: entity.resultingStoreCredit ?? null, note: entity.note ?? null, settlementHash: entity.settlementHash ?? null, active: entity.active ?? null, isReversed: entity.isReversed ?? null, reversalOfId: entity.reversalOfId ?? null, paymentDate: entity.paymentDate ?? null, updatedAt: entity.updatedAt ?? null });

export const orderFromFirestore = (doc: unknown): Order => {
  const o = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const lines = Array.isArray(o.lines) ? o.lines.map((l) => ({ ...(l as Record<string, unknown>), id: asStr((l as Record<string, unknown>).id), supplierId: asStr((l as Record<string, unknown>).supplierId), productId: asStr((l as Record<string, unknown>).productId), customerId: asStr((l as Record<string, unknown>).customerId), totalCtns: asNum((l as Record<string, unknown>).totalCtns) ?? 0, pcsPerCtn: asNum((l as Record<string, unknown>).pcsPerCtn) ?? 0, rmbPerPcs: asNum((l as Record<string, unknown>).rmbPerPcs) ?? 0 })) : [];
  return { ...(o as any), id: asStr(o.id), number: asStr(o.number) || asStr(o.orderNumber), orderNumber: asStr(o.orderNumber) || asStr(o.number), date: asStr(o.date), loadingDate: asStr(o.loadingDate) || undefined, wechatId: asStr(o.wechatId), status: (asStr(o.status) as Order["status"]) || "draft", paymentStatus: (asStr(o.paymentStatus) as Order["paymentStatus"]) || "pending", paymentBy: asStr(o.paymentBy), paymentAgentId: asStr(o.paymentAgentId), paidToPaymentAgentNow: asNum(o.paidToPaymentAgentNow) ?? 0, lines: lines as any, createdAt: asStr(o.createdAt, now), updatedAt: asStr(o.updatedAt, now), savedAt: asStr(o.savedAt) || undefined, draftAutosavedAt: asStr(o.draftAutosavedAt) || undefined, lastEditedAt: asStr(o.lastEditedAt) || undefined } as Order;
};
export const orderToFirestore = (entity: Order): Record<string, unknown> => ({ ...entity, savedAt: entity.savedAt ?? null, draftAutosavedAt: (entity as any).draftAutosavedAt ?? null, lastEditedAt: (entity as any).lastEditedAt ?? null });
