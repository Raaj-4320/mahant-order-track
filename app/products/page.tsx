"use client";

import { PageShell } from "@/components/PageShell";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useStore } from "@/lib/store";
import { getProductStats } from "@/services/selectors";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { formatCNY } from "@/lib/data";
import { Boxes, Download, Filter, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function ProductsPage() {
  const { data: products, error } = useProducts();
  const { data: suppliers } = useSuppliers();
  const { orders, pushToast } = useStore();
  const rows = getProductStats(products, orders).map((x) => ({ ...x.product, totalQtyPcs: x.totalQtyPcs, totalAmount: x.totalAmount, catalogValue: x.catalogValue, isLowStock: x.isLowStock }));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const categories = Array.from(new Set(rows.map((r) => r.category)));
  const filtered = useMemo(() => rows.filter((p) => [p.name, p.sku, p.marka, p.category].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || p.status === status) && (category === "all" || p.category === category)), [rows, q, status, category]);
  const active = rows.filter((r) => r.status === "active").length;
  const lowStock = rows.filter((r) => r.isLowStock).length;
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });

  return (
    <PageShell title="Products">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 flex-1">
            <StatCard label="Total Products" value={rows.length.toString()} icon={<Boxes size={16} />} />
            <StatCard label="Active Products" value={active.toString()} />
            <StatCard label="Inactive Products" value={(rows.length - active).toString()} />
            <StatCard label="Categories" value={categories.length.toString()} />
            <StatCard label="Low Stock Items" value={lowStock.toString()} />
            <StatCard label="Total Catalog Value" value={formatCNY(rows.reduce((s, r) => s + (r.catalogValue ?? 0), 0))} />
          </div>
          <Button onClick={placeholder} variant="primary" className="ml-3"><Plus size={14} />Add Product</Button>
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name, SKU, marka, category..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[170px]"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>
        {error && <div className="text-[12px] text-fg-subtle">{error}</div>}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[13px]">
              <thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Product</th><th>Marka</th><th>Category</th><th>Default Dimension</th><th>RMB / PCS</th><th>Supplier</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[20px]">{p.photo}</div><div><div className="font-semibold">{p.name}</div><div className="text-[11.5px] text-fg-subtle">{p.sku}</div></div></div></td>
                    <td>{p.marka}</td>
                    <td>{p.category} <span className="text-fg-subtle">· {p.unit}</span></td>
                    <td>{p.defaultDim || "—"}</td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatCNY(p.sellingPrice ?? p.defaultRmbPerPcs ?? 0)}</td>
                    <td>{suppliers.find((s) => s.id === p.supplierId)?.name ?? "—"}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="px-4"><ActionIcons onPlaceholder={placeholder} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">No products found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>
      </div>
    </PageShell>
  );
}
