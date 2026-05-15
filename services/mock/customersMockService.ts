import { customers } from "@/lib/data";
import type { CustomersService } from "@/services/contracts";
import { deepClone } from "./utils";
import { isDemoDataEnabled } from "@/lib/runtimeConfig";

const mockCustomers = () => deepClone(isDemoDataEnabled() ? customers : []);

export const customersMockService: CustomersService = {
  async listCustomers() { return mockCustomers(); },
  async getCustomerById(id) { const rows = mockCustomers(); return deepClone(rows.find((x) => x.id === id) ?? null); },
};
