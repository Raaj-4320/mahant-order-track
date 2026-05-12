"use client";

import { PageShell } from "@/components/PageShell";
import { formatCNY } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useSuppliers } from "@/hooks/useSuppliers";
import { getSupplierStats } from "@/services/selectors";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Building2, Download, Filter, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { StatCard } from "@/components/StatCard";

export default function SuppliersPage() {
  const { orders, pushToast } = useStore();
  const { data: suppliers } = useSuppliers();
  const rows = getSupplierStats(suppliers, orders).map((x) => ({ ...x.supplier, totalOrders: x.totalOrders, totalOrderAmount: x.totalOrderAmount }));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => rows.filter((r) => [r.name, r.contactPerson, r.city, r.country].join(" ").toLowerCase().includes(query.toLowerCase().trim()) && (status === "all" || r.status === status)), [rows, query, status]);
  const active = rows.filter((r) => r.status === "active").length;
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });

  return (
    <PageShell title="Suppliers">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1">
            <StatCard label="Total Suppliers" value={rows.length.toString()} />
            <StatCard label="Active Suppliers" value={active.toString()} />
            <StatCard label="Inactive Suppliers" value={(rows.length - active).toString()} />
            <StatCard label="Total Orders" value={rows.reduce((s, r) => s + r.totalOrders, 0).toString()} />
            <StatCard label="Total Order Amount" value={formatCNY(rows.reduce((s, r) => s + r.totalOrderAmount, 0))} />
          </div>
          <Button onClick={placeholder} variant="primary" className="ml-3"><Plus size={14} />Add Supplier</Button>
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by supplier name, contact, city, country..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <div className="w-[160px]"><Select value="all" onChange={placeholder} options={[{ value: "all", label: "All Countries" }]} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Supplier</th><th>Contact Person</th><th>Location</th><th>Total Orders</th><th>Total Order Amount</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[12px] font-semibold">{s.logoInitials}</div><div><div className="font-semibold">{s.name}</div><div className="text-[11.5px] text-fg-subtle">{s.supplierCode}</div></div></div></td>
                    <td><div>{s.contactPerson}</div><div className="text-[11.5px] text-fg-subtle">{s.phone}</div></td>
                    <td><div>{s.country}</div><div className="text-[11.5px] text-fg-subtle">{s.city}</div></td>
                    <td>{s.totalOrders}</td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatCNY(s.totalOrderAmount)}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="px-4"><ActionIcons onPlaceholder={placeholder} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No suppliers found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>
      </div>
    </PageShell>
  );
}
