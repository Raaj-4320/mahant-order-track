import { products } from "@/lib/data";
import type { ProductsService } from "@/services/contracts";
import { deepClone } from "./utils";

export const productsMockService: ProductsService = {
  async listProducts() { return deepClone(products); },
  async getProductById(id) { return deepClone(products.find((x) => x.id === id) ?? null); },
};
