export const businessPath = (businessId: string) => `businesses/${businessId}`;
export const membersPath = (businessId: string) => `${businessPath(businessId)}/members`;
export const memberPath = (businessId: string, uid: string) => `${membersPath(businessId)}/${uid}`;
export const settingsPath = (businessId: string) => `${businessPath(businessId)}/settings`;
export const settingsDocPath = (businessId: string, docId: string) => `${settingsPath(businessId)}/${docId}`;

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

export const paymentAgentLedgerPath = (businessId: string) => `${businessPath(businessId)}/paymentAgentLedger`;
export const paymentAgentLedgerEntryPath = (businessId: string, entryId: string) => `${paymentAgentLedgerPath(businessId)}/${entryId}`;
export const customerLedgerPath = (businessId: string) => `${businessPath(businessId)}/customerLedger`;
export const customerLedgerEntryPath = (businessId: string, entryId: string) => `${customerLedgerPath(businessId)}/${entryId}`;
export const referenceRecordsPath = (businessId: string) => `${businessPath(businessId)}/referenceRecords`;
export const referenceRecordPath = (businessId: string, recordId: string) => `${referenceRecordsPath(businessId)}/${recordId}`;
export const recycleBinPath = (businessId: string) => `${businessPath(businessId)}/recycleBin`;
export const recycleBinEntryPath = (businessId: string, entryId: string) => `${recycleBinPath(businessId)}/${entryId}`;

export const orderNumberCounterPath = (businessId: string) => `${businessPath(businessId)}/counters/orderNumbers`;
