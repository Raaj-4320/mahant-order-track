import { paymentAgents } from "@/lib/data";
import type { PaymentAgentsService } from "@/services/contracts";
import { deepClone } from "./utils";

let paymentAgentsState = deepClone(paymentAgents);

export const paymentAgentsMockService: PaymentAgentsService = {
  async listPaymentAgents() { return deepClone(paymentAgentsState); },
  async getPaymentAgentById(id) { return deepClone(paymentAgentsState.find((x) => x.id === id) ?? null); },
  async upsertPaymentAgent(agent) {
    const idx = paymentAgentsState.findIndex((x) => x.id === agent.id);
    if (idx >= 0) paymentAgentsState[idx] = deepClone(agent);
    else paymentAgentsState = [deepClone(agent), ...paymentAgentsState];
    return deepClone(agent);
  },
};
