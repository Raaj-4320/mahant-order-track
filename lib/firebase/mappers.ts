import type { Customer, CustomerLedgerEntry, LifecycleMetadata, Order, OrderDependencyMap, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit, Product, RecycleBinEntry, ReferenceRecord, Supplier } from "@/lib/types";
import { seedDetailBoxesFromLegacy, withDerivedLegacyDetails } from "@/lib/orderLineDetails";

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
const asLifecycleStatus = (v: unknown): "active" | "deleted" => (v === "deleted" ? "deleted" : "active");
const asSourceType = (v: unknown): "order" | "manual" | "import" | "system" => {
  if (v === "order" || v === "manual" || v === "import" || v === "system") return v;
  return "manual";
};
const asReferenceRecordType = (v: unknown): "wechatId" | "marka" | "detail" | "orderNumber" => {
  if (v === "wechatId" || v === "marka" || v === "detail" || v === "orderNumber") return v;
  return "detail";
};
const asRecycleItemType = (v: unknown): "order" | "product" | "customer" | "paymentAgent" | "reference" => {
  if (v === "order" || v === "product" || v === "customer" || v === "paymentAgent" || v === "reference") return v;
  return "reference";
};
const asStringArray = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
const asRecord = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

const lifecycleFromUnknown = (value: unknown, defaults?: Partial<LifecycleMetadata>): LifecycleMetadata | undefined => {
  const raw = asRecord(value);
  if (!raw && !defaults) return undefined;
  return {
    id: asStr(raw?.id) || defaults?.id,
    type: asStr(raw?.type) || defaults?.type,
    status: asLifecycleStatus(raw?.status ?? defaults?.status),
    sourceType: asSourceType(raw?.sourceType ?? defaults?.sourceType),
    sourceOrderId: asStr(raw?.sourceOrderId) || defaults?.sourceOrderId,
    createdByOrder: typeof raw?.createdByOrder === "boolean" ? raw.createdByOrder : defaults?.createdByOrder,
    reusable: typeof raw?.reusable === "boolean" ? raw.reusable : defaults?.reusable,
    deletedAt: asStr(raw?.deletedAt) || defaults?.deletedAt,
    restoredAt: asStr(raw?.restoredAt) || defaults?.restoredAt,
    deletedBy: asStr(raw?.deletedBy) || defaults?.deletedBy,
    restoredBy: asStr(raw?.restoredBy) || defaults?.restoredBy,
    recycleBinEntryId: asStr(raw?.recycleBinEntryId) || defaults?.recycleBinEntryId,
    linkedLedgerEntryIds: asStringArray(raw?.linkedLedgerEntryIds) ?? defaults?.linkedLedgerEntryIds,
    linkedTransactionIds: asStringArray(raw?.linkedTransactionIds) ?? defaults?.linkedTransactionIds,
    linkedProductIds: asStringArray(raw?.linkedProductIds) ?? defaults?.linkedProductIds,
    linkedCustomerIds: asStringArray(raw?.linkedCustomerIds) ?? defaults?.linkedCustomerIds,
    linkedPaymentAgentIds: asStringArray(raw?.linkedPaymentAgentIds) ?? defaults?.linkedPaymentAgentIds,
    linkedWechatIds: asStringArray(raw?.linkedWechatIds) ?? defaults?.linkedWechatIds,
    linkedReferenceIds: asStringArray(raw?.linkedReferenceIds) ?? defaults?.linkedReferenceIds,
  };
};

