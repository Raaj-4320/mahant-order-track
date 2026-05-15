import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { paymentAgentFromFirestore, paymentAgentLedgerEntryToFirestore, paymentAgentToFirestore } from "@/lib/firebase/mappers";
import { paymentAgentLedgerPath, paymentAgentsPath, paymentAgentPath } from "@/lib/firebase/paths";
import type { PaymentAgentsService } from "@/services/contracts";
import type { PaymentAgent } from "@/lib/types";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `pa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };

export const paymentAgentsFirebaseService: PaymentAgentsService = {
  async listPaymentAgents() {
    const db = requireDb();
    const snap = await getDocs(collection(db, paymentAgentsPath(BUSINESS_ID)));
    return snap.docs.map((d) => paymentAgentFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async getPaymentAgentById(id) {
    const db = requireDb();
    const snap = await getDoc(doc(db, paymentAgentPath(BUSINESS_ID, id)));
    if (!snap.exists()) return null;
    return paymentAgentFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },
  async upsertPaymentAgent(agent: PaymentAgent) {
    const db = requireDb();
    const now = new Date().toISOString();
    const id = agent.id || makeId();
    const existing = await this.getPaymentAgentById(id);
    const next: PaymentAgent = { ...agent, id, createdAt: existing?.createdAt || agent.createdAt || now, updatedAt: now, creditBalance: agent.creditBalance ?? agent.openingCreditBalance ?? 0, openingCreditBalance: agent.openingCreditBalance ?? 0, totalOrderAmount: agent.totalOrderAmount ?? 0, totalPaidAmount: agent.totalPaidAmount ?? 0, currentDuePayable: agent.currentDuePayable ?? 0 };
    await setDoc(doc(db, paymentAgentPath(BUSINESS_ID, id)), paymentAgentToFirestore(next), { merge: true });
    return next;
  },
  async recordPaymentToAgent(agentId, payment) {
    const db = requireDb();
    if (!(Number(payment.amount) > 0)) throw new Error("Payment amount must be greater than 0.");
    const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
    const ledgerRef = doc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)));
    const now = new Date().toISOString();
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(agentRef);
      if (!snap.exists()) throw new Error("Payment agent not found.");
      const current = paymentAgentFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
      const amount = Math.max(0, Number(payment.amount) || 0);
      const due = Math.max(0, current.currentDuePayable ?? 0);
      const dueReduced = Math.min(due, amount);
      const creditCreated = Math.max(0, amount - dueReduced);
      const updated: PaymentAgent = { ...current, currentDuePayable: due - dueReduced, creditBalance: Math.max(0, (current.creditBalance ?? 0) + creditCreated), totalPaidAmount: Math.max(0, (current.totalPaidAmount ?? 0) + amount), updatedAt: now };
      tx.set(agentRef, paymentAgentToFirestore(updated), { merge: true });
      tx.set(ledgerRef, paymentAgentLedgerEntryToFirestore({ id: ledgerRef.id, agentId, type: "agent_payment", amount, dueReduced, creditCreated, note: payment.note, paymentDate: payment.paymentDate || now, createdAt: now }));
      return updated;
    });
  },
  async listPaymentAgentLedger(agentId: string) {
    const { paymentAgentLedgerFirebaseService } = await import("@/services/firebase/paymentAgentLedgerFirebaseService");
    return paymentAgentLedgerFirebaseService.listPaymentAgentLedgerEntries(agentId);
  },
  async recalculatePaymentAgentsFromOrders() {
    return this.listPaymentAgents();
  },
  async archivePaymentAgent(id: string) {
    const existing = await this.getPaymentAgentById(id);
    if (!existing) return;
    await this.upsertPaymentAgent({ ...existing, status: "inactive" });
  }
};
