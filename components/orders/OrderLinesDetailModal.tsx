"use client";

import { formatAmount, formatDate } from "@/lib/data";
import { Order } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

const label = "text-[11px] uppercase tracking-wide text-fg-subtle";
const value = "text-[15px] font-semibold tabular-nums";

export function OrderLinesDetailModal({ order, isOpen, onClose }: OrderLinesDetailModalProps) {
  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div className="mx-auto mt-8 w-full max-w-6xl rounded-xl border border-border bg-bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-lg font-semibold">Order Details</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><div className={label}>Order Number</div><div className={value}>{order.number}</div></div>
            <div><div className={label}>Date</div><div className={value}>{order.date ? formatDate(order.date) : "—"}</div></div>
            <div><div className={label}>Loading Date</div><div className={value}>{order.loadingDate ? formatDate(order.loadingDate) : "—"}</div></div>
            <div><div className={label}>Status</div><div className={value}>{order.status}</div></div>
            <div><div className={label}>Payment Agent</div><div className="text-[14px] font-medium">{order.paymentBy || "—"}</div></div>
            <div><div className={label}>WeChat ID</div><div className="text-[14px] font-medium">{order.wechatId || "—"}</div></div>
            <div><div className={label}>Total Lines</div><div className={value}>{order.lines.length}</div></div>
            <div><div className={label}>Total Amount</div><div className="text-[24px] font-bold text-[var(--success)]">{formatAmount(orderTotal(order))}</div></div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1050px] text-[12px]">
              <thead className="bg-bg-subtle text-left uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Dimension Photo</th><th className="px-3 py-2">Product Photo</th><th className="px-3 py-2">Marka</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Total Cartons</th><th className="px-3 py-2">PCS / Carton</th><th className="px-3 py-2">Rate / PCS</th><th className="px-3 py-2">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
                  const lineTotal = totalPcs * (line.rmbPerPcs || 0);
                  return <tr key={line.id} className="border-t border-border align-top"><td className="px-3 py-2">{line.photoUrl ? <img src={line.photoUrl} alt="dimension" className="h-10 w-10 rounded border border-border object-cover" /> : "No photo"}</td><td className="px-3 py-2">{line.productPhotoUrl ? <img src={line.productPhotoUrl} alt="product" className="h-10 w-10 rounded border border-border object-cover" /> : "No photo"}</td><td className="px-3 py-2 font-medium">{line.marka || "—"}</td><td className="px-3 py-2">{line.details || "—"}</td><td className="px-3 py-2 tabular-nums">{line.totalCtns || 0}</td><td className="px-3 py-2 tabular-nums">{line.pcsPerCtn || 0}</td><td className="px-3 py-2 tabular-nums">{formatAmount(line.rmbPerPcs || 0)}</td><td className="px-3 py-2 font-semibold tabular-nums">{formatAmount(lineTotal)}</td></tr>;
                })}
                {order.lines.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-fg-subtle">No order lines to display.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
