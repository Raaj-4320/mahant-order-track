export type EntityStatus = "active" | "inactive";
export type LifecycleStatus = "active" | "deleted";
export type LifecycleSourceType = "order" | "manual" | "import" | "system";
export type OrderStatus = "scheduled" | "pending" | "packed" | "received" | "completed" | "delayed" | "draft" | "saved" | "cancelled" | "archived";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "pending";
export type LoadingStatus = "idle" | "loading" | "success" | "error";
export type ReferenceRecordType = "wechatId" | "marka" | "detail" | "orderNumber";
export type RecycleBinItemType = "order" | "product" | "customer" | "paymentAgent" | "reference";

export type EntitySnapshot = { id: string; code?: string; name: string };
export type LifecycleMetadata = {
  id?: string;
  type?: string;
  status: LifecycleStatus;
  sourceType: LifecycleSourceType;
  sourceOrderId?: string;
  createdByOrder?: boolean;
  reusable?: boolean;
  deletedAt?: string;
  restoredAt?: string;
  deletedBy?: string;
  restoredBy?: string;
  recycleBinEntryId?: string;
  linkedLedgerEntryIds?: string[];
  linkedTransactionIds?: string[];
  linkedProductIds?: string[];
  linkedCustomerIds?: string[];
  linkedPaymentAgentIds?: string[];
  linkedWechatIds?: string[];
  linkedReferenceIds?: string[];
};
export type OrderDependencyMap = {
  previousStatus?: OrderStatus;
  createdProductIds: string[];
  createdCustomerIds: string[];
  createdPaymentAgentIds: string[];
  linkedWechatReferenceIds: string[];
  linkedMarkaReferenceIds: string[];
  linkedDetailReferenceIds: string[];
  linkedOrderNumberReferenceIds: string[];
  customerLedgerEntryIds: string[];
  paymentAgentLedgerEntryIds: string[];
  affectedCustomerIds: string[];
  affectedPaymentAgentIds: string[];
};
export type ReferenceRecord = {
  id: string;
  type: ReferenceRecordType;
  value: string;
  normalizedValue: string;
  sourceOrderIds?: string[];
  status: EntityStatus;
  lifecycle?: LifecycleMetadata;
  createdAt: string;
  updatedAt: string;
};
export type RecycleBinEntry = {
  id: string;
  itemId: string;
  itemType: RecycleBinItemType;
  referenceType?: ReferenceRecordType;
  label: string;
  originalReference: string;
  sourceOrderId?: string;
  snapshot?: Record<string, unknown>;
  deletedAt: string;
  deletedBy?: string;
  restoredAt?: string;
  restoredBy?: string;
  status: LifecycleStatus;
};

