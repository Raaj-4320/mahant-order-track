import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { productFromFirestore, productToFirestore } from "@/lib/firebase/mappers";
import { productPath, productsPath } from "@/lib/firebase/paths";
import type { Product } from "@/lib/types";
import type { ProductsService } from "@/services/contracts";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `prd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

const normalizeProduct = (product: Product, existing?: Product | null): Product => {
  const now = new Date().toISOString();
  return {
    ...product,
    id: product.id || makeId(),
    productCode: (product.productCode || product.sku || "").trim(),
    sku: (product.sku || product.productCode || "").trim(),
    name: product.name.trim(),
    marka: product.marka?.trim() || "",
    category: product.category?.trim() || "",
    unit: product.unit?.trim() || "pcs",
    defaultDim: product.defaultDim?.trim() || undefined,
    photo: product.photo || "",
    supplierId: product.supplierId || undefined,
    purchasePrice: Number.isFinite(product.purchasePrice as number) ? Number(product.purchasePrice) : undefined,
    sellingPrice: Number.isFinite(product.sellingPrice as number) ? Number(product.sellingPrice) : Number(product.defaultRmbPerPcs ?? 0),
    defaultRmbPerPcs: Number.isFinite(product.defaultRmbPerPcs as number) ? Number(product.defaultRmbPerPcs) : Number(product.sellingPrice ?? 0),
    stockQty: Number.isFinite(product.stockQty as number) ? Number(product.stockQty) : undefined,
    lowStockLimit: Number.isFinite(product.lowStockLimit as number) ? Number(product.lowStockLimit) : undefined,
    status: product.status === "inactive" ? "inactive" : "active",
    createdAt: existing?.createdAt || product.createdAt || now,
    updatedAt: now,
  };
};

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured. Check NEXT_PUBLIC_FIREBASE_* env variables.");
  return db;
}

export const productsFirebaseService: ProductsService = {
  async listProducts() {
    const db = requireDb();
    const snapshot = await getDocs(collection(db, productsPath(BUSINESS_ID)));
    return snapshot.docs.map((d) => productFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  },
  async getProductById(id: string) {
    const db = requireDb();
    const snapshot = await getDoc(doc(db, productPath(BUSINESS_ID, id)));
    if (!snapshot.exists()) return null;
    return productFromFirestore({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) });
  },
  async upsertProduct(product: Product) {
    const db = requireDb();
    const existing = product.id ? await this.getProductById(product.id) : null;
    const normalized = normalizeProduct(product, existing);
    await setDoc(doc(db, productPath(BUSINESS_ID, normalized.id)), productToFirestore(normalized), { merge: true });
    return normalized;
  },
};
