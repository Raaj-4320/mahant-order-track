"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { Order } from "@/lib/types";
import { orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useRef, useState } from "react";
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
  const [jpgState, setJpgState] = useState<"idle" | "copying" | "copied" | "downloaded">("idle");
  const exportRef = useRef<HTMLDivElement | null>(null);
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

  const copyViewAsJpg = async () => {
    const node = exportRef.current;
    if (!node || jpgState === "copying") return;
    setJpgState("copying");

    try {
      const width = Math.ceil(node.scrollWidth);
      const height = Math.ceil(node.scrollHeight);
      const serialized = new XMLSerializer().serializeToString(node);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">${serialized}</foreignObject>
        </svg>
      `;
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load export image"));
        image.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      URL.revokeObjectURL(svgUrl);
      if (!blob) throw new Error("Failed to create JPG blob");

      const filename = `order-details-${orderNo || "order"}.jpg`;
      const supportsClipboardImage =
        typeof window !== "undefined" &&
        "ClipboardItem" in window &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function";

      if (supportsClipboardImage) {
        try {
          const item = new ClipboardItem({ "image/jpeg": blob });
          await navigator.clipboard.write([item]);
          setJpgState("copied");
          window.setTimeout(() => setJpgState("idle"), 1500);
          return;
        } catch {
          // fallback to download
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setJpgState("downloaded");
      window.setTimeout(() => setJpgState("idle"), 1800);
    } catch {
      setJpgState("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div className="mx-auto mt-4 w-[96vw] max-w-[1280px] rounded-2xl border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[18px] font-semibold">Order Details</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={copyViewAsJpg} disabled={jpgState === "copying"}>
              {jpgState === "copying" ? "Copying..." : jpgState === "copied" ? "Copied JPG" : jpgState === "downloaded" ? "Downloaded JPG" : "Copy as JPG"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>✕</Button>
          </div>
        </div>

        <div ref={exportRef} className="space-y-2.5 p-3">
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
                <col className="w-[34px]" />
                <col className="w-[115px]" />
                <col className="w-[115px]" />
                <col className="w-[140px]" />
                <col className="w-[130px]" />
                <col className="w-[95px]" />
                <col className="w-[85px]" />
                <col className="w-[100px]" />
                <col className="w-[105px]" />
                <col className="w-[130px]" />
                <col className="w-[100px]" />
              </colgroup>
              <thead className="bg-[var(--brand)] text-left uppercase tracking-wide text-[var(--brand-fg)]">
                <tr>
                  <th className="border border-border px-2 py-3">#</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">PRODUCT DIMENSION / WEIGHT</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">产品图片</th>
                  <th className="border border-border px-2 py-3">Marka</th>
                  <th className="border border-border px-2 py-3">Details</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">件数<br />PCS/CTN</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">装箱数<br />CTN</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">TOTAL P</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">单价<br />PRICE/PC</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">金额<br />TOTAL AMOUNT</th>
                  <th className="border border-border px-1 py-2 text-[10px] leading-tight">COPY</th>
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
                      <td className="border border-border px-1.5 py-1.5">
                        <div className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded border border-border bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
                          {dimPhoto ? <button type="button" title="Open image preview" aria-label="Open image preview" className="grid h-full w-full place-items-center cursor-zoom-in" onClick={() => setPreviewImage(dimPhoto)}><img src={getCloudinaryOptimizedUrl(dimPhoto, { width: 180, height: 180, crop: "fit" })} alt="dimension" className="h-full w-full object-contain object-center" loading="lazy" decoding="async" /></button> : "No photo"}
                        </div>
                      </td>
                      <td className="border border-border px-1.5 py-1.5">
                        <div className="grid h-[76px] w-[76px] place-items-center rounded border border-border bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
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
                      <td className="border border-border px-1 py-1 text-center">
                        <button type="button" onClick={() => copyText(copyTextBlock, `line-${line.id}`)} className="inline-flex w-full items-center justify-center gap-1 rounded border border-border bg-bg-subtle px-1 py-1 text-[10px] font-semibold">
                          <Copy size={10} /> {copiedKey === `line-${line.id}` ? "Copied" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? <tr><td colSpan={11} className="border border-border px-3 py-8 text-center text-fg-subtle">No order lines to display.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border-2 border-border bg-bg-subtle px-2 py-2">
            <div className="grid grid-cols-[34px_115px_115px_140px_130px_95px_85px_100px_105px_130px_100px] items-center gap-0">
              <div className="col-start-10 justify-self-end text-right">
                <div className="text-[11px] font-bold uppercase tracking-wide text-fg">TOTAL ORDER AMOUNT</div>
                <div className="mt-0.5 inline-flex rounded border-2 border-border bg-[var(--brand)] px-3 py-1 text-[15px] font-extrabold text-[var(--brand-fg)] tabular-nums">{formatPlainAmount(orderTotal(order))}</div>
              </div>
              <div className="col-start-11 justify-self-end text-right">
                <button type="button" onClick={() => copyText(order.lines.map((line) => buildLineCopyText(line)).join("\n\n\n"), "all")} className="inline-flex items-center gap-1 rounded border border-border bg-bg-card px-2 py-1 text-[11px]">
                  <Copy size={13} />{copiedKey === "all" ? "Copied all" : "Copy All"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
