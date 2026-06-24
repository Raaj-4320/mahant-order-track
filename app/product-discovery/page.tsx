"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { TablePagination } from "@/components/table/TablePagination";
import { PhotoUpload } from "@/components/orders/PhotoUpload";
import { useProducts } from "@/hooks/useProducts";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { formatIndianDate } from "@/lib/dateFormat";
import { formatWholeMoney } from "@/lib/numbers";
import type { Product } from "@/lib/types";

const PAGE_SIZE = 24;
const PRODUCT_DISCOVERY_CATEGORY = "Product Discovery";

type DiscoveryForm = {
  id: string;
  productName: string;
  supplierName: string;
  notes: string;
  totalCtns: string;
  pcsPerCtn: string;
  rate: string;
  images: string[];
};

const emptyForm = (): DiscoveryForm => ({
  id: "",
  productName: "",
  supplierName: "",
  notes: "",
  totalCtns: "",
  pcsPerCtn: "",
  rate: "",
  images: [""],
});

const toNumber = (value: string) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const makeDiscoveryCode = (name: string, existingCode?: string) => {
  if (existingCode?.trim()) return existingCode.trim();
  const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || "DISCOVERY";
  return `PD-${slug}-${Date.now().toString().slice(-6)}`;
};

const formFromProduct = (product: Product): DiscoveryForm => ({
  id: product.id,
  productName: product.name || "",
  supplierName: product.supplierName || "",
  notes: product.notes || "",
  totalCtns: product.discoveryTotalCtns ? String(product.discoveryTotalCtns) : "",
  pcsPerCtn: product.discoveryPcsPerCtn ? String(product.discoveryPcsPerCtn) : "",
  rate: product.discoveryRate ? String(product.discoveryRate) : "",
  images: product.discoveryImages?.length ? [...product.discoveryImages] : [product.photo || ""].filter(Boolean).concat(product.photo ? [] : [""]),
});

