import { lineTotalPcs, lineTotalRmb, type Order } from "@/lib/types";

const SUPPLIER_SOURCE_STATUSES = ["saved", "loading", "shipped", "received", "completed", "cancelled", "delayed"] as const;
export const isSupplierSourceOrder = (order: Order) =>
  (SUPPLIER_SOURCE_STATUSES as readonly string[]).includes((order.status || "").toString());

const norm = (v: string) => v.trim().replace(/\s+/g, " ");
const key = (v: string) => norm(v).toLowerCase();
const lineSupplier = (line: Order["lines"][number]) => norm(line.supplierName || line.supplierSnapshot?.name || line.supplierId || "");

export function getWechatSupplierGroups(orders: Order[]) {
  const groups = new Map<string, any>();
  for (const o of orders) {
    const w = norm(o.wechatId || "");
    if (!w) continue;
    const lines = o.lines
      .map((l) => ({
        lineId: l.id,
        supplierName: lineSupplier(l),
        marka: l.marka,
        details: l.details,
        amount: lineTotalRmb(l),
        totalPcs: lineTotalPcs(l),
        totalCtns: Number(l.totalCtns) || 0,
        customerName: l.customerName || l.customerSnapshot?.name || "",
      }))
      .filter((l) => l.supplierName);
    if (!lines.length) continue;
    const row = groups.get(w) || { wechatId: w, orders: [] as any[] };
    row.orders.push({
      orderId: o.id,
      orderNumber: o.number || o.orderNumber,
      date: o.date,
      loadingDate: o.loadingDate,
      totalAmount: lines.reduce((s, l) => s + l.amount, 0),
      lines,
    });
    groups.set(w, row);
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    orderIds: g.orders.map((o: any) => o.orderId),
    orderNumbers: g.orders.map((o: any) => o.orderNumber),
    totalOrders: g.orders.length,
    totalLineCount: g.orders.reduce((s: number, o: any) => s + o.lines.length, 0),
    totalSuppliers: g.orders.reduce((s: number, o: any) => s + o.lines.length, 0),
    totalCtns: g.orders.reduce((s: number, o: any) => s + o.lines.reduce((x: number, l: any) => x + l.totalCtns, 0), 0),
    totalPcs: g.orders.reduce((s: number, o: any) => s + o.lines.reduce((x: number, l: any) => x + l.totalPcs, 0), 0),
    totalAmount: g.orders.reduce((s: number, o: any) => s + o.totalAmount, 0),
    supplierNames: Array.from(new Set(g.orders.flatMap((o: any) => o.lines.map((l: any) => l.supplierName)))),
    customerNames: Array.from(new Set(g.orders.flatMap((o: any) => o.lines.map((l: any) => l.customerName).filter(Boolean)))),
    lastOrderDate: g.orders.map((o: any) => o.date).sort().at(-1),
    lastLoadingDate: g.orders.map((o: any) => o.loadingDate).filter(Boolean).sort().at(-1),
  }));
}

export function getUniqueSupplierGroups(orders: Order[]) {
  const groups = new Map<string, any>();
  for (const o of orders) for (const l of o.lines) {
    const name = lineSupplier(l); if (!name) continue;
    const k = key(name);
    const row = groups.get(k) || { supplierKey: k, supplierName: name, entries: [] as any[] };
    row.entries.push({
      orderId: o.id, orderNumber: o.number || o.orderNumber, wechatId: o.wechatId || "", date: o.date, loadingDate: o.loadingDate,
      lineId: l.id, amount: lineTotalRmb(l), marka: l.marka, details: l.details,
      totalCtns: Number(l.totalCtns) || 0, totalPcs: lineTotalPcs(l), customerName: l.customerName || l.customerSnapshot?.name || "",
    });
    groups.set(k, row);
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    orderIds: Array.from(new Set(g.entries.map((e: any) => e.orderId))),
    orderNumbers: Array.from(new Set(g.entries.map((e: any) => e.orderNumber))),
    totalOrders: new Set(g.entries.map((e: any) => e.orderId)).size,
    totalWechatIds: new Set(g.entries.map((e: any) => e.wechatId).filter(Boolean)).size,
    totalLineCount: g.entries.length,
    totalCtns: g.entries.reduce((s: number, e: any) => s + e.totalCtns, 0),
    totalPcs: g.entries.reduce((s: number, e: any) => s + e.totalPcs, 0),
    totalAmount: g.entries.reduce((s: number, e: any) => s + e.amount, 0),
    customerNames: Array.from(new Set(g.entries.map((e: any) => e.customerName).filter(Boolean))),
    lastOrderDate: g.entries.map((e: any) => e.date).sort().at(-1),
    lastLoadingDate: g.entries.map((e: any) => e.loadingDate).filter(Boolean).sort().at(-1),
  }));
}