const orderDependencyMapFromUnknown = (value: unknown): OrderDependencyMap | undefined => {
  const raw = asRecord(value);
  if (!raw) return undefined;
  return {
    previousStatus: asStr(raw.previousStatus) as OrderDependencyMap["previousStatus"],
    createdProductIds: asStringArray(raw.createdProductIds) ?? [],
    createdCustomerIds: asStringArray(raw.createdCustomerIds) ?? [],
    createdPaymentAgentIds: asStringArray(raw.createdPaymentAgentIds) ?? [],
    linkedWechatReferenceIds: asStringArray(raw.linkedWechatReferenceIds) ?? [],
    linkedMarkaReferenceIds: asStringArray(raw.linkedMarkaReferenceIds) ?? [],
    linkedDetailReferenceIds: asStringArray(raw.linkedDetailReferenceIds) ?? [],
    linkedOrderNumberReferenceIds: asStringArray(raw.linkedOrderNumberReferenceIds) ?? [],
    customerLedgerEntryIds: asStringArray(raw.customerLedgerEntryIds) ?? [],
    paymentAgentLedgerEntryIds: asStringArray(raw.paymentAgentLedgerEntryIds) ?? [],
    affectedCustomerIds: asStringArray(raw.affectedCustomerIds) ?? [],
    affectedPaymentAgentIds: asStringArray(raw.affectedPaymentAgentIds) ?? [],
  };
};

const paymentAgentSplitSettlementSnapshotFromUnknown = (value: unknown): PaymentAgentOrderSplit["settlementSnapshot"] => {
  const raw = asRecord(value);
  if (!raw) return undefined;
  return {
    orderPortionTotal: asNum(raw.orderPortionTotal) ?? 0,
    existingCredit: asNum(raw.existingCredit) ?? 0,
    creditUsed: asNum(raw.creditUsed) ?? 0,
    payableAfterCredit: asNum(raw.payableAfterCredit) ?? 0,
    remainingPayable: asNum(raw.remainingPayable) ?? 0,
    newCreditCreated: asNum(raw.newCreditCreated) ?? 0,
    resultingCreditBalance: asNum(raw.resultingCreditBalance) ?? 0,
    paidNow: asNum(raw.paidNow) ?? 0,
    status: raw.status === "partial" || raw.status === "paid" || raw.status === "credit" ? raw.status : "unpaid",
    createdAt: asStr(raw.createdAt) || undefined,
    updatedAt: asStr(raw.updatedAt) || undefined,
  };
};

const paymentAgentSplitsFromUnknown = (value: unknown): PaymentAgentOrderSplit[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.reduce<PaymentAgentOrderSplit[]>((acc, item) => {
    const raw = asRecord(item);
    if (!raw) return acc;
    const id = asStr(raw.id);
    if (!id) return acc;
    const rawSnapshot = asRecord(raw.paymentAgentSnapshot);
    acc.push({
      id,
      paymentAgentId: asStr(raw.paymentAgentId),
      paymentBy: asStr(raw.paymentBy),
      paymentAgentName: asStr(raw.paymentAgentName),
      paymentAgentSnapshot: rawSnapshot
        ? {
            id: asStr(rawSnapshot.id),
            name: asStr(rawSnapshot.name),
            code: asStr(rawSnapshot.code) || undefined,
          }
        : undefined,
      assignedAmount: asNum(raw.assignedAmount) ?? 0,
      paidNow: asNum(raw.paidNow),
      note: asStr(raw.note) || undefined,
      settlementSnapshot: paymentAgentSplitSettlementSnapshotFromUnknown(raw.settlementSnapshot),
      createdAt: asStr(raw.createdAt) || undefined,
      updatedAt: asStr(raw.updatedAt) || undefined,
    });
    return acc;
  }, []);
};


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
    lifecycle: lifecycleFromUnknown(p.lifecycle, { type: "product", sourceType: p.source === "order-line" ? "order" : "manual" }),
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
  lifecycle: entity.lifecycle ?? null,
});

