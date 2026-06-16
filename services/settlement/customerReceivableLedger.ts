import { createHash } from "crypto";
import type { CustomerLedgerEntry, Order, OrderLine } from "@/lib/types";
import { lineTotalRmb, orderShippingPrice } from "@/lib/types";
import { floorMoney } from "@/lib/numbers";
import type { Customer } from "@/lib/types";

export const lineAmount = (line: OrderLine) => lineTotalRmb(line);

export function getOrderCustomerReceivableAmount(order: Order, line: OrderLine) {
  const lines = order.lines.filter((item) => item.customerId && item.id && (item.totalCtns || item.pcsPerCtn || item.rmbPerPcs));
  const shipping = orderShippingPrice(order);
  const baseAmount = lineAmount(line);
  if (shipping <= 0 || lines.length === 0) return baseAmount;

  const totalBase = lines.reduce((sum, item) => sum + lineAmount(item), 0);
  if (totalBase <= 0) return baseAmount;

  let allocatedShipping = 0;
  const targetIndex = lines.findIndex((item) => item.id === line.id);
  if (targetIndex === -1) return baseAmount;

  if (targetIndex === lines.length - 1) {
    const priorAllocated = lines.slice(0, -1).reduce((sum, item) => sum + floorMoney((lineAmount(item) / totalBase) * shipping), 0);
    allocatedShipping = Math.max(0, floorMoney(shipping - priorAllocated));
  } else {
    allocatedShipping = floorMoney((baseAmount / totalBase) * shipping);
  }

  return floorMoney(baseAmount + allocatedShipping);
}

export function createCustomerReceivableHash(order: Order, line: OrderLine, customerId: string) {
  const raw = `${order.id}|${line.id}|${customerId}|${getOrderCustomerReceivableAmount(order, line).toFixed(2)}|${line.customerId || ""}|${orderShippingPrice(order).toFixed(2)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function buildOrderReceivableEntry(order: Order, line: OrderLine, customerId: string): CustomerLedgerEntry {
  const amount = getOrderCustomerReceivableAmount(order, line);
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
