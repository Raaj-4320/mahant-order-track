import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { areBusinessValuesEqual } from "@/lib/firebase/noopWrite";
import { measurePerfAsync, recordPerfEvent, recordPerfNoopWrite } from "@/lib/perfDebug";
import { paymentAgentFromFirestore, paymentAgentLedgerEntryToFirestore, paymentAgentToFirestore } from "@/lib/firebase/mappers";
import { paymentAgentLedgerPath, paymentAgentsPath, paymentAgentPath } from "@/lib/firebase/paths";
import type { PaymentAgentsService } from "@/services/contracts";
import type { PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit, PaymentAgentSplitSettlementSnapshot } from "@/lib/types";
import { buildOrderSplitSettlementEntry, buildOrderSplitSettlementReversalEntry } from "@/services/settlement/paymentAgentLedger";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";
import {
  getOrderPaymentAgentLedgerEntryIds,
  getOrderPaymentAgentSplits,
  getPaymentAgentSplitAgentId,
  validatePaymentAgentSplits,
} from "@/services/settlement/paymentAgentSplits";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";
const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `pa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const requireDb = () => { const db = getFirestoreDb(); if (!db) throw new Error("Firebase not configured."); return db; };
const clamp = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

const toSplitSettlementSnapshot = (
  split: Pick<PaymentAgentOrderSplit, "assignedAmount" | "paidNow" | "settlementSnapshot">,
): PaymentAgentSplitSettlementSnapshot => {
  const now = new Date().toISOString();
  if (split.settlementSnapshot) {
    return {
      orderPortionTotal: clamp(split.settlementSnapshot.orderPortionTotal),
      existingCredit: clamp(split.settlementSnapshot.existingCredit),
      creditUsed: clamp(split.settlementSnapshot.creditUsed),
      payableAfterCredit: clamp(split.settlementSnapshot.payableAfterCredit),
      remainingPayable: clamp(split.settlementSnapshot.remainingPayable),
      newCreditCreated: clamp(split.settlementSnapshot.newCreditCreated),
      resultingCreditBalance: clamp(split.settlementSnapshot.resultingCreditBalance),
      paidNow: clamp(split.settlementSnapshot.paidNow),
      status: split.settlementSnapshot.status,
      createdAt: now,
      updatedAt: now,
    };
  }

  const settlement = calculatePaymentAgentSettlement({
    orderTotal: clamp(split.assignedAmount),
    existingCredit: 0,
    paidNow: clamp(split.paidNow ?? 0),
  });

  return {
    orderPortionTotal: clamp(settlement.orderTotal),
    existingCredit: clamp(settlement.existingCredit),
    creditUsed: clamp(settlement.creditUsed),
    payableAfterCredit: clamp(settlement.payableAfterCredit),
    remainingPayable: clamp(settlement.remainingPayable),
    newCreditCreated: clamp(settlement.newCreditCreated),
    resultingCreditBalance: clamp(settlement.resultingCreditBalance),
    paidNow: clamp(settlement.paidNow),
    status: settlement.status,
    createdAt: now,
    updatedAt: now,
  };
};

const isActiveSettlementEntry = (entry: PaymentAgentLedgerEntry | null | undefined) =>
  Boolean(entry && entry.active !== false && entry.isReversed !== true);

const applySettlementDelta = (
  agent: PaymentAgent,
  entry: {
    amount?: number;
    creditUsed?: number;
    paidNow?: number;
    remainingPayable?: number;
    newCreditCreated?: number;
  },
  direction: 1 | -1,
  now: string,
): PaymentAgent => ({
  ...agent,
  creditBalance: clamp((agent.creditBalance ?? 0) + direction * (-clamp(entry.creditUsed ?? 0) + clamp(entry.newCreditCreated ?? 0))),
  totalOrderAmount: clamp((agent.totalOrderAmount ?? 0) + direction * clamp(entry.amount ?? 0)),
  totalPaidAmount: clamp((agent.totalPaidAmount ?? 0) + direction * clamp(entry.paidNow ?? 0)),
  currentDuePayable: clamp((agent.currentDuePayable ?? 0) + direction * clamp(entry.remainingPayable ?? 0)),
  updatedAt: now,
});

export const paymentAgentsFirebaseService: PaymentAgentsService = {
  async listPaymentAgents() {
    const db = requireDb();
    const path = paymentAgentsPath(BUSINESS_ID);
    const snap = await measurePerfAsync("firestore-read", "paymentAgents.listPaymentAgents", { path }, () => getDocs(collection(db, path)));
    return snap.docs.map((d) => paymentAgentFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async getPaymentAgentById(id) {
    const db = requireDb();
    const path = paymentAgentPath(BUSINESS_ID, id);
    const snap = await measurePerfAsync("firestore-read", "paymentAgents.getPaymentAgentById", { path, agentId: id }, () => getDoc(doc(db, path)));
    if (!snap.exists()) return null;
    return paymentAgentFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
  },
  async upsertPaymentAgent(agent: PaymentAgent) {
    const db = requireDb();
    const now = new Date().toISOString();
    const id = agent.id || makeId();
    const existing = await this.getPaymentAgentById(id);
    const next: PaymentAgent = { ...agent, id, createdAt: existing?.createdAt || agent.createdAt || now, updatedAt: now, creditBalance: agent.creditBalance ?? agent.openingCreditBalance ?? 0, openingCreditBalance: agent.openingCreditBalance ?? 0, totalOrderAmount: agent.totalOrderAmount ?? 0, totalPaidAmount: agent.totalPaidAmount ?? 0, currentDuePayable: agent.currentDuePayable ?? 0 };
    if (existing) {
      if (areBusinessValuesEqual(paymentAgentToFirestore(existing), paymentAgentToFirestore(next))) {
        recordPerfNoopWrite("paymentAgents.upsertPaymentAgent", { path: paymentAgentPath(BUSINESS_ID, id), agentId: id });
        return existing;
      }
    }
    await measurePerfAsync("firestore-write", "paymentAgents.upsertPaymentAgent", { path: paymentAgentPath(BUSINESS_ID, id), agentId: id }, () => setDoc(doc(db, paymentAgentPath(BUSINESS_ID, id)), paymentAgentToFirestore(next), { merge: true }));
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
      recordPerfEvent("firestore-write", "paymentAgents.recordPaymentToAgent.agent", { path: paymentAgentPath(BUSINESS_ID, agentId), agentId });
      tx.set(agentRef, paymentAgentToFirestore(updated), { merge: true });
      recordPerfEvent("firestore-write", "paymentAgents.recordPaymentToAgent.ledger", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${ledgerRef.id}`, agentId });
      tx.set(ledgerRef, paymentAgentLedgerEntryToFirestore({ id: ledgerRef.id, agentId, type: "agent_payment", amount, dueReduced, creditCreated, note: payment.note, paymentMethod: payment.paymentMethod, paymentDate: payment.paymentDate || now, createdAt: now }));
      return updated;
    });
  },
  async listPaymentAgentLedger(agentId?: string) {
    const { paymentAgentLedgerFirebaseService } = await import("@/services/firebase/paymentAgentLedgerFirebaseService");
    return paymentAgentLedgerFirebaseService.listPaymentAgentLedgerEntries(agentId);
  },
  async recalculatePaymentAgentsFromOrders() {
    return this.listPaymentAgents();
  },
  async deletePaymentAgent(id: string) {
    const existing = await this.getPaymentAgentById(id);
    if (!existing) throw new Error("Payment agent not found.");
    await measurePerfAsync("firestore-write", "paymentAgents.deletePaymentAgent", { path: paymentAgentPath(BUSINESS_ID, id), agentId: id }, () => deleteDoc(doc(requireDb(), paymentAgentPath(BUSINESS_ID, id))));
  },
  async applyOrderSettlement(order) {
    if (!isOrderEligibleForCreditSettlement(order)) {
      const reverseSettlement = paymentAgentsFirebaseService.reverseOrderSettlement;
      if (reverseSettlement) {
        await reverseSettlement(order);
      }
      return;
    }
    const rawSplits = getOrderPaymentAgentSplits(order);
    if (rawSplits.length === 0) {
      await paymentAgentsFirebaseService.reverseOrderSettlement?.(order);
      return;
    }
    const splitValidation = validatePaymentAgentSplits(order);
    if (!splitValidation.isValid) {
      throw new Error(splitValidation.issues[0] || "Payment-agent split settlement data is invalid.");
    }
    const db = requireDb();
    const now = new Date().toISOString();
    const preparedSplits = rawSplits.map((split) => {
      const agentId = getPaymentAgentSplitAgentId(split);
      if (!agentId) {
        throw new Error(`Payment agent split ${split.id} is missing an agent id.`);
      }
      const settlement = toSplitSettlementSnapshot(split);
      return {
        ...split,
        paymentAgentId: agentId,
        paymentBy: agentId,
        paymentAgentName: split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy || "",
        settlementSnapshot: settlement,
      };
    });
    const desiredEntries = preparedSplits.map((split) => buildOrderSplitSettlementEntry(order, split));
    const desiredEntryById = new Map(desiredEntries.map((entry, index) => [entry.id, { entry, split: preparedSplits[index]! }]));
    const existingEntryIds = Array.from(new Set([
      ...(order.dependencyMap?.paymentAgentLedgerEntryIds ?? []),
      ...getOrderPaymentAgentLedgerEntryIds(order),
    ]));

    return runTransaction(db, async (tx) => {
      const existingEntries = new Map<string, PaymentAgentLedgerEntry>();
      for (const entryId of existingEntryIds) {
        const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), entryId);
        const snap = await tx.get(settlementRef);
        if (snap.exists()) {
          existingEntries.set(entryId, { id: snap.id, ...(snap.data() as Record<string, unknown>) } as PaymentAgentLedgerEntry);
        }
      }

      const activeAgentIds = new Set<string>();
      existingEntries.forEach((entry) => {
        if (isActiveSettlementEntry(entry) && typeof entry.agentId === "string" && entry.agentId.trim()) {
          activeAgentIds.add(entry.agentId.trim());
        }
      });
      preparedSplits.forEach((split) => activeAgentIds.add(split.paymentAgentId));

      const agentDocs = new Map<string, PaymentAgent>();
      for (const agentId of activeAgentIds) {
        const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
        const agentSnap = await tx.get(agentRef);
        if (!agentSnap.exists()) throw new Error(`Payment agent ${agentId} not found for order settlement.`);
        agentDocs.set(agentId, paymentAgentFromFirestore({ id: agentSnap.id, ...(agentSnap.data() as Record<string, unknown>) }));
      }

      const applyAgentUpdate = (agentId: string, direction: 1 | -1, entry: PaymentAgentLedgerEntry) => {
        const current = agentDocs.get(agentId);
        if (!current) throw new Error(`Payment agent ${agentId} is missing during settlement update.`);
        agentDocs.set(agentId, applySettlementDelta(current, entry, direction, now));
      };

      for (const [entryId, existing] of existingEntries.entries()) {
        if (!isActiveSettlementEntry(existing)) continue;
        const desired = desiredEntryById.get(entryId)?.entry;
        if (desired && existing.settlementHash === desired.settlementHash && existing.agentId === desired.agentId) {
          continue;
        }
        if (typeof existing.agentId === "string" && existing.agentId.trim()) {
          applyAgentUpdate(existing.agentId.trim(), -1, existing);
        }
        const reversal = buildOrderSplitSettlementReversalEntry(order, existing);
        const reversalRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), reversal.id);
        recordPerfEvent("firestore-write", "paymentAgents.applyOrderSettlement.reversal", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${reversalRef.id}`, orderId: order.id, splitId: existing.sourcePaymentAgentSplitId || "legacy" });
        tx.set(reversalRef, paymentAgentLedgerEntryToFirestore({ ...reversal, createdAt: now, updatedAt: now }), { merge: true });
        recordPerfEvent("firestore-write", "paymentAgents.applyOrderSettlement.deactivateExisting", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${entryId}`, orderId: order.id, splitId: existing.sourcePaymentAgentSplitId || "legacy" });
        tx.set(doc(db, paymentAgentLedgerPath(BUSINESS_ID), entryId), { active: false, isReversed: true, updatedAt: now }, { merge: true });
      }

      for (const nextEntry of desiredEntries) {
        const existing = existingEntries.get(nextEntry.id);
        if (isActiveSettlementEntry(existing) && existing?.settlementHash === nextEntry.settlementHash && existing?.agentId === nextEntry.agentId) {
          continue;
        }
        applyAgentUpdate(nextEntry.agentId, 1, nextEntry);
        const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), nextEntry.id);
        recordPerfEvent("firestore-write", "paymentAgents.applyOrderSettlement.settlement", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${settlementRef.id}`, orderId: order.id, splitId: nextEntry.sourcePaymentAgentSplitId || "legacy" });
        tx.set(settlementRef, paymentAgentLedgerEntryToFirestore({ ...nextEntry, createdAt: now, updatedAt: now }), { merge: true });
      }

      for (const [agentId, updatedAgent] of agentDocs.entries()) {
        recordPerfEvent("firestore-write", "paymentAgents.applyOrderSettlement.agent", { path: paymentAgentPath(BUSINESS_ID, agentId), orderId: order.id });
        tx.set(doc(db, paymentAgentPath(BUSINESS_ID, agentId)), paymentAgentToFirestore(updatedAgent), { merge: true });
      }
    });
  },
  async reverseOrderSettlement(order) {
    if (!order.id) return;
    const db = requireDb();
    const now = new Date().toISOString();
    return runTransaction(db, async (tx) => {
      const entryIds = Array.from(new Set([
        ...(order.dependencyMap?.paymentAgentLedgerEntryIds ?? []),
        ...getOrderPaymentAgentLedgerEntryIds(order),
      ]));
      if (entryIds.length === 0) return;

      const existingEntries: PaymentAgentLedgerEntry[] = [];
      const agentIds = new Set<string>();

      for (const entryId of entryIds) {
        const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), entryId);
        const snap = await tx.get(settlementRef);
        if (!snap.exists()) continue;
        const existing = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as PaymentAgentLedgerEntry;
        if (!isActiveSettlementEntry(existing)) continue;
        existingEntries.push(existing);
        if (typeof existing.agentId === "string" && existing.agentId.trim()) {
          agentIds.add(existing.agentId.trim());
        }
      }

      if (existingEntries.length === 0) return;

      const agentDocs = new Map<string, PaymentAgent>();
      for (const agentId of agentIds) {
        const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
        const agentSnap = await tx.get(agentRef);
        if (!agentSnap.exists()) throw new Error(`Payment agent ${agentId} not found for settlement reversal.`);
        agentDocs.set(agentId, paymentAgentFromFirestore({ id: agentSnap.id, ...(agentSnap.data() as Record<string, unknown>) }));
      }

      for (const existing of existingEntries) {
        const agentId = typeof existing.agentId === "string" ? existing.agentId.trim() : "";
        if (!agentId) throw new Error("Payment agent id missing for settlement reversal.");
        const current = agentDocs.get(agentId);
        if (!current) throw new Error(`Payment agent ${agentId} not found during settlement reversal.`);
        agentDocs.set(agentId, applySettlementDelta(current, existing, -1, now));
        const reversal = buildOrderSplitSettlementReversalEntry(order, existing);
        const reversalRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), reversal.id);
        recordPerfEvent("firestore-write", "paymentAgents.reverseOrderSettlement.reversal", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${reversalRef.id}`, orderId: order.id, splitId: existing.sourcePaymentAgentSplitId || "legacy" });
        tx.set(reversalRef, paymentAgentLedgerEntryToFirestore({ ...reversal, createdAt: now, updatedAt: now }), { merge: true });
        recordPerfEvent("firestore-write", "paymentAgents.reverseOrderSettlement.deactivateExisting", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${existing.id}`, orderId: order.id, splitId: existing.sourcePaymentAgentSplitId || "legacy" });
        tx.set(doc(db, paymentAgentLedgerPath(BUSINESS_ID), String(existing.id)), { active: false, isReversed: true, updatedAt: now }, { merge: true });
      }

      for (const [agentId, updated] of agentDocs.entries()) {
        recordPerfEvent("firestore-write", "paymentAgents.reverseOrderSettlement.agent", { path: paymentAgentPath(BUSINESS_ID, agentId), orderId: order.id });
        tx.set(doc(db, paymentAgentPath(BUSINESS_ID, agentId)), paymentAgentToFirestore(updated), { merge: true });
      }
    });
  },
};
