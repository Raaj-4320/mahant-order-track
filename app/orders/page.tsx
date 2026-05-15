"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatCNY, formatDate } from "@/lib/data";
import { Order, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { hasAnyDraftContent, validateOrderForSave } from "@/services/orderValidation";

const today = () => new Date().toISOString().slice(0, 10);
const nextOrderNo = (orders: Order[]) => `25-${String(orders.length + 301).padStart(3, "0")}`;
const createEmptyDraft = (orders: Order[], defaultPaymentAgentId = ""): Order => ({
  id: `ord-${Date.now()}`,
  orderNumber: nextOrderNo(orders),
  number: nextOrderNo(orders),
  date: today(),
  paymentAgentId: defaultPaymentAgentId,
  paymentBy: defaultPaymentAgentId,
  wechatId: "",
  status: "draft",
  paymentStatus: "pending",
  paidToPaymentAgentNow: 0,
  lines: [{ ...newLine(), details: "", marka: "", totalCtns: 0, pcsPerCtn: 0, rmbPerPcs: 0, productPhotoUrl: "", photoUrl: "" }],
});

const meaningfulLine = (l: Order["lines"][number]) => !!(l.details?.trim() || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs);

export default function OrdersPage() {
  type OrdersMode = "history" | "add" | "drafts" | "edit";
  const { orders, upsertOrder, deleteOrder, pushToast } = useStore();
  const { data: paymentAgents, recalculateFromOrders, applyOrderSettlement, reverseOrderSettlement } = usePaymentAgents();
  const { data: firebaseOrders, draftOrders: firebaseDraftOrders, autosaveDraft, upsertOrder: upsertFirebaseOrder, archiveOrder: archiveFirebaseOrder, reload: reloadFirebaseOrders } = useOrders();
  const ordersDataSource = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock";
  const isFirebaseOrdersMode = ordersDataSource === "firebase";
  const [query, setQuery] = useState("");
  const [activeUploads, setActiveUploads] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Order>(createEmptyDraft(orders));
  const [mode, setMode] = useState<OrdersMode>("history");

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const history = useMemo(() => activeOrders.filter((o) => { const q=query.toLowerCase().trim(); if(!q) return true; const supplierText=o.lines.map(l=>l.supplierName || l.supplierSnapshot?.name || "").join(" ").toLowerCase(); const customerText=o.lines.map(l=>l.customerSnapshot?.name || "").join(" ").toLowerCase(); const payment=paymentAgents.find(p=>p.id===o.paymentBy)?.name.toLowerCase()??""; return o.number.toLowerCase().includes(q)||o.wechatId.toLowerCase().includes(q)||supplierText.includes(q)||customerText.includes(q)||payment.includes(q); }).slice(0, 10), [activeOrders, query, paymentAgents]);
  const editingOrder = editingOrderId ? activeOrders.find((o) => o.id === editingOrderId) ?? null : null;
  const wechatSuggestions = useMemo(() => Array.from(new Set(activeOrders.map((o) => o.wechatId.trim()).filter(Boolean))).slice(0, 5), [activeOrders]);
  const supplierSuggestions = useMemo(() => {
    const fromOrders = activeOrders.flatMap((o) => o.lines.map((l) => (l.supplierName?.trim() || l.supplierSnapshot?.name || "").trim()));
    return Array.from(new Set(fromOrders.filter(Boolean))).slice(0, 5);
  }, [activeOrders]);
  const selectedPaymentAgentId = draft.paymentAgentId || draft.paymentBy;
  const selectedPaymentAgent = paymentAgents.find((p) => p.id === selectedPaymentAgentId || p.name === selectedPaymentAgentId || p.agentCode === selectedPaymentAgentId) ?? null;
  const settlement = useMemo(() => calculatePaymentAgentSettlement({ orderTotal: total, existingCredit: selectedPaymentAgent?.creditBalance ?? 0, paidNow: draft.paidToPaymentAgentNow ?? 0 }), [total, selectedPaymentAgent, draft.paidToPaymentAgentNow]);
  const validation = useMemo(() => validateOrderForSave(draft), [draft]);

  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const onSave = async (status: Order["status"]) => {
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });

    if (status === "draft") {
      if (!hasAnyDraftContent(draft)) return pushToast({ tone: "info", text: "Add some order details before saving a draft." });
      const draftOrder = { ...draft, status: "draft" as const, paymentAgentId: selectedPaymentAgentId, paymentBy: selectedPaymentAgentId };
      if (isFirebaseOrdersMode) {
        await upsertFirebaseOrder({ ...draftOrder, draftAutosavedAt: new Date().toISOString() } as any);
        await reloadFirebaseOrders();
      } else {
        upsertOrder(draftOrder);
      }
      setEditingOrderId(null);
      setRemovedLineIds([]);
      setOriginalLineIds(new Set());
      setDraft(createEmptyDraft(orders, ""));
      setMode("history");
      return pushToast({ tone: "success", text: "Draft saved. Use Complete Draft to finish it." });
    }

    if (!validation.isValid) {
      pushToast({ tone: "danger", text: "Complete required fields before saving as order, or save as draft." });
      return;
    }

    if (editingOrderId && !confirm("Updating this order can update generated products, order history, and dashboard totals. Continue?")) return;

    const now = new Date().toISOString();
    const savedOrder = { ...draft, status: "saved" as const, paymentAgentId: selectedPaymentAgentId, paymentBy: selectedPaymentAgentId, paymentAgentSettlementSnapshot: { ...settlement, orderTotal: settlement.orderTotal, existingCredit: settlement.existingCredit, paymentAgentId: selectedPaymentAgentId, paymentAgentName: selectedPaymentAgent?.name, updatedAt: now, createdAt: draft.paymentAgentSettlementSnapshot?.createdAt || now } };
    if (isFirebaseOrdersMode) {
      await upsertFirebaseOrder(savedOrder as any);
      await reloadFirebaseOrders();
    } else {
      upsertOrder(savedOrder);
    }
    const mergedOrders = activeOrders.some((o) => o.id === savedOrder.id) ? activeOrders.map((o) => (o.id === savedOrder.id ? savedOrder : o)) : [savedOrder, ...activeOrders];
    if (editingOrderId && removedLineIds.length) await archiveProductsForRemovedOrderLines(editingOrderId, removedLineIds);
    const result = await syncOrderLinesToProducts(savedOrder);
    if (isFirebaseOrdersMode) {
      try {
        await applyOrderSettlement(savedOrder);
      } catch {
        pushToast({ tone: "info", text: "Order saved, but payment-agent settlement failed." });
      }
    }
    await recalculateFromOrders(mergedOrders);
    pushToast({ tone: result.failed ? "info" : "success", text: result.failed ? "Order saved, but generated product sync failed." : `Order ${draft.number} saved and products synced.` });
    setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history");
  };

  const onCancel = () => { setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history"); pushToast({ tone: "info", text: "Draft reset to new order." }); };

  const startEdit = (o: Order) => { setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id))); setDraft(JSON.parse(JSON.stringify(o))); setMode("edit"); };
  const startAdd = () => {
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    if (isFirebaseOrdersMode && firebaseDraftOrders.length) {
      const latest = [...firebaseDraftOrders].sort((a, b) => (b.draftAutosavedAt || b.updatedAt || "").localeCompare(a.draftAutosavedAt || a.updatedAt || ""))[0];
      setDraft(JSON.parse(JSON.stringify(latest)));
      pushToast({ tone: "info", text: "Resumed autosaved draft." });
    } else {
      setDraft(createEmptyDraft(orders, ""));
    }
    setMode("add");
  };
  const drafts = useMemo(() => (isFirebaseOrdersMode ? firebaseDraftOrders : orders.filter((o) => o.status === "draft")), [isFirebaseOrdersMode, orders, firebaseDraftOrders]);


  const handleRemoveLine = (lineId: string) => {
    if (editingOrderId && originalLineIds.has(lineId)) {
      const ok = confirm("Deleting this line will remove/archive the generated product linked to this line after you save changes. Continue?");
      if (!ok) return;
      setRemovedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
    }
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
  };

  const autosaveStatus = useDraftAutosave({ enabled: isFirebaseOrdersMode && (mode === "add" || mode === "edit"), draft, activeUploads, autosaveDraft, onSaved: (saved) => setDraft((d) => ({ ...d, id: saved.id })) });

  const removeOrder = async (o: Order) => {
    if (!confirm("Deleting this order will remove it from order history and remove/archive generated products created from its lines. This may affect Products and Dashboard totals. Continue?")) return;
    if (isFirebaseOrdersMode) {
      try {
        await reverseOrderSettlement(o);
      } catch {
        pushToast({ tone: "danger", text: `Could not reverse payment-agent settlement for ${o.number}. Order was not archived.` });
        return;
      }
      let archiveProductsFailed = false;
      try { await archiveProductsForOrder(o); } catch { archiveProductsFailed = true; }
      await archiveFirebaseOrder(o.id);
      await reloadFirebaseOrders();
      pushToast({ tone: archiveProductsFailed ? "info" : "success", text: archiveProductsFailed ? `Order ${o.number} archived, but generated product archive failed.` : `Order ${o.number} archived and generated products archived.` });
      return;
    }
    deleteOrder(o.id);
    await recalculateFromOrders(orders.filter((x) => x.id !== o.id && x.status === "saved"));
    await archiveProductsForOrder(o);
    pushToast({ tone: "success", text: `Order ${o.number} deleted and related generated products archived.` });
    if (editingOrderId === o.id) onCancel();
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg">
        <div className="flex-1 max-w-md"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search order history..." className="input" /></div>
        <Button size="sm" variant="secondary" onClick={() => pushToast({ tone: "info", text: "This action will be connected in a later phase." })}>Filter</Button>
        <Button size="sm" variant="secondary" onClick={() => pushToast({ tone: "info", text: "This action will be connected in a later phase." })}>Sort</Button>
        <Button size="sm" variant="secondary" onClick={() => pushToast({ tone: "info", text: "This action will be connected in a later phase." })}>View</Button>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("drafts")}>Complete Draft</Button>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {(mode === "add" || mode === "edit") && <>
          {isFirebaseOrdersMode && <div className="text-[11px] text-fg-subtle px-5">{autosaveStatus === "saving" ? "Saving draft..." : autosaveStatus === "saved" ? "Draft saved" : autosaveStatus === "error" ? "Draft autosave failed" : ""}</div>}
          <div className="card p-3 text-[12px] text-fg-subtle">{editingOrder ? `Editing order ${editingOrder.number}` : "Create new order"}</div>
          <OrderForm draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} supplierSuggestions={supplierSuggestions} />
          {!validation.isValid && <div className="card p-3 text-[12px]"><div className="font-semibold mb-1">Missing before Save Order</div><ul className="list-disc pl-5 space-y-0.5 text-fg-subtle">{validation.missingFields.map((item) => <li key={item}>{item}</li>)}{validation.lineIssues.flatMap((line) => line.issues.map((issue) => <li key={`${line.lineId}-${issue}`}>{`Line ${line.lineNumber}: ${issue}`}</li>))}</ul></div>}
          <OrderFooter total={total} onCancel={onCancel} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} saveOrderLabel={editingOrderId ? "Save Changes" : "Save Order"} disableSaveOrder={!validation.isValid} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />
        </>}
        {mode === "drafts" && <section className="card p-4"><div className="font-semibold mb-2">Draft Orders</div>{drafts.length === 0 ? <div className="text-[12px] text-fg-subtle">No draft orders yet.</div> : <div className="space-y-2">{drafts.map((o)=>{ const check = validateOrderForSave(o); const agent = paymentAgents.find((p) => p.id === (o.paymentAgentId || o.paymentBy)); return <div key={o.id} className="rounded border border-border p-3 flex items-center justify-between"><div className="text-[12px]"><div className="font-semibold">{o.number}</div><div className="text-fg-subtle">{formatDate(o.date)} · {o.lines.length} lines · {agent?.name ?? "No payment agent"}</div><div className="text-fg-subtle">{o.wechatId || "No WeChat ID"} · {check.missingFields.length + check.lineIssues.length} missing items</div>{isFirebaseOrdersMode && o.draftAutosavedAt ? <div className="text-fg-subtle">Autosaved: {formatDate(o.draftAutosavedAt)}</div> : null}</div><Button size="sm" variant="secondary" onClick={() => startEdit(o)}>Continue / Complete</Button></div>})}</div>}</section>}

        <section className="card p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing first 10</div></div>
          <div className="space-y-2">{history.length === 0 ? <div className="text-[12px] text-fg-subtle">No orders yet. Click Add Order to create one.</div> : history.map((o) => (
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
