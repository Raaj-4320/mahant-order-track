"use client";

import { PageShell } from "@/components/PageShell";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useStore } from "@/lib/store";
import { getProductStats } from "@/services/selectors";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { formatAmount } from "@/lib/data";
import { uploadImageUnsigned } from "@/lib/cloudinary/client";
import type { Product } from "@/lib/types";
import { Boxes, Download, Edit, Filter, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow, logProduct, logError } from "@/lib/logger";

type ProductForm = Omit<Product, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string };
const emptyForm: ProductForm = { id: "", productCode: "", sku: "", name: "", marka: "", category: "", unit: "pcs", defaultDim: "", photo: "", supplierId: "", purchasePrice: undefined, sellingPrice: undefined, defaultRmbPerPcs: undefined, stockQty: undefined, lowStockLimit: undefined, status: "active" };

export default function ProductsPage() {
  useEffect(() => {
    logPageAccess("Products", { component: "app/products/page.tsx", source: process.env.NEXT_PUBLIC_PRODUCTS_DATA_SOURCE ?? "mock" });
  }, []);
  const { data: products, isLoading: isProductsLoading, error, upsertProduct, archiveProduct } = useProducts();
  const { data: suppliers } = useSuppliers();
  const { orders, pushToast } = useStore();
  const rows = getProductStats(products, orders).map((x) => ({ ...x.product, totalQtyPcs: x.totalQtyPcs, totalAmount: x.totalAmount, catalogValue: x.catalogValue, isLowStock: x.isLowStock }));
  const [q, setQ] = useState(""); const [status, setStatus] = useState("active"); const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false); const [form, setForm] = useState<ProductForm>(emptyForm); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false);
  const categories = Array.from(new Set(rows.map((r) => r.category)));
  const filtered = useMemo(() => rows.filter((p) => [p.name, p.sku, p.marka, p.category].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || p.status === status) && (category === "all" || p.category === category)), [rows, q, status, category]);
  const activeRows = rows.filter((r) => r.status === "active");
  const inactiveRows = rows.filter((r) => r.status === "inactive");
  const active = activeRows.length;
  const inactive = inactiveRows.length;
  const activeCatalogValue = activeRows.reduce((s, r) => s + (r.catalogValue ?? 0), 0);
  const displayedRows = status === "all" ? rows : (status === "inactive" ? inactiveRows : activeRows);
  const displayedCategoriesCount = new Set(displayedRows.map((r) => r.category).filter(Boolean)).size;
  const displayedLowStock = displayedRows.filter((r) => r.isLowStock).length;
  const displayedCatalogValue = status === "inactive" ? displayedRows.reduce((s, r) => s + (r.catalogValue ?? 0), 0) : activeCatalogValue;
  const kpiScope = status === "all" ? "all" : status === "inactive" ? "inactive" : "active";

  const productsFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (productsFlowLoggedRef.current) return;
    if (isProductsLoading || error) return;
    productsFlowLoggedRef.current = true;
    logDataFlow("Products", { functionsCalled: ["useProducts.reload", "productsService.listProducts"], dbPaths: ["businesses/{businessId}/products"], result: { count: rows.length, reachedComponent: true, renderedRows: filtered.length }, counts: { selectedStatusFilter: status, kpiScope, visibleProducts: filtered.length, activeProducts: active, inactiveProducts: inactive, displayedProductCount: displayedRows.length, displayedCatalogValue }, activeCatalogValue, sampleProducts: filtered.slice(0,5).map((p) => ({ id: p.id, sku: p.sku, name: p.name, status: p.status })), visibleActionsSummary: ["Add Product", "Edit Product", "Archive Product"] });
  }, [isProductsLoading, error, rows.length, filtered.length, status, kpiScope, active, inactive, displayedRows.length, displayedCatalogValue, activeCatalogValue]);

  const openAdd = () => { setForm(emptyForm); setFile(null); setOpen(true); };
  const openEdit = (p: Product) => { setForm({ ...p }); setFile(null); setOpen(true); };
  const archive = async (p: Product) => {
    if (p.status === "inactive") return;
    if (!confirm(`Archive product ${p.name}? This is a safe soft-delete and will keep order history.`)) return;
    logProduct("product_archive_started", { productId: p.id, status: p.status, source: p.source });
    try {
      await archiveProduct(p.id);
      logProduct("product_archive_success", { productId: p.id });
      pushToast({ tone: "success", text: `Product ${p.name} archived.` });
    } catch (e) {
      logError("product_archive_failed", { productId: p.id, error: e instanceof Error ? e.message : String(e) });
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Failed to archive product." });
    }
  };
  const restore = async (p: Product) => {
    try {
      await upsertProduct({ ...p, status: "active", updatedAt: new Date().toISOString() });
      pushToast({ tone: "success", text: `Product ${p.name} restored to active.` });
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Failed to restore product." });
    }
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
    } finally { setSaving(false); }
  };

  return (<PageShell title="Products"><div className="space-y-4 p-6">
    <div className="flex items-center justify-between"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 flex-1">
      {status === "all" ? <>
        <StatCard label="Total Products" value={rows.length.toString()} icon={<Boxes size={16} />} />
        <StatCard label="Active Products" value={active.toString()} />
        <StatCard label="Inactive Products" value={inactive.toString()} />
        <StatCard label="Categories" value={displayedCategoriesCount.toString()} />
        <StatCard label="Low Stock Items" value={displayedLowStock.toString()} />
        <StatCard label="Active Catalog Value" value={formatAmount(activeCatalogValue)} />
      </> : <>
        <StatCard label={status === "inactive" ? "Inactive Products" : "Products"} value={displayedRows.length.toString()} icon={<Boxes size={16} />} />
        <StatCard label={status === "inactive" ? "Inactive Categories" : "Categories"} value={displayedCategoriesCount.toString()} />
        <StatCard label={status === "inactive" ? "Inactive Low Stock" : "Low Stock Items"} value={displayedLowStock.toString()} />
        <StatCard label={status === "inactive" ? "Inactive Catalog Value" : "Active Catalog Value"} value={formatAmount(displayedCatalogValue)} />
      </>}
    </div><Button onClick={openAdd} variant="primary" className="ml-3"><Plus size={14} />Add Product</Button></div>
    <div className="card p-3 flex flex-wrap gap-2 items-center"><div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name, SKU, marka, category..." leadingIcon={<Search size={14} />} /></div><div className="w-[170px]"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} /></div><div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div><Button disabled title="Additional filtering is not enabled in this phase." size="sm" variant="secondary"><Filter size={14} />More Filters</Button><Button disabled title="Export is not enabled in this phase." size="sm" variant="secondary"><Download size={14} />Export</Button>{status === "active" && inactive > 0 ? <div className="ml-auto text-xs text-fg-subtle">{inactive} inactive products are hidden by the Active filter.</div> : null}</div>
    {error && <div className="text-[12px] text-fg-subtle">{error}</div>}
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-[13px]"><thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Product</th><th>Marka</th><th>Category</th><th>Default Dimension</th><th>Rate / PCS</th><th>Supplier</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id} className="border-t border-border"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[20px] overflow-hidden">{p.photo?.startsWith("http") ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : p.photo}</div><div><div className="font-semibold">{p.name}</div><div className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle"><span>{p.sku}</span>{(p.generatedFromOrderLines || p.source === "order-line") && <span title="Created from saved order lines" className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-[1px] text-[10px] text-sky-700">Generated</span>}{p.source === "manual" && <span title="Created from Products page" className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-[1px] text-[10px] text-slate-700">Manual</span>}</div></div></div></td><td>{p.marka}</td><td>{p.category} <span className="text-fg-subtle">· {p.unit}</span></td><td>{p.defaultDim || "—"}</td><td className="font-semibold text-[var(--success)] tabular-nums">{formatAmount(p.sellingPrice ?? p.defaultRmbPerPcs ?? 0)}</td><td>{suppliers.find((s) => s.id === p.supplierId)?.name ?? "—"}</td><td><StatusBadge status={p.status} /></td><td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => openEdit(p)}><Edit size={12} />Edit</Button>{p.status === "inactive" ? <Button size="sm" variant="secondary" onClick={() => restore(p)} title="Restore product to active status.">Restore</Button> : <Button size="sm" variant="secondary" onClick={() => archive(p)} title="Archive product (safe soft-delete).">Delete</Button>}</div></td></tr>)}{filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">{status === "active" && active === 0 && inactive > 0 ? `No active products found. ${inactive} inactive products are hidden by the Active filter.` : "No products found."}</td></tr>}</tbody></table></div><TablePagination total={filtered.length} /></div>

    {open && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-3xl p-4 space-y-3"><div className="text-lg font-semibold">{form.id ? "Edit Product" : "Add Product"}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
        <div className="space-y-1"><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{form.photo && <img src={form.photo} alt="preview" className="h-14 w-14 object-cover rounded border" />}</div>
      </div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Product"}</Button></div>
    </div></div>}
  </div></PageShell>);
}
