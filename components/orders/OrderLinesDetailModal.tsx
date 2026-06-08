"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { Order, orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Copy, X } from "lucide-react";
import { useRef, useState } from "react";
import { getLineDetailsParts, joinLineDetails } from "@/lib/orderLineDetails";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

const formatPlainAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EXPORT_HIDDEN_ATTR = "data-export-hidden";
const TwoLineHeader = ({ zh, en }: { zh: string; en?: string }) => (
  <div className="flex flex-col items-center justify-center leading-tight">
    <span>{zh}</span>
    {en ? <span className="text-[11px] font-bold">{en}</span> : null}
  </div>
);

export function OrderLinesDetailModal({ order, isOpen, onClose }: OrderLinesDetailModalProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [jpgState, setJpgState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
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
    const qtyPerCtn = line.pcsPerCtn || 0;
    const markaTitle = line.marka?.trim() || joinLineDetails(line) || "—";
    return `外套编织袋唛头一 正一侧唛头如下:\n\n${markaTitle}\n\nQty/Ctn - ${qtyPerCtn} PCS\n\nGW: 待填\n\nMEAS: 待填\n\n(${orderNo || "—"})`;
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

  const scheduleJpgStateReset = (delayMs = 1500) => {
    window.setTimeout(() => {
      setJpgState("idle");
    }, delayMs);
  };

  const imageUrlToDataUrl = async (url: string): Promise<string | null> => {
    try {
      if (!url) return null;
      if (url.startsWith("data:")) return url;
      const normalizedUrl = /^https?:\/\//i.test(url) ? url : new URL(url, window.location.origin).toString();
      const response = await fetch(normalizedUrl, { mode: "cors", cache: "no-store" });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const copyComputedStyles = (source: HTMLElement, target: HTMLElement) => {
    const computedStyle = window.getComputedStyle(source);
    const cssText = Array.from(computedStyle)
      .map((property) => `${property}:${computedStyle.getPropertyValue(property)};`)
      .join("");
    target.setAttribute("style", cssText);
  };

  const prepareCloneImages = async (source: HTMLElement, clone: HTMLElement) => {
    const sourceImages = Array.from(source.querySelectorAll("img"));
    const cloneImages = Array.from(clone.querySelectorAll("img"));

    await Promise.all(
      cloneImages.map(async (cloneImage, index) => {
        const sourceImage = sourceImages[index];
        const rawSrc = sourceImage?.currentSrc || sourceImage?.getAttribute("src") || cloneImage.getAttribute("src") || "";

        if (!rawSrc) {
          cloneImage.removeAttribute("src");
          cloneImage.removeAttribute("srcset");
          cloneImage.removeAttribute("sizes");
          return;
        }

        const inlinedSrc = await imageUrlToDataUrl(rawSrc);
        if (inlinedSrc) {
          cloneImage.setAttribute("src", inlinedSrc);
          cloneImage.removeAttribute("srcset");
          cloneImage.removeAttribute("sizes");
          cloneImage.setAttribute("crossorigin", "anonymous");
          return;
        }

        cloneImage.removeAttribute("src");
        cloneImage.removeAttribute("srcset");
        cloneImage.removeAttribute("sizes");
      }),
    );
  };

  const prepareExportClone = async (source: HTMLElement) => {
    const clone = source.cloneNode(true) as HTMLElement;
    const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))] as HTMLElement[];
    const cloneElements = [clone, ...Array.from(clone.querySelectorAll("*"))] as HTMLElement[];

    sourceElements.forEach((sourceElement, index) => {
      const cloneElement = cloneElements[index];
      if (!cloneElement) return;
      copyComputedStyles(sourceElement, cloneElement);
    });

    clone.querySelectorAll(`[${EXPORT_HIDDEN_ATTR}="true"]`).forEach((node) => node.remove());
    clone.style.margin = "0";
    clone.style.width = `${Math.ceil(source.getBoundingClientRect().width)}px`;
    clone.style.maxWidth = "none";
    clone.style.background = "#ffffff";
    clone.style.boxSizing = "border-box";

    await prepareCloneImages(source, clone);
    return clone;
  };

  const renderExportNodeToCanvas = async (source: HTMLElement) => {
    const clone = await prepareExportClone(source);
    const width = Math.ceil(source.scrollWidth || source.getBoundingClientRect().width);
    const height = Math.ceil(source.scrollHeight || source.getBoundingClientRect().height);
    const serializedNode = new XMLSerializer().serializeToString(clone);
    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#ffffff;overflow:hidden;">
            ${serializedNode}
          </div>
        </foreignObject>
      </svg>
    `;
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load export SVG image."));
      image.src = svgDataUrl;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas;
  };

  const copyViewAsJpg = async () => {
    if (jpgState === "copying") return;
    setJpgState("copying");

    try {
      const source = exportRef.current;
      if (!source) throw new Error("Export node not found.");

      const canvas = await renderExportNodeToCanvas(source);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to create clipboard image blob");
      const canWriteClipboardImage =
        typeof navigator !== "undefined" &&
        Boolean(navigator.clipboard?.write) &&
        typeof ClipboardItem !== "undefined" &&
        window.isSecureContext;

      if (!canWriteClipboardImage) {
        throw new Error("Image clipboard write is not supported or page is not secure context.");
      }

      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setJpgState("copied");
      } catch {
        setJpgState("failed");
      }
    } catch {
      setJpgState("failed");
    } finally {
      scheduleJpgStateReset(1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div
        className="mx-auto mt-4 w-[98vw] max-w-[1460px] rounded-2xl border border-border bg-bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[18px] font-semibold">Order Details</h3>
          <div className="flex items-center gap-2" data-export-hidden="true">
            <Button size="sm" variant="secondary" onClick={copyViewAsJpg} disabled={jpgState === "copying"}>
              {jpgState === "copying"
                ? "Copying..."
                : jpgState === "copied"
                  ? "Copied Image"
                  : jpgState === "failed"
                    ? "Copy failed"
                    : "Copy as JPG"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose} aria-label="Close">
              <X size={18} />
            </Button>
          </div>
        </div>

        <div ref={exportRef} className="space-y-2.5 p-3">
          <div className="overflow-hidden rounded-xl border-2 border-border bg-bg">
            <div className="grid grid-cols-[180px_1fr] items-center p-2.5">
              <div className="text-[22px] font-bold tabular-nums leading-tight">{order.number || order.orderNumber || "—"}</div>
              <div className="text-left text-[22px] font-bold leading-tight">WECHAT : {order.wechatId || "—"}</div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-border bg-bg-card">
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                <col className="w-[34px]" />
                <col className="w-[160px]" />
                <col className="w-[160px]" />
                <col className="w-[150px]" />
                <col className="w-[150px]" />
                <col className="w-[50px]" />
                <col className="w-[50px]" />
                <col className="w-[80px]" />
                <col className="w-[55px]" />
                <col className="w-[80px]" />
                <col className="w-[80px]" data-export-hidden="true" />
              </colgroup>
              <thead className="bg-[var(--brand)] text-center uppercase tracking-wide text-[var(--brand-fg)]">
                <tr>
                  <th className="border border-border px-2 py-3">#</th>
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap">DIM/WEIGHT</th>
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap">产品图</th>
                  <th className="border border-border px-2 py-2.5 text-[14px] whitespace-nowrap">MARKA</th>
                  <th className="border border-border px-2 py-2.5 text-[14px] whitespace-nowrap">DETAILS</th>
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap"><TwoLineHeader zh="箱数" en="CTN" /></th>
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap"><TwoLineHeader zh="件/箱" en="PCS/CTN" /></th>
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap">TOTAL Pieces</th>
                  <th className="border border-border px-2 py-2 text-[13px] leading-tight whitespace-nowrap"><TwoLineHeader zh="单价" en="PRICE/PC" /></th>
                  <th className="border border-border px-2 py-2 text-[13px] leading-tight whitespace-nowrap"><TwoLineHeader zh="金额" en="TOTAL AMOUNT" /></th>
                  <th className="border border-border px-2 py-2 text-[15px] leading-tight whitespace-nowrap" data-export-hidden="true">COPY</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, idx) => {
                  const totalPcs = (line.totalCtns || 0) * (line.pcsPerCtn || 0);
                  const lineTotal = totalPcs * (line.rmbPerPcs || 0);
                  const productPhoto = getLineProductPhoto(line);
                  const dimPhoto = getLineDimensionPhoto(line);
                  const copyTextBlock = buildLineCopyText(line);
                  const detailParts = getLineDetailsParts(line);
                  const hasAnyDetail = Boolean(detailParts.detail1 || detailParts.detail2 || detailParts.detail3);

                  return (
                    <tr key={line.id} className="align-middle">
                      <td className="border border-border px-1 py-2 text-center font-bold tabular-nums">{idx + 1}</td>
                      <td className="px-1.5 py-1.5 align-middle">
                        <div className="mx-auto flex h-[170px] w-[150px] items-center justify-center overflow-hidden rounded bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
                          {dimPhoto ? (
                            <button
                              type="button"
                              title="Open image preview"
                              aria-label="Open image preview"
                              className="flex h-full w-full cursor-zoom-in items-center justify-center"
                              onClick={() => setPreviewImage(dimPhoto)}
                            >
                              <img
                                src={getCloudinaryOptimizedUrl(dimPhoto, { width: 390, height: 390, crop: "fit" })}
                                crossOrigin="anonymous"
                                alt="dimension"
                                className="block max-h-full max-w-full object-contain object-center"
                                loading="lazy"
                                decoding="async"
                              />
                            </button>
                          ) : (
                            "No photo"
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5 align-middle">
                        <div className="mx-auto flex h-[120px] w-[150px] items-center justify-center overflow-hidden rounded bg-bg-subtle text-[10px] font-semibold text-fg-subtle">
                          {productPhoto ? (
                            <button
                              type="button"
                              title="Open image preview"
                              aria-label="Open image preview"
                              className="flex h-full w-full cursor-zoom-in items-center justify-center"
                              onClick={() => setPreviewImage(productPhoto)}
                            >
                              <img
                                src={getCloudinaryOptimizedUrl(productPhoto, { width: 360, height: 360, crop: "fit" })}
                                crossOrigin="anonymous"
                                alt="product"
                                className="block max-h-full max-w-full object-contain object-center"
                                loading="lazy"
                                decoding="async"
                              />
                            </button>
                          ) : (
                            "No photo"
                          )}
                        </div>
                      </td>
                      <td className="border border-border px-2 py-2 text-[16px] font-semibold leading-tight break-words">{line.marka || "—"}</td>
                      <td className="border border-border px-2 py-2 text-[16px] font-semibold leading-tight break-words">
                        {hasAnyDetail ? (
                          <div className="space-y-1">
                            <div>{detailParts.detail1 || "—"}</div>
                            {detailParts.detail2 ? <div>{detailParts.detail2}</div> : null}
                            {detailParts.detail3 ? <div>{detailParts.detail3}</div> : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-border px-1 py-2 text-center text-[16px] font-bold leading-tight tabular-nums">{line.totalCtns || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[16px] font-bold leading-tight tabular-nums">{line.pcsPerCtn || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[16px] font-bold leading-tight tabular-nums">{totalPcs || 0}</td>
                      <td className="border border-border px-1 py-2 text-center text-[16px] font-bold leading-tight tabular-nums">
                        {line.rmbPerPcs ? formatPlainAmount(line.rmbPerPcs) : "0.00"}
                      </td>
                      <td className="border border-border px-1 py-2 text-center text-[16px] font-bold leading-tight tabular-nums">
                        {lineTotal ? formatPlainAmount(lineTotal) : "0.00"}
                      </td>
                      <td className="border border-border px-1 py-1 text-center" data-export-hidden="true">
                        <button
                          type="button"
                          onClick={() => copyText(copyTextBlock, `line-${line.id}`)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded border border-border bg-bg-subtle px-1 py-1 text-[10px] font-semibold"
                        >
                          <Copy size={10} /> {copiedKey === `line-${line.id}` ? "Copied" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="border border-border px-3 py-8 text-center text-fg-subtle">
                      No order lines to display.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="bg-bg-subtle">
                  <td colSpan={7} className="border-t-2 border-border px-2 py-3" />
                  <td colSpan={2} className="border-t-2 border-border px-1 py-3 text-right align-middle">
                    <div className="inline-flex bg-bg-card px-2 py-1 text-right text-[16px] font-bold uppercase leading-tight tracking-wide text-danger whitespace-nowrap">
                      TOTAL AMOUNT
                    </div>
                  </td>
                  <td className="border-t-2 border-border px-1 py-3 text-center align-middle">
                    <div className="mx-auto inline-flex rounded border-2 border-border bg-[var(--brand)] px-3 py-1 text-[18px] font-bold text-[var(--brand-fg)] tabular-nums">
                      {formatPlainAmount(orderTotal(order))}
                    </div>
                  </td>
                  <td className="border-t-2 border-border px-1 py-3 text-center align-middle" data-export-hidden="true">
                    <button
                      type="button"
                      onClick={() => copyText(order.lines.map((line) => buildLineCopyText(line)).join("\n\n\n"), "all")}
                      className="inline-flex items-center justify-center gap-1 rounded border border-border bg-bg-card px-2 py-1 text-[11px] font-semibold"
                    >
                      <Copy size={13} />
                      {copiedKey === "all" ? "Copied all" : "Copy All"}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
