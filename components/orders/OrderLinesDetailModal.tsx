"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { formatRate, formatWholeMoney } from "@/lib/numbers";
import { Order, lineTotalPcs, lineTotalRmb, orderShippingPrice, orderTotal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Copy, X } from "lucide-react";
import { useRef, useState } from "react";
import { getLineDetailsParts } from "@/lib/orderLineDetails";
import type { PaymentAgent, PaymentAgentOrderSplit, PaymentAgentPaymentEvent } from "@/lib/types";

type OrderLinesDetailModalProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  paymentAgents?: PaymentAgent[];
  paymentAgentSplits?: PaymentAgentOrderSplit[];
  paymentAgentEvents?: PaymentAgentPaymentEvent[];
  onPaymentAgentEventsChange?: (events: PaymentAgentPaymentEvent[]) => void;
  onPaymentAgentEventManualAmountEdit?: (eventId: string) => void;
};

const formatFinalAmount = (value: number) => formatWholeMoney(value);
const formatRateAmount = (value: number) => formatRate(value);

const EXPORT_HIDDEN_ATTR = "data-export-hidden";
const TwoLineHeader = ({ zh, en }: { zh: string; en?: string }) => (
  <div className="flex flex-col items-center justify-center leading-tight">
    <span>{zh}</span>
    {en ? <span className="text-[11px] font-bold">{en}</span> : null}
  </div>
);

