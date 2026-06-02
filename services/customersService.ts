import type { CustomersService } from "@/services/contracts";
import { customersMockService } from "@/services/mock/customersMockService";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { customersDataSourceSelection } from "@/lib/runtimeConfig";

let cachedCustomersService: CustomersService | null = null;
let cachedCustomersSource: "mock" | "firebase" | null = null;

export function getCustomersService(): CustomersService {
  const selection = customersDataSourceSelection();
  if (cachedCustomersService && cachedCustomersSource === selection.source) return cachedCustomersService;

if (selection.source !== "firebase") {
    if (!selection.hasFirebaseConfig)
cachedCustomersService = customersMockService;
    cachedCustomersSource = selection.source;
    return cachedCustomersService;
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for customers but Firebase is not configured.");
  cachedCustomersService = {
    async listCustomers() { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.listCustomers(); },
    async getCustomerById(id) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.getCustomerById(id); },
    async upsertCustomer(customer) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.upsertCustomer!(customer); },
    async recordPaymentToCustomer(customerId, input) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.recordPaymentToCustomer!(customerId, input); },
    async deleteCustomer(id) { const { customersFirebaseService } = await import("@/services/firebase/customersFirebaseService"); return customersFirebaseService.deleteCustomer?.(id); },
  };
  cachedCustomersSource = selection.source;

  return cachedCustomersService;
}

