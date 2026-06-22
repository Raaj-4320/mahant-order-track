import type { Order, OrderNumberSeries } from "@/lib/types";
import type { OrderNumberSeriesService } from "@/services/contracts";
import { backfillSeriesFromOrders, createSeriesRecord, formatSeriesOrderNumber, mergeOrderSeries, orderNumberExists, parseOrderNumber } from "@/lib/orderNumberSeries";
import { deepClone } from "./utils";

let mockSeries: OrderNumberSeries[] = [];

function getMergedSeries(orders: Order[] = []): OrderNumberSeries[] {
  return mergeOrderSeries(mockSeries, backfillSeriesFromOrders(orders));
}

export const orderNumberSeriesMockService: OrderNumberSeriesService = {
  async listOrderNumberSeries(orders = []) {
    return deepClone(getMergedSeries(orders));
  },
  async createOrderNumberSeries(input, orders = []) {
    const merged = getMergedSeries(orders);
    const record = createSeriesRecord(input);
    if (merged.some((series) => series.prefix === record.prefix)) {
      throw new Error("This series already exists.");
    }
    if (orderNumberExists(orders, formatSeriesOrderNumber(record.prefix, record.nextNumber))) {
      throw new Error("This order number already exists. Choose another starting number.");
    }
    mockSeries = mergeOrderSeries([...mockSeries, record], []);
    return deepClone(record);
  },
  async syncOrderNumberSeriesFromOrder(order, orders = []) {
    const parsed = parseOrderNumber(order.number || order.orderNumber);
    if (!parsed) return null;
    const merged = getMergedSeries(orders);
    const existing = merged.find((series) => series.prefix === parsed.prefix);
    if (!existing) return null;
    const updated: OrderNumberSeries = {
      ...existing,
      lastUsedNumber: Math.max(existing.lastUsedNumber, parsed.sequenceNumber),
      nextNumber: Math.max(existing.nextNumber, parsed.sequenceNumber + 1),
      updatedAt: new Date().toISOString(),
    };
    mockSeries = mergeOrderSeries(mockSeries.filter((series) => series.prefix !== updated.prefix).concat(updated), []);
    return deepClone(updated);
  },
  async deleteOrderNumberSeries(id) {
    mockSeries = mockSeries.filter((series) => series.id !== id);
  },
};
