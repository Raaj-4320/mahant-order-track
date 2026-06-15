import type { Order, OrderNumberSeries } from "@/lib/types";

export type ParsedOrderNumber = {
  prefix: string;
  fullPrefix: string;
  category: string;
  numericNumber: number;
  sequenceNumber: number;
  normalized: string;
};

export type OrderNumberSeriesInput = {
  label: string;
  startNumber: number;
};

const ORDER_NUMBER_RE = /^(.*?)(\d+)$/;

export function normalizeSeriesLabel(value?: string | null): string {
  return (value || "").trim().toUpperCase().replace(/-+$/g, "");
}

export function buildSeriesPrefix(label?: string | null): string {
  const normalized = normalizeSeriesLabel(label);
  return normalized ? `${normalized}-` : "";
}

export function makeOrderNumberSeriesId(prefix: string): string {
  const slug = prefix.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `series-${slug || "default"}`;
}

export function parseOrderNumber(value?: string | null): ParsedOrderNumber | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(ORDER_NUMBER_RE);
  if (!match) return null;
  const fullPrefix = match[1] || "";
  const numericNumber = Number(match[2]);
  if (!fullPrefix || !Number.isInteger(numericNumber) || numericNumber <= 0) return null;
  const category = fullPrefix.replace(/-+$/g, "");
  return {
    prefix: fullPrefix,
    fullPrefix,
    category,
    numericNumber,
    sequenceNumber: numericNumber,
    normalized: `${fullPrefix}${numericNumber}`,
  };
}

export function formatSeriesOrderNumber(prefix: string, sequenceNumber: number): string {
  return `${prefix}${sequenceNumber}`;
}

export function getSeriesSuggestion(series: OrderNumberSeries | null | undefined): string {
  if (!series) return "";
  return formatSeriesOrderNumber(series.prefix, series.nextNumber);
}

export function orderNumberExists(orders: Order[], orderNumber: string, excludeOrderId?: string): boolean {
  const normalized = (orderNumber || "").trim().toLowerCase();
  if (!normalized) return false;
  return orders.some((order) => order.id !== excludeOrderId && ((order.number || order.orderNumber || "").trim().toLowerCase() === normalized));
}

export function deriveOrderSeriesFields(orderNumber: string): Pick<Order, "orderPrefix" | "orderSequenceNumber"> {
  const parsed = parseOrderNumber(orderNumber);
  if (!parsed) return { orderPrefix: undefined, orderSequenceNumber: undefined };
  return { orderPrefix: parsed.prefix, orderSequenceNumber: parsed.sequenceNumber };
}

export function backfillSeriesFromOrders(orders: Order[]): OrderNumberSeries[] {
  const now = new Date().toISOString();
  const seriesMap = new Map<string, OrderNumberSeries>();
  orders.forEach((order) => {
    const parsed = parseOrderNumber(order.number || order.orderNumber);
    if (!parsed) return;
    const existing = seriesMap.get(parsed.prefix);
    if (!existing) {
      seriesMap.set(parsed.prefix, {
        id: makeOrderNumberSeriesId(parsed.prefix),
        prefix: parsed.prefix,
        label: parsed.prefix.replace(/-+$/g, ""),
        startNumber: parsed.sequenceNumber,
        lastUsedNumber: parsed.sequenceNumber,
        nextNumber: parsed.sequenceNumber + 1,
        isDefault: false,
        isActive: true,
        createdAt: order.createdAt || order.savedAt || order.updatedAt || now,
        updatedAt: order.updatedAt || order.savedAt || order.createdAt || now,
      });
      return;
    }
    existing.startNumber = Math.min(existing.startNumber, parsed.sequenceNumber);
    existing.lastUsedNumber = Math.max(existing.lastUsedNumber, parsed.sequenceNumber);
    existing.nextNumber = Math.max(existing.nextNumber, parsed.sequenceNumber + 1);
    existing.updatedAt = order.updatedAt || order.savedAt || order.createdAt || existing.updatedAt;
  });
  return Array.from(seriesMap.values()).sort((left, right) => left.prefix.localeCompare(right.prefix));
}

export function mergeOrderSeries(stored: OrderNumberSeries[], derived: OrderNumberSeries[]): OrderNumberSeries[] {
  const merged = new Map<string, OrderNumberSeries>();
  [...derived, ...stored].forEach((series) => {
    const existing = merged.get(series.prefix);
    if (!existing) {
      merged.set(series.prefix, { ...series });
      return;
    }
    merged.set(series.prefix, {
      ...existing,
      ...series,
      startNumber: Math.min(existing.startNumber, series.startNumber),
      lastUsedNumber: Math.max(existing.lastUsedNumber, series.lastUsedNumber),
      nextNumber: Math.max(existing.nextNumber, series.nextNumber, existing.lastUsedNumber + 1, series.lastUsedNumber + 1),
      isActive: series.isActive ?? existing.isActive,
      updatedAt: series.updatedAt || existing.updatedAt,
    });
  });
  return Array.from(merged.values())
    .filter((series) => series.isActive !== false)
    .sort((left, right) => {
      if (left.isDefault && !right.isDefault) return -1;
      if (!left.isDefault && right.isDefault) return 1;
      return left.prefix.localeCompare(right.prefix);
    });
}

export function createSeriesRecord(input: OrderNumberSeriesInput, options?: Partial<OrderNumberSeries>): OrderNumberSeries {
  const prefix = buildSeriesPrefix(input.label);
  const now = new Date().toISOString();
  return {
    id: options?.id || makeOrderNumberSeriesId(prefix),
    prefix,
    label: normalizeSeriesLabel(input.label),
    startNumber: input.startNumber,
    lastUsedNumber: input.startNumber - 1,
    nextNumber: input.startNumber,
    isDefault: options?.isDefault ?? false,
    isActive: options?.isActive ?? true,
    createdAt: options?.createdAt || now,
    updatedAt: options?.updatedAt || now,
  };
}
