import { suppliers } from "@/lib/data";
import { sanitizeFirestorePayload } from "@/lib/firebase/mappers";
import { logError, logProduct } from "@/lib/logger";
import { lineTotalPcs, type Order, type OrderLine, type Product } from "@/lib/types";
import { getProductsService } from "@/services/productsService";

const isHttpUrl = (v?: string) => !!v && /^https?:\/\//.test(v);
const isDataUrl = (v?: string) => !!v && v.startsWith("data:");
export const createFallbackProductIdFromOrderLine = (order: Order, line: OrderLine) => `order-line-${order.id}-${line.id}`;
const uniqueAppend = (arr: string[] | undefined, value: string): string[] => (arr?.includes(value) ? arr : [...(arr ?? []), value]);
const meaningfulLine = (l: OrderLine) => !!(l.details?.trim() || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || Number(l.totalCtns) > 0 || Number(l.pcsPerCtn) > 0 || Number(l.rmbPerPcs) > 0);

export const productFromOrderLine = async (order: Order, line: OrderLine, index: number): Promise<Product> => {
  const service = getProductsService();
  const now = new Date().toISOString();
  const id = createFallbackProductIdFromOrderLine(order, line);
  const existing = await service.getProductById(id);
  const supplier = suppliers.find((s) => s.id === line.supplierId);
  const code = `${order.number || order.orderNumber}-L${index + 1}`;
  const isFirebaseProducts = process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase";
  const linePhoto = isHttpUrl(line.productPhotoUrl) ? line.productPhotoUrl : (isFirebaseProducts && isDataUrl(line.productPhotoUrl) ? "" : line.productPhotoUrl || "");
  const existingPhoto = existing?.photo && !(isFirebaseProducts && isDataUrl(existing.photo)) ? existing.photo : "";
  return { id, productCode: existing?.productCode || code, sku: existing?.sku || code, name: line.details?.trim() || line.marka?.trim() || "Order Line Product", marka: line.marka?.trim() || existing?.marka || "", category: existing?.category || "Order Generated", unit: existing?.unit || "pcs", defaultDim: line.picDim?.trim() || existing?.defaultDim, photo: existingPhoto || linePhoto || "", supplierId: line.supplierId || existing?.supplierId, supplierSnapshot: supplier ? { id: supplier.id, code: supplier.supplierCode, name: supplier.name } : existing?.supplierSnapshot, purchasePrice: existing?.purchasePrice, sellingPrice: Number(line.rmbPerPcs) || existing?.sellingPrice, defaultRmbPerPcs: Number(line.rmbPerPcs) || existing?.defaultRmbPerPcs, stockQty: lineTotalPcs(line), status: existing?.status || "active", createdAt: existing?.createdAt || now, updatedAt: now, source: existing?.source || "order-line", sourceOrderId: order.id, sourceOrderNumber: order.number || order.orderNumber, sourceLineId: line.id, sourceOrderIds: uniqueAppend(existing?.sourceOrderIds, order.id), sourceLineIds: uniqueAppend(existing?.sourceLineIds, `${order.id}:${line.id}`), catalogKey: existing?.catalogKey, generatedFromOrderLines: existing?.generatedFromOrderLines ?? true, lastSeenAt: now, lastLineTotalPcs: lineTotalPcs(line) };
};

export type ProductSyncFailure = { lineId: string; generatedProductId?: string; reason: string; errorCode?: string; errorMessage?: string };

export const syncOrderLinesToProducts = async (order: Order): Promise<{ synced: number; failed: number; failures: ProductSyncFailure[] }> => {
  logProduct("sync_order_lines_to_products_start", { orderId: order.id, orderNumber: order.number || order.orderNumber, status: order.status, lineCount: order.lines.length });
  if (order.status !== "saved") {
    logProduct("sync_order_lines_to_products_skipped", { orderId: order.id, reason: "order_not_saved", status: order.status });
    return { synced: 0, failed: 0, failures: [] };
  }

  const service = getProductsService();
  let synced = 0;
  let failed = 0;
  const failures: ProductSyncFailure[] = [];

  for (let i = 0; i < order.lines.length; i++) {
    const line = order.lines[i];
    const generatedProductId = order.id && line.id ? createFallbackProductIdFromOrderLine(order, line) : undefined;
    if (!order.id) {
      failed++;
      const failure = { lineId: line.id || `line-${i + 1}`, generatedProductId, reason: "missing_order_id" };
      failures.push(failure);
      logProduct("sync_order_line_skipped", { ...failure, index: i, reasonDetail: "Order id missing" });
      continue;
    }
    if (!line.id) {
      failed++;
      const failure = { lineId: `line-${i + 1}`, generatedProductId, reason: "missing_line_id" };
      failures.push(failure);
      logProduct("sync_order_line_skipped", { ...failure, index: i, reasonDetail: "Line id missing" });
      continue;
    }
    if (!meaningfulLine(line)) {
      logProduct("sync_order_line_skipped", { orderId: order.id, lineId: line.id, index: i, reason: "blank_line" });
      continue;
    }

    logProduct("sync_order_line_considered", { orderId: order.id, lineId: line.id, index: i, generatedProductId });

    try {
      const payload = await productFromOrderLine(order, line, i);
      const { removedUndefinedPaths } = sanitizeFirestorePayload(payload);
      const payloadSummary = {
        generatedProductId: payload.id,
        name: payload.name,
        sku: payload.sku,
        status: payload.status,
        source: payload.source,
        stockQty: payload.stockQty,
        hasPhoto: Boolean(payload.photo),
      };
      logProduct("sync_order_line_payload_summary", {
        lineId: line.id,
        ...payloadSummary,
        undefinedFieldPaths: removedUndefinedPaths,
      });

      logProduct("upsert_generated_product_start", { lineId: line.id, generatedProductId: payload.id, undefinedFieldPaths: removedUndefinedPaths });
      await service.upsertProduct(payload);
      logProduct("upsert_generated_product_success", { lineId: line.id, generatedProductId: payload.id });
      synced++;
    } catch (e) {
      failed++;
      const errorCode = e && typeof e === "object" && "code" in e ? String((e as any).code) : undefined;
      const errorMessage = e instanceof Error ? e.message : String(e);
      failures.push({ lineId: line.id, generatedProductId, reason: "upsert_failed", errorCode, errorMessage });
      const payload = await productFromOrderLine(order, line, i).catch(() => null);
      const payloadSummary = payload ? { generatedProductId: payload.id, name: payload.name, sku: payload.sku, status: payload.status, source: payload.source, stockQty: payload.stockQty, hasPhoto: Boolean(payload.photo) } : undefined;
      const undefinedFieldPaths = payload ? sanitizeFirestorePayload(payload).removedUndefinedPaths : [];
      logError("upsert_generated_product_failure", { lineId: line.id, generatedProductId, payloadSummary, undefinedFieldPaths, errorCode, errorMessage });
    }
  }

  logProduct("sync_order_lines_to_products_complete", { orderId: order.id, synced, failed, failureCount: failures.length });
  return { synced, failed, failures };
};

export const archiveProductsForRemovedOrderLines = async (orderId: string, removedLineIds: string[]) => {
  const service = getProductsService();
  for (const lineId of removedLineIds) {
    try { await service.archiveProduct(`order-line-${orderId}-${lineId}`); } catch { /* best effort */ }
  }
};

export const archiveProductsForOrder = async (order: Order) => {
  await archiveProductsForRemovedOrderLines(order.id, order.lines.map((l) => l.id));
};
