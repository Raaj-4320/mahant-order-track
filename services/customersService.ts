import type { CustomersService } from "@/services/contracts";
import { customersMockService } from "@/services/mock/customersMockService";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { logCustomer } from "@/lib/logger";

const CUSTOMERS_SOURCE = process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? (process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock");

let cachedCustomersService: CustomersService | null = null;

export function getCustomersService(): CustomersService {
  if (cachedCustomersService) return cachedCustomersService;

  logCustomer("customers_service_select_start", { configured: isFirebaseConfigured(), source: CUSTOMERS_SOURCE });
  if (CUSTOMERS_SOURCE !== "firebase") {
    logCustomer("customers_service_select_mock", { reason: "source_not_firebase" });
    cachedCustomersService = customersMockService;
    return cachedCustomersService;
  }
  if (!isFirebaseConfigured()) {
    logCustomer("customers_service_select_mock", { reason: "firebase_not_configured" });
    cachedCustomersService = customersMockService;
    return cachedCustomersService;
  }
  cachedCustomersService = {
    async listCustomers() { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.listCustomers(); },
    async getCustomerById(id) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.getCustomerById(id); },
    async upsertCustomer(customer) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.upsertCustomer!(customer); },
    async recordPaymentToCustomer(customerId, input) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.recordPaymentToCustomer!(customerId, input); },
  };

  return cachedCustomersService;
}
