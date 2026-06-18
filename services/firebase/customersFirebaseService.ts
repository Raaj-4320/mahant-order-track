import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb, requireFirebaseBusinessId } from "@/lib/firebase/client";
import { customerPath, customersPath } from "@/lib/firebase/paths";
import { areBusinessValuesEqual } from "@/lib/firebase/noopWrite";
import type { Customer } from "@/lib/types";
import type { CustomersService } from "@/services/contracts";
import { customerLedgerPath } from "@/lib/firebase/paths";
import { customerFromFirestore, customerLedgerEntryToFirestore, customerToFirestore } from "@/lib/firebase/mappers";
import { buildCustomerPaymentEntry } from "@/services/settlement/customerReceivableLedger";
import { normalizeCustomerName } from "@/services/customers/customerIdentity";
import { getCustomerCurrentReceivable, getCustomerStoreCredit, getCustomerTotalReceived, getCustomerTotalReceivable } from "@/services/customers/customerFinance";
import { logCustomer, logDB } from "@/lib/logger";

const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `cus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const businessId = () => requireFirebaseBusinessId();

const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured"); return db; };

export const customersFirebaseService: CustomersService = {
  async listCustomers() {
    const db = requireDb();
    const snap = await getDocs(collection(db, customersPath(businessId())));
    const rows = snap.docs.map((d) => customerFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    return rows;
  },
  async getCustomerById(id) {
    const db = requireDb();
    const snap = await getDoc(doc(db, customerPath(businessId(), id)));
    if (!snap.exists()) return null;
    return customerFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },
  async upsertCustomer(customer) {
    const bizId = businessId();
logCustomer("upsert_customer_start", { incomingId: customer.id, name: customer.name || customer.displayName, path: customersPath(bizId) });
    const db = requireDb();
    const now = new Date().toISOString();
    const id = customer.id || makeId();
    const existing = customer.id ? await this.getCustomerById(customer.id) : null;
    const next: Customer = { ...customer, id, normalizedName: normalizeCustomerName(customer.name || customer.displayName || ""), createdAt: existing?.createdAt || customer.createdAt || now, updatedAt: now };
    if (existing) {
      if (areBusinessValuesEqual(customerToFirestore(existing), customerToFirestore(next))) {
        return existing;
      }
    }
    try {
      await setDoc(doc(db, customerPath(bizId, id)), customerToFirestore(next), { merge: true });
} catch (e) {
throw e;
    }
    logDB("upsert_customer_success", { customerId: id, path: customerPath(bizId, id), normalizedName: next.normalizedName });
    return next;
  },
  async recordPaymentToCustomer(customerId, input) {
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than 0.");
    const db = requireDb();
    const bizId = businessId();
    const ref = doc(db, customerPath(bizId, customerId));

    const updated = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Customer not found.");
      const customer = { ...(snap.data() as Customer), id: snap.id } as Customer;

      const currentReceivable = getCustomerCurrentReceivable(customer);
      const storeCreditBalance = getCustomerStoreCredit(customer);
      const receivableReduced = Math.min(currentReceivable, amount);
      const creditCreated = Math.max(0, amount - receivableReduced);
      const newCurrentReceivable = Math.max(0, currentReceivable - receivableReduced);
      const newStoreCreditBalance = storeCreditBalance + creditCreated;
      const totalReceived = getCustomerTotalReceived(customer) + amount;
      const totalReceivableGenerated = getCustomerTotalReceivable(customer);

      const entry = buildCustomerPaymentEntry(customer, { amount, paymentDate: input.paymentDate, note: input.note }, { receivableReduced, creditCreated, newCurrentReceivable, newStoreCreditBalance });
      tx.set(doc(db, customerLedgerPath(bizId), entry.id), customerLedgerEntryToFirestore(entry), { merge: true });

      logCustomer("customer_payment_update_summary", { customerId, before: { currentReceivable, totalReceivableGenerated, totalReceived: getCustomerTotalReceived(customer), storeCreditBalance }, after: { currentReceivable: newCurrentReceivable, totalReceivableGenerated, totalReceived, storeCreditBalance: newStoreCreditBalance } });
      const next: Customer = { ...customer, updatedAt: new Date().toISOString(), totalReceivableGenerated, totalReceived, storeCreditBalance: newStoreCreditBalance, currentReceivable: newCurrentReceivable, outstandingAmount: newCurrentReceivable, totalSpent: totalReceivableGenerated };
      tx.set(ref, customerToFirestore(next), { merge: true });
      return next;
    });

    return updated;
  },
  async deleteCustomer(id) {
const existing = await this.getCustomerById(id);
    if (!existing) throw new Error("Customer not found.");
    const bizId = businessId();
    try {
      await deleteDoc(doc(requireDb(), customerPath(bizId, id)));
} catch (e: unknown) {
throw e;
    }
  },
};

