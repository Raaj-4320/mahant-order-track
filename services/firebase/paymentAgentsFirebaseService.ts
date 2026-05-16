import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { paymentAgentFromFirestore, paymentAgentLedgerEntryToFirestore, paymentAgentToFirestore } from "@/lib/firebase/mappers";
import { paymentAgentLedgerPath, paymentAgentsPath, paymentAgentPath } from "@/lib/firebase/paths";
import type { PaymentAgentsService } from "@/services/contracts";
import type { PaymentAgent } from "@/lib/types";
import { buildOrderSettlementEntry, buildOrderSettlementReversalEntry } from "@/services/settlement/paymentAgentLedger";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `pa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };
const clamp = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

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
  },
  async applyOrderSettlement(order) {
    if (order.status !== "saved" || !order.paymentAgentSettlementSnapshot) return;
    const agentId = order.paymentAgentId || order.paymentBy;
    if (!agentId) return;
    const db = requireDb();
    const now = new Date().toISOString();
    const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
    const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), `order-settlement-${order.id}`);
    const reversalRef = doc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)));
    return runTransaction(db, async (tx) => {
      const agentSnap = await tx.get(agentRef);
      if (!agentSnap.exists()) throw new Error("Payment agent not found for order settlement.");
      const current = paymentAgentFromFirestore({ id: agentSnap.id, ...(agentSnap.data() as Record<string, unknown>) });
      const existingSnap = await tx.get(settlementRef);
      const existing = existingSnap.exists() ? ({ id: existingSnap.id, ...(existingSnap.data() as Record<string, unknown>) } as any) : null;
      const nextEntry = buildOrderSettlementEntry(order);
      const existingIsActive = !!existing && existing.active !== false && existing.isReversed !== true;
      if (existingIsActive && existing?.settlementHash && existing.settlementHash === nextEntry.settlementHash) return;
      let updated = { ...current };
      if (existingIsActive) {
        updated = {
          ...updated,
          creditBalance: clamp((updated.creditBalance ?? 0) + clamp(existing.creditUsed ?? 0) - clamp(existing.newCreditCreated ?? 0)),
          totalOrderAmount: clamp((updated.totalOrderAmount ?? 0) - clamp(existing.amount ?? 0)),
          totalPaidAmount: clamp((updated.totalPaidAmount ?? 0) - clamp(existing.paidNow ?? 0)),
          currentDuePayable: clamp((updated.currentDuePayable ?? 0) - clamp(existing.remainingPayable ?? 0)),
          updatedAt: now,
        };
        const reversal = buildOrderSettlementReversalEntry(order, existing);
        tx.set(reversalRef, paymentAgentLedgerEntryToFirestore({ ...reversal, id: reversalRef.id, createdAt: now, updatedAt: now }));
        tx.set(doc(db, paymentAgentLedgerPath(BUSINESS_ID), existing.id), { active: false, isReversed: true, updatedAt: now }, { merge: true });
      }
      updated = {
        ...updated,
        creditBalance: clamp((updated.creditBalance ?? 0) - clamp(nextEntry.creditUsed ?? 0) + clamp(nextEntry.newCreditCreated ?? 0)),
        totalOrderAmount: clamp((updated.totalOrderAmount ?? 0) + clamp(nextEntry.amount ?? 0)),
        totalPaidAmount: clamp((updated.totalPaidAmount ?? 0) + clamp(nextEntry.paidNow ?? 0)),
        currentDuePayable: clamp((updated.currentDuePayable ?? 0) + clamp(nextEntry.remainingPayable ?? 0)),
        updatedAt: now,
      };
      tx.set(agentRef, paymentAgentToFirestore(updated), { merge: true });
      tx.set(settlementRef, paymentAgentLedgerEntryToFirestore({ ...nextEntry, id: settlementRef.id, createdAt: now, updatedAt: now }), { merge: true });
    });
  },
  async reverseOrderSettlement(order) {
    if (!order.id) return;
    const db = requireDb();
    const now = new Date().toISOString();
    return runTransaction(db, async (tx) => {
      const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), `order-settlement-${order.id}`);
      const existingSnap = await tx.get(settlementRef);
      if (!existingSnap.exists()) return;
      const existing = { id: existingSnap.id, ...(existingSnap.data() as Record<string, unknown>) } as any;
      if (existing.active === false || existing.isReversed === true) return;
      const agentId = existing.agentId || order.paymentAgentId || order.paymentBy;
      if (!agentId) throw new Error("Payment agent id missing for settlement reversal.");
      const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
      const agentSnap = await tx.get(agentRef);
      if (!agentSnap.exists()) throw new Error("Payment agent not found for settlement reversal.");
      const current = paymentAgentFromFirestore({ id: agentSnap.id, ...(agentSnap.data() as Record<string, unknown>) });
      const updated: PaymentAgent = {
        ...current,
        creditBalance: clamp((current.creditBalance ?? 0) + clamp(existing.creditUsed ?? 0) - clamp(existing.newCreditCreated ?? 0)),
        totalOrderAmount: clamp((current.totalOrderAmount ?? 0) - clamp(existing.amount ?? 0)),
        totalPaidAmount: clamp((current.totalPaidAmount ?? 0) - clamp(existing.paidNow ?? 0)),
        currentDuePayable: clamp((current.currentDuePayable ?? 0) - clamp(existing.remainingPayable ?? 0)),
        updatedAt: now,
      };
      tx.set(agentRef, paymentAgentToFirestore(updated), { merge: true });
      const reversalRef = doc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)));
      const reversal = buildOrderSettlementReversalEntry(order, existing as any);
      tx.set(reversalRef, paymentAgentLedgerEntryToFirestore({ ...reversal, id: reversalRef.id, createdAt: now, updatedAt: now }));
      tx.set(doc(db, paymentAgentLedgerPath(BUSINESS_ID), existing.id), { active: false, isReversed: true, updatedAt: now }, { merge: true });
    });
  },
};
