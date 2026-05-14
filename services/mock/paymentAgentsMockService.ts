import { paymentAgents } from "@/lib/data";
import type { PaymentAgentsService } from "@/services/contracts";
import { deepClone } from "./utils";
import { recalculateAgentFromOpeningAndOrders } from "@/services/settlement/paymentAgentLedger";
import type { PaymentAgentLedgerEntry } from "@/lib/types";

let paymentAgentsState = deepClone(paymentAgents);
let paymentAgentLedgerState: PaymentAgentLedgerEntry[] = [];

export const paymentAgentsMockService: PaymentAgentsService = {
  async listPaymentAgents() { return deepClone(paymentAgentsState); },
  async getPaymentAgentById(id) { return deepClone(paymentAgentsState.find((x) => x.id === id) ?? null); },
  async upsertPaymentAgent(agent) {
    const idx = paymentAgentsState.findIndex((x) => x.id === agent.id);
    if (idx >= 0) paymentAgentsState[idx] = deepClone(agent);
    else paymentAgentsState = [deepClone(agent), ...paymentAgentsState];
    return deepClone(agent);
  },
  async recalculatePaymentAgentsFromOrders(orders) {
    paymentAgentsState = paymentAgentsState.map((a) => recalculateAgentFromOpeningAndOrders(a, orders));
    for (const entry of paymentAgentLedgerState.filter((x) => x.type === "agent_payment")) {
      const idx = paymentAgentsState.findIndex((a) => a.id === entry.agentId);
      if (idx < 0) continue;
      paymentAgentsState[idx] = {
        ...paymentAgentsState[idx],
        currentDuePayable: Math.max(0, (paymentAgentsState[idx].currentDuePayable ?? 0) - (entry.dueReduced ?? 0)),
        creditBalance: Math.max(0, (paymentAgentsState[idx].creditBalance ?? 0) + (entry.creditCreated ?? 0)),
        totalPaidAmount: Math.max(0, (paymentAgentsState[idx].totalPaidAmount ?? 0) + entry.amount),
      };
    }
    return deepClone(paymentAgentsState);
  },
  async recordPaymentToAgent(agentId, payment) {
    const idx = paymentAgentsState.findIndex((a) => a.id === agentId);
    if (idx < 0) throw new Error("Payment agent not found.");
    const amount = Math.max(0, Number(payment.amount) || 0);
    const due = Math.max(0, paymentAgentsState[idx].currentDuePayable ?? 0);
    const dueReduced = Math.min(due, amount);
    const creditCreated = Math.max(0, amount - dueReduced);
    paymentAgentsState[idx] = { ...paymentAgentsState[idx], currentDuePayable: due - dueReduced, creditBalance: Math.max(0, (paymentAgentsState[idx].creditBalance ?? 0) + creditCreated), totalPaidAmount: Math.max(0, (paymentAgentsState[idx].totalPaidAmount ?? 0) + amount), updatedAt: new Date().toISOString() };
    paymentAgentLedgerState = [{ id: `led-${Date.now()}`, agentId, type: "agent_payment", amount, dueReduced, creditCreated, note: payment.note, createdAt: payment.paymentDate || new Date().toISOString() }, ...paymentAgentLedgerState];
    return deepClone(paymentAgentsState[idx]);
  },
  async listPaymentAgentLedger(agentId) { return deepClone(paymentAgentLedgerState.filter((x) => x.agentId === agentId)); },
};
