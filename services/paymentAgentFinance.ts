import type { PaymentAgent } from "@/lib/types";

const clampMoney = (value: number | undefined) => Math.max(0, Number.isFinite(value as number) ? Number(value) : 0);
const clampCount = (value: number | undefined) => Math.max(0, Number(value) || 0);

export type PaymentAgentDirectFinanceSnapshot = {
  totalOrders: number;
  totalAdvanced: number;
  totalUsed: number;
  duePending: number;
  creditLeft: number;
  paymentsMade: number;
  totalPayable: number;
  currentPayable: number;
};

export function getPaymentAgentDirectFinance(agent: PaymentAgent): PaymentAgentDirectFinanceSnapshot {
  const totalUsed = clampMoney(agent.totalUsedAmount);
  const creditLeft = clampMoney(agent.creditBalance);
  const duePending = clampMoney(agent.currentDuePayable ?? agent.currentPayable);
  const paymentsMade = clampMoney(agent.totalPaidAmount);
  const totalOrders = clampCount(agent.totalOrdersPaid);
  const totalPayable = clampMoney(agent.totalPayableAmount ?? agent.currentDuePayable ?? agent.currentPayable);
  const currentPayable = clampMoney(agent.currentPayable ?? agent.currentDuePayable);

  return {
    totalOrders,
    totalAdvanced: clampMoney(totalUsed + creditLeft),
    totalUsed,
    duePending,
    creditLeft,
    paymentsMade,
    totalPayable,
    currentPayable,
  };
}
