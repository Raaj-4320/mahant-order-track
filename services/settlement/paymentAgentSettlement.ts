export type PaymentAgentSettlementStatus = "unpaid" | "partial" | "paid" | "credit";

export type PaymentAgentSettlementInput = {
  orderTotal: number;
  existingCredit: number;
  paidNow: number;
};

export type PaymentAgentSettlementResult = {
  orderTotal: number;
  existingCredit: number;
  creditUsed: number;
  payableAfterCredit: number;
  paidNow: number;
  remainingPayable: number;
  newCreditCreated: number;
  resultingCreditBalance: number;
  status: PaymentAgentSettlementStatus;
};

const safe = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

export function calculatePaymentAgentSettlement(input: PaymentAgentSettlementInput): PaymentAgentSettlementResult {
  const orderTotal = safe(input.orderTotal);
  const existingCredit = safe(input.existingCredit);
  const paidNow = safe(input.paidNow);
  const creditUsed = Math.min(existingCredit, orderTotal);
  const payableAfterCredit = Math.max(orderTotal - creditUsed, 0);
  const remainingPayable = Math.max(payableAfterCredit - paidNow, 0);
  const newCreditCreated = Math.max(paidNow - payableAfterCredit, 0);
  const resultingCreditBalance = existingCredit - creditUsed + newCreditCreated;

  let status: PaymentAgentSettlementStatus = "unpaid";
  if (remainingPayable > 0) status = paidNow > 0 ? "partial" : "unpaid";
  else status = newCreditCreated > 0 ? "credit" : "paid";

  return { orderTotal, existingCredit, creditUsed, payableAfterCredit, paidNow, remainingPayable, newCreditCreated, resultingCreditBalance, status };
}
