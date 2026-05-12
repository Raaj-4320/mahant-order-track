"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { formatCNY, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { getDashboardRows, getDashboardStats } from "@/services/selectors";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CalendarDays, ClipboardList, Download, Filter, Package, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

export default function DashboardPage() {
  const { orders, pushToast } = useStore();
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: paymentAgents } = usePaymentAgents();
  const stats = getDashboardStats(orders);
  const rows = getDashboardRows(orders, suppliers, customers, paymentAgents);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => rows.filter((r) => [r.orderNumber, r.customerSummary, r.supplierSummary].join(" ").toLowerCase().includes(query.toLowerCase().trim())), [rows, query]);
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Orders" value={stats.totalOrders.toString()} icon={<ClipboardList size={16} />} />
          <StatCard label="Total Order Amount" value={formatCNY(stats.totalOrderAmount)} icon={<TrendingUp size={16} />} />
          <StatCard label="Orders Loading Today" value={stats.ordersLoadingToday.toString()} icon={<CalendarDays size={16} />} />
          <StatCard label="Pending Payments" value={stats.pendingPayments.toString()} icon={<Package size={16} />} />
          <StatCard label="Delayed Shipments" value={stats.delayedShipments.toString()} icon={<Filter size={16} />} />
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[260px] flex-1"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by order no., customer, supplier..." leadingIcon={<Search size={14} />} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />Filter</Button>
          <button onClick={placeholder} className="btn btn-secondary py-1.5 px-3 text-[13px] rounded-lg"><CalendarDays size={14} />01 May 2025 - 31 May 2025</button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Order Number</th><th>Total Unique Items</th><th>Order Total</th><th>Paid By</th><th>Loading Date</th><th>Status</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="font-semibold">{r.orderNumber}</div><div className="text-[11.5px] text-fg-subtle truncate max-w-[240px]">{r.supplierSummary}</div></td>
                    <td><span className="rounded-full bg-bg-subtle px-2 py-1 text-[11.5px]">{r.totalUniqueItems} Items</span></td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatCNY(r.orderTotal)}</td>
                    <td><div>{r.paidBy}</div></td>
                    <td><span className="rounded-md border border-border px-2 py-1 text-[12px]">{r.loadingDate ? formatDate(r.loadingDate) : "—"}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="px-4"><ActionIcons onPlaceholder={placeholder} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No matching orders found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>
      </div>
    </PageShell>
  );
}
