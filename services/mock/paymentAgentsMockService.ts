import { paymentAgents } from "@/lib/data";
import type { PaymentAgentsService } from "@/services/contracts";
import { deepClone } from "./utils";

export const paymentAgentsMockService: PaymentAgentsService = {
  async listPaymentAgents() { return deepClone(paymentAgents); },
  async getPaymentAgentById(id) { return deepClone(paymentAgents.find((x) => x.id === id) ?? null); },
};
