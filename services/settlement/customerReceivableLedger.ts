import { createHash } from "crypto";
import type { CustomerLedgerEntry, Order, OrderLine } from "@/lib/types";
import { lineTotalRmb } from "@/lib/types";
import type { Customer } from "@/lib/types";

export const lineAmount = (line: OrderLine) => lineTotalRmb(line);

export function createCustomerReceivableHash(order: Order, line: OrderLine, customerId: string) {
  const raw = `${order.id}|${line.id}|${customerId}|${lineAmount(line).toFixed(2)}|${line.customerId || ""}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function buildOrderReceivableEntry(order: Order, line: OrderLine, customerId: string): CustomerLedgerEntry {
  const amount = lineAmount(line);
  const now = new Date().toISOString();
  return { id: `customer-receivable-${order.id}-${line.id}`, customerId, type: "order_receivable", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, sourceLineId: line.id, amount, debit: amount, credit: 0, settlementHash: createCustomerReceivableHash(order, line, customerId), active: true, isReversed: false, createdAt: now, updatedAt: now };
}

export function buildOrderReceivableReversalEntry(order: Order, previous: CustomerLedgerEntry): CustomerLedgerEntry {
  const now = new Date().toISOString();
  return { id: `customer-receivable-reversal-${previous.id}-${Date.now()}`, customerId: previous.customerId, type: "order_receivable_reversal", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, sourceLineId: previous.sourceLineId, amount: previous.amount, debit: 0, credit: previous.amount, note: "Reversal of order receivable", active: true, isReversed: false, reversalOfId: previous.id, createdAt: now, updatedAt: now };
}

export function buildCustomerPaymentEntry(customer: Customer, input: { amount: number; paymentDate?: string; note?: string }, computed: { receivableReduced: number; creditCreated: number; newCurrentReceivable: number; newStoreCreditBalance: number }): CustomerLedgerEntry {
  const now = new Date().toISOString();
  return { id: `customer-payment-${customer.id}-${Date.now()}`, customerId: customer.id, type: "customer_payment", amount: input.amount, debit: 0, credit: input.amount, receivableReduced: computed.receivableReduced, creditCreated: computed.creditCreated, resultingReceivable: computed.newCurrentReceivable, resultingStoreCredit: computed.newStoreCreditBalance, note: input.note || `Payment received · Receivable reduced ${computed.receivableReduced.toFixed(2)} · Store credit added ${computed.creditCreated.toFixed(2)}`, paymentDate: input.paymentDate || now.slice(0, 10), active: true, isReversed: false, createdAt: now, updatedAt: now };
}
