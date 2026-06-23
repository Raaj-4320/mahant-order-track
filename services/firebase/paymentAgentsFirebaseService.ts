import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { areBusinessValuesEqual } from "@/lib/firebase/noopWrite";
import { measurePerfAsync, recordPerfEvent, recordPerfNoopWrite } from "@/lib/perfDebug";
import { orderFromFirestore, paymentAgentFromFirestore, paymentAgentLedgerEntryFromFirestore, paymentAgentLedgerEntryToFirestore, paymentAgentToFirestore } from "@/lib/firebase/mappers";
import { ordersPath, paymentAgentLedgerPath, paymentAgentsPath, paymentAgentPath } from "@/lib/firebase/paths";
import type { PaymentAgentsService } from "@/services/contracts";
import type { Order, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit, PaymentAgentSplitSettlementSnapshot } from "@/lib/types";
import { buildOrderSplitSettlementEntry, buildOrderSplitSettlementReversalEntry } from "@/services/settlement/paymentAgentLedger";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import {
  getOrderPaymentAgentLedgerEntryIds,
  getOrderPaymentAgentSplits,
  getPaymentAgentSplitAgentId,
  validatePaymentAgentSplits,
} from "@/services/settlement/paymentAgentSplits";
import { computePaymentAgentDirectFinance } from "@/services/paymentAgentDirectFinanceSync";

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

  const usedAmount = clamp(split.paidNow ?? split.assignedAmount);

  return {
    orderPortionTotal: usedAmount,
    existingCredit: 0,
    creditUsed: usedAmount,
    payableAfterCredit: 0,
    remainingPayable: 0,
    newCreditCreated: 0,
    resultingCreditBalance: 0,
    paidNow: 0,
    status: usedAmount > 0 ? "paid" : "unpaid",
    createdAt: now,
    updatedAt: now,
  };
};

const isActiveSettlementEntry = (entry: PaymentAgentLedgerEntry | null | undefined) =>
  Boolean(entry && entry.active !== false && entry.isReversed !== true);

type AgentFinanceComputation = {
  totalOrdersPaid: number;
  creditBalance: number;
  totalOrderAmount: number;
  totalPaidAmount: number;
  totalPayableAmount: number;
  currentDuePayable: number;
  totalUsedAmount: number;
  currentPayable: number;
};

const computeAgentFinanceFromRawFacts = (
  agent: PaymentAgent,
  orders: Order[],
  ledger: PaymentAgentLedgerEntry[],
): AgentFinanceComputation => {
  return computePaymentAgentDirectFinance(agent, orders, ledger);
};

const writeRecomputedAgentFinance = async (
  agentId: string,
  orders: Order[],
  ledger: PaymentAgentLedgerEntry[],
): Promise<PaymentAgent> => {
  const db = requireDb();
  const current = await paymentAgentsFirebaseService.getPaymentAgentById(agentId);
  if (!current) throw new Error("Payment agent not found.");
  const recomputed = computeAgentFinanceFromRawFacts(current, orders, ledger);
  const updated: PaymentAgent = {
    ...current,
    ...recomputed,
    updatedAt: new Date().toISOString(),
  };
  const financeUnchanged =
    clamp(current.totalOrdersPaid ?? 0) === clamp(updated.totalOrdersPaid ?? 0)
    && clamp(current.creditBalance ?? 0) === clamp(updated.creditBalance ?? 0)
    && clamp(current.totalOrderAmount ?? 0) === clamp(updated.totalOrderAmount ?? 0)
    && clamp(current.totalPaidAmount ?? 0) === clamp(updated.totalPaidAmount ?? 0)
    && clamp(current.totalPayableAmount ?? 0) === clamp(updated.totalPayableAmount ?? 0)
    && clamp(current.currentDuePayable ?? 0) === clamp(updated.currentDuePayable ?? 0)
    && clamp(current.totalUsedAmount ?? 0) === clamp(updated.totalUsedAmount ?? 0)
    && clamp(current.currentPayable ?? 0) === clamp(updated.currentPayable ?? 0);
  if (financeUnchanged) {
    recordPerfNoopWrite("paymentAgents.writeRecomputedAgentFinance", { path: paymentAgentPath(BUSINESS_ID, agentId), agentId });
    return current;
  }
  await measurePerfAsync("firestore-write", "paymentAgents.writeRecomputedAgentFinance", { path: paymentAgentPath(BUSINESS_ID, agentId), agentId }, () =>
    setDoc(doc(db, paymentAgentPath(BUSINESS_ID, agentId)), paymentAgentToFirestore(updated), { merge: true }),
  );
  return updated;
};

