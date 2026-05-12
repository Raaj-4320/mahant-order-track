"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { customers, formatCNY, formatDate, suppliers } from "@/lib/data";
import { orderTotal } from "@/lib/types";
import { ClipboardList, TrendingUp, Users, Package } from "lucide-react";

export default function DashboardPage() {
  const { orders } = useStore();
  const totalAmount = orders.reduce((s, o) => s + orderTotal(o), 0);
  const totalLines = orders.reduce((s, o) => s + o.lines.length, 0);
  const recent = orders.slice(0, 5);

  return (
    <PageShell title="Dashboard">
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Orders" value={orders.length.toString()} hint="All time" icon={<ClipboardList size={16} />} />
          <StatCard label="Total Value" value={formatCNY(totalAmount)} hint="Across all orders" icon={<TrendingUp size={16} />} />
          <StatCard label="Customers" value={customers.length.toString()} hint="Active accounts" icon={<Users size={16} />} />
          <StatCard label="Line Items" value={totalLines.toString()} hint="Items booked" icon={<Package size={16} />} />
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Recent orders</h3>
            <span className="text-[12px] text-fg-subtle">Top 5</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="py-2 font-medium">Order</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Suppliers</th>
                  <th className="py-2 font-medium">Lines</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-3 font-medium">{o.number}</td>
                    <td className="py-3 text-fg-muted">{formatDate(o.date)}</td>
                    <td className="py-3 text-fg-muted">
                      {Array.from(
                        new Set(o.lines.map((l) => suppliers.find((s) => s.id === l.supplierId)?.name).filter(Boolean))
                      ).join(", ")}
                    </td>
                    <td className="py-3 text-fg-muted">{o.lines.length}</td>
                    <td className="py-3 text-right font-semibold text-[var(--success)] tabular-nums">
                      {formatCNY(orderTotal(o))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