export const customerFromFirestore = (doc: unknown): Customer => {
  const c = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(c.id),
    customerCode: asStr(c.customerCode),
    name: asStr(c.name),
    displayName: asStr(c.displayName) || asStr(c.name),
    normalizedName: asStr(c.normalizedName) || undefined,
    source: c.source === "order-line" ? "order-line" : (c.source === "manual" ? "manual" : undefined),
    phone: asStr(c.phone) || undefined,
    email: asStr(c.email) || undefined,
    wechatId: asStr(c.wechatId) || undefined,
    country: asStr(c.country) || undefined,
    city: asStr(c.city) || undefined,
    address: asStr(c.address) || undefined,
    status: asStatus(c.status),
    totalOrders: asNum(c.totalOrders) ?? 0,
    totalSpent: asNum(c.totalSpent) ?? 0,
    outstandingAmount: asNum(c.outstandingAmount) ?? 0,
    totalReceived: asNum(c.totalReceived),
    storeCreditBalance: asNum(c.storeCreditBalance),
    totalReceivableGenerated: asNum(c.totalReceivableGenerated),
    currentReceivable: asNum(c.currentReceivable),
    sourceOrderIds: Array.isArray(c.sourceOrderIds) ? c.sourceOrderIds.filter((x): x is string => typeof x === "string") : undefined,
    createdAt: asStr(c.createdAt, now),
    updatedAt: asStr(c.updatedAt, now),
    lifecycle: lifecycleFromUnknown(c.lifecycle, { type: "customer", sourceType: c.source === "order-line" ? "order" : "manual" }),
  };
};
export const customerToFirestore = (entity: Customer): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  normalizedName: entity.normalizedName ?? null,
  source: entity.source ?? null,
  phone: entity.phone ?? null,
  email: entity.email ?? null,
  wechatId: entity.wechatId ?? null,
  country: entity.country ?? null,
  city: entity.city ?? null,
  address: entity.address ?? null,
  totalReceived: entity.totalReceived ?? null,
  storeCreditBalance: entity.storeCreditBalance ?? null,
  totalReceivableGenerated: entity.totalReceivableGenerated ?? null,
  currentReceivable: entity.currentReceivable ?? null,
  sourceOrderIds: entity.sourceOrderIds ?? null,
  lifecycle: entity.lifecycle ?? null,
}).value as Record<string, unknown>;
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
    lifecycle: lifecycleFromUnknown(p.lifecycle, { type: "paymentAgent", sourceType: "manual" }),
  };
};
export const paymentAgentToFirestore = (entity: PaymentAgent): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  phone: entity.phone ?? null,
  wechatId: entity.wechatId ?? null,
  country: entity.country ?? null,
  city: entity.city ?? null,
  notes: entity.notes ?? null,
  openingCreditBalance: entity.openingCreditBalance ?? 0,
  creditBalance: entity.creditBalance ?? 0,
  totalOrderAmount: entity.totalOrderAmount ?? 0,
  totalPaidAmount: entity.totalPaidAmount ?? 0,
  currentDuePayable: entity.currentDuePayable ?? 0,
  lifecycle: entity.lifecycle ?? null,
}).value as Record<string, unknown>;

