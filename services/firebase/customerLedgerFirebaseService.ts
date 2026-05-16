import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { customerLedgerEntryFromFirestore, customerLedgerEntryToFirestore } from "@/lib/firebase/mappers";
import { customerLedgerPath, customerPath, customersPath } from "@/lib/firebase/paths";
import type { Customer, CustomerLedgerEntry, Order } from "@/lib/types";
import { buildOrderReceivableEntry, buildOrderReceivableReversalEntry } from "@/services/settlement/customerReceivableLedger";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };

export const customerLedgerFirebaseService = {
  async listCustomerLedgerEntries(customerId?: string): Promise<CustomerLedgerEntry[]> {
    const db = requireDb();
    const base = collection(db, customerLedgerPath(BUSINESS_ID));
    const snap = customerId ? await getDocs(query(base, where("customerId", "==", customerId))) : await getDocs(base);
    return snap.docs.map((d) => customerLedgerEntryFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) })).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  },

  async reverseOrderCustomerReceivables(order: Order): Promise<void> {
    const db = requireDb();
    const active = await getDocs(query(collection(db, customerLedgerPath(BUSINESS_ID)), where("sourceOrderId", "==", order.id), where("type", "==", "order_receivable"), where("active", "==", true)));
    if (active.empty) return;
    await runTransaction(db, async (tx) => {
      for (const docSnap of active.docs) {
        const prev = customerLedgerEntryFromFirestore({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) });
        const customerRef = doc(db, customerPath(BUSINESS_ID, prev.customerId));
        const customerSnap = await tx.get(customerRef);
        if (customerSnap.exists()) {
          const c = customerSnap.data() as Customer;
          tx.set(customerRef, { updatedAt: new Date().toISOString(), outstandingAmount: Math.max(0, (c.outstandingAmount ?? 0) - prev.amount), totalSpent: Math.max(0, (c.totalSpent ?? 0) - prev.amount) }, { merge: true });
        }
        const reversal = buildOrderReceivableReversalEntry(order, prev);
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), reversal.id), customerLedgerEntryToFirestore(reversal), { merge: true });
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), prev.id), { active: false, isReversed: true, updatedAt: new Date().toISOString() }, { merge: true });
      }
    });
  },

  async applyOrderCustomerReceivables(order: Order): Promise<void> {
    if (order.status !== "saved") return;
    const db = requireDb();
    await this.reverseOrderCustomerReceivables(order);
    const lines = order.lines.filter((l) => l.customerId && l.id && (l.totalCtns || l.pcsPerCtn || l.rmbPerPcs));
    if (!lines.length) return;

    await runTransaction(db, async (tx) => {
      for (const line of lines) {
        const entry = buildOrderReceivableEntry(order, line, line.customerId);
        const existing = await tx.get(doc(db, customerLedgerPath(BUSINESS_ID), entry.id));
        if (existing.exists()) {
          const prev = customerLedgerEntryFromFirestore({ id: existing.id, ...(existing.data() as Record<string, unknown>) });
          if (prev.active && prev.settlementHash === entry.settlementHash) continue;
        }
        const customerRef = doc(db, customerPath(BUSINESS_ID, line.customerId));
        const customerSnap = await tx.get(customerRef);
        if (customerSnap.exists()) {
          const c = customerSnap.data() as Customer;
          tx.set(customerRef, { updatedAt: new Date().toISOString(), outstandingAmount: (c.outstandingAmount ?? 0) + entry.amount, totalSpent: (c.totalSpent ?? 0) + entry.amount }, { merge: true });
        }
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), entry.id), customerLedgerEntryToFirestore(entry), { merge: true });
      }
    });
  },
};
