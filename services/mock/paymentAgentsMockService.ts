import { paymentAgents } from "@/lib/data";
import type { PaymentAgentsService } from "@/services/contracts";
import { deepClone } from "./utils";
import { computePaymentAgentDirectFinance } from "@/services/paymentAgentDirectFinanceSync";
import type { PaymentAgentLedgerEntry } from "@/lib/types";
import { isDemoDataEnabled } from "@/lib/runtimeConfig";
import { ordersMockService } from "@/services/mock/ordersMockService";

let paymentAgentsState = deepClone(isDemoDataEnabled() ? paymentAgents : []);
let paymentAgentLedgerState: PaymentAgentLedgerEntry[] = [];

const clamp = (value: number | undefined | null) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);

const syncMockPaymentAgentFinance = async (agentId: string) => {
  const agentIndex = paymentAgentsState.findIndex((agent) => agent.id === agentId);
  if (agentIndex < 0) throw new Error("Payment agent not found.");
  const current = paymentAgentsState[agentIndex];
  const savedOrders = (await ordersMockService.listOrders()).filter((order) => order.status === "saved");
  const recomputed = {
    ...current,
    ...computePaymentAgentDirectFinance(current, savedOrders, paymentAgentLedgerState),
    updatedAt: new Date().toISOString(),
  };
  paymentAgentsState[agentIndex] = recomputed;
  return deepClone(recomputed);
};