export function OrderLinesDetailModal({
  order,
  isOpen,
  onClose,
  paymentAgents = [],
  paymentAgentSplits = [],
  paymentAgentEvents = [],
  onPaymentAgentEventsChange,
  onPaymentAgentEventManualAmountEdit,
}: OrderLinesDetailModalProps) {
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
  const displayWechatId = order.wechatId?.trim() || "—";
  const shippingPrice = orderShippingPrice(order);
  const hasDimWeightColumn = order.lines.some((line) => Boolean(getLineDimensionPhoto(line) || line.picDim?.trim()));
  const leadingFooterColSpan = hasDimWeightColumn ? 6 : 5;
  const emptyStateColSpan = hasDimWeightColumn ? 10 : 9;
  const getVisibleDetails = (line: Order["lines"][number]) => {
    const parts = getLineDetailsParts(line);
    const values = [parts.detail1, parts.detail2, parts.detail3].map((part) => part?.trim() || "").filter(Boolean);
    if (values.length > 0) return values;
    return line.details?.trim() ? [line.details.trim()] : [];
  };

  const buildLineCopyText = (line: Order["lines"][number]) => {
    const qtyPerCtn = line.pcsPerCtn || 0;
    const markaTitle = line.marka?.trim() || "-";
    return `外套编织袋唛头一 正一侧唛头如下:\n\n${markaTitle}\n\nQTY - ${qtyPerCtn} PCS\n\nGW :填毛重\n\nMEAS:填外箱尺寸\n\n(${orderNo || "-"})`;
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

    const scale = Math.max(2, Math.min(3, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2));
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
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
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
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
    <div className="fixed inset-0 z-50 overflow-auto bg-black/45 p-4" onClick={onClose}>
      <div
        className="mx-auto mt-4 w-fit max-w-[calc(100vw-32px)] rounded-2xl border border-border bg-bg-card shadow-card"
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

        <div className="max-w-[calc(100vw-32px)] overflow-x-auto p-3">
          <div ref={exportRef} className="inline-block w-fit min-w-0 max-w-full space-y-2.5 align-top">
            <div className="overflow-hidden rounded-xl border-2 border-border bg-bg">
              <div className="grid w-fit min-w-full grid-cols-[max-content_max-content] items-center gap-6 p-2.5">
                <div className="text-[22px] font-bold tabular-nums leading-tight">{order.number || order.orderNumber || "—"}</div>
                <div className="text-left text-[22px] font-bold leading-tight whitespace-nowrap">WECHAT : {displayWechatId}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border-2 border-border bg-bg-card">
              <div className="inline-block w-fit align-top">
              <table className="inline-table w-max min-w-0 table-auto text-[12px]">
                <colgroup>
                  {hasDimWeightColumn ? <col className="w-[1%]" /> : null}
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" />
                  <col className="w-[1%]" data-export-hidden="true" />
                </colgroup>
              <thead className="bg-[var(--brand)] text-center uppercase tracking-wide text-[var(--brand-fg)]">
                <tr>
                  {hasDimWeightColumn ? <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap">DIM/WEIGHT</th> : null}
                  <th className="border border-border px-2 py-2 text-[14px] leading-tight whitespace-nowrap">产品图</th>
                  <th className="border border-border px-2 py-2.5 text-[14px] whitespace-nowrap">MARKA</th>
                  <th className="border border-border px-2 py-2.5 text-[14px] whitespace-nowrap">DETAILS</th>
                  <th className="border border-border px-1.5 py-2 text-[14px] leading-tight whitespace-nowrap"><TwoLineHeader zh="箱数" en="CTN" /></th>
                  <th className="border border-border px-1.5 py-2 text-[14px] leading-tight whitespace-nowrap"><TwoLineHeader zh="件/箱" en="PCS/CTN" /></th>
                  <th className="border border-border px-1.5 py-2 text-[14px] leading-tight whitespace-nowrap"><TwoLineHeader zh="TOTAL" en="PIECES" /></th>
                  <th className="border border-border px-1.5 py-2 text-[13px] leading-tight whitespace-nowrap"><TwoLineHeader zh="单价" en="PRICE/PC" /></th>
                  <th className="border border-border px-1.5 py-2 text-[13px] leading-tight whitespace-nowrap"><TwoLineHeader zh="金额" en="AMOUNT" /></th>
                  <th className="border border-border px-1.5 py-2 text-[15px] leading-tight whitespace-nowrap" data-export-hidden="true">COPY</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const totalPcs = lineTotalPcs(line);
                  const lineTotal = lineTotalRmb(line);
                  const productPhoto = getLineProductPhoto(line);
                  const dimPhoto = getLineDimensionPhoto(line);
                  const dimWeightValue = line.picDim?.trim() || "";
                  const hasDimWeightContent = Boolean(dimPhoto || dimWeightValue);
                  const copyTextBlock = buildLineCopyText(line);
                  const visibleDetails = getVisibleDetails(line);
                  const hasAnyDetail = visibleDetails.length > 0;

                  return (
                    <tr key={line.id} className="align-middle">
                      {hasDimWeightColumn ? (
                        <td className="border border-border px-2 py-2 align-top">
                          {hasDimWeightContent ? (
                            <div className="inline-flex w-fit max-w-[252px] flex-col items-center gap-1.5 rounded bg-bg-subtle px-2 py-2">
                              {dimPhoto ? (
                                <button
                                  type="button"
                                  title="Open image preview"
                                  aria-label="Open image preview"
                                  className="inline-flex cursor-zoom-in items-center justify-center"
                                  onClick={() => setPreviewImage(dimPhoto)}
                                >
                                  <img
                                    src={getCloudinaryOptimizedUrl(dimPhoto, { width: 420, height: 420, crop: "fit" })}
                                    crossOrigin="anonymous"
                                    alt="dimension"
                                    className="block max-h-[180px] max-w-[220px] object-contain object-center"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </button>
                              ) : null}
                              {dimWeightValue ? <div className="max-w-[200px] whitespace-normal text-center text-[11px] font-semibold leading-tight text-fg">{dimWeightValue}</div> : null}
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                      <td className="border border-border px-2 py-2 align-top">
                        <div className="inline-flex w-fit min-h-[112px] min-w-[112px] max-w-[264px] items-center justify-center overflow-hidden rounded bg-bg-subtle px-2 py-2 text-[10px] font-semibold text-fg-subtle">
                          {productPhoto ? (
                            <button
                              type="button"
                              title="Open image preview"
                              aria-label="Open image preview"
                              className="inline-flex cursor-zoom-in items-center justify-center"
                              onClick={() => setPreviewImage(productPhoto)}
                            >
                              <img
                                src={getCloudinaryOptimizedUrl(productPhoto, { width: 520, height: 520, crop: "fit" })}
                                crossOrigin="anonymous"
                                alt="product"
                                className="block max-h-[220px] max-w-[240px] object-contain object-center"
                                loading="lazy"
                                decoding="async"
                              />
                            </button>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                      <td className="border border-border px-2.5 py-1.5 text-[18px] font-bold leading-tight break-words whitespace-normal">
                        <div className="inline-block whitespace-nowrap">{line.marka || "—"}</div>
                      </td>
                      <td className="border border-border px-2.5 py-1.5 text-[18px] font-bold leading-tight">
                        {hasAnyDetail ? (
                          <div className="inline-flex flex-col items-start gap-0.5 whitespace-nowrap">
                            {visibleDetails.map((detail, index) => (
                              <div key={`${line.id}-detail-${index}`}>{detail}</div>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-border px-1.5 py-1.5 text-center text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">{line.totalCtns || 0}</td>
                      <td className="border border-border px-1.5 py-1.5 text-center text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">{line.pcsPerCtn || 0}</td>
                      <td className="border border-border px-1.5 py-1.5 text-center text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">{totalPcs || 0}</td>
                      <td className="border border-border px-1.5 py-1.5 text-center text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap">
                        {formatRateAmount(line.rmbPerPcs || 0)}
                      </td>
                      <td className={`border border-border px-1.5 py-1.5 text-center text-[18px] font-bold leading-tight tabular-nums whitespace-nowrap ${lineTotal > 0 ? "text-fg" : "text-[var(--danger)]"}`}>
                        {formatFinalAmount(lineTotal || 0)}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-center" data-export-hidden="true">
                        <button
                          type="button"
                          onClick={() => copyText(copyTextBlock, `line-${line.id}`)}
                          className="inline-flex items-center justify-center gap-1 rounded border border-border bg-bg-subtle px-2 py-1 text-[10px] font-semibold whitespace-nowrap"
                        >
                          <Copy size={10} /> {copiedKey === `line-${line.id}` ? "Copied" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {order.lines.length === 0 ? (
                  <tr>
                    <td colSpan={emptyStateColSpan} className="border border-border px-3 py-8 text-center text-fg-subtle">
                      No order lines to display.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                {shippingPrice > 0 ? (
                  <tr className="bg-bg-subtle">
                    <td colSpan={leadingFooterColSpan} className="border-t-2 border-border px-2 py-3" />
                    <td colSpan={2} className="border-t-2 border-border px-1.5 py-2 text-right align-middle">
                      <div className="inline-flex bg-bg-card px-2 py-1 text-right text-[15px] font-bold uppercase leading-tight tracking-wide text-rose-600 whitespace-nowrap">
                        SHIPPING
                      </div>
                    </td>
                    <td className="border-t-2 border-border px-1.5 py-2 text-center align-middle">
                      <div className="mx-auto inline-flex rounded border border-rose-200 bg-rose-50 px-3 py-1 text-[18px] font-bold text-rose-600 tabular-nums whitespace-nowrap">
                        {formatFinalAmount(shippingPrice)}
                      </div>
                    </td>
                    <td className="border-t-2 border-border px-1.5 py-2 text-center align-middle" data-export-hidden="true" />
                  </tr>
                ) : null}
                <tr className="bg-bg-subtle">
                  <td colSpan={leadingFooterColSpan} className={shippingPrice > 0 ? "border-t border-border px-2 py-3" : "border-t-2 border-border px-2 py-3"} />
                  <td colSpan={2} className="border-t-2 border-border px-1.5 py-3 text-right align-middle">
                    <div className="inline-flex bg-bg-card px-2 py-1 text-right text-[16px] font-bold uppercase leading-tight tracking-wide text-danger whitespace-nowrap">
                      AMOUNT
                    </div>
                  </td>
                  <td className="border-t-2 border-border px-1.5 py-3 text-center align-middle">
                    <div className="mx-auto inline-flex rounded border-2 border-border bg-[var(--brand)] px-3 py-1 text-[18px] font-bold text-[var(--brand-fg)] tabular-nums whitespace-nowrap">
                      {formatFinalAmount(orderTotal(order))}
                    </div>
                  </td>
                  <td className="border-t-2 border-border px-1.5 py-3 text-center align-middle" data-export-hidden="true">
                    <button
                      type="button"
                      onClick={() => copyText(order.lines.map((line) => buildLineCopyText(line)).join("\n\n"), "all")}
                      className="inline-flex items-center justify-center gap-1 rounded border border-border bg-bg-card px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
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
        </div>
      </div>
      <ImageLightbox src={previewImage} alt="Order line photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
