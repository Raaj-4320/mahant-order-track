import { collection, getDocs, limit, query, writeBatch } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { businessPath } from "@/lib/firebase/paths";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const BATCH_SIZE = 400;

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

const collectionPath = (collectionName: string) => `${businessPath(BUSINESS_ID)}/${collectionName}`;

export async function deleteBusinessCollection(collectionName: string): Promise<number> {
  const db = requireDb();
  let deleted = 0;

  while (true) {
    const snap = await getDocs(query(collection(db, collectionPath(collectionName)), limit(BATCH_SIZE)));
    if (snap.empty) break;

    const batch = writeBatch(db);
    for (const row of snap.docs) {
      batch.delete(row.ref);
    }
    await batch.commit();
    deleted += snap.docs.length;
  }

  return deleted;
}

export async function deleteEverythingForBusiness(options?: { includeSettings?: boolean }): Promise<{ orders: number; products: number; paymentAgents: number; paymentAgentLedger: number; customerLedger: number; customers: number; settings?: number; }> {
  const includeSettings = options?.includeSettings === true;

  const results = {
    orders: await deleteBusinessCollection("orders"),
    products: await deleteBusinessCollection("products"),
    paymentAgents: await deleteBusinessCollection("paymentAgents"),
    paymentAgentLedger: await deleteBusinessCollection("paymentAgentLedger"),
    customerLedger: await deleteBusinessCollection("customerLedger"),
    customers: await deleteBusinessCollection("customers"),
  } as { orders: number; products: number; paymentAgents: number; paymentAgentLedger: number; customerLedger: number; customers: number; settings?: number; };

  if (includeSettings) {
    results.settings = await deleteBusinessCollection("settings");
  }

  return results;
}
