import type { ProductsService } from "@/services/contracts";
import { productsMockService } from "@/services/mock/productsMockService";
import { isFirebaseConfigured } from "@/lib/firebase/client";

const FIREBASE_PRODUCTS_FLAG = process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase";

export function getProductsService(): ProductsService {
  if (!FIREBASE_PRODUCTS_FLAG) return productsMockService;
  if (!isFirebaseConfigured()) return productsMockService;

  return {
    async listProducts() {
      const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService");
      return productsFirebaseService.listProducts();
    },
    async getProductById(id: string) {
      const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService");
      return productsFirebaseService.getProductById(id);
    },
  };
}
