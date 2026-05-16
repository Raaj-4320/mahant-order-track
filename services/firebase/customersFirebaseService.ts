import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { customerPath, customersPath } from "@/lib/firebase/paths";
import type { Customer } from "@/lib/types";
import type { CustomersService } from "@/services/contracts";
import { customerLedgerPath } from "@/lib/firebase/paths";
import { customerLedgerEntryToFirestore } from "@/lib/firebase/mappers";
import { buildCustomerPaymentEntry } from "@/services/settlement/customerReceivableLedger";
import { normalizeCustomerName } from "@/services/customers/customerIdentity";
import { logCustomer, logDB } from "@/lib/logger";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `cus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured"); return db; };

export const customersFirebaseService: CustomersService = {
  async listCustomers() {
    const db = requireDb();
    const snap = await getDocs(collection(db, customersPath(BUSINESS_ID)));
    const rows = snap.docs.map((d) => ({ ...(d.data() as Customer), id: d.id } as Customer));
    return rows;
  },
  async getCustomerById(id) {
    const db = requireDb();
    const snap = await getDoc(doc(db, customerPath(BUSINESS_ID, id)));
    if (!snap.exists()) return null;
    return { ...(snap.data() as Customer), id: snap.id } as Customer;
  },
  async upsertCustomer(customer) {
    logCustomer("upsert_customer_start", { incomingId: customer.id, name: customer.name || customer.displayName, path: customersPath(BUSINESS_ID) });
    const db = requireDb();
    const now = new Date().toISOString();
    const id = customer.id || makeId();
    const next: Customer = { ...customer, id, normalizedName: normalizeCustomerName(customer.name || customer.displayName || ""), createdAt: customer.createdAt || now, updatedAt: now };
    await setDoc(doc(db, customerPath(BUSINESS_ID, id)), next, { merge: true });
    logDB("upsert_customer_success", { customerId: id, path: customerPath(BUSINESS_ID, id), normalizedName: next.normalizedName });
    return next;
  },
  async recordPaymentToCustomer(customerId, input) {
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than 0.");
    const db = requireDb();
    const ref = doc(db, customerPath(BUSINESS_ID, customerId));

    const updated = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Customer not found.");
      const customer = { ...(snap.data() as Customer), id: snap.id } as Customer;

      const currentReceivable = customer.currentReceivable ?? customer.outstandingAmount ?? 0;
      const storeCreditBalance = customer.storeCreditBalance ?? 0;
      const receivableReduced = Math.min(currentReceivable, amount);
      const creditCreated = Math.max(0, amount - receivableReduced);
      const newCurrentReceivable = Math.max(0, currentReceivable - receivableReduced);
      const newStoreCreditBalance = storeCreditBalance + creditCreated;
      const totalReceived = (customer.totalReceived ?? 0) + amount;

      const entry = buildCustomerPaymentEntry(customer, { amount, paymentDate: input.paymentDate, note: input.note }, { receivableReduced, creditCreated, newCurrentReceivable, newStoreCreditBalance });
      tx.set(doc(db, customerLedgerPath(BUSINESS_ID), entry.id), customerLedgerEntryToFirestore(entry), { merge: true });

      const next: Customer = { ...customer, updatedAt: new Date().toISOString(), totalReceived, storeCreditBalance: newStoreCreditBalance, currentReceivable: newCurrentReceivable, outstandingAmount: newCurrentReceivable };
      tx.set(ref, next, { merge: true });
      return next;
    });

    return updated;
  }
};
