import { lineTotalPcs, lineTotalRmb, type Order, type Supplier } from "@/lib/types";

const norm = (v: string) => v.trim().replace(/\s+/g, " ");
const key = (v: string) => norm(v).toLowerCase();
const lineSupplier = (line: Order["lines"][number], suppliers: Supplier[]) => norm(line.supplierName || suppliers.find((s) => s.id === line.supplierId)?.name || "");

export function getWechatSupplierGroups(orders: Order[], suppliers: Supplier[] = []) {
  const groups = new Map<string, any>();
  for (const o of orders) {
    const w = norm(o.wechatId || "");
    if (!w) continue;
    const lines = o.lines.map((l) => ({ lineId: l.id, supplierName: lineSupplier(l, suppliers), marka: l.marka, details: l.details, amount: lineTotalRmb(l), totalPcs: lineTotalPcs(l), image: l.productPhotoUrl || l.photoUrl })).filter((l) => l.supplierName);
    if (!lines.length) continue;
    const row = groups.get(w) || { wechatId: w, orders: [] as any[] };
    row.orders.push({ orderId: o.id, orderNumber: o.number || o.orderNumber, date: o.date, totalAmount: lines.reduce((s, l) => s + l.amount, 0), lines });
    groups.set(w, row);
  }
  return Array.from(groups.values()).map((g) => ({ ...g, totalOrders: g.orders.length, totalSuppliers: g.orders.reduce((s: number, o: any) => s + o.lines.length, 0), totalAmount: g.orders.reduce((s: number, o: any) => s + o.totalAmount, 0), lastOrderDate: g.orders.map((o: any) => o.date).sort().at(-1) }));
}

export function getUniqueSupplierGroups(orders: Order[], suppliers: Supplier[] = []) {
  const groups = new Map<string, any>();
  for (const o of orders) for (const l of o.lines) {
    const name = lineSupplier(l, suppliers); if (!name) continue;
    const k = key(name);
    const row = groups.get(k) || { supplierKey: k, supplierName: name, entries: [] as any[] };
    row.entries.push({ orderId: o.id, orderNumber: o.number || o.orderNumber, wechatId: o.wechatId || "", date: o.date, lineId: l.id, amount: lineTotalRmb(l), marka: l.marka, details: l.details });
    groups.set(k, row);
  }
  return Array.from(groups.values()).map((g) => ({ ...g, totalOrders: new Set(g.entries.map((e: any) => e.orderId)).size, totalWechatIds: new Set(g.entries.map((e: any) => e.wechatId).filter(Boolean)).size, totalAmount: g.entries.reduce((s: number, e: any) => s + e.amount, 0), lastOrderDate: g.entries.map((e: any) => e.date).sort().at(-1) }));
}
