import { collection, doc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import type { Order, OrderNumberSeries } from "@/lib/types";
import type { OrderNumberSeriesService } from "@/services/contracts";
import { backfillSeriesFromOrders, createSeriesRecord, formatSeriesOrderNumber, mergeOrderSeries, orderNumberExists, parseOrderNumber } from "@/lib/orderNumberSeries";
import { getFirestoreDb, requireFirebaseBusinessId } from "@/lib/firebase/client";
import { orderNumberSeriesDocPath, orderNumberSeriesPath } from "@/lib/firebase/paths";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

function normalizeSeriesDoc(raw: Record<string, unknown>): OrderNumberSeries {
  const prefix = typeof raw.prefix === "string" ? raw.prefix : "";
  const label = typeof raw.label === "string" ? raw.label : prefix.replace(/-+$/g, "");
  const startNumber = Number(raw.startNumber);
  const lastUsedNumber = Number(raw.lastUsedNumber);
  const nextNumber = Number(raw.nextNumber);
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    prefix,
    label,
    startNumber: Number.isInteger(startNumber) && startNumber > 0 ? startNumber : 1,
    lastUsedNumber: Number.isInteger(lastUsedNumber) ? lastUsedNumber : Math.max(0, startNumber - 1),
    nextNumber: Number.isInteger(nextNumber) && nextNumber > 0 ? nextNumber : Math.max(1, lastUsedNumber + 1),
    isDefault: typeof raw.isDefault === "boolean" ? raw.isDefault : false,
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : true,
    createdAt,
    updatedAt,
  };
}

async function persistMissingDerivedSeries(db: ReturnType<typeof requireDb>, businessId: string, derivedSeries: OrderNumberSeries[], storedSeries: OrderNumberSeries[]) {
  const storedPrefixes = new Set(storedSeries.map((series) => series.prefix));
  for (const series of derivedSeries) {
    if (storedPrefixes.has(series.prefix)) continue;
    await setDoc(doc(db, orderNumberSeriesDocPath(businessId, series.id)), series, { merge: true });
  }
}

export const orderNumberSeriesFirebaseService: OrderNumberSeriesService = {
  async listOrderNumberSeries(orders = []) {
    const db = requireDb();
    const businessId = requireFirebaseBusinessId();
    const snapshot = await getDocs(collection(db, orderNumberSeriesPath(businessId)));
    const stored = snapshot.docs.map((docSnap) => normalizeSeriesDoc({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }));
    const derived = backfillSeriesFromOrders(orders);
    if (derived.length > 0) {
      await persistMissingDerivedSeries(db, businessId, derived, stored);
    }
    return mergeOrderSeries(stored, derived);
  },
  async createOrderNumberSeries(input, orders = []) {
    const db = requireDb();
    const businessId = requireFirebaseBusinessId();
    const currentSeries = await this.listOrderNumberSeries(orders);
    const record = createSeriesRecord(input);
    if (currentSeries.some((series) => series.prefix === record.prefix)) {
      throw new Error("This series already exists.");
    }
    if (orderNumberExists(orders, formatSeriesOrderNumber(record.prefix, record.nextNumber))) {
      throw new Error("This order number already exists. Choose another starting number.");
    }
    await setDoc(doc(db, orderNumberSeriesDocPath(businessId, record.id)), record, { merge: true });
    return record;
  },
  async syncOrderNumberSeriesFromOrder(order, orders = []) {
    const parsed = parseOrderNumber(order.number || order.orderNumber);
    if (!parsed) return null;
    const db = requireDb();
    const businessId = requireFirebaseBusinessId();
    const currentSeries = await this.listOrderNumberSeries(orders);
    const existing = currentSeries.find((series) => series.prefix === parsed.prefix);
    if (!existing) return null;
    const seriesRef = doc(db, orderNumberSeriesDocPath(businessId, existing.id));
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(seriesRef);
      const base = snapshot.exists()
        ? normalizeSeriesDoc({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) })
        : existing;
      const updated: OrderNumberSeries = {
        ...base,
        startNumber: Math.min(base.startNumber, parsed.sequenceNumber),
        lastUsedNumber: Math.max(base.lastUsedNumber, parsed.sequenceNumber),
        nextNumber: Math.max(base.nextNumber, parsed.sequenceNumber + 1),
        updatedAt: new Date().toISOString(),
      };
      transaction.set(seriesRef, updated, { merge: true });
      return updated;
    });
  },
};
