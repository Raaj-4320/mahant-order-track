import { suppliers } from "@/lib/data";
import type { SuppliersService } from "@/services/contracts";
import { deepClone } from "./utils";
import { isDemoDataEnabled } from "@/lib/runtimeConfig";

const mockSuppliers = () => deepClone(isDemoDataEnabled() ? suppliers : []);

export const suppliersMockService: SuppliersService = {
  async listSuppliers() { return mockSuppliers(); },
  async getSupplierById(id) { const rows = mockSuppliers(); return deepClone(rows.find((x) => x.id === id) ?? null); },
};
