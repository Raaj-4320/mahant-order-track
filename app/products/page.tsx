"use client";

import { PageShell } from "@/components/PageShell";
import { products } from "@/lib/data";

export default function ProductsPage() {
  return (
    <PageShell title="Products">
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="card flex flex-col gap-3 p-5 hover:border-fg-subtle hover:shadow-soft transition-all"
            >
              <div className="grid h-32 place-items-center rounded-lg bg-bg-subtle text-5xl">
                {p.photo}
              </div>
              <div>
                <div className="text-[14px] font-semibold">{p.name}</div>
                <div className="mt-1 text-[12px] text-fg-subtle">
                  {p.marka} · {p.defaultDim}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