export type Supplier = { id: string; supplierCode: string; name: string; displayName: string; logoInitials: string; contactPerson: string; phone: string; email?: string; wechatId?: string; country: string; city: string; address?: string; status: EntityStatus; totalOrders: number; totalOrderAmount: number; createdAt: string; updatedAt: string; notes?: string; tags?: string[]; lastOrderDate?: string; outstandingAmount?: number; lifecycle?: LifecycleMetadata; };
export type Customer = { id: string; customerCode: string; name: string; displayName: string; normalizedName?: string; source?: "order-line" | "manual"; phone?: string; email?: string; wechatId?: string; country?: string; city?: string; address?: string; status: EntityStatus; totalOrders: number; totalSpent: number; outstandingAmount: number; totalReceived?: number; storeCreditBalance?: number; totalReceivableGenerated?: number; currentReceivable?: number; sourceOrderIds?: string[]; createdAt: string; updatedAt: string; lifecycle?: LifecycleMetadata; };
export type Product = { id: string; productCode: string; sku: string; name: string; marka: string; category: string; unit: string; defaultDim?: string; photo: string; supplierId?: string; supplierName?: string; supplierSnapshot?: EntitySnapshot; purchasePrice?: number; sellingPrice?: number; defaultRmbPerPcs?: number; stockQty?: number; lowStockLimit?: number; notes?: string; discoveryImages?: string[]; discoveryTotalCtns?: number; discoveryPcsPerCtn?: number; discoveryRate?: number; status: EntityStatus; createdAt: string; updatedAt: string; source?: "order-line" | "manual"; sourceOrderId?: string; sourceOrderNumber?: string; sourceLineId?: string; sourceOrderIds?: string[]; sourceLineIds?: string[]; catalogKey?: string; generatedFromOrderLines?: boolean; lastSeenAt?: string; lastLineTotalPcs?: number; lifecycle?: LifecycleMetadata; };
export type PaymentAgent = { id: string; agentCode: string; name: string; initials: string; phone?: string; wechatId?: string; country?: string; city?: string; status: EntityStatus; totalOrdersPaid?: number; totalPaidAmount?: number; totalOrderAmount?: number; totalPayableAmount?: number; currentDuePayable?: number; createdAt?: string; updatedAt?: string; notes?: string; defaultCurrency?: string; paymentMethods?: string[]; creditBalance?: number; openingCreditBalance?: number; totalUsedAmount?: number; currentPayable?: number; currency?: string; lifecycle?: LifecycleMetadata; };
export type OrderNumberSeries = { id: string; prefix: string; label: string; startNumber: number; lastUsedNumber: number; nextNumber: number; isDefault?: boolean; isActive: boolean; createdAt: string; updatedAt: string; };
export type PaymentAgentSplitSnapshot = { id: string; name: string; code?: string };
export type PaymentAgentSplitSettlementSnapshot = {
  orderPortionTotal: number;
  existingCredit: number;
  creditUsed: number;
  payableAfterCredit: number;
  remainingPayable: number;
  newCreditCreated: number;
  resultingCreditBalance: number;
  paidNow: number;
  status: "unpaid" | "partial" | "paid" | "credit";
  createdAt?: string;
  updatedAt?: string;
};
export type PaymentAgentOrderSplit = {
  id: string;
  paymentAgentId: string;
  paymentBy: string;
  paymentAgentName: string;
  paymentAgentSnapshot?: PaymentAgentSplitSnapshot;
  assignedAmount: number;
  paidNow?: number;
  note?: string;
  settlementSnapshot?: PaymentAgentSplitSettlementSnapshot;
  createdAt?: string;
  updatedAt?: string;
};
export type PaymentAgentPaymentEvent = {
  id: string;
  paymentAgentId: string;
  paymentBy: string;
  paymentAgentName: string;
  paymentAgentSnapshot?: PaymentAgentSplitSnapshot;
  amount: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OrderLine = { id: string; supplierId: string; supplierName?: string; supplierSnapshot?: EntitySnapshot; picDim: string; productId: string; productSnapshot?: EntitySnapshot; marka: string; details?: string; detail1?: string; detail2?: string; detail3?: string; totalCtns: number; pcsPerCtn: number; rmbPerPcs: number; customerId: string; customerName?: string; customerSnapshot?: EntitySnapshot; photoUrl?: string; productPhotoUrl?: string; notes?: string; };

export type Order = { id: string; orderNumber: string; number: string; orderPrefix?: string; orderSequenceNumber?: number; date: string; loadingDate?: string; paymentAgentId: string; paymentBy: string; paymentByName?: string; paymentAgentName?: string; paymentAgentSnapshot?: EntitySnapshot; paymentAgentSplits?: PaymentAgentOrderSplit[]; paymentAgentPaymentEvents?: PaymentAgentPaymentEvent[]; wechatId: string; status: OrderStatus; paymentStatus: PaymentStatus; supplierSummary?: string; customerSummary?: string; totalUniqueItems?: number; subtotal?: number; discount?: number; tax?: number; grandTotal?: number; shippingPrice?: number; paidAmount?: number; dueAmount?: number; paidToPaymentAgentNow?: number; paymentAgentSettlementSnapshot?: { orderTotal: number; existingCredit: number; creditUsed: number; payableAfterCredit: number; remainingPayable: number; newCreditCreated: number; resultingCreditBalance: number; paidNow: number; status: "unpaid" | "partial" | "paid" | "credit"; paymentAgentId?: string; paymentAgentName?: string; createdAt?: string; updatedAt?: string }; lines: OrderLine[]; notes?: string; createdAt?: string; updatedAt?: string; savedAt?: string; draftAutosavedAt?: string; lastEditedAt?: string; lifecycle?: LifecycleMetadata; dependencyMap?: OrderDependencyMap; };
export type PaymentAgentLedgerEntry = { id: string; agentId: string; type: "opening_credit" | "order_settlement" | "order_settlement_reversal" | "agent_payment" | "agent_payment_reversal"; sourceOrderId?: string; sourceOrderNumber?: string; sourcePaymentAgentSplitId?: string; settlementEntryKey?: string; amount: number; dueReduced?: number; creditCreated?: number; creditUsed?: number; paidNow?: number; payableAfterCredit?: number; remainingPayable?: number; newCreditCreated?: number; resultingCreditBalance?: number; settlementHash?: string; isReversed?: boolean; active?: boolean; note?: string; paymentMethod?: string; createdAt: string; updatedAt?: string; paymentDate?: string; reversalOfId?: string; lifecycle?: LifecycleMetadata; };
export type CustomerLedgerEntry = { id: string; customerId: string; type: "order_receivable" | "order_receivable_reversal" | "customer_payment" | "customer_payment_reversal"; sourceOrderId?: string; sourceOrderNumber?: string; sourceLineId?: string; amount: number; debit?: number; credit?: number; balance?: number; receivableReduced?: number; creditCreated?: number; resultingReceivable?: number; resultingStoreCredit?: number; note?: string; settlementHash?: string; active?: boolean; isReversed?: boolean; reversalOfId?: string; paymentDate?: string; createdAt: string; updatedAt?: string; lifecycle?: LifecycleMetadata; };

export type DashboardOrderRow = { id: string; orderNumber: string; supplierSummary: string; customerSummary: string; totalUniqueItems: number; totalCtns?: number; orderTotal: number; paidBy: string; paymentAgentId?: string; wechatId?: string; orderDate?: string; productsSummary?: string; markaSummary?: string; loadingDate?: string; status: OrderStatus; };
export type PaginationState = { page: number; pageSize: number; total: number };
export type FilterState = { query?: string; status?: string[]; city?: string[]; dateFrom?: string; dateTo?: string };