export const paymentAgentLedgerEntryFromFirestore = (doc: unknown): PaymentAgentLedgerEntry => {
  const e = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(e.id), agentId: asStr(e.agentId), type: (asStr(e.type) as PaymentAgentLedgerEntry["type"]) || "agent_payment",
    sourceOrderId: asStr(e.sourceOrderId) || undefined, sourceOrderNumber: asStr(e.sourceOrderNumber) || undefined, sourcePaymentAgentSplitId: asStr(e.sourcePaymentAgentSplitId) || undefined, settlementEntryKey: asStr(e.settlementEntryKey) || undefined,
    amount: asNum(e.amount) ?? 0, creditUsed: asNum(e.creditUsed), payableAfterCredit: asNum(e.payableAfterCredit), paidNow: asNum(e.paidNow), remainingPayable: asNum(e.remainingPayable), newCreditCreated: asNum(e.newCreditCreated), dueReduced: asNum(e.dueReduced), creditCreated: asNum(e.creditCreated), resultingCreditBalance: asNum(e.resultingCreditBalance), settlementHash: asStr(e.settlementHash) || undefined, isReversed: typeof e.isReversed === "boolean" ? e.isReversed : undefined, active: typeof e.active === "boolean" ? e.active : undefined, note: asStr(e.note) || undefined, paymentMethod: asStr(e.paymentMethod) || undefined, createdAt: asStr(e.createdAt, now), updatedAt: asStr(e.updatedAt) || undefined, paymentDate: asStr(e.paymentDate) || undefined, reversalOfId: asStr(e.reversalOfId) || undefined, lifecycle: lifecycleFromUnknown(e.lifecycle, { type: "paymentAgentLedger", sourceType: "system" })
  };
};
export const paymentAgentLedgerEntryToFirestore = (entity: PaymentAgentLedgerEntry): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  sourceOrderId: entity.sourceOrderId ?? null,
  sourceOrderNumber: entity.sourceOrderNumber ?? null,
  sourcePaymentAgentSplitId: entity.sourcePaymentAgentSplitId ?? null,
  settlementEntryKey: entity.settlementEntryKey ?? null,
  creditUsed: entity.creditUsed ?? null,
  payableAfterCredit: entity.payableAfterCredit ?? null,
  paidNow: entity.paidNow ?? null,
  remainingPayable: entity.remainingPayable ?? null,
  newCreditCreated: entity.newCreditCreated ?? null,
  dueReduced: entity.dueReduced ?? null,
  creditCreated: entity.creditCreated ?? null,
  resultingCreditBalance: entity.resultingCreditBalance ?? null,
  settlementHash: entity.settlementHash ?? null,
  isReversed: entity.isReversed ?? null,
  active: entity.active ?? null,
  note: entity.note ?? null,
  paymentMethod: entity.paymentMethod ?? null,
  updatedAt: entity.updatedAt ?? null,
  paymentDate: entity.paymentDate ?? null,
  reversalOfId: entity.reversalOfId ?? null,
  lifecycle: entity.lifecycle ?? null,
}).value as Record<string, unknown>;
export const customerLedgerEntryFromFirestore = (doc: unknown): CustomerLedgerEntry => {
  const e = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return { id: asStr(e.id), customerId: asStr(e.customerId), type: (asStr(e.type) as CustomerLedgerEntry["type"]) || "order_receivable", sourceOrderId: asStr(e.sourceOrderId) || undefined, sourceOrderNumber: asStr(e.sourceOrderNumber) || undefined, sourceLineId: asStr(e.sourceLineId) || undefined, amount: asNum(e.amount) ?? 0, debit: asNum(e.debit), credit: asNum(e.credit), balance: asNum(e.balance), receivableReduced: asNum(e.receivableReduced), creditCreated: asNum(e.creditCreated), resultingReceivable: asNum(e.resultingReceivable), resultingStoreCredit: asNum(e.resultingStoreCredit), note: asStr(e.note) || undefined, settlementHash: asStr(e.settlementHash) || undefined, active: typeof e.active === "boolean" ? e.active : undefined, isReversed: typeof e.isReversed === "boolean" ? e.isReversed : undefined, reversalOfId: asStr(e.reversalOfId) || undefined, paymentDate: asStr(e.paymentDate) || undefined, createdAt: asStr(e.createdAt, now), updatedAt: asStr(e.updatedAt) || undefined, lifecycle: lifecycleFromUnknown(e.lifecycle, { type: "customerLedger", sourceType: "system" }) };
};
export const customerLedgerEntryToFirestore = (entity: CustomerLedgerEntry): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  sourceOrderId: entity.sourceOrderId ?? null,
  sourceOrderNumber: entity.sourceOrderNumber ?? null,
  sourceLineId: entity.sourceLineId ?? null,
  debit: entity.debit ?? null,
  credit: entity.credit ?? null,
  balance: entity.balance ?? null,
  receivableReduced: entity.receivableReduced ?? null,
  creditCreated: entity.creditCreated ?? null,
  resultingReceivable: entity.resultingReceivable ?? null,
  resultingStoreCredit: entity.resultingStoreCredit ?? null,
  note: entity.note ?? null,
  settlementHash: entity.settlementHash ?? null,
  active: entity.active ?? null,
  isReversed: entity.isReversed ?? null,
  reversalOfId: entity.reversalOfId ?? null,
  paymentDate: entity.paymentDate ?? null,
  updatedAt: entity.updatedAt ?? null,
  lifecycle: entity.lifecycle ?? null,
}).value as Record<string, unknown>;

