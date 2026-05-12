import { suppliers } from "@/lib/data";
import type { SuppliersService } from "@/services/contracts";
import { deepClone } from "./utils";

export const suppliersMockService: SuppliersService = {
  async listSuppliers() { return deepClone(suppliers); },
  async getSupplierById(id) { return deepClone(suppliers.find((x) => x.id === id) ?? null); },
};
