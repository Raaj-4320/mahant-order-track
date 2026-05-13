import { products as seedProducts } from "@/lib/data";
import type { Product } from "@/lib/types";
import type { ProductsService } from "@/services/contracts";
import { deepClone } from "./utils";

let productsState: Product[] = deepClone(seedProducts);

export const productsMockService: ProductsService = {
  async listProducts() { return deepClone(productsState); },
  async getProductById(id) { return deepClone(productsState.find((x) => x.id === id) ?? null); },
  async upsertProduct(product) {
    const idx = productsState.findIndex((x) => x.id === product.id);
    if (idx >= 0) productsState[idx] = deepClone(product);
    else productsState = [deepClone(product), ...productsState];
    return deepClone(product);
  },
};
