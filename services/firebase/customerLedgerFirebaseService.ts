import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { customerLedgerEntryFromFirestore, customerLedgerEntryToFirestore } from "@/lib/firebase/mappers";
import { customerLedgerPath, customerPath, customersPath, ordersPath } from "@/lib/firebase/paths";
import type { Customer, CustomerLedgerEntry, Order } from "@/lib/types";
import { lineTotalRmb } from "@/lib/types";
import { orderFromFirestore } from "@/lib/firebase/mappers";
import { buildOrderReceivableEntry, buildOrderReceivableReversalEntry } from "@/services/settlement/customerReceivableLedger";
import { buildCustomerSummaryFromLedger } from "@/services/customers/customerLedgerSummary";
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



  async recalculateCustomerFromLedger(customerId: string): Promise<Customer> {
    const db = requireDb();
    const customerRef = doc(db, customerPath(BUSINESS_ID, customerId));
    const customerSnap = await getDocs(query(collection(db, customersPath(BUSINESS_ID)), where("__name__", "==", customerId)));
    if (customerSnap.empty) throw new Error("Customer not found.");
    const customer = { ...(customerSnap.docs[0].data() as Customer), id: customerId } as Customer;
    const ledger = await this.listCustomerLedgerEntries(customerId);
    const summary = buildCustomerSummaryFromLedger(customer, ledger);
    logLedger("customer_reconcile_summary", { customerId, before: { totalReceivableGenerated: getCustomerTotalReceivable(customer), totalReceived: getCustomerTotalReceived(customer), currentReceivable: getCustomerCurrentReceivable(customer), storeCreditBalance: getCustomerStoreCredit(customer), totalOrders: getCustomerTotalOrders(customer) }, after: summary });
    const next: Customer = { ...customer, ...summary, updatedAt: new Date().toISOString() };
    await runTransaction(db, async (tx) => { tx.set(customerRef, next, { merge: true }); });
    return next;
  },

  async recalculateAllCustomersFromLedger(): Promise<Customer[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, customersPath(BUSINESS_ID)));
    const out: Customer[] = [];
    for (const d of snap.docs) {
      out.push(await this.recalculateCustomerFromLedger(d.id));
    }
    return out;
  },



  async repairCustomerLedgerFromSavedOrders(): Promise<{ savedOrdersScanned: number; missingLedgerEntriesCreated: number; customersRecalculated: number }> {
    const db = requireDb();
    logLedger("repair_start", { path: ordersPath(BUSINESS_ID) });
    const ordersSnap = await getDocs(collection(db, ordersPath(BUSINESS_ID)));
    const savedOrders = ordersSnap.docs.map((d) => orderFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) })).filter((o) => o.status === "saved");
    let created = 0;

    for (const order of savedOrders) {
      await runTransaction(db, async (tx) => {
        for (const line of order.lines) {
          const amount = lineTotalRmb(line as any);
          if (!line.id || !line.customerId || amount <= 0) continue;
          const entryId = `customer-receivable-${order.id}-${line.id}`;
          const ref = doc(db, customerLedgerPath(BUSINESS_ID), entryId);
          const snap = await tx.get(ref);
          if (snap.exists()) continue;
          const entry = buildOrderReceivableEntry(order, line as any, line.customerId);
          tx.set(ref, customerLedgerEntryToFirestore(entry), { merge: true });
          created += 1;
        }
      });
    }

    const recalculated = await this.recalculateAllCustomersFromLedger();
    logLedger("repair_success", { savedOrdersScanned: savedOrders.length, missingLedgerEntriesCreated: created, customersRecalculated: recalculated.length });
    return { savedOrdersScanned: savedOrders.length, missingLedgerEntriesCreated: created, customersRecalculated: recalculated.length };
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
