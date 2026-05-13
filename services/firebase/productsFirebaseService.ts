import type { Product } from "@/lib/types";
import { productFromFirestore } from "@/lib/firebase/mappers";
import { productsPath } from "@/lib/firebase/paths";
import type { ProductsService } from "@/services/contracts";

type FirestoreModule = {
  getFirestore: (app?: unknown) => unknown;
  collection: (db: unknown, path: string) => unknown;
  getDocs: (ref: unknown) => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
  doc: (db: unknown, path: string, id: string) => unknown;
  getDoc: (ref: unknown) => Promise<{ exists: () => boolean; id: string; data: () => unknown }>;
};

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;

async function loadFirestoreModule(): Promise<FirestoreModule> {
  return (await dynamicImport("firebase/firestore")) as FirestoreModule;
}

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "default";

export const productsFirebaseService: ProductsService = {
  async listProducts(): Promise<Product[]> {
    const { getFirestore, collection, getDocs } = await loadFirestoreModule();
    const { getFirebaseApp } = await import("@/lib/firebase/client");
    const app = getFirebaseApp();
    if (!app) throw new Error("Firebase app is not available.");

    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, productsPath(BUSINESS_ID)));
    return snapshot.docs.map((d) => productFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  },

  async getProductById(id: string): Promise<Product | null> {
    const { getFirestore, doc, getDoc } = await loadFirestoreModule();
    const { getFirebaseApp } = await import("@/lib/firebase/client");
    const app = getFirebaseApp();
    if (!app) throw new Error("Firebase app is not available.");

    const db = getFirestore(app);
    const snapshot = await getDoc(doc(db, productsPath(BUSINESS_ID), id));
    if (!snapshot.exists()) return null;
    return productFromFirestore({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) });
  },
};
