import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { customerLedgerEntryFromFirestore, customerLedgerEntryToFirestore } from "@/lib/firebase/mappers";
import { customerLedgerPath, customerPath, customersPath } from "@/lib/firebase/paths";
import type { Customer, CustomerLedgerEntry, Order } from "@/lib/types";
import { buildOrderReceivableEntry, buildOrderReceivableReversalEntry } from "@/services/settlement/customerReceivableLedger";
import { getCustomerCurrentReceivable, getCustomerStoreCredit, getCustomerTotalOrders, getCustomerTotalReceived, getCustomerTotalReceivable } from "@/services/customers/customerFinance";
import { logDB, logError, logLedger } from "@/lib/logger";

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
          const totalReceivableGenerated = Math.max(0, getCustomerTotalReceivable(c) - prev.amount);
          const currentReceivable = Math.max(0, getCustomerCurrentReceivable(c) - prev.amount);
          const nextOrderIds = (c.sourceOrderIds ?? []).filter((id) => id !== order.id);
          const totalOrders = Math.max(0, nextOrderIds.length || getCustomerTotalOrders(c) - 1);
          logLedger("customer_receivable_reverse_summary", { customerId: prev.customerId, before: { totalReceivableGenerated: getCustomerTotalReceivable(c), currentReceivable: getCustomerCurrentReceivable(c), totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders: getCustomerTotalOrders(c) }, after: { totalReceivableGenerated, currentReceivable, totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders } });
          tx.set(customerRef, { updatedAt: new Date().toISOString(), totalReceivableGenerated, currentReceivable, totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders, sourceOrderIds: nextOrderIds, outstandingAmount: currentReceivable, totalSpent: totalReceivableGenerated }, { merge: true });
        }
        const reversal = buildOrderReceivableReversalEntry(order, prev);
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), reversal.id), customerLedgerEntryToFirestore(reversal), { merge: true });
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), prev.id), { active: false, isReversed: true, updatedAt: new Date().toISOString() }, { merge: true });
      }
    });
  },

  async applyOrderCustomerReceivables(order: Order): Promise<void> {
    logLedger("apply_order_customer_receivables_tx_start", { orderId: order.id, status: order.status, path: customerLedgerPath(BUSINESS_ID) });
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
          const totalReceivableGenerated = getCustomerTotalReceivable(c) + entry.amount;
          const currentReceivable = getCustomerCurrentReceivable(c) + entry.amount;
          const sourceOrderIds = Array.from(new Set([...(c.sourceOrderIds ?? []), order.id]));
          const totalOrders = Math.max(getCustomerTotalOrders(c), sourceOrderIds.length);
          logLedger("customer_receivable_apply_summary", { customerId: line.customerId, before: { totalReceivableGenerated: getCustomerTotalReceivable(c), currentReceivable: getCustomerCurrentReceivable(c), totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders: getCustomerTotalOrders(c) }, after: { totalReceivableGenerated, currentReceivable, totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders } });
          tx.set(customerRef, { updatedAt: new Date().toISOString(), totalReceivableGenerated, currentReceivable, totalReceived: getCustomerTotalReceived(c), storeCreditBalance: getCustomerStoreCredit(c), totalOrders, sourceOrderIds, outstandingAmount: currentReceivable, totalSpent: totalReceivableGenerated }, { merge: true });
        }
        logDB("customer_ledger_entry_write_start", { entryId: entry.id, customerId: line.customerId, path: customerLedgerPath(BUSINESS_ID) });
        tx.set(doc(db, customerLedgerPath(BUSINESS_ID), entry.id), customerLedgerEntryToFirestore(entry), { merge: true });
        logDB("customer_ledger_entry_write_success", { entryId: entry.id, customerId: line.customerId });
      }
    });
  },
};
