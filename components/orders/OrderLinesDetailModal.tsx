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
      <div className="mx-auto mt-8 w-full max-w-6xl rounded-2xl border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-[20px] font-semibold">Order Details</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>✕</Button>
        </div>

        <div className="space-y-4 p-5">
          <div className="overflow-hidden rounded-xl border-2 border-border bg-bg">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1 border-r-2 border-border p-3 sm:p-3.5">
                <div className={label}>Order Number</div>
                <div className="text-[22px] font-extrabold tabular-nums">{order.number || order.orderNumber || "—"}</div>
              </div>
              <div className="space-y-1 p-3 sm:p-3.5">
                <div className={label}>WECHAT</div>
                <div className="text-[22px] font-bold">WECHAT : {order.wechatId || "—"}</div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-border bg-bg-card">
            <table className="w-full min-w-[1374px] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[44px]" />
                <col className="w-[180px]" />
                <col className="w-[180px]" />
                <col className="w-[150px]" />
                <col className="w-[140px]" />
                <col className="w-[90px]" />
                <col className="w-[75px]" />
                <col className="w-[100px]" />
                <col className="w-[100px]" />
                <col className="w-[125px]" />
                <col className="w-[190px]" />
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
                      <td className="border border-border px-2 py-2 text-center font-bold tabular-nums">{idx + 1}</td>
                      <td className="border border-border px-2 py-2">
                        <div className="grid h-32 w-32 place-items-center overflow-hidden rounded border border-border bg-bg-subtle text-[11px] font-semibold text-fg-subtle">
                          {dimPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(dimPhoto)}><img src={getCloudinaryOptimizedUrl(dimPhoto, { width: 320, height: 320, crop: "fit" })} alt="dimension" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="border border-border px-2 py-2">
                        <div className="grid h-32 w-32 place-items-center overflow-hidden rounded border border-border bg-bg-subtle text-[11px] font-semibold text-fg-subtle">
                          {productPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(productPhoto)}><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 320, height: 320, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="border border-border px-2 py-2 text-[14px] font-bold">{line.marka || "—"}</td>
                      <td className="border border-border px-2 py-2 text-[13px] font-semibold">{line.details || "—"}</td>
                      <td className="border border-border px-2 py-2 text-center text-[13px] font-bold tabular-nums">{line.pcsPerCtn || 0}</td>
                      <td className="border border-border px-2 py-2 text-center text-[13px] font-bold tabular-nums">{line.totalCtns || 0}</td>
                      <td className="border border-border px-2 py-2 text-center text-[13px] font-bold tabular-nums">{totalPcs || 0}</td>
                      <td className="border border-border px-2 py-2 text-center text-[13px] font-bold tabular-nums">{line.rmbPerPcs ? formatPlainAmount(line.rmbPerPcs) : "0.00"}</td>
                      <td className="border border-border px-2 py-2 text-center text-[13px] font-bold tabular-nums">{lineTotal ? formatPlainAmount(lineTotal) : "0.00"}</td>
                      <td className="border border-border px-2 py-2 text-left">
                        <button type="button" onClick={() => copyText(copyTextBlock, `line-${line.id}`)} className="w-full cursor-copy whitespace-pre-line text-left text-[12px] font-semibold leading-5">
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

          <div className="flex items-center justify-end rounded-xl border-2 border-border bg-bg-subtle px-3 py-3 sm:px-4">
            <button type="button" onClick={() => copyText(order.lines.map((line) => buildLineCopyText(line)).join("\n\n\n"), "all")} className="mr-3 inline-flex items-center gap-1 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-[12px]">
              <Copy size={13} />{copiedKey === "all" ? "Copied all" : "Copy All"}
            </button>
            <div className="text-right">
              <div className="text-[13px] font-bold uppercase tracking-wide text-fg">TOTAL ORDER AMOUNT</div>
              <div className="mt-1 inline-flex rounded border-2 border-border bg-[var(--brand)] px-4 py-1.5 text-[18px] font-extrabold text-[var(--brand-fg)] tabular-nums">{formatPlainAmount(orderTotal(order))}</div>
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
