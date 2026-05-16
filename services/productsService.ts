import type { ProductsService } from "@/services/contracts";
import { productsMockService } from "@/services/mock/productsMockService";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { logDB, logProduct } from "@/lib/logger";

const FIREBASE_PRODUCTS_FLAG = process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase";

export function getProductsService(): ProductsService {
  logProduct("products_service_selected", { firebaseFlag: FIREBASE_PRODUCTS_FLAG, firebaseConfigured: isFirebaseConfigured() });
  if (!FIREBASE_PRODUCTS_FLAG || !isFirebaseConfigured()) return productsMockService;
  return {
    async listProducts() { const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService"); return productsFirebaseService.listProducts(); },
    async getProductById(id: string) { const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService"); return productsFirebaseService.getProductById(id); },
    async upsertProduct(product) { const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService"); return productsFirebaseService.upsertProduct(product); },
    async archiveProduct(id: string) { const { productsFirebaseService } = await import("@/services/firebase/productsFirebaseService"); return productsFirebaseService.archiveProduct(id); },
  };
}
