import type { CustomersService } from "@/services/contracts";
import { customersMockService } from "@/services/mock/customersMockService";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { logCustomer, logDB, logError } from "@/lib/logger";

const CUSTOMERS_SOURCE = process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? (process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock");

export function getCustomersService(): CustomersService {
  logCustomer("customers_service_select_start", { configured: isFirebaseConfigured(), source: CUSTOMERS_SOURCE });
  if (CUSTOMERS_SOURCE !== "firebase") { logCustomer("customers_service_select_mock", { reason: "source_not_firebase" }); return customersMockService; }
  if (!isFirebaseConfigured()) { logCustomer("customers_service_select_mock", { reason: "firebase_not_configured" }); return customersMockService; }
  return {
    async listCustomers() { logDB("list_customers_start", { source: "firebase-facade" }); try { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); const rows = await customersFirebaseService.listCustomers(); logDB("list_customers_success", { source: "firebase-facade", count: rows.length }); return rows; } catch (e) { logError("list_customers_failure", { source: "firebase-facade", error: e instanceof Error ? e.message : String(e) }); throw e; } },
    async getCustomerById(id) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.getCustomerById(id); },
    async upsertCustomer(customer) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.upsertCustomer!(customer); },
    async recordPaymentToCustomer(customerId, input) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.recordPaymentToCustomer!(customerId, input); },
  };
}
