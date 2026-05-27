"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { Order } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useState } from "react";
import { Copy } from "lucide-react";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

const label = "text-[12px] uppercase tracking-wide text-fg-subtle";

const formatPlainAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OrderLinesDetailModal({ order, isOpen, onClose }: OrderLinesDetailModalProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  if (!isOpen || !order) return null;
  const getLineProductPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
    return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
  };
  const getLineDimensionPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { dimensionPhotoUrl?: string; sizePhotoUrl?: string };
    return candidate.photoUrl || candidate.dimensionPhotoUrl || candidate.sizePhotoUrl || "";
  };
  const orderNo = order.number || order.orderNumber || "—";
  const buildLineCopyText = (line: Order["lines"][number]) => {
    const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
    return `外套编织袋唛头一 正一侧唛头如下:\n\n${line.marka || "—"}\n\nQTY - ${totalPcs} PCS\n\nGW:填毛重\n\nMEAS:填外箱尺寸\n\n(${orderNo || "—"})`;
  };
  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1200);
    } catch {
      setCopiedKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div className="mx-auto mt-4 w-[96vw] max-w-[1400px] rounded-2xl border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[18px] font-semibold">Order Details</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>✕</Button>
        </div>

        <div className="space-y-2.5 p-3">
          <div className="overflow-hidden rounded-xl border-2 border-border bg-bg">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="space-y-0.5 border-r-2 border-border p-2.5">
                <div className={label}>Order Number</div>
                <div className="text-[18px] font-bold tabular-nums">{order.number || order.orderNumber || "—"}</div>
              </div>
              <div className="space-y-0.5 p-2.5">
                <div className={label}>WECHAT</div>
                <div className="text-[18px] font-bold">WECHAT : {order.wechatId || "—"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-border bg-bg-card">
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                <col className="w-[32px]" />
                <col className="w-[86px]" />
                <col className="w-[86px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[70px]" />
                <col className="w-[55px]" />
                <col className="w-[75px]" />
                <col className="w-[75px]" />
                <col className="w-[90px]" />
                <col className="w-[155px]" />
              </colgroup>
              <thead className="bg-[var(--brand)] text-left uppercase tracking-wide text-[var(--brand-fg)]">
                <tr>
                  <th className="border border-border px-2 py-3">#</th>
                  <th className="border border-border px-2 py-3">Product Dimension / Weight</th>
                  <th className="border border-border px-2 py-3">Product Photo</th>
                  <th className="border border-border px-2 py-3">Marka</th>
                  <th className="border border-border px-2 py-3">Details</th>
                  <th className="border border-border px-2 py-3">PCS / CTN</th>
                  <th className="border border-border px-2 py-3">CTN</th>
                  <th className="border border-border px-2 py-3">Total PCS</th>
                  <th className="border border-border px-2 py-3">Price / PC</th>
                  <th className="border border-border px-2 py-3">Total Amount</th>
                  <th className="border border-border px-2 py-3">Copy Details</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, idx) => {
                  const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
                  const lineTotal = totalPcs * (line.rmbPerPcs || 0);
                  const productPhoto = getLineProductPhoto(line);
                  const dimPhoto = getLineDimensionPhoto(line);
                  const copyTextBlock = buildLineCopyText(line);
                  return (
                    <tr key={line.id} className="align-middle">
                      <td className="border border-border px-1 py-2 text-center font-bold tabular-nums">{idx + 1}</td>
                      <td className="border border-border px-2 py-2">
                        <div className="grid h-[74px] w-[74px] place-items-center overflow-hidden rounded border border-border bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
                          {dimPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(dimPhoto)}><img src={getCloudinaryOptimizedUrl(dimPhoto, { width: 180, height: 180, crop: "fit" })} alt="dimension" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="border border-border px-2 py-2">
                        <div className="grid h-[74px] w-[74px] place-items-center overflow-hidden rounded border border-border bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
                          {productPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(productPhoto)}><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 180, height: 180, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="border border-border px-2 py-2 text-[12px] font-semibold leading-tight break-words">{line.marka || "—"}</td>
                      <td className="border border-border px-2 py-2 text-[12px] font-semibold leading-tight break-words">{line.details || "—"}</td>
                      <td className="border border-border px-1 py-2 text-center text-[12px] font-bold tabular-nums">{line.pcsPerCtn || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[12px] font-bold tabular-nums">{line.totalCtns || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[12px] font-bold tabular-nums">{totalPcs || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[12px] font-bold tabular-nums">{line.rmbPerPcs ? formatPlainAmount(line.rmbPerPcs) : "0.00"}</td>
                      <td className="border border-border px-1 py-2 text-center text-[12px] font-bold tabular-nums">{lineTotal ? formatPlainAmount(lineTotal) : "0.00"}</td>
                      <td className="border border-border px-2 py-2 text-left">
                        <button type="button" onClick={() => copyText(copyTextBlock, `line-${line.id}`)} className="w-full cursor-copy whitespace-pre-line text-left text-[11px] font-semibold leading-tight break-words">
                          {copyTextBlock}
                        </button>
                        {copiedKey === `line-${line.id}` ? <div className="mt-1 text-[11px] font-semibold text-[var(--success)]">Copied</div> : null}
                      </td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? <tr><td colSpan={11} className="border border-border px-3 py-8 text-center text-fg-subtle">No order lines to display.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end rounded-xl border-2 border-border bg-bg-subtle px-2.5 py-2">
            <button type="button" onClick={() => copyText(order.lines.map((line) => buildLineCopyText(line)).join("\n\n\n"), "all")} className="mr-2 inline-flex items-center gap-1 rounded border border-border bg-bg-card px-2 py-1 text-[11px]">
              <Copy size={13} />{copiedKey === "all" ? "Copied all" : "Copy All"}
            </button>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wide text-fg">TOTAL ORDER AMOUNT</div>
              <div className="mt-0.5 inline-flex rounded border-2 border-border bg-[var(--brand)] px-3 py-1 text-[15px] font-extrabold text-[var(--brand-fg)] tabular-nums">{formatPlainAmount(orderTotal(order))}</div>
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
