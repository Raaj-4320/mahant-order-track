"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { Order } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

const label = "text-[11px] uppercase tracking-wide text-fg-subtle";

const formatPlainAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><div className={label}>Order Number</div><div className="text-[15px] font-semibold tabular-nums">{order.number || order.orderNumber || "—"}</div></div>
            <div><div className={label}>WeChat ID</div><div className="text-[14px] font-medium">{order.wechatId || "—"}</div></div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[920px] text-[12px]">
              <thead className="bg-bg-subtle text-left uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Product Photo</th>
                  <th className="px-3 py-2">Marka Info</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Total Ctns</th>
                  <th className="px-3 py-2">Pcs/Ctn</th>
                  <th className="px-3 py-2">Total Pcs</th>
                  <th className="px-3 py-2">Price/Pc</th>
                  <th className="px-3 py-2">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
                  const lineTotal = totalPcs * (line.rmbPerPcs || 0);
                  return (
                    <tr key={line.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">{line.productPhotoUrl ? <img src={getCloudinaryOptimizedUrl(line.productPhotoUrl, { width: 96, height: 96, crop: "fill" })} alt="product" className="h-10 w-10 rounded border border-border object-cover" loading="lazy" decoding="async" /> : "No photo"}</td>
                      <td className="px-3 py-2 font-medium">{line.marka || "—"}</td>
                      <td className="px-3 py-2">{line.details || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{line.totalCtns || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{line.pcsPerCtn || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{totalPcs || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{line.rmbPerPcs ? formatPlainAmount(line.rmbPerPcs) : "—"}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums">{lineTotal ? formatPlainAmount(lineTotal) : "—"}</td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-fg-subtle">No order lines to display.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="rounded-lg border border-border bg-bg-subtle px-4 py-2 text-right">
              <div className={label}>Total Order Amount</div>
              <div className="text-[20px] font-bold text-[var(--success)] tabular-nums">{formatPlainAmount(orderTotal(order))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