export const orderFromFirestore = (doc: unknown): Order => {
  const o = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const lines = Array.isArray(o.lines)
    ? o.lines.map((l) => {
        const line = l as Record<string, unknown>;
        return seedDetailBoxesFromLegacy({
          ...line,
          id: asStr(line.id),
          supplierId: asStr(line.supplierId),
          productId: asStr(line.productId),
          customerId: asStr(line.customerId),
          details: asStr(line.details),
          detail1: asStr(line.detail1) || undefined,
          detail2: asStr(line.detail2) || undefined,
          detail3: asStr(line.detail3) || undefined,
          totalCtns: asNum(line.totalCtns) ?? 0,
          pcsPerCtn: asNum(line.pcsPerCtn) ?? 0,
          rmbPerPcs: asNum(line.rmbPerPcs) ?? 0,
        });
      })
    : [];
  return { ...(o as any), id: asStr(o.id), number: asStr(o.number) || asStr(o.orderNumber), orderNumber: asStr(o.orderNumber) || asStr(o.number), orderPrefix: asStr(o.orderPrefix) || undefined, orderSequenceNumber: asNum(o.orderSequenceNumber) ?? undefined, date: asStr(o.date), loadingDate: asStr(o.loadingDate) || undefined, wechatId: asStr(o.wechatId), status: (asStr(o.status) as Order["status"]) || "draft", paymentStatus: (asStr(o.paymentStatus) as Order["paymentStatus"]) || "pending", paymentBy: asStr(o.paymentBy), paymentAgentId: asStr(o.paymentAgentId), paymentAgentSplits: paymentAgentSplitsFromUnknown(o.paymentAgentSplits), shippingPrice: asNum(o.shippingPrice) ?? 0, paidToPaymentAgentNow: asNum(o.paidToPaymentAgentNow) ?? 0, lines: lines as any, createdAt: asStr(o.createdAt, now), updatedAt: asStr(o.updatedAt, now), savedAt: asStr(o.savedAt) || undefined, draftAutosavedAt: asStr(o.draftAutosavedAt) || undefined, lastEditedAt: asStr(o.lastEditedAt) || undefined, lifecycle: lifecycleFromUnknown(o.lifecycle, { type: "order", sourceType: "manual" }), dependencyMap: orderDependencyMapFromUnknown(o.dependencyMap) } as Order;
};
export const orderToFirestore = (entity: Order): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  number: entity.number ?? "",
  orderNumber: entity.orderNumber ?? "",
  orderPrefix: entity.orderPrefix ?? null,
  orderSequenceNumber: entity.orderSequenceNumber ?? null,
  loadingDate: entity.loadingDate ?? null,
  paymentAgentId: entity.paymentAgentId ?? "",
  paymentBy: entity.paymentBy ?? "",
  shippingPrice: entity.shippingPrice ?? 0,
  paymentByName: entity.paymentByName ?? "",
  paymentAgentName: entity.paymentAgentName ?? "",
  paymentAgentSnapshot: entity.paymentAgentSnapshot ?? { id: "", name: "", code: "" },
  ...(entity.paymentAgentSplits
    ? {
        paymentAgentSplits: entity.paymentAgentSplits.map((split) => ({
          id: split.id ?? "",
          paymentAgentId: split.paymentAgentId ?? "",
          paymentBy: split.paymentBy ?? "",
          paymentAgentName: split.paymentAgentName ?? "",
          paymentAgentSnapshot: split.paymentAgentSnapshot ?? null,
          assignedAmount: split.assignedAmount ?? 0,
          paidNow: split.paidNow ?? null,
          note: split.note ?? null,
          settlementSnapshot: split.settlementSnapshot
            ? {
                ...split.settlementSnapshot,
                orderPortionTotal: split.settlementSnapshot.orderPortionTotal ?? 0,
                existingCredit: split.settlementSnapshot.existingCredit ?? 0,
                creditUsed: split.settlementSnapshot.creditUsed ?? 0,
                payableAfterCredit: split.settlementSnapshot.payableAfterCredit ?? 0,
                remainingPayable: split.settlementSnapshot.remainingPayable ?? 0,
                newCreditCreated: split.settlementSnapshot.newCreditCreated ?? 0,
                resultingCreditBalance: split.settlementSnapshot.resultingCreditBalance ?? 0,
                paidNow: split.settlementSnapshot.paidNow ?? 0,
                status: split.settlementSnapshot.status ?? "unpaid",
                createdAt: split.settlementSnapshot.createdAt ?? null,
                updatedAt: split.settlementSnapshot.updatedAt ?? null,
              }
            : null,
          createdAt: split.createdAt ?? null,
          updatedAt: split.updatedAt ?? null,
        })),
      }
    : {}),
  wechatId: entity.wechatId ?? "",
  paidToPaymentAgentNow: entity.paidToPaymentAgentNow ?? 0,
  paymentAgentSettlementSnapshot: entity.paymentAgentSettlementSnapshot
    ? {
        ...entity.paymentAgentSettlementSnapshot,
        paymentAgentId: entity.paymentAgentSettlementSnapshot.paymentAgentId ?? "",
        paymentAgentName: entity.paymentAgentSettlementSnapshot.paymentAgentName ?? "",
      }
    : null,
  lines: entity.lines.map((line) => ({
    ...withDerivedLegacyDetails(line),
    supplierId: line.supplierId ?? "",
    supplierName: line.supplierName ?? null,
    productId: line.productId ?? "",
    customerId: line.customerId ?? "",
    customerName: line.customerName ?? null,
    customerSnapshot: line.customerSnapshot ?? null,
    supplierSnapshot: line.supplierSnapshot ?? null,
    productSnapshot: line.productSnapshot ?? null,
    productPhotoUrl: line.productPhotoUrl ?? null,
    photoUrl: line.photoUrl ?? null,
    notes: line.notes ?? null,
  })),
  savedAt: entity.savedAt ?? null,
  draftAutosavedAt: (entity as any).draftAutosavedAt ?? null,
  lastEditedAt: (entity as any).lastEditedAt ?? null,
  lifecycle: entity.lifecycle ?? null,
  dependencyMap: entity.dependencyMap ?? null,
}).value as Record<string, unknown>;

