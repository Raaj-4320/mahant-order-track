import type { Customer } from "@/lib/types";

const asFinite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export const getCustomerCurrentReceivable = (customer: Customer): number => {
  return asFinite(customer.currentReceivable) ?? asFinite(customer.outstandingAmount) ?? 0;
};

export const getCustomerTotalReceivable = (customer: Customer): number => {
  return asFinite(customer.totalReceivableGenerated) ?? asFinite(customer.totalSpent) ?? 0;
};

export const getCustomerTotalReceived = (customer: Customer): number => {
  return asFinite(customer.totalReceived) ?? 0;
};

export const getCustomerStoreCredit = (customer: Customer): number => {
  return asFinite(customer.storeCreditBalance) ?? 0;
};

export const getCustomerTotalOrders = (customer: Customer): number => {
  return asFinite(customer.totalOrders) ?? (Array.isArray(customer.sourceOrderIds) ? customer.sourceOrderIds.length : 0);
};
