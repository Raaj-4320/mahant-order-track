"use client";

import { PageShell } from "@/components/PageShell";
import { formatCNY, formatDate } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useSuppliers } from "@/hooks/useSuppliers";
import { getUniqueSupplierGroups, getWechatSupplierGroups } from "@/services/supplierSelectors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/StatCard";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function SuppliersPage() {
  const { orders, pushToast } = useStore();
  const { data: suppliers } = useSuppliers();
  const [tab, setTab] = useState<"wechat" | "unique">("wechat");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const wechatGroups = useMemo(() => getWechatSupplierGroups(orders, suppliers), [orders, suppliers]);
  const uniqueGroups = useMemo(() => getUniqueSupplierGroups(orders, suppliers), [orders, suppliers]);
  const filteredWechat = wechatGroups.filter((g) => [g.wechatId, ...g.orders.map((o: any) => o.orderNumber), ...g.orders.flatMap((o: any) => o.lines.map((l: any) => l.supplierName))].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  const filteredUnique = uniqueGroups.filter((g) => [g.supplierName, ...g.entries.map((e: any) => `${e.wechatId} ${e.orderNumber}`)].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  return <PageShell title="Suppliers"><div className="space-y-4 p-6">
    <div className="flex gap-2"><Button variant={tab==="wechat"?"primary":"secondary"} size="sm" onClick={()=>setTab("wechat")}>WeChat IDs</Button><Button variant={tab==="unique"?"primary":"secondary"} size="sm" onClick={()=>setTab("unique")}>Unique Suppliers</Button></div>
    <div className="min-w-[280px]"><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={tab==="wechat"?"Search by wechat, order, supplier...":"Search by supplier, wechat, order..."} leadingIcon={<Search size={14} />} /></div>
    {tab==="wechat" ? <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total WeChat IDs" value={filteredWechat.length.toString()} /><StatCard label="Total Orders" value={filteredWechat.reduce((s,g)=>s+g.totalOrders,0).toString()} /><StatCard label="Total Supplier Entries" value={filteredWechat.reduce((s,g)=>s+g.totalSuppliers,0).toString()} /><StatCard label="Total Amount" value={formatCNY(filteredWechat.reduce((s,g)=>s+g.totalAmount,0))} /></div>
      <div className="card overflow-hidden"><table className="w-full text-[13px]"><thead className="bg-bg-subtle"><tr><th className="px-3 py-2 text-left">WeChat ID</th><th className="text-left">Orders</th><th className="text-left">Suppliers</th><th className="text-left">Amount</th><th className="text-left">Last Date</th><th /></tr></thead><tbody>{filteredWechat.map((g)=><><tr key={g.wechatId} className="border-t border-border"><td className="px-3 py-2 font-semibold">{g.wechatId}</td><td>{g.totalOrders}</td><td>{g.totalSuppliers}</td><td>{formatCNY(g.totalAmount)}</td><td>{g.lastOrderDate?formatDate(g.lastOrderDate):"—"}</td><td><Button size="sm" variant="secondary" onClick={()=>setExpanded(expanded===g.wechatId?null:g.wechatId)}>View Details</Button></td></tr>{expanded===g.wechatId && <tr><td colSpan={6} className="px-3 py-2 bg-bg-subtle">{g.orders.map((o:any)=><div key={o.orderId} className="mb-2"><div className="text-[12px] font-medium">{o.orderNumber} · {formatDate(o.date)}</div>{o.lines.map((l:any)=><div key={l.lineId} className="text-[12px] text-fg-subtle">{l.supplierName} · {formatCNY(l.amount)} · {l.marka || l.details || "—"}</div>)}</div>)}</td></tr>}</>)}</tbody></table></div>
    </> : <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total Unique Suppliers" value={filteredUnique.length.toString()} /><StatCard label="Total Orders" value={filteredUnique.reduce((s,g)=>s+g.totalOrders,0).toString()} /><StatCard label="Total WeChat IDs" value={filteredUnique.reduce((s,g)=>s+g.totalWechatIds,0).toString()} /><StatCard label="Total Amount" value={formatCNY(filteredUnique.reduce((s,g)=>s+g.totalAmount,0))} /></div>
      <div className="card overflow-hidden"><table className="w-full text-[13px]"><thead className="bg-bg-subtle"><tr><th className="px-3 py-2 text-left">Supplier</th><th className="text-left">Orders</th><th className="text-left">WeChat IDs</th><th className="text-left">Amount</th><th className="text-left">Last Date</th><th /></tr></thead><tbody>{filteredUnique.map((g)=><><tr key={g.supplierKey} className="border-t border-border"><td className="px-3 py-2 font-semibold">{g.supplierName}</td><td>{g.totalOrders}</td><td>{g.totalWechatIds}</td><td>{formatCNY(g.totalAmount)}</td><td>{g.lastOrderDate?formatDate(g.lastOrderDate):"—"}</td><td><Button size="sm" variant="secondary" onClick={()=>setExpanded(expanded===g.supplierKey?null:g.supplierKey)}>View Details</Button></td></tr>{expanded===g.supplierKey && <tr><td colSpan={6} className="px-3 py-2 bg-bg-subtle">{g.entries.map((e:any)=><div key={e.lineId} className="text-[12px] text-fg-subtle">{e.orderNumber} · {e.wechatId || "—"} · {formatDate(e.date)} · {formatCNY(e.amount)} · {e.marka || e.details || "—"}</div>)}</td></tr>}</>)}</tbody></table></div>
    </>}
    <Button size="sm" variant="secondary" onClick={()=>pushToast({tone:"info",text:"Manual supplier creation is not required in this flow."})}>Add Supplier</Button>
  </div></PageShell>;
}
