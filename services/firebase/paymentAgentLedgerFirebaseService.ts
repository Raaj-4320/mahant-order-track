import { addDoc, collection, getDocs, orderBy, query, where } from "firebase/firestore";
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
    const q = agentId ? query(base, where("agentId", "==", agentId), orderBy("createdAt", "desc")) : query(base, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => paymentAgentLedgerEntryFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  },
  async createPaymentAgentLedgerEntry(entry: PaymentAgentLedgerEntry): Promise<PaymentAgentLedgerEntry> {
    const db = requireDb();
    const payload = paymentAgentLedgerEntryToFirestore(entry);
    const created = await addDoc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)), payload);
    return { ...entry, id: created.id };
  },
};
