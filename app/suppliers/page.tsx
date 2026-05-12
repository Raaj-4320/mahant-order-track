"use client";

import { PageShell } from "@/components/PageShell";
import { suppliers, formatCNY } from "@/lib/data";
import { useStore } from "@/lib/store";
import { Truck } from "lucide-react";

export default function SuppliersPage() {
  const { orders } = useStore();
  const rows = suppliers.map((s) => {
    const lines = orders.flatMap((o) => o.lines.filter((l) => l.supplierId === s.id));
    const total = lines.reduce((sum, l) => sum + l.totalCtns * l.pcsPerCtn * l.rmbPerPcs, 0);
    return { s, lines: lines.length, total };
  });

  return (
    <PageShell title="Suppliers">
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ s, lines, total }) => (
            <div key={s.id} className="card p-5 hover:border-fg-subtle hover:shadow-soft transition-all">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-bg-subtle border border-border text-fg-muted">
                  <Truck size={16} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{s.name}</div>
                  <div className="text-[12px] text-fg-subtle">{lines} line{lines === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-[12px] text-fg-muted">Lifetime value</span>
                <span className="text-[16px] font-semibold tabular-nums text-[var(--success)]">
                  {formatCNY(total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
