"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { customers, formatCNY, formatDate, paymentAgents, suppliers } from "@/lib/data";
import { Order, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";

const today = () => new Date().toISOString().slice(0, 10);
const nextOrderNo = (orders: Order[]) => `25-${String(orders.length + 301).padStart(3, "0")}`;
const createEmptyDraft = (orders: Order[]): Order => ({
  id: `ord-${Date.now()}`,
  orderNumber: nextOrderNo(orders),
  number: nextOrderNo(orders),
  date: today(),
  paymentAgentId: paymentAgents[0]?.id || "",
  paymentBy: paymentAgents[0]?.id || "",
  wechatId: "",
  status: "draft",
  paymentStatus: "pending",
  paidToPaymentAgentNow: 0,
  lines: [{ ...newLine(), details: "", marka: "", totalCtns: 0, pcsPerCtn: 0, rmbPerPcs: 0, productPhotoUrl: "", photoUrl: "" }],
});

const meaningfulLine = (l: Order["lines"][number]) => !!(l.details?.trim() || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs);

export default function OrdersPage() {
  const { orders, upsertOrder, deleteOrder, pushToast } = useStore();
  const [query, setQuery] = useState("");
  const [activeUploads, setActiveUploads] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Order>(createEmptyDraft(orders));

  const total = useMemo(() => orderTotal(draft), [draft]);
  const history = useMemo(() => orders.filter((o) => { const q=query.toLowerCase().trim(); if(!q) return true; const supplierText=o.lines.map(l=>suppliers.find(s=>s.id===l.supplierId)?.name??"").join(" ").toLowerCase(); const customerText=o.lines.map(l=>customers.find(c=>c.id===l.customerId)?.name??"").join(" ").toLowerCase(); const payment=paymentAgents.find(p=>p.id===o.paymentBy)?.name.toLowerCase()??""; return o.number.toLowerCase().includes(q)||o.wechatId.toLowerCase().includes(q)||supplierText.includes(q)||customerText.includes(q)||payment.includes(q); }).slice(0, 10), [orders, query]);
  const editingOrder = editingOrderId ? orders.find((o) => o.id === editingOrderId) ?? null : null;
  const wechatSuggestions = useMemo(() => Array.from(new Set(orders.map((o) => o.wechatId.trim()).filter(Boolean))).slice(0, 5), [orders]);
  const supplierSuggestions = useMemo(() => {
    const fromOrders = orders.flatMap((o) => o.lines.map((l) => (l.supplierName?.trim() || suppliers.find((s) => s.id === l.supplierId)?.name || "").trim()));
    const merged = Array.from(new Set([...suppliers.map((s) => s.name), ...fromOrders].filter(Boolean)));
    return merged.slice(0, 5);
  }, [orders]);
  const selectedPaymentAgentId = draft.paymentAgentId || draft.paymentBy;
  const selectedPaymentAgent = paymentAgents.find((p) => p.id === selectedPaymentAgentId) ?? null;
  const settlement = useMemo(() => calculatePaymentAgentSettlement({ orderTotal: total, existingCredit: selectedPaymentAgent?.creditBalance ?? 0, paidNow: draft.paidToPaymentAgentNow ?? 0 }), [total, selectedPaymentAgent, draft.paidToPaymentAgentNow]);

  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const onSave = async (status: Order["status"]) => {
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });
    if (!draft.number.trim() || !draft.date) return pushToast({ tone: "danger", text: "Order number and date are required." });
    if (!draft.lines.some(meaningfulLine)) return pushToast({ tone: "danger", text: "Add at least one meaningful line before saving." });

    if (status === "draft") {
      setDraft((d) => ({ ...d, status: "draft" }));
      return pushToast({ tone: "success", text: `Draft ${draft.number} saved` });
    }

    if (editingOrderId && !confirm("Updating this order can update generated products, order history, and dashboard totals. Continue?")) return;
    if (!selectedPaymentAgentId && total > 0) return pushToast({ tone: "danger", text: "Select a payment agent before saving this order." });

    const savedOrder = { ...draft, status: "saved" as const, paymentAgentId: selectedPaymentAgentId, paymentBy: selectedPaymentAgentId, paymentAgentSettlementSnapshot: settlement };
    upsertOrder(savedOrder);
    if (editingOrderId && removedLineIds.length) await archiveProductsForRemovedOrderLines(editingOrderId, removedLineIds);
    const result = await syncOrderLinesToProducts(savedOrder);
    pushToast({ tone: result.failed ? "info" : "success", text: result.failed ? `Order ${draft.number} saved, but product sync failed for ${result.failed} line(s).` : `Order ${draft.number} saved and products synced.` });
    setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders));
  };

  const onCancel = () => { setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders)); pushToast({ tone: "info", text: "Draft reset to new order." }); };

  const startEdit = (o: Order) => { setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id))); setDraft(JSON.parse(JSON.stringify(o))); };


  const handleRemoveLine = (lineId: string) => {
    if (editingOrderId && originalLineIds.has(lineId)) {
      const ok = confirm("Deleting this line will remove/archive the generated product linked to this line after you save changes. Continue?");
      if (!ok) return;
      setRemovedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
    }
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
  };

  const removeOrder = async (o: Order) => {
    if (!confirm("Deleting this order will remove it from order history and remove/archive generated products created from its lines. This may affect Products and Dashboard totals. Continue?")) return;
    deleteOrder(o.id);
    await archiveProductsForOrder(o);
    pushToast({ tone: "success", text: `Order ${o.number} deleted and related generated products archived.` });
    if (editingOrderId === o.id) onCancel();
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg"><div className="flex-1 max-w-md"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search order history..." className="input" /></div><Button size="sm" variant="primary" onClick={onCancel}>New Order</Button></div>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <div className="card p-3 text-[12px] text-fg-subtle">{editingOrder ? `Editing order ${editingOrder.number}` : "Create new order"}</div>
        <OrderForm draft={draft} setDraft={(u) => setDraft((d) => u(d))} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} supplierSuggestions={supplierSuggestions} />
        <OrderFooter total={total} onCancel={onCancel} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} saveOrderLabel={editingOrderId ? "Save Changes" : "Save Order"} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />

        <section className="card p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing first 10</div></div>
          <div className="space-y-2">{history.map((o) => (
            <div key={o.id} className="rounded border border-border p-3 flex items-center justify-between gap-2">
              <div className="text-[12px]"><div className="font-semibold">{o.number}</div><div className="text-fg-subtle">{formatDate(o.date)} · {paymentAgents.find((p) => p.id === o.paymentBy)?.name ?? "—"} · {o.wechatId || "—"}</div><div className="text-fg-subtle">{o.lines.length} lines · {formatCNY(orderTotal(o))} · {o.status}</div></div>
              <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => startEdit(o)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button></div>
            </div>
          ))}</div>
        </section>
      </main>
    </div>
  );
}
