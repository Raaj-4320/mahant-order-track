import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { orderFromFirestore, orderToFirestore } from "@/lib/firebase/mappers";
import { orderPath, ordersPath } from "@/lib/firebase/paths";
import type { OrdersService } from "@/services/contracts";
import type { Order } from "@/lib/types";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };

export const ordersFirebaseService: OrdersService = {
  async listOrders() {
    const db = requireDb();
    const snap = await getDocs(collection(db, ordersPath(BUSINESS_ID)));
    return snap.docs.map((d) => orderFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) })).sort((a, b) => (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || ""));
  },
  async getOrderById(id) {
    const db = requireDb();
    const snap = await getDoc(doc(db, orderPath(BUSINESS_ID, id)));
    if (!snap.exists()) return null;
    return orderFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },
  async upsertOrder(order: Order) {
    const db = requireDb();
    const now = new Date().toISOString();
    const id = order.id || makeId();
    const existing = await this.getOrderById(id);
    const next: Order = { ...order, id, createdAt: existing?.createdAt || order.createdAt || now, updatedAt: now, savedAt: order.status === "saved" ? (order.savedAt || now) : order.savedAt } as Order;
    await setDoc(doc(db, orderPath(BUSINESS_ID, id)), orderToFirestore(next), { merge: true });
    return next;
  },
  async archiveOrder(id: string) {
    const existing = await this.getOrderById(id);
    if (!existing) return;
    await this.upsertOrder({ ...existing, status: "archived" as any });
  },
  async listDraftOrders() {
    const db = requireDb();
    const q = query(collection(db, ordersPath(BUSINESS_ID)), where("status", "==", "draft"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => orderFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  },
  async autosaveDraft(order: Order) {
    const now = new Date().toISOString();
    return this.upsertOrder({ ...order, status: "draft", draftAutosavedAt: now, lastEditedAt: now } as any);
  },
};
