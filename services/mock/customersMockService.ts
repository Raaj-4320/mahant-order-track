import { customers } from "@/lib/data";
import type { CustomersService } from "@/services/contracts";
import { deepClone } from "./utils";

export const customersMockService: CustomersService = {
  async listCustomers() { return deepClone(customers); },
  async getCustomerById(id) { return deepClone(customers.find((x) => x.id === id) ?? null); },
};
