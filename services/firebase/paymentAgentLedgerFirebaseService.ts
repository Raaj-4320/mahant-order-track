import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { measurePerfAsync } from "@/lib/perfDebug";
import { getFirestoreDb } from "@/lib/firebase/client";
import { paymentAgentLedgerEntryFromFirestore, paymentAgentLedgerEntryToFirestore } from "@/lib/firebase/mappers";
import { paymentAgentLedgerPath } from "@/lib/firebase/paths";
import type { PaymentAgentLedgerEntry } from "@/lib/types";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };

export const paymentAgentLedgerFirebaseService = {
  async listPaymentAgentLedgerEntries(agentId?: string): Promise<PaymentAgentLedgerEntry[]> {
    const db = requireDb();
    const base = collection(db, paymentAgentLedgerPath(BUSINESS_ID));
    const sourceQuery = agentId ? query(base, where("agentId", "==", agentId)) : base;
    const snap = await measurePerfAsync("firestore-read", "paymentAgentLedger.list", { path: paymentAgentLedgerPath(BUSINESS_ID), agentId: agentId || "all" }, () => getDocs(sourceQuery));
    return snap.docs
      .map((d) => paymentAgentLedgerEntryFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .sort((left, right) => {
        const leftDate = left.paymentDate || left.createdAt || "";
        const rightDate = right.paymentDate || right.createdAt || "";
        return rightDate.localeCompare(leftDate);
      });
  },
  async createPaymentAgentLedgerEntry(entry: PaymentAgentLedgerEntry): Promise<PaymentAgentLedgerEntry> {
    const db = requireDb();
    const payload = paymentAgentLedgerEntryToFirestore(entry);
    const created = await measurePerfAsync("firestore-write", "paymentAgentLedger.create", { path: paymentAgentLedgerPath(BUSINESS_ID), agentId: entry.agentId }, () => addDoc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)), payload));
    return { ...entry, id: created.id };
  },
};
