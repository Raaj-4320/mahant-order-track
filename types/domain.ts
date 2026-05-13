export type EntityStatus = "active" | "inactive";
export type OrderStatus = "scheduled" | "pending" | "packed" | "delayed" | "draft" | "saved" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "pending";
export type LoadingStatus = "idle" | "loading" | "success" | "error";

export type EntitySnapshot = { id: string; code?: string; name: string };

export type Supplier = { id: string; supplierCode: string; name: string; displayName: string; logoInitials: string; contactPerson: string; phone: string; email?: string; wechatId?: string; country: string; city: string; address?: string; status: EntityStatus; totalOrders: number; totalOrderAmount: number; createdAt: string; updatedAt: string; notes?: string; tags?: string[]; lastOrderDate?: string; outstandingAmount?: number; };
export type Customer = { id: string; customerCode: string; name: string; displayName: string; phone?: string; email?: string; wechatId?: string; country?: string; city?: string; address?: string; status: EntityStatus; totalOrders: number; totalSpent: number; outstandingAmount: number; createdAt: string; updatedAt: string; };
export type Product = { id: string; productCode: string; sku: string; name: string; marka: string; category: string; unit: string; defaultDim?: string; photo: string; supplierId?: string; supplierSnapshot?: EntitySnapshot; purchasePrice?: number; sellingPrice?: number; defaultRmbPerPcs?: number; stockQty?: number; lowStockLimit?: number; status: EntityStatus; createdAt: string; updatedAt: string; source?: "order-line" | "manual"; sourceOrderId?: string; sourceOrderNumber?: string; sourceLineId?: string; sourceOrderIds?: string[]; sourceLineIds?: string[]; catalogKey?: string; generatedFromOrderLines?: boolean; lastSeenAt?: string; lastLineTotalPcs?: number; };
export type PaymentAgent = { id: string; agentCode: string; name: string; initials: string; phone: string; wechatId: string; country: string; city?: string; status: EntityStatus; totalOrdersPaid: number; totalPaidAmount: number; createdAt: string; updatedAt: string; notes?: string; defaultCurrency?: string; paymentMethods?: string[]; };

export type OrderLine = { id: string; supplierId: string; supplierSnapshot?: EntitySnapshot; picDim: string; productId: string; productSnapshot?: EntitySnapshot; marka: string; details: string; totalCtns: number; pcsPerCtn: number; rmbPerPcs: number; customerId: string; customerSnapshot?: EntitySnapshot; photoUrl?: string; productPhotoUrl?: string; notes?: string; };

export type Order = { id: string; orderNumber: string; number: string; date: string; loadingDate?: string; paymentAgentId: string; paymentBy: string; paymentAgentSnapshot?: EntitySnapshot; wechatId: string; status: OrderStatus; paymentStatus: PaymentStatus; supplierSummary?: string; customerSummary?: string; totalUniqueItems?: number; subtotal?: number; discount?: number; tax?: number; grandTotal?: number; paidAmount?: number; dueAmount?: number; lines: OrderLine[]; notes?: string; createdAt?: string; updatedAt?: string; };

export type DashboardOrderRow = { id: string; orderNumber: string; supplierSummary: string; customerSummary: string; totalUniqueItems: number; orderTotal: number; paidBy: string; loadingDate?: string; status: OrderStatus; };
export type PaginationState = { page: number; pageSize: number; total: number };
export type FilterState = { query?: string; status?: string[]; city?: string[]; dateFrom?: string; dateTo?: string };
