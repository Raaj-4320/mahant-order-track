"use client";

import { PageShell } from "@/components/PageShell";
import { formatCNY } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useCustomers } from "@/hooks/useCustomers";
import { getCustomerStats } from "@/services/selectors";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Download, Filter, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { isAnyFirebaseModeEnabled } from "@/lib/runtimeConfig";

export default function CustomersPage() {
  const { orders, pushToast } = useStore();
  const { data: customers, error } = useCustomers();
  const base = getCustomerStats(customers, orders).map((x) => ({ ...x.customer, totalOrders: x.totalOrders, totalSpent: x.totalSpent, outstandingAmount: x.outstandingAmount }));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => base.filter((c) => [c.name, c.phone, c.wechatId, c.city].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || c.status === status)), [base, q, status]);
  const active = base.filter((c) => c.status === "active").length;
  const firebaseMode = isAnyFirebaseModeEnabled();
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });

  return (
    <PageShell title="Customers">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 flex-1">
            <StatCard label="Total Customers" value={base.length.toString()} icon={<Users size={16} />} />
            <StatCard label="Active Customers" value={active.toString()} />
            <StatCard label="Inactive Customers" value={(base.length - active).toString()} />
            <StatCard label="Total Orders" value={base.reduce((s, c) => s + c.totalOrders, 0).toString()} />
            <StatCard label="Total Spent" value={formatCNY(base.reduce((s, c) => s + c.totalSpent, 0))} />
            <StatCard label="Outstanding Amount" value={formatCNY(base.reduce((s, c) => s + (c.outstandingAmount ?? 0), 0))} />
          </div>
          <Button onClick={placeholder} variant="primary" className="ml-3"><Plus size={14} />Add Customer</Button>
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by customer name, phone, wechat id, city..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <div className="w-[160px]"><Select value="all" onChange={placeholder} options={[{ value: "all", label: "All Locations" }]} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>
        {error && <div className="text-[12px] text-fg-subtle">{error}</div>}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[13px]">
              <thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Customer</th><th>Contact</th><th>Location</th><th>Total Orders</th><th>Total Spent</th><th>Outstanding</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[12px] font-semibold">{c.displayName.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div><div className="font-semibold">{c.displayName}</div><div className="text-[11.5px] text-fg-subtle">{c.customerCode}</div></div></div></td>
                    <td><div>{c.phone || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.wechatId || c.email || "—"}</div></td>
                    <td><div>{c.country || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.city || "—"}</div></td>
                    <td>{c.totalOrders}</td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatCNY(c.totalSpent)}</td>
                    <td className="tabular-nums">{formatCNY(c.outstandingAmount ?? 0)}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="px-4"><ActionIcons onPlaceholder={placeholder} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">{firebaseMode ? "No customers yet. Customer records will appear here when added." : "No customers found."}</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>
      </div>
    </PageShell>
  );
}