export const paymentAgentsMockService: PaymentAgentsService = {
  async listPaymentAgents() { return deepClone(paymentAgentsState); },
  async getPaymentAgentById(id) { return deepClone(paymentAgentsState.find((x) => x.id === id) ?? null); },
  async upsertPaymentAgent(agent) {
    const idx = paymentAgentsState.findIndex((x) => x.id === agent.id);
    const existing = idx >= 0 ? paymentAgentsState[idx] : null;
    const openingCreditBalance = clamp(agent.openingCreditBalance ?? existing?.openingCreditBalance ?? 0);
    const next = {
      ...(existing ?? {}),
      ...agent,
      openingCreditBalance,
      creditBalance: existing?.creditBalance ?? openingCreditBalance,
      totalOrdersPaid: existing?.totalOrdersPaid ?? 0,
      totalPaidAmount: existing?.totalPaidAmount ?? 0,
      totalOrderAmount: existing?.totalOrderAmount ?? 0,
      totalPayableAmount: existing?.totalPayableAmount ?? 0,
      currentDuePayable: existing?.currentDuePayable ?? 0,
      totalUsedAmount: existing?.totalUsedAmount ?? 0,
      currentPayable: existing?.currentPayable ?? existing?.currentDuePayable ?? 0,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) paymentAgentsState[idx] = deepClone(next);
    else paymentAgentsState = [deepClone(next), ...paymentAgentsState];
    return syncMockPaymentAgentFinance(next.id);
  },
  async recalculatePaymentAgentsFromOrders(orders) {
    const savedOrders = orders.filter((order) => order.status === "saved");
    paymentAgentsState = paymentAgentsState.map((agent) => ({
      ...agent,
      ...computePaymentAgentDirectFinance(agent, savedOrders, paymentAgentLedgerState),
      updatedAt: new Date().toISOString(),
    }));
    return deepClone(paymentAgentsState);
  },
  async repairPaymentAgentsFromSavedOrders() {
    const savedOrders = (await ordersMockService.listOrders()).filter((order) => order.status === "saved");
    paymentAgentsState = paymentAgentsState.map((agent) => ({
      ...agent,
      ...computePaymentAgentDirectFinance(agent, savedOrders, paymentAgentLedgerState),
      updatedAt: new Date().toISOString(),
    }));
    return {
      paymentAgentsScanned: paymentAgentsState.length,
      openingBalancesBackfilled: 0,
      openingEntriesCreatedOrUpdated: 0,
      duplicateOpeningEntriesDeactivated: 0,
      settlementEntriesCreatedOrUpdated: 0,
      paymentAgentsRecalculated: paymentAgentsState.length,
    };
  },
  async recordPaymentToAgent(agentId, payment) {
    const idx = paymentAgentsState.findIndex((a) => a.id === agentId);
    if (idx < 0) throw new Error("Payment agent not found.");
    const amount = Math.max(0, Number(payment.amount) || 0);
    const due = Math.max(0, paymentAgentsState[idx].currentDuePayable ?? 0);
    const dueReduced = Math.min(due, amount);
    const creditCreated = Math.max(0, amount - dueReduced);
    paymentAgentsState[idx] = {
      ...paymentAgentsState[idx],
      currentDuePayable: due - dueReduced,
      currentPayable: due - dueReduced,
      creditBalance: Math.max(0, (paymentAgentsState[idx].creditBalance ?? 0) + creditCreated),
      totalPaidAmount: Math.max(0, (paymentAgentsState[idx].totalPaidAmount ?? 0) + amount),
      updatedAt: new Date().toISOString(),
    };
    paymentAgentLedgerState = [{ id: `led-${Date.now()}`, agentId, type: "agent_payment", amount, dueReduced, creditCreated, note: payment.note, paymentMethod: payment.paymentMethod, createdAt: payment.paymentDate || new Date().toISOString(), paymentDate: payment.paymentDate || new Date().toISOString() }, ...paymentAgentLedgerState];
    return syncMockPaymentAgentFinance(agentId);
  },
  async deletePaymentAgentLedgerEntry(entryId) {
    const entryIndex = paymentAgentLedgerState.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) throw new Error("Ledger entry not found.");
    const entry = paymentAgentLedgerState[entryIndex];
    if (!entry || entry.type !== "agent_payment") throw new Error("Only manual payment records can be deleted from this ledger.");
    if (entry.active === false || entry.isReversed === true) throw new Error("This payment record has already been reversed.");
    const agentIndex = paymentAgentsState.findIndex((agent) => agent.id === entry.agentId);
    if (agentIndex < 0) throw new Error("Payment agent not found.");
    const current = paymentAgentsState[agentIndex];
    const creditCreated = Math.max(0, Number(entry.creditCreated) || 0);
    if ((current.creditBalance ?? 0) < creditCreated) {
      throw new Error("This payment cannot be deleted because its credit has already been used in later transactions.");
    }
    const now = new Date().toISOString();
    paymentAgentsState[agentIndex] = {
      ...current,
      currentDuePayable: Math.max(0, (current.currentDuePayable ?? 0) + Math.max(0, Number(entry.dueReduced) || 0)),
      currentPayable: Math.max(0, (current.currentPayable ?? current.currentDuePayable ?? 0) + Math.max(0, Number(entry.dueReduced) || 0)),
      creditBalance: Math.max(0, (current.creditBalance ?? 0) - creditCreated),
      totalPaidAmount: Math.max(0, (current.totalPaidAmount ?? 0) - Math.max(0, Number(entry.amount) || 0)),
      updatedAt: now,
    };
    paymentAgentLedgerState[entryIndex] = {
      ...entry,
      active: false,
      isReversed: true,
      updatedAt: now,
    };
    paymentAgentLedgerState = [
      {
        id: `led-reversal-${Date.now()}`,
        agentId: entry.agentId,
        type: "agent_payment_reversal",
        amount: entry.amount,
        dueReduced: entry.dueReduced,
        creditCreated: entry.creditCreated,
        note: `Reversal of payment${entry.note ? `: ${entry.note}` : ""}`,
        paymentMethod: entry.paymentMethod,
        createdAt: now,
        updatedAt: now,
        paymentDate: now,
        reversalOfId: entry.id,
        active: true,
        isReversed: false,
      },
      ...paymentAgentLedgerState,
    ];
    return syncMockPaymentAgentFinance(entry.agentId);
  },
  async listPaymentAgentLedger(agentId) { return deepClone(agentId ? paymentAgentLedgerState.filter((x) => x.agentId === agentId) : paymentAgentLedgerState); },
  async deletePaymentAgent(id) {
    const idx = paymentAgentsState.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error("Payment agent not found.");
    paymentAgentsState.splice(idx, 1);
  },
};