export default function ProductDiscoveryPage() {
  const { data: products, isLoading, upsertProduct, archiveProduct } = useProducts();
  const { pushToast } = useStore();
  const [form, setForm] = useState<DiscoveryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const history = useMemo(
    () =>
      products
        .filter((product) => product.category === PRODUCT_DISCOVERY_CATEGORY && product.status !== "inactive")
        .sort((left, right) => (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "")),
    [products],
  );

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pagedHistory = useMemo(
    () => history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [history, currentPage],
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const setImageAt = (index: number, nextValue?: string) => {
    setForm((current) => ({
      ...current,
      images: current.images.map((value, currentIndex) => (currentIndex === index ? (nextValue || "") : value)),
    }));
  };

  const addImageSlot = () => {
    setForm((current) => ({ ...current, images: [...current.images, ""] }));
  };

  const removeImageSlot = (index: number) => {
    setForm((current) => {
      if (current.images.length === 1) return { ...current, images: [""] };
      return { ...current, images: current.images.filter((_, currentIndex) => currentIndex !== index) };
    });
  };

  const resetForm = () => setForm(emptyForm());

  const saveDiscovery = async () => {
    const trimmedName = form.productName.trim();
    if (!trimmedName) {
      pushToast({ tone: "danger", text: "Product name is required." });
      return;
    }

    setSaving(true);
    try {
      const existing = form.id ? history.find((entry) => entry.id === form.id) ?? products.find((entry) => entry.id === form.id) ?? null : null;
      const images = form.images.map((value) => value.trim()).filter(Boolean);
      const totalCtns = toNumber(form.totalCtns);
      const pcsPerCtn = toNumber(form.pcsPerCtn);
      const rate = toNumber(form.rate);
      const totalPieces = totalCtns * pcsPerCtn;
      const payload: Product = {
        ...(existing ?? {
          id: "",
          productCode: "",
          sku: "",
          name: "",
          marka: "",
          category: PRODUCT_DISCOVERY_CATEGORY,
          unit: "pcs",
          photo: "",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "manual",
        }),
        id: form.id,
        productCode: makeDiscoveryCode(trimmedName, existing?.productCode),
        sku: makeDiscoveryCode(trimmedName, existing?.sku),
        name: trimmedName,
        supplierName: form.supplierName.trim() || undefined,
        notes: form.notes.trim() || undefined,
        photo: images[0] || "",
        discoveryImages: images,
        discoveryTotalCtns: totalCtns || undefined,
        discoveryPcsPerCtn: pcsPerCtn || undefined,
        discoveryRate: rate || undefined,
        defaultRmbPerPcs: rate || undefined,
        sellingPrice: rate || undefined,
        stockQty: totalPieces || undefined,
        category: PRODUCT_DISCOVERY_CATEGORY,
        source: "manual",
        status: "active",
      };

      await upsertProduct(payload);
      pushToast({ tone: "success", text: form.id ? "Product discovery updated." : "Product discovery saved." });
      resetForm();
      setCurrentPage(1);
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Could not save product discovery." });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (product: Product) => {
    setForm(formFromProduct(product));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await archiveProduct(pendingDelete.id);
      pushToast({ tone: "success", text: "Product discovery deleted." });
      if (form.id === pendingDelete.id) resetForm();
      setPendingDelete(null);
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Could not delete product discovery." });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <PageShell title="Product Discovery">
      <div className="space-y-2 p-2.5">
        <div className="grid gap-2 xl:grid-cols-[520px_minmax(0,1fr)] xl:items-start">
          <section className="card max-w-[520px] overflow-hidden">
            <div className="border-b border-border px-2 py-1.5">
              <div className="text-[14px] font-semibold">New Discovery</div>
              <div className="mt-0.5 text-[10px] text-fg-subtle">Capture a product lead with photos, supplier details, packing, rate, and notes.</div>
            </div>

            <div className="space-y-2 p-2">
              <div className="grid gap-1.5 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-fg-muted">Product Name</span>
                  <Input value={form.productName} onChange={(e) => setForm((current) => ({ ...current, productName: e.target.value }))} placeholder="Open field" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-fg-muted">Supplier Name</span>
                  <Input value={form.supplierName} onChange={(e) => setForm((current) => ({ ...current, supplierName: e.target.value }))} placeholder="Open field" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-fg-muted">Rate</span>
                  <Input value={form.rate} onChange={(e) => setForm((current) => ({ ...current, rate: e.target.value }))} placeholder="RMB / piece" inputMode="decimal" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-fg-muted">CTN</span>
                  <Input value={form.totalCtns} onChange={(e) => setForm((current) => ({ ...current, totalCtns: e.target.value }))} placeholder="0" inputMode="decimal" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-fg-muted">PCS / CTN</span>
                  <Input value={form.pcsPerCtn} onChange={(e) => setForm((current) => ({ ...current, pcsPerCtn: e.target.value }))} placeholder="0" inputMode="decimal" />
                </label>
                <div className="rounded-lg border border-border bg-bg-subtle/50 px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">Quick Total</div>
                  <div className="mt-1 text-[13px] font-semibold text-fg">{formatWholeMoney(toNumber(form.totalCtns) * toNumber(form.pcsPerCtn) * toNumber(form.rate))}</div>
                  <div className="mt-0.5 text-[10px] text-fg-subtle">{toNumber(form.totalCtns) * toNumber(form.pcsPerCtn)} pcs</div>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-fg-muted">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Any supplier notes, quality remarks, color options, MOQ, or follow-up details..."
                  className="min-h-[34px] w-full rounded-lg border border-border bg-bg-card px-2 py-1.5 text-[12px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-fg-subtle"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-fg-muted">Images</div>
                    <div className="text-[10px] text-fg-subtle">Click, paste, drag-drop, or double-click to browse. Add as many image slots as needed.</div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={addImageSlot}>
                    <Plus size={14} />
                    Add Image
                  </Button>
                </div>

                <div className="grid gap-1 sm:grid-cols-3">
                  {form.images.map((image, index) => (
                    <div key={`discovery-image-${index}`} className="rounded-lg border border-border bg-bg-subtle/30 p-1">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-fg-subtle">Image {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeImageSlot(index)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-fg-subtle transition-colors hover:bg-bg-card"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex justify-center">
                        <PhotoUpload compact value={image || undefined} onChange={(nextUrl) => setImageAt(index, nextUrl)} onPreview={(src) => setPreviewImage(src)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-1.5">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
                <Button type="button" variant="primary" onClick={() => void saveDiscovery()} disabled={saving}>
                  {saving ? <Save size={14} /> : <Save size={14} />}
                  {saving ? "Saving..." : form.id ? "Save Changes" : "Save"}
                </Button>
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-2.5 py-2">
              <div>
                <div className="text-[14px] font-semibold">Existing Product History</div>
                <div className="mt-0.5 text-[10px] text-fg-subtle">{history.length} saved discovery item{history.length === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-[11px] text-fg-subtle">
                Product Discovery
              </div>
            </div>

            <div className="space-y-2 p-2.5">
            {isLoading ? <div className="rounded-2xl border border-border bg-bg-subtle/40 px-4 py-8 text-center text-[13px] text-fg-subtle">Loading discovery history...</div> : null}
            {!isLoading && pagedHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-bg-subtle/30 px-4 py-10 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-dashed border-border bg-bg-card text-fg-subtle">
                  <ImagePlus size={18} />
                </div>
                <div className="mt-3 text-[15px] font-semibold">No product discoveries yet</div>
                <div className="mt-1 text-[12px] text-fg-subtle">Save a new discovery above and it will appear here with edit and delete actions.</div>
              </div>
            ) : null}

            {pagedHistory.map((product) => {
              const totalCtns = Number(product.discoveryTotalCtns) || 0;
              const pcsPerCtn = Number(product.discoveryPcsPerCtn) || 0;
              const rate = Number(product.discoveryRate ?? product.sellingPrice ?? product.defaultRmbPerPcs) || 0;
              const totalPieces = totalCtns * pcsPerCtn;
              const totalAmount = totalPieces * rate;
              const images = product.discoveryImages?.length ? product.discoveryImages : (product.photo ? [product.photo] : []);

              return (
                <article key={product.id} className="rounded-3xl border border-border bg-bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="xl:w-[260px]">
                      <div className={cn("grid gap-2", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                        {images.length > 0 ? images.map((src, index) => (
                          <button
                            key={`${product.id}-image-${index}`}
                            type="button"
                            onClick={() => setPreviewImage(src)}
                            className="overflow-hidden rounded-2xl border border-border bg-bg-subtle"
                          >
                            <img src={src} alt={`${product.name} ${index + 1}`} className="h-[120px] w-full object-cover" loading="lazy" decoding="async" />
                          </button>
                        )) : (
                          <div className="grid h-[120px] place-items-center rounded-2xl border border-dashed border-border bg-bg-subtle text-[12px] text-fg-subtle">No image</div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-[22px] font-semibold leading-tight">{product.name}</div>
                          <div className="mt-1 text-[13px] text-fg-subtle">
                            Supplier: <span className="font-medium text-fg">{product.supplierName || "Not set"}</span>
                          </div>
                          <div className="mt-1 text-[12px] text-fg-subtle">
                            Saved {formatIndianDate(product.createdAt)} · Updated {formatIndianDate(product.updatedAt)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(product)}>
                            <Pencil size={14} />
                            Edit
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setPendingDelete(product)} className="text-[var(--danger)] hover:bg-[var(--danger)]/10">
                            <Trash2 size={14} />
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl border border-border bg-bg-subtle/45 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">CTN</div>
                          <div className="mt-1 text-[18px] font-semibold">{totalCtns || "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-bg-subtle/45 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">PCS / CTN</div>
                          <div className="mt-1 text-[18px] font-semibold">{pcsPerCtn || "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-bg-subtle/45 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">Total Pieces</div>
                          <div className="mt-1 text-[18px] font-semibold">{totalPieces || "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-bg-subtle/45 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">Rate</div>
                          <div className="mt-1 text-[18px] font-semibold">{rate ? formatWholeMoney(rate) : "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">Estimated Amount</div>
                          <div className="mt-1 text-[18px] font-semibold text-emerald-700 dark:text-emerald-300">{totalAmount ? formatWholeMoney(totalAmount) : "-"}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-bg-subtle/35 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">Notes</div>
                        <div className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-fg">{product.notes?.trim() || "No notes added."}</div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>

            <TablePagination total={history.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="product discoveries" />
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Product Discovery"
        description={pendingDelete ? `Delete ${pendingDelete.name}?` : ""}
        confirmLabel={deleteBusy ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        danger
        onCancel={() => { if (!deleteBusy) setPendingDelete(null); }}
        onConfirm={() => { void confirmDelete(); }}
      />

      <ImageLightbox open={Boolean(previewImage)} src={previewImage} onClose={() => setPreviewImage(null)} />
    </PageShell>
  );
}
