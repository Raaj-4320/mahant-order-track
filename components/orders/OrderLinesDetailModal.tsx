"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { Order } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useState } from "react";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

const label = "text-[11px] uppercase tracking-wide text-fg-subtle";

const formatPlainAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OrderLinesDetailModal({ order, isOpen, onClose }: OrderLinesDetailModalProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  if (!isOpen || !order) return null;
  const getLineProductPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
    return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div className="mx-auto mt-8 w-full max-w-6xl rounded-2xl border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-[20px] font-semibold">Order Details</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>✕</Button>
        </div>

        <div className="space-y-5 p-5">
          <div className="overflow-hidden rounded-xl border border-border bg-bg">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1 p-4 sm:p-5">
                <div className={label}>Order Number</div>
                <div className="text-[19px] font-bold tabular-nums">{order.number || order.orderNumber || "—"}</div>
              </div>
              <div className="space-y-1 border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5">
                <div className={label}>WeChat ID</div>
                <div className="text-[19px] font-semibold">{order.wechatId || "—"}</div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-bg-card">
            <table className="w-full min-w-[920px] text-[12px]">
              <thead className="bg-[var(--brand)] text-left uppercase tracking-wide text-[var(--brand-fg)]">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-2">Product Photo</th>
                  <th className="px-3 py-2">Marka Info</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Total Ctns</th>
                  <th className="px-3 py-2">Pcs / Ctn</th>
                  <th className="px-3 py-2">Total Pcs</th>
                  <th className="px-3 py-2">Price / Pc</th>
                  <th className="px-3 py-2">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, idx) => {
                  const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
                  const lineTotal = totalPcs * (line.rmbPerPcs || 0);
                  const productPhoto = getLineProductPhoto(line);
                  return (
                    <tr key={line.id} className="border-t border-border align-top">
                      <td className="px-3 py-3 text-center font-semibold tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-3">
                        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle text-[11px] text-fg-subtle">
                          {productPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(productPhoto)}><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 160, height: 160, crop: "fill" })} alt="product" className="h-full w-full object-cover" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold">{line.marka || "—"}</td>
                      <td className="px-3 py-3 text-fg-muted">{line.details || "—"}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{line.totalCtns || 0}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{line.pcsPerCtn || 0}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{totalPcs || 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.rmbPerPcs ? formatPlainAmount(line.rmbPerPcs) : "0.00"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{lineTotal ? formatPlainAmount(lineTotal) : "0.00"}</td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-fg-subtle">No order lines to display.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end rounded-xl border border-border bg-bg-subtle px-3 py-3 sm:px-4">
            <div className="text-right">
              <div className={label}>Total Order Amount</div>
              <div className="mt-1 inline-flex rounded-lg border border-border bg-[var(--brand)] px-4 py-1.5 text-[18px] font-bold text-[var(--brand-fg)] tabular-nums">{formatPlainAmount(orderTotal(order))}</div>
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
