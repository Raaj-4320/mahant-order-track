import type { Product } from "@/lib/types";
import { productFromFirestore, productToFirestore } from "@/lib/firebase/mappers";
import { productPath, productsPath } from "@/lib/firebase/paths";
import type { ProductsService } from "@/services/contracts";
import { getFirebaseApp } from "@/lib/firebase/client";

type FirestoreModule = {
  getFirestore: (app?: unknown) => unknown;
  collection: (db: unknown, path: string) => unknown;
  getDocs: (ref: unknown) => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
  doc: (db: unknown, path: string) => unknown;
  getDoc: (ref: unknown) => Promise<{ exists: () => boolean; id: string; data: () => unknown }>;
  setDoc: (ref: unknown, data: unknown, options?: { merge?: boolean }) => Promise<void>;
};
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
async function loadFirestoreModule(): Promise<FirestoreModule> { return (await dynamicImport("firebase/firestore")) as FirestoreModule; }
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

export const productsFirebaseService: ProductsService = {
  async listProducts() {
    const { getFirestore, collection, getDocs } = await loadFirestoreModule();
    const app = await getFirebaseApp(); if (!app) throw new Error("Firebase app is not available.");
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, productsPath(BUSINESS_ID)));
    return snapshot.docs.map((d) => productFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  },
  async getProductById(id: string) {
    const { getFirestore, doc, getDoc } = await loadFirestoreModule();
    const app = await getFirebaseApp(); if (!app) throw new Error("Firebase app is not available.");
    const db = getFirestore(app);
    const snapshot = await getDoc(doc(db, productPath(BUSINESS_ID, id)));
    if (!snapshot.exists()) return null;
    return productFromFirestore({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) });
  },
  async upsertProduct(product: Product) {
    const { getFirestore, doc, setDoc } = await loadFirestoreModule();
    const app = await getFirebaseApp(); if (!app) throw new Error("Firebase app is not available.");
    const existing = product.id ? await this.getProductById(product.id) : null;
    const normalized = normalizeProduct(product, existing);
    const db = getFirestore(app);
    await setDoc(doc(db, productPath(BUSINESS_ID, normalized.id)), productToFirestore(normalized), { merge: true });
    return normalized;
  },
};
