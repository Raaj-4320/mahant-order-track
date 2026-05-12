"use client";

import { PageShell } from "@/components/PageShell";
import { customers, formatCNY } from "@/lib/data";
import { useStore } from "@/lib/store";
import { orderTotal } from "@/lib/types";
import { Users } from "lucide-react";

export default function CustomersPage() {
  const { orders } = useStore();
  const rows = customers.map((c) => {
    const involved = orders.filter((o) => o.lines.some((l) => l.customerId === c.id));
    const total = involved.reduce((s, o) => {
      const matchLines = o.lines.filter((l) => l.customerId === c.id);
      return (
        s +
        matchLines.reduce(
          (ss, l) => ss + l.totalCtns * l.pcsPerCtn * l.rmbPerPcs,
          0
        )
      );
    }, 0);
    return { c, orders: involved.length, total };
  });

  return (
    <PageShell title="Customers">
      <div className="p-6 space-y-4">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-[15px] font-semibold flex items-center gap-2">
              <Users size={16} /> {customers.length} customers
            </h3>
            <span className="text-[12px] text-fg-subtle">Sorted by total value</span>
          </div>
          <div className="divide-y divide-border">
            {rows
              .sort((a, b) => b.total - a.total)
              .map(({ c, orders, total }) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-bg-subtle/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-subtle border border-border text-[12px] font-semibold">
                      {c.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                    </div>
                    <div>
                      <div className="text-[14px] font-medium">{c.name}</div>
                      <div className="text-[12px] text-fg-subtle">{orders} order{orders === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <div className="text-[15px] font-semibold tabular-nums text-[var(--success)]">
                    {formatCNY(total)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
