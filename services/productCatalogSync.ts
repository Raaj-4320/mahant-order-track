import { suppliers } from "@/lib/data";
import { lineTotalPcs, type Order, type OrderLine, type Product } from "@/lib/types";
import { getProductsService } from "@/services/productsService";

const isHttpUrl = (v?: string) => !!v && /^https?:\/\//.test(v);
const isDataUrl = (v?: string) => !!v && v.startsWith("data:");

export const createProductIdFromOrderLine = (order: Order, line: OrderLine) => `order-line-${order.id}-${line.id}`;

const uniqueAppend = (arr: string[] | undefined, value: string): string[] => (arr?.includes(value) ? arr : [...(arr ?? []), value]);

export const productFromOrderLine = async (order: Order, line: OrderLine, index: number): Promise<Product> => {
  const service = getProductsService();
  const now = new Date().toISOString();
  const id = createProductIdFromOrderLine(order, line);
  const existing = await service.getProductById(id);
  const supplier = suppliers.find((s) => s.id === line.supplierId);
  const code = `${order.number || order.orderNumber}-L${index + 1}`;
  const linePhoto = isHttpUrl(line.productPhotoUrl)
    ? line.productPhotoUrl
    : (process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE === "firebase" && isDataUrl(line.productPhotoUrl) ? "" : line.productPhotoUrl || "");

  const generated = !existing || existing.source !== "manual";
  const sourceLineRef = `${order.id}:${line.id}`;

  return {
    id,
    productCode: existing?.productCode || code,
    sku: existing?.sku || code,
    name: existing?.source === "manual" ? existing.name : (line.details?.trim() || line.marka?.trim() || existing?.name || "Order Line Product"),
    marka: existing?.source === "manual" ? existing.marka : (line.marka?.trim() || existing?.marka || ""),
    category: existing?.category || "Order Generated",
    unit: existing?.unit || "pcs",
    defaultDim: line.picDim?.trim() || existing?.defaultDim,
    photo: existing?.photo ? existing.photo : (linePhoto || ""),
    supplierId: line.supplierId || existing?.supplierId,
    supplierSnapshot: supplier ? { id: supplier.id, code: supplier.supplierCode, name: supplier.name } : existing?.supplierSnapshot,
    purchasePrice: existing?.purchasePrice,
    sellingPrice: generated ? (Number(line.rmbPerPcs) || existing?.sellingPrice) : existing?.sellingPrice,
    defaultRmbPerPcs: generated ? (Number(line.rmbPerPcs) || existing?.defaultRmbPerPcs) : existing?.defaultRmbPerPcs,
    stockQty: generated ? lineTotalPcs(line) : existing?.stockQty,
    status: existing?.status || "active",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    source: existing?.source || "order-line",
    sourceOrderId: order.id,
    sourceOrderNumber: order.number || order.orderNumber,
    sourceLineId: line.id,
    sourceOrderIds: uniqueAppend(existing?.sourceOrderIds, order.id),
    sourceLineIds: uniqueAppend(existing?.sourceLineIds, sourceLineRef),
    catalogKey: existing?.catalogKey,
    generatedFromOrderLines: existing?.generatedFromOrderLines ?? true,
    lastSeenAt: now,
    lastLineTotalPcs: lineTotalPcs(line),
  };
};

export const syncOrderLinesToProducts = async (order: Order): Promise<{ synced: number; failed: number }> => {
  const service = getProductsService();
  let synced = 0; let failed = 0;
  for (let i = 0; i < order.lines.length; i++) {
    try {
      const mapped = await productFromOrderLine(order, order.lines[i], i);
      await service.upsertProduct(mapped);
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
};