const listSavedOrdersFromDb = async (): Promise<Order[]> => {
  const db = requireDb();
  const snap = await measurePerfAsync("firestore-read", "paymentAgents.listSavedOrdersFromDb", { path: ordersPath(BUSINESS_ID) }, () => getDocs(collection(db, ordersPath(BUSINESS_ID))));
  return snap.docs
    .map((d) => orderFromFirestore({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((order) => order.status === "saved");
};

const syncPaymentAgentFinanceFromDb = async (agentId: string): Promise<PaymentAgent> => {
  const [orders, ledger] = await Promise.all([listSavedOrdersFromDb(), paymentAgentsFirebaseService.listPaymentAgentLedger()]);
  return writeRecomputedAgentFinance(agentId, orders, ledger);
};

const buildOpeningCreditEntry = (agent: PaymentAgent, amount: number, now: string): PaymentAgentLedgerEntry => ({
  id: `opening-credit-${agent.id}`,
  agentId: agent.id,
  type: "opening_credit",
  amount: clamp(amount),
  creditCreated: clamp(amount),
  dueReduced: 0,
  note: "Opening advance balance",
  paymentMethod: "Opening Balance",
  paymentDate: agent.createdAt || now,
  createdAt: agent.createdAt || now,
  updatedAt: now,
  active: true,
  isReversed: false,
});

const applySettlementDelta = (
  agent: PaymentAgent,
  entry: {
    amount?: number;
    creditUsed?: number;
    paidNow?: number;
    payableAfterCredit?: number;
    remainingPayable?: number;
    newCreditCreated?: number;
  },
  direction: 1 | -1,
  now: string,
): PaymentAgent => ({
  ...agent,
  totalOrdersPaid: clamp((agent.totalOrdersPaid ?? 0) + direction),
  creditBalance: clamp((agent.creditBalance ?? 0) + direction * -clamp(entry.creditUsed ?? 0) + direction * clamp(entry.newCreditCreated ?? 0)),
  totalOrderAmount: clamp((agent.totalOrderAmount ?? 0) + direction * clamp(entry.amount ?? 0)),
  totalPaidAmount: clamp(agent.totalPaidAmount ?? 0),
  totalPayableAmount: clamp((agent.totalPayableAmount ?? 0) + direction * clamp(entry.payableAfterCredit ?? 0)),
  currentDuePayable: clamp((agent.currentDuePayable ?? 0) + direction * clamp(entry.remainingPayable ?? 0)),
  totalUsedAmount: clamp((agent.totalUsedAmount ?? 0) + direction * clamp(entry.creditUsed ?? 0)),
  currentPayable: clamp((agent.currentPayable ?? agent.currentDuePayable ?? 0) + direction * clamp(entry.remainingPayable ?? 0)),
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
    const openingCreditBalance = clamp(agent.openingCreditBalance ?? existing?.openingCreditBalance ?? 0);
    const next: PaymentAgent = {
      ...(existing ?? {}),
      ...agent,
      id,
      createdAt: existing?.createdAt || agent.createdAt || now,
      updatedAt: now,
      totalOrdersPaid: existing?.totalOrdersPaid ?? 0,
      creditBalance: existing?.creditBalance ?? openingCreditBalance,
      openingCreditBalance,
      totalOrderAmount: existing?.totalOrderAmount ?? 0,
      totalPaidAmount: existing?.totalPaidAmount ?? 0,
      totalPayableAmount: existing?.totalPayableAmount ?? 0,
      currentDuePayable: existing?.currentDuePayable ?? 0,
      totalUsedAmount: existing?.totalUsedAmount ?? 0,
      currentPayable: existing?.currentPayable ?? existing?.currentDuePayable ?? 0,
    };
    if (existing) {
      if (areBusinessValuesEqual(paymentAgentToFirestore(existing), paymentAgentToFirestore(next))) {
        recordPerfNoopWrite("paymentAgents.upsertPaymentAgent", { path: paymentAgentPath(BUSINESS_ID, id), agentId: id });
        return syncPaymentAgentFinanceFromDb(id);
      }
    }
    await measurePerfAsync("firestore-write", "paymentAgents.upsertPaymentAgent", { path: paymentAgentPath(BUSINESS_ID, id), agentId: id }, () => setDoc(doc(db, paymentAgentPath(BUSINESS_ID, id)), paymentAgentToFirestore(next), { merge: true }));
    return syncPaymentAgentFinanceFromDb(id);
  },
  async recordPaymentToAgent(agentId, payment) {
    const db = requireDb();
    if (!(Number(payment.amount) > 0)) throw new Error("Payment amount must be greater than 0.");
    const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, agentId));
    const ledgerRef = doc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)));
    const now = new Date().toISOString();
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(agentRef);
      if (!snap.exists()) throw new Error("Payment agent not found.");
      const current = paymentAgentFromFirestore({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
      const amount = Math.max(0, Number(payment.amount) || 0);
      const due = Math.max(0, current.currentDuePayable ?? 0);
      const dueReduced = Math.min(due, amount);
      const creditCreated = Math.max(0, amount - dueReduced);
      const nextDue = due - dueReduced;
      const updated: PaymentAgent = {
        ...current,
        currentDuePayable: nextDue,
        currentPayable: nextDue,
        creditBalance: Math.max(0, (current.creditBalance ?? 0) + creditCreated),
        totalPaidAmount: Math.max(0, (current.totalPaidAmount ?? 0) + amount),
        updatedAt: now,
      };
      recordPerfEvent("firestore-write", "paymentAgents.recordPaymentToAgent.agent", { path: paymentAgentPath(BUSINESS_ID, agentId), agentId });
      tx.set(agentRef, paymentAgentToFirestore(updated), { merge: true });
      recordPerfEvent("firestore-write", "paymentAgents.recordPaymentToAgent.ledger", { path: `${paymentAgentLedgerPath(BUSINESS_ID)}/${ledgerRef.id}`, agentId });
      tx.set(ledgerRef, paymentAgentLedgerEntryToFirestore({ id: ledgerRef.id, agentId, type: "agent_payment", amount, dueReduced, creditCreated, note: payment.note, paymentMethod: payment.paymentMethod, paymentDate: payment.paymentDate || now, createdAt: now }));
    });
    return syncPaymentAgentFinanceFromDb(agentId);
  },
  async deletePaymentAgentLedgerEntry(entryId) {
    const db = requireDb();
    const entryRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), entryId);
    const now = new Date().toISOString();
    await runTransaction(db, async (tx) => {
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists()) throw new Error("Ledger entry not found.");
      const currentEntry = paymentAgentLedgerEntryFromFirestore({ id: entrySnap.id, ...(entrySnap.data() as Record<string, unknown>) });
      if (currentEntry.type !== "agent_payment") throw new Error("Only manual payment records can be deleted from this ledger.");
      if (currentEntry.active === false || currentEntry.isReversed === true) throw new Error("This payment record has already been reversed.");
      const agentRef = doc(db, paymentAgentPath(BUSINESS_ID, currentEntry.agentId));
      const agentSnap = await tx.get(agentRef);
      if (!agentSnap.exists()) throw new Error("Payment agent not found.");
      const currentAgent = paymentAgentFromFirestore({ id: agentSnap.id, ...(agentSnap.data() as Record<string, unknown>) });
      const creditCreated = clamp(currentEntry.creditCreated ?? 0);
      if (clamp(currentAgent.creditBalance ?? 0) < creditCreated) {
        throw new Error("This payment cannot be deleted because its credit has already been used in later transactions.");
      }
      const updatedAgent: PaymentAgent = {
        ...currentAgent,
        currentDuePayable: clamp((currentAgent.currentDuePayable ?? 0) + clamp(currentEntry.dueReduced ?? 0)),
        currentPayable: clamp((currentAgent.currentPayable ?? currentAgent.currentDuePayable ?? 0) + clamp(currentEntry.dueReduced ?? 0)),
        creditBalance: clamp((currentAgent.creditBalance ?? 0) - creditCreated),
        totalPaidAmount: clamp((currentAgent.totalPaidAmount ?? 0) - clamp(currentEntry.amount)),
        updatedAt: now,
      };
      const reversalRef = doc(collection(db, paymentAgentLedgerPath(BUSINESS_ID)));
      tx.set(agentRef, paymentAgentToFirestore(updatedAgent), { merge: true });
      tx.set(entryRef, { active: false, isReversed: true, updatedAt: now }, { merge: true });
      tx.set(
        reversalRef,
        paymentAgentLedgerEntryToFirestore({
          id: reversalRef.id,
          agentId: currentEntry.agentId,
          type: "agent_payment_reversal",
          amount: clamp(currentEntry.amount),
          dueReduced: clamp(currentEntry.dueReduced ?? 0),
          creditCreated: creditCreated,
          note: `Reversal of payment${currentEntry.note ? `: ${currentEntry.note}` : ""}`,
          paymentMethod: currentEntry.paymentMethod,
          createdAt: now,
          updatedAt: now,
          paymentDate: now,
          reversalOfId: currentEntry.id,
          active: true,
          isReversed: false,
        }),
      );
    });
    const refreshedEntry = await getDoc(entryRef);
    const refreshed = refreshedEntry.exists() ? paymentAgentLedgerEntryFromFirestore({ id: refreshedEntry.id, ...(refreshedEntry.data() as Record<string, unknown>) }) : null;
    const targetAgentId = refreshed?.agentId || "";
    if (!targetAgentId) throw new Error("Payment agent not found after deleting payment.");
    return syncPaymentAgentFinanceFromDb(targetAgentId);
  },
  async listPaymentAgentLedger(agentId?: string) {
    const { paymentAgentLedgerFirebaseService } = await import("@/services/firebase/paymentAgentLedgerFirebaseService");
    return paymentAgentLedgerFirebaseService.listPaymentAgentLedgerEntries(agentId);
  },
  async recalculatePaymentAgentsFromOrders(orders) {
    const agents = await this.listPaymentAgents();
    const ledger = await this.listPaymentAgentLedger();
    const savedOrders = await listSavedOrdersFromDb();
    const updatedAgents = await Promise.all(agents.map((agent) => writeRecomputedAgentFinance(agent.id, savedOrders, ledger)));
    return updatedAgents.sort((a, b) => a.name.localeCompare(b.name));
  },
  async repairPaymentAgentsFromSavedOrders() {
    const db = requireDb();
    const now = new Date().toISOString();
    const [agents, savedOrders, ledger] = await Promise.all([
      this.listPaymentAgents(),
      listSavedOrdersFromDb(),
      this.listPaymentAgentLedger(),
    ]);

    let openingBalancesBackfilled = 0;
    let openingEntriesCreatedOrUpdated = 0;
    let duplicateOpeningEntriesDeactivated = 0;
    let settlementEntriesCreatedOrUpdated = 0;

    const ledgerById = new Map(ledger.map((entry) => [entry.id, entry]));

    for (const order of savedOrders) {
      if (!isOrderEligibleForCreditSettlement(order)) continue;
      const splits = getOrderPaymentAgentSplits(order);
      if (splits.length === 0) continue;
      const validation = validatePaymentAgentSplits(order);
      if (!validation.isValid) continue;
      for (const split of splits) {
        if (!split.settlementSnapshot) continue;
        const desiredEntry = buildOrderSplitSettlementEntry(order, split);
        const existing = ledgerById.get(desiredEntry.id) ?? null;
        const needsWrite = !existing
          || existing.active === false
          || existing.isReversed === true
          || existing.settlementHash !== desiredEntry.settlementHash
          || existing.agentId !== desiredEntry.agentId;
        if (needsWrite) {
          await setDoc(
            doc(db, paymentAgentLedgerPath(BUSINESS_ID), desiredEntry.id),
            paymentAgentLedgerEntryToFirestore({
              ...desiredEntry,
              createdAt: existing?.createdAt || desiredEntry.createdAt,
              updatedAt: now,
            }),
            { merge: true },
          );
          ledgerById.set(desiredEntry.id, {
            ...desiredEntry,
            createdAt: existing?.createdAt || desiredEntry.createdAt,
            updatedAt: now,
          });
          settlementEntriesCreatedOrUpdated += 1;
        }
      }
    }

    for (const agent of agents) {
      const agentLedger = ledger.filter((entry) => entry.agentId === agent.id);
      const activeOpeningEntries = agentLedger.filter((entry) => entry.type === "opening_credit" && isActiveSettlementEntry(entry));
      const activeOpeningTotal = activeOpeningEntries.reduce((sum, entry) => sum + clamp(entry.amount), 0);
      const activeManualPaymentCount = agentLedger.filter((entry) => entry.type === "agent_payment" && isActiveSettlementEntry(entry)).length;

      let desiredOpeningBalance = clamp(agent.openingCreditBalance ?? 0);
      if (desiredOpeningBalance <= 0 && activeOpeningTotal > 0) {
        desiredOpeningBalance = activeOpeningTotal;
      }

      if (desiredOpeningBalance <= 0 && activeManualPaymentCount === 0) {
        const candidateFromLegacyFields = Math.max(
          clamp(agent.creditBalance ?? 0) + clamp(agent.totalUsedAmount ?? 0),
          clamp(agent.totalPaidAmount ?? 0),
        );
        if (candidateFromLegacyFields > 0) {
          desiredOpeningBalance = candidateFromLegacyFields;
        }
      }

      const currentOpeningBalance = clamp(agent.openingCreditBalance ?? 0);
      if (desiredOpeningBalance !== currentOpeningBalance) {
        await setDoc(
          doc(db, paymentAgentPath(BUSINESS_ID, agent.id)),
          paymentAgentToFirestore({
            ...agent,
            openingCreditBalance: desiredOpeningBalance,
            updatedAt: now,
          }),
          { merge: true },
        );
        openingBalancesBackfilled += 1;
      }

      for (const duplicateEntry of activeOpeningEntries.filter((entry) => entry.id !== `opening-credit-${agent.id}`)) {
        await setDoc(
          doc(db, paymentAgentLedgerPath(BUSINESS_ID), duplicateEntry.id),
          { active: false, updatedAt: now },
          { merge: true },
        );
        duplicateOpeningEntriesDeactivated += 1;
      }

      const canonicalOpeningRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), `opening-credit-${agent.id}`);
      const canonicalOpeningEntry = activeOpeningEntries.find((entry) => entry.id === `opening-credit-${agent.id}`) ?? null;
      if (desiredOpeningBalance > 0) {
        const desiredEntry = buildOpeningCreditEntry(
          {
            ...agent,
            openingCreditBalance: desiredOpeningBalance,
          },
          desiredOpeningBalance,
          now,
        );
        const needsWrite = !canonicalOpeningEntry
          || clamp(canonicalOpeningEntry.amount) !== desiredOpeningBalance
          || canonicalOpeningEntry.active === false
          || canonicalOpeningEntry.isReversed === true
          || (canonicalOpeningEntry.note || "") !== desiredEntry.note
          || (canonicalOpeningEntry.paymentMethod || "") !== desiredEntry.paymentMethod;
        if (needsWrite) {
          await setDoc(canonicalOpeningRef, paymentAgentLedgerEntryToFirestore(desiredEntry), { merge: true });
          openingEntriesCreatedOrUpdated += 1;
        }
      } else if (canonicalOpeningEntry && isActiveSettlementEntry(canonicalOpeningEntry)) {
        await setDoc(canonicalOpeningRef, { active: false, updatedAt: now }, { merge: true });
        duplicateOpeningEntriesDeactivated += 1;
      }
    }

    const refreshedLedger = await this.listPaymentAgentLedger();
    const recalculatedAgents = await Promise.all(agents.map((agent) => writeRecomputedAgentFinance(agent.id, savedOrders, refreshedLedger)));
    return {
      paymentAgentsScanned: agents.length,
      openingBalancesBackfilled,
      openingEntriesCreatedOrUpdated,
      duplicateOpeningEntriesDeactivated,
      settlementEntriesCreatedOrUpdated,
      paymentAgentsRecalculated: recalculatedAgents.length,
    };
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
    const affectedAgentIds = new Set<string>(preparedSplits.map((split) => split.paymentAgentId).filter(Boolean));

    await runTransaction(db, async (tx) => {
      const existingEntries = new Map<string, PaymentAgentLedgerEntry>();
      for (const entryId of existingEntryIds) {
        const settlementRef = doc(db, paymentAgentLedgerPath(BUSINESS_ID), entryId);
        const snap = await tx.get(settlementRef);
        if (snap.exists()) {
          const existingEntry = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as PaymentAgentLedgerEntry;
          existingEntries.set(entryId, existingEntry);
          if (typeof existingEntry.agentId === "string" && existingEntry.agentId.trim()) {
            affectedAgentIds.add(existingEntry.agentId.trim());
          }
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
    const [orders, ledger] = await Promise.all([listSavedOrdersFromDb(), this.listPaymentAgentLedger()]);
    await Promise.all(Array.from(affectedAgentIds).map((agentId) => writeRecomputedAgentFinance(agentId, orders, ledger)));
  },
  async reverseOrderSettlement(order) {
    if (!order.id) return;
    const db = requireDb();
    const now = new Date().toISOString();
    const affectedAgentIds = new Set<string>();
    await runTransaction(db, async (tx) => {
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
          const agentId = existing.agentId.trim();
          agentIds.add(agentId);
          affectedAgentIds.add(agentId);
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
    const [orders, ledger] = await Promise.all([listSavedOrdersFromDb(), this.listPaymentAgentLedger()]);
    await Promise.all(Array.from(affectedAgentIds).map((agentId) => writeRecomputedAgentFinance(agentId, orders, ledger)));
  },
};
