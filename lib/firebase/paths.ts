export const businessPath = (businessId: string) => `businesses/${businessId}`;

export const productsPath = (businessId: string) => `${businessPath(businessId)}/products`;
export const productPath = (businessId: string, productId: string) => `${productsPath(businessId)}/${productId}`;

export const customersPath = (businessId: string) => `${businessPath(businessId)}/customers`;
export const customerPath = (businessId: string, customerId: string) => `${customersPath(businessId)}/${customerId}`;

export const suppliersPath = (businessId: string) => `${businessPath(businessId)}/suppliers`;
export const supplierPath = (businessId: string, supplierId: string) => `${suppliersPath(businessId)}/${supplierId}`;

export const paymentAgentsPath = (businessId: string) => `${businessPath(businessId)}/paymentAgents`;
export const paymentAgentPath = (businessId: string, agentId: string) => `${paymentAgentsPath(businessId)}/${agentId}`;

export const ordersPath = (businessId: string) => `${businessPath(businessId)}/orders`;
export const orderPath = (businessId: string, orderId: string) => `${ordersPath(businessId)}/${orderId}`;