export const referenceRecordFromFirestore = (doc: unknown): ReferenceRecord => {
  const value = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(value.id),
    type: asReferenceRecordType(value.type),
    value: asStr(value.value),
    normalizedValue: asStr(value.normalizedValue),
    sourceOrderIds: asStringArray(value.sourceOrderIds),
    status: asStatus(value.status),
    lifecycle: lifecycleFromUnknown(value.lifecycle, { type: "reference", sourceType: "manual" }),
    createdAt: asStr(value.createdAt, now),
    updatedAt: asStr(value.updatedAt, now),
  };
};

export const referenceRecordToFirestore = (entity: ReferenceRecord): Record<string, unknown> => sanitizeFirestorePayload({
  ...entity,
  sourceOrderIds: entity.sourceOrderIds ?? null,
  lifecycle: entity.lifecycle ?? null,
}).value as Record<string, unknown>;

export const recycleBinEntryFromFirestore = (doc: unknown): RecycleBinEntry => {
  const value = (doc ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  return {
    id: asStr(value.id),
    itemId: asStr(value.itemId),
    itemType: asRecycleItemType(value.itemType),
    referenceType: value.referenceType ? asReferenceRecordType(value.referenceType) : undefined,
    label: asStr(value.label),
    originalReference: asStr(value.originalReference),
    sourceOrderId: asStr(value.sourceOrderId) || undefined,
    snapshot: asRecord(value.snapshot),
    deletedAt: asStr(value.deletedAt, now),
    deletedBy: asStr(value.deletedBy) || undefined,
    restoredAt: asStr(value.restoredAt) || undefined,
    restoredBy: asStr(value.restoredBy) || undefined,
    status: asLifecycleStatus(value.status),
  };
};

export const recycleBinEntryToFirestore = (entity: RecycleBinEntry): Record<string, unknown> => ({
  ...entity,
  referenceType: entity.referenceType ?? null,
  sourceOrderId: entity.sourceOrderId ?? null,
  snapshot: entity.snapshot ?? null,
  deletedBy: entity.deletedBy ?? null,
  restoredAt: entity.restoredAt ?? null,
  restoredBy: entity.restoredBy ?? null,
});
