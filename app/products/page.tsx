"use client";

import { PageShell } from "@/components/PageShell";
import { useProducts } from "@/hooks/useProducts";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useStore } from "@/lib/store";
import { getProductStats } from "@/services/selectors";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TablePagination } from "@/components/table/TablePagination";
import { formatAmount } from "@/lib/data";
import { uploadImageUnsigned } from "@/lib/cloudinary/client";
import type { Product } from "@/lib/types";
import { Boxes, Download, Filter, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow } from "@/lib/logger";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import { joinLineDetails } from "@/lib/orderLineDetails";
import { ordersDataSource } from "@/lib/runtimeConfig";

type ProductForm = Omit<Product, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string };

const emptyForm: ProductForm = {
  id: "",
  productCode: "",
  sku: "",
  name: "",
  marka: "",
  category: "",
  unit: "pcs",
  defaultDim: "",
  photo: "",
  supplierId: "",
  purchasePrice: undefined,
  sellingPrice: undefined,
  defaultRmbPerPcs: undefined,
  stockQty: undefined,
  lowStockLimit: undefined,
  status: "active",
};

export default function ProductsPage() {
  useEffect(() => {
    logPageAccess("Products", { component: "app/products/page.tsx", source: process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE ?? "mock" });
  }, []);

  const { data: products, isLoading: isProductsLoading, error, upsertProduct } = useProducts();
  const { data: paymentAgents } = usePaymentAgents();
  const { data: suppliers } = useSuppliers();
  const { data: customers } = useCustomers();
  const { data: remoteOrders } = useOrders();
  const { orders: localOrders, pushToast } = useStore();
  const ordersSource = ordersDataSource();
  const orders = ordersSource === "firebase" ? remoteOrders : localOrders;

  const rows = getProductStats(products, orders).map((x) => ({
    ...x.product,
    totalQtyPcs: x.totalQtyPcs,
    totalAmount: x.totalAmount,
    catalogValue: x.catalogValue,
    isLowStock: x.isLowStock,
  }));

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const categories = Array.from(new Set(rows.map((r) => r.category)));
  const filtered = useMemo(
    () =>
      rows.filter(
        (p) =>
          [p.name, p.sku, p.marka, p.category].join(" ").toLowerCase().includes(q.toLowerCase().trim()) &&
          (status === "all" || p.status === status) &&
          (category === "all" || p.category === category),
      ),
    [rows, q, status, category],
  );

  const activeRows = rows.filter((r) => r.status === "active");
  const inactiveRows = rows.filter((r) => r.status === "inactive");
  const active = activeRows.length;
  const inactive = inactiveRows.length;
  const activeCatalogValue = activeRows.reduce((s, r) => s + (r.catalogValue ?? 0), 0);
  const displayedRows = status === "all" ? rows : status === "inactive" ? inactiveRows : activeRows;
  const displayedCategoriesCount = new Set(displayedRows.map((r) => r.category).filter(Boolean)).size;
  const displayedLowStock = displayedRows.filter((r) => r.isLowStock).length;
  const displayedCatalogValue = status === "inactive" ? displayedRows.reduce((s, r) => s + (r.catalogValue ?? 0), 0) : activeCatalogValue;
  const kpiScope = status === "all" ? "all" : status === "inactive" ? "inactive" : "active";

  const productTableRows = useMemo(
    () =>
      filtered.map((p) => {
        const sourceOrderIds = new Set(
          [p.sourceOrderId, ...(p.sourceOrderIds ?? [])].filter((value): value is string => Boolean(value)),
        );
        const sourceLineKeys = new Set(
          [p.sourceLineId ? `${p.sourceOrderId || ""}:${p.sourceLineId}` : "", ...(p.sourceLineIds ?? [])].filter(Boolean),
        );
        const sourceLineIds = new Set(
          [p.sourceLineId, ...(p.sourceLineIds ?? []).map((value) => value.split(":").pop() || "")].filter(
            (value): value is string => Boolean(value),
          ),
        );
        const generatedFallbackId = p.sourceOrderId && p.sourceLineId ? `order-line-${p.sourceOrderId}-${p.sourceLineId}` : "";
        const productKeys = new Set(
          [p.id, p.productCode, p.sku, p.catalogKey, generatedFallbackId].filter((value): value is string => Boolean(value)),
        );

        const matchesLine = (orderId: string, line: (typeof orders)[number]["lines"][number]) => {
          const lineKey = `${orderId}:${line.id}`;
          const snapshotId = line.productSnapshot?.id?.trim();
          const snapshotCode = line.productSnapshot?.code?.trim();
          const detailName = joinLineDetails(line).trim();

          return (
            sourceLineKeys.has(lineKey) ||
            sourceLineIds.has(line.id) ||
            productKeys.has(line.productId) ||
            (snapshotId ? productKeys.has(snapshotId) : false) ||
            (snapshotCode ? productKeys.has(snapshotCode) : false) ||
            (Boolean(p.marka.trim()) && Boolean(line.marka.trim()) && p.marka.trim() === line.marka.trim() && detailName === p.name.trim())
          );
        };

        const matchedOrder =
          orders.find((o) => sourceOrderIds.has(o.id) && o.lines.some((line) => matchesLine(o.id, line))) ||
          orders.find((o) => o.lines.some((line) => matchesLine(o.id, line))) ||
          (p.sourceOrderId ? orders.find((o) => o.id === p.sourceOrderId) : undefined);
        const matchedLine = matchedOrder?.lines.find((line) => matchesLine(matchedOrder.id, line));

        const paymentAgentName = matchedOrder ? getOrderPaymentAgentDisplay(matchedOrder, paymentAgents).value : "—";
        const customerName =
          matchedLine?.customerName?.trim() ||
          matchedLine?.customerSnapshot?.name?.trim() ||
          customers.find((c) => c.id === matchedLine?.customerId)?.name ||
          "—";
        const totalCtn = Number(matchedLine?.totalCtns) || 0;
        const qtyPerCtn = Number(matchedLine?.pcsPerCtn) || 0;
        const totalQty = totalCtn * qtyPerCtn;
        const ratePerPcs = Number(matchedLine?.rmbPerPcs) || p.sellingPrice || p.defaultRmbPerPcs || 0;
        const amount = matchedLine ? totalQty * ratePerPcs : p.totalAmount ?? 0;

        return {
          product: p,
          details: joinLineDetails(matchedLine || {}) || p.name,
          paymentAgentName,
          wechatId: matchedOrder?.wechatId?.trim() || "—",
          customerName,
          totalCtn,
          qtyPerCtn,
          totalQty,
          ratePerPcs,
          amount,
        };
      }),
    [filtered, orders, paymentAgents, customers],
  );

  const productsFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (productsFlowLoggedRef.current) return;
    if (isProductsLoading || error) return;
    productsFlowLoggedRef.current = true;
    logDataFlow("Products", {
      functionsCalled: ["useProducts.reload", "productsService.listProducts"],
      dbPaths: ["businesses/{businessId}/products"],
      result: { count: rows.length, reachedComponent: true, renderedRows: filtered.length },
      counts: {
        selectedStatusFilter: status,
        kpiScope,
        visibleProducts: filtered.length,
        activeProducts: active,
        inactiveProducts: inactive,
        displayedProductCount: displayedRows.length,
        displayedCatalogValue,
      },
      activeCatalogValue,
      sampleProducts: filtered.slice(0, 5).map((p) => ({ id: p.id, sku: p.sku, name: p.name, status: p.status })),
      visibleActionsSummary: ["Add Product"],
    });
  }, [isProductsLoading, error, rows.length, filtered.length, status, kpiScope, active, inactive, displayedRows.length, displayedCatalogValue, activeCatalogValue]);

  const openAdd = () => {
    setForm(emptyForm);
    setFile(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return pushToast({ tone: "danger", text: "Product name is required." });
    if (!(form.productCode || form.sku).trim()) return pushToast({ tone: "danger", text: "Product code / SKU is required." });
    if (!form.status) return pushToast({ tone: "danger", text: "Status is required." });
    setSaving(true);
    try {
      let photo = form.photo;
      if (file) {
        const uploaded = await uploadImageUnsigned(file, "tradeflow/products");
        photo = uploaded.secureUrl || form.photo;
      }
      const now = new Date().toISOString();
      const payload: Product = {
        id: form.id,
        productCode: (form.productCode || form.sku).trim(),
        sku: (form.sku || form.productCode).trim(),
        name: form.name.trim(),
        marka: form.marka?.trim() || "",
        category: form.category?.trim() || "",
        unit: form.unit?.trim() || "pcs",
        defaultDim: form.defaultDim?.trim() || undefined,
        photo: photo || "",
        supplierId: form.supplierId || undefined,
        purchasePrice: form.purchasePrice,
        sellingPrice: form.sellingPrice,
        defaultRmbPerPcs: form.defaultRmbPerPcs ?? form.sellingPrice,
        stockQty: form.stockQty,
        lowStockLimit: form.lowStockLimit,
        status: form.status,
        createdAt: form.createdAt || now,
        updatedAt: now,
        source: form.id ? form.source : "manual",
        generatedFromOrderLines: form.id ? form.generatedFromOrderLines : false,
      };
      await upsertProduct(payload);
      pushToast({ tone: "success", text: form.id ? "Product updated." : "Product added." });
      setOpen(false);
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Failed to save product." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Products">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {status === "all" ? (
              <>
                <StatCard label="Total Products" value={rows.length.toString()} icon={<Boxes size={16} />} />
                <StatCard label="Active Products" value={active.toString()} />
                <StatCard label="Inactive Products" value={inactive.toString()} />
                <StatCard label="Categories" value={displayedCategoriesCount.toString()} />
                <StatCard label="Low Stock Items" value={displayedLowStock.toString()} />
                <StatCard label="Active Catalog Value" value={formatAmount(activeCatalogValue)} />
              </>
            ) : (
              <>
                <StatCard label={status === "inactive" ? "Inactive Products" : "Products"} value={displayedRows.length.toString()} icon={<Boxes size={16} />} />
                <StatCard label={status === "inactive" ? "Inactive Categories" : "Categories"} value={displayedCategoriesCount.toString()} />
                <StatCard label={status === "inactive" ? "Inactive Low Stock" : "Low Stock Items"} value={displayedLowStock.toString()} />
                <StatCard label={status === "inactive" ? "Inactive Catalog Value" : "Active Catalog Value"} value={formatAmount(displayedCatalogValue)} />
              </>
            )}
          </div>
          <Button onClick={openAdd} variant="primary" className="ml-3">
            <Plus size={14} />
            Add Product
          </Button>
        </div>

        <div className="card flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-[280px] flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name, SKU, marka, category..." leadingIcon={<Search size={14} />} />
          </div>
          <div className="w-[170px]">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          </div>
          <div className="w-[160px]">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          </div>
          <Button disabled title="Additional filtering is not enabled in this phase." size="sm" variant="secondary">
            <Filter size={14} />
            More Filters
          </Button>
          <Button disabled title="Export is not enabled in this phase." size="sm" variant="secondary">
            <Download size={14} />
            Export
          </Button>
          {status === "active" && inactive > 0 ? <div className="ml-auto text-xs text-fg-subtle">{inactive} inactive products are hidden by the Active filter.</div> : null}
        </div>

        {error && <div className="text-[12px] text-fg-subtle">{error}</div>}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Product Photo</th>
                  <th>Marka</th>
                  <th>Details</th>
                  <th>Payment Agent</th>
                  <th>WeChat ID</th>
                  <th>Customer</th>
                  <th>Total Ctn</th>
                  <th>Qty/Ctn</th>
                  <th>Total Qty</th>
                  <th>Rate/Pcs</th>
                  <th className="px-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {productTableRows.map((row) => (
                  <tr key={row.product.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle text-[20px]">
                        {row.product.photo?.startsWith("http") ? (
                          <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(row.product.photo)}>
                            <img src={row.product.photo} alt="" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          row.product.photo || "—"
                        )}
                      </div>
                    </td>
                    <td className="font-semibold">{row.product.marka || "—"}</td>
                    <td>
                      <div className="font-medium">{row.details || "—"}</div>
                      <div className="text-[11.5px] text-fg-subtle">{row.product.sku || row.product.productCode}</div>
                    </td>
                    <td>{row.paymentAgentName}</td>
                    <td>{row.wechatId}</td>
                    <td>{row.customerName}</td>
                    <td className="tabular-nums">{row.totalCtn.toLocaleString()}</td>
                    <td className="tabular-nums">{row.qtyPerCtn.toLocaleString()}</td>
                    <td className="tabular-nums">{row.totalQty.toLocaleString()}</td>
                    <td className="font-semibold tabular-nums text-[var(--success)]">{formatAmount(row.ratePerPcs)}</td>
                    <td className="px-4 font-semibold tabular-nums">{formatAmount(row.amount)}</td>
                  </tr>
                ))}
                {productTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-fg-subtle">
                      {status === "active" && active === 0 && inactive > 0 ? `No active products found. ${inactive} inactive products are hidden by the Active filter.` : "No products found."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination total={filtered.length} />
        </div>

        {open && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card w-full max-w-3xl space-y-3 p-4">
              <div className="text-lg font-semibold">{form.id ? "Edit Product" : "Add Product"}</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Product Name" />
                <Input value={form.productCode} onChange={(e) => setForm((s) => ({ ...s, productCode: e.target.value }))} placeholder="Product Code" />
                <Input value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} placeholder="SKU" />
                <Input value={form.marka} onChange={(e) => setForm((s) => ({ ...s, marka: e.target.value }))} placeholder="Marka" />
                <Input value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} placeholder="Category" />
                <Input value={form.unit} onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))} placeholder="Unit" />
                <Input value={form.defaultDim ?? ""} onChange={(e) => setForm((s) => ({ ...s, defaultDim: e.target.value }))} placeholder="Default Dimension" />
                <Select value={form.supplierId || ""} onChange={(e) => setForm((s) => ({ ...s, supplierId: e.target.value }))} options={[{ value: "", label: "No Supplier" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                <Input type="number" value={form.purchasePrice ?? ""} onChange={(e) => setForm((s) => ({ ...s, purchasePrice: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="Purchase Price" />
                <Input type="number" value={form.sellingPrice ?? ""} onChange={(e) => setForm((s) => ({ ...s, sellingPrice: e.target.value === "" ? undefined : Number(e.target.value), defaultRmbPerPcs: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="Selling Price / Rate per PCS" />
                <Input type="number" value={form.stockQty ?? ""} onChange={(e) => setForm((s) => ({ ...s, stockQty: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="Stock Qty" />
                <Input type="number" value={form.lowStockLimit ?? ""} onChange={(e) => setForm((s) => ({ ...s, lowStockLimit: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="Low Stock Limit" />
                <Select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as Product["status"] }))} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                <div className="space-y-1">
                  <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {form.photo ? (
                    <button type="button" title="Open image preview" aria-label="Open image preview" className="cursor-zoom-in" onClick={() => setPreviewImage(form.photo)}>
                      <img src={form.photo} alt="preview" className="h-14 w-14 rounded border object-cover" />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save Product"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <ImageLightbox src={previewImage} alt="Product photo" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
      </div>
    </PageShell>
  );
}
