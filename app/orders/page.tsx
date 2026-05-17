"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatDate } from "@/lib/data";
import { Order, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { hasAnyDraftContent, validateOrderForSave } from "@/services/orderValidation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { useCustomers } from "@/hooks/useCustomers";
import { customerLedgerService } from "@/services/customerLedgerService";
import { resolveCustomersForOrderLines } from "@/services/customers/customerResolution";
import { logCustomer, logDB, logError, logLedger, logOrder, logPageAccess, logDataFlow, logPaymentAgent, logProduct } from "@/lib/logger";
import { ensureFinalOrderNumber, peekNextOrderNumber } from "@/services/orderNumberService";

const today = () => new Date().toISOString().slice(0, 10);
const createEmptyDraft = (_orders: Order[], defaultPaymentAgentId = "", reservedOrderNumber = ""): Order => ({
  id: `ord-${Date.now()}`,
  orderNumber: reservedOrderNumber,
  number: reservedOrderNumber,
  date: today(),
  loadingDate: undefined,
  paymentAgentId: defaultPaymentAgentId,
  paymentBy: defaultPaymentAgentId,
  wechatId: "",
  status: "draft",
  paymentStatus: "pending",
  paidToPaymentAgentNow: 0,
  lines: [{ ...newLine(), details: "", marka: "", totalCtns: 0, pcsPerCtn: 0, rmbPerPcs: 0, productPhotoUrl: "", photoUrl: "" }],
});

const meaningfulLine = (l: Order["lines"][number]) => !!(l.details?.trim() || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs);

type OrderSideEffectResult = {
  mode: "create" | "edit" | "archive" | "draft";
  orderSaved: boolean;
  productsSynced: boolean;
  productSyncFailures: { lineId: string; reason: string; errorCode?: string; errorMessage?: string }[];
  paymentSettlementApplied: boolean;
  paymentSettlementReversed: boolean;
  customerReceivablesApplied: boolean;
  customerReceivablesReversed: boolean;
  generatedProductsArchived: boolean;
  blocked: boolean;
  warnings: string[];
  errors: string[];
};

const summarizeOrderForLog = (o: Order) => ({
  id: o.id,
  orderNumber: o.number || o.orderNumber,
  status: o.status,
  date: o.date,
  loadingDate: o.loadingDate,
  wechatId: o.wechatId,
  paymentBy: o.paymentBy,
  paymentAgentId: o.paymentAgentId,
  lineCount: o.lines.length,
  totalAmount: orderTotal(o),
  customerNames: Array.from(new Set(o.lines.map((l) => l.customerName || l.customerSnapshot?.name || "").filter(Boolean))).slice(0, 10),
  supplierNames: Array.from(new Set(o.lines.map((l) => l.supplierName || l.supplierSnapshot?.name || "").filter(Boolean))).slice(0, 10),
  generatedLineIds: o.lines.map((l) => l.id),
  linePhotoFlags: o.lines.map((l) => ({ lineId: l.id, hasProductPhoto: Boolean(l.productPhotoUrl), hasDimensionPhoto: Boolean(l.photoUrl) })),
});

export default function OrdersPage() {
  type OrdersMode = "history" | "add" | "drafts" | "edit";
  useEffect(() => {
    logPageAccess("Orders", { component: "app/orders/page.tsx", source: process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock" });
  }, []);

  const { orders, upsertOrder, deleteOrder, pushToast } = useStore();
  const { data: paymentAgents, recalculateFromOrders, applyOrderSettlement, reverseOrderSettlement } = usePaymentAgents();
  const { data: firebaseOrders, isLoading: isOrdersLoading, error: ordersLoadError, draftOrders: firebaseDraftOrders, autosaveDraft, upsertOrder: upsertFirebaseOrder, archiveOrder: archiveFirebaseOrder, reload: reloadFirebaseOrders } = useOrders();
  const { data: customers, isLoading: isCustomersLoading, reload: reloadCustomers } = useCustomers();
  const ordersDataSource = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock";
  const isFirebaseOrdersMode = ordersDataSource === "firebase";
  const [query, setQuery] = useState("");
  const [activeUploads, setActiveUploads] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Order>(createEmptyDraft(orders));
  const [mode, setMode] = useState<OrdersMode>("history");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const history = useMemo(() => activeOrders.filter((o) => { const q=query.toLowerCase().trim(); if(!q) return true; const supplierText=o.lines.map(l=>l.supplierName || l.supplierSnapshot?.name || "").join(" ").toLowerCase(); const customerText=o.lines.map(l=>l.customerSnapshot?.name || "").join(" ").toLowerCase(); const payment=paymentAgents.find(p=>p.id===o.paymentBy)?.name.toLowerCase()??""; return (o.number || o.orderNumber || "").toLowerCase().includes(q)||o.wechatId.toLowerCase().includes(q)||supplierText.includes(q)||customerText.includes(q)||payment.includes(q); }).slice(0, 10), [activeOrders, query, paymentAgents]);

  const ordersFlowLoggedRef = useRef(false);

  useEffect(() => {
    if (ordersFlowLoggedRef.current) return;
    if (isFirebaseOrdersMode && isOrdersLoading) return;
    if (isCustomersLoading) return;

    if (ordersLoadError) {
      ordersFlowLoggedRef.current = true;
      logError("orders_load_failure", { source: isFirebaseOrdersMode ? "firebase" : "mock", error: ordersLoadError });
      return;
    }

    const allOrders = isFirebaseOrdersMode ? firebaseOrders : orders;
    ordersFlowLoggedRef.current = true;
    logDataFlow("Orders", {
      functionsCalled: ["useOrders.reload", "useCustomers.reload", "ordersService.listOrders", "customersService.listCustomers"],
      dbPaths: ["businesses/{businessId}/orders", "businesses/{businessId}/customers"],
      result: { count: allOrders.length, reachedComponent: true, renderedRows: history.length },
      counts: { saved: allOrders.filter((o) => o.status === "saved").length, draft: allOrders.filter((o) => o.status === "draft").length, archived: allOrders.filter((o) => o.status === "archived").length },
      customersLoadedCount: customers.length,
      sampleOrders: history.slice(0, 5).map(summarizeOrderForLog),
      query: query.trim() || undefined,
    });
  }, [isFirebaseOrdersMode, isOrdersLoading, isCustomersLoading, ordersLoadError, firebaseOrders, orders, history, query, customers.length]);
  const editingOrder = editingOrderId ? activeOrders.find((o) => o.id === editingOrderId) ?? null : null;
  const wechatSuggestions = useMemo(() => Array.from(new Set(activeOrders.map((o) => o.wechatId.trim()).filter(Boolean))).slice(0, 5), [activeOrders]);
  const supplierSuggestions = useMemo(() => {
    const fromOrders = activeOrders.flatMap((o) => o.lines.map((l) => (l.supplierName?.trim() || l.supplierSnapshot?.name || "").trim()));
    return Array.from(new Set(fromOrders.filter(Boolean))).slice(0, 5);
  }, [activeOrders]);
  const customerSuggestions = useMemo(() => {
    const fromCustomerRows = customers.map((c) => c.name?.trim()).filter(Boolean) as string[];
    const fromOrders = activeOrders.flatMap((o) => o.lines.map((l) => (l.customerName || l.customerSnapshot?.name || "").trim())).filter(Boolean) as string[];
    return Array.from(new Set([...fromCustomerRows, ...fromOrders])).slice(0, 20);
  }, [customers, activeOrders]);
  const selectedPaymentAgentId = draft.paymentAgentId || draft.paymentBy;
  const selectedPaymentAgent = paymentAgents.find((p) => p.id === selectedPaymentAgentId || p.name === selectedPaymentAgentId || p.agentCode === selectedPaymentAgentId) ?? null;
  const settlement = useMemo(() => calculatePaymentAgentSettlement({ orderTotal: total, existingCredit: selectedPaymentAgent?.creditBalance ?? 0, paidNow: draft.paidToPaymentAgentNow ?? 0 }), [total, selectedPaymentAgent, draft.paidToPaymentAgentNow]);
  const validation = useMemo(() => validateOrderForSave(draft), [draft]);

  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const onSave = async (status: Order["status"]) => {
    logDataFlow("Orders", JSON.stringify({ event: status === "draft" ? "draft_save_started" : "order_save_started", status, lineCount: draft.lines.length, displayedOrderNumber: draft.number || draft.orderNumber }, null, 2));
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });

    if (status === "draft") {
      if (!hasAnyDraftContent(draft)) return pushToast({ tone: "info", text: "Add some order details before saving a draft." });
      const draftOrder = { ...draft, number: "", orderNumber: "", status: "draft" as const, paymentAgentId: selectedPaymentAgentId, paymentBy: selectedPaymentAgentId };
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
      logDataFlow("Orders", JSON.stringify({ event: "draft_save_completed", orderId: draftOrder.id, persistedOrderNumber: "" }, null, 2));
      return pushToast({ tone: "success", text: "Draft saved. Use Complete Draft to finish it." });
    }

    logOrder("save_validation_result", { isValid: validation.isValid, missing: validation.missingFields.length, lineIssues: validation.lineIssues.length });
    if (!validation.isValid) {
      pushToast({ tone: "danger", text: "Complete required fields before saving as order, or save as draft." });
      return;
    }

    if (editingOrderId && !confirm("Updating this order can update generated products, order history, and dashboard totals. Continue?")) return;

    const now = new Date().toISOString();
    logOrder("save_order_lines_before_resolution", { lines: draft.lines.map((l) => ({ lineId: l.id, customerId: l.customerId, customerName: l.customerName, lineTotal: (l.totalCtns||0)*(l.pcsPerCtn||0)*(l.rmbPerPcs||0) })) });
    let resolvedLines = draft.lines;
    try {
      resolvedLines = await resolveCustomersForOrderLines(draft.lines, customers, now);
      const knownIds = new Set(customers.map((c) => c.id));
      const affectedCustomerIds = Array.from(new Set(resolvedLines.map((l) => l.customerId).filter(Boolean)));
      const createdCustomerIds = affectedCustomerIds.filter((id) => !knownIds.has(id));
      const reusedCustomerIds = affectedCustomerIds.filter((id) => knownIds.has(id));
      logCustomer("save_order_customer_resolution_summary", { affectedCustomerIds, createdCustomerIds, reusedCustomerIds });
      logOrder("customer_resolution_success", { resolvedLines: resolvedLines.length });
    } catch (e) {
      logError("customer_resolution_failure", { error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    const finalOrderNumber = await ensureFinalOrderNumber({ ...draft, status: "saved" as const });
    const savedOrder = { ...draft, number: finalOrderNumber, orderNumber: finalOrderNumber, lines: resolvedLines, status: "saved" as const, paymentAgentId: selectedPaymentAgentId, paymentBy: selectedPaymentAgentId, paymentAgentSettlementSnapshot: { ...settlement, orderTotal: settlement.orderTotal, existingCredit: settlement.existingCredit, paymentAgentId: selectedPaymentAgentId, paymentAgentName: selectedPaymentAgent?.name, updatedAt: now, createdAt: draft.paymentAgentSettlementSnapshot?.createdAt || now } };
    try {
      if (isFirebaseOrdersMode) {
        await upsertFirebaseOrder(savedOrder as any);
        await reloadFirebaseOrders();
      } else {
        upsertOrder(savedOrder);
      }
      logDB("upsert_order_success", { orderId: savedOrder.id, status: savedOrder.status });
    } catch (e) {
      logError("upsert_order_failure", { orderId: savedOrder.id, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    const mergedOrders = activeOrders.some((o) => o.id === savedOrder.id) ? activeOrders.map((o) => (o.id === savedOrder.id ? savedOrder : o)) : [savedOrder, ...activeOrders];
    logCustomer("skipped_unrelated_customer_upserts", { reason: "normal_save_should_not_rewrite_unrelated_customers", affectedCustomerIds: Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean))) });
    const result: OrderSideEffectResult = { mode: editingOrderId ? "edit" : "create", orderSaved: true, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: !isFirebaseOrdersMode, paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: editingOrderId ? false : true, blocked: false, warnings: [], errors: [] };
    const affectedCustomerIds = Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean)));
    const generatedProductIds = savedOrder.lines.map((l) => `order-line-${savedOrder.id}-${l.id}`);
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: savedOrder.id, orderNumber: savedOrder.number, mode: result.mode, affectedCustomerIds, affectedPaymentAgentId: savedOrder.paymentAgentId || savedOrder.paymentBy, generatedProductIds }, null, 2));

    if (editingOrderId && removedLineIds.length) {
      try { await archiveProductsForRemovedOrderLines(editingOrderId, removedLineIds); result.generatedProductsArchived = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "archive_removed_line_products", success: true }, null, 2)); }
      catch (e) { result.generatedProductsArchived = false; result.warnings.push("Removed-line product archive failed."); logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "archive_removed_line_products", error: e instanceof Error ? e.message : String(e) }); }
    }

    try {
      const sync = await syncOrderLinesToProducts(savedOrder);
      result.productsSynced = sync.failed === 0;
      result.productSyncFailures = sync.failures.map((f) => ({ lineId: f.lineId, reason: f.reason, errorCode: f.errorCode, errorMessage: f.errorMessage }));
      if (!result.productsSynced) result.warnings.push(`Product sync failed for ${sync.failed} line(s).`);
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "sync_products", success: result.productsSynced, productSyncFailures: result.productSyncFailures }, null, 2));
    } catch (e) {
      result.productsSynced = false;
      result.warnings.push("Product sync failed.");
      logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "sync_products", error: e instanceof Error ? e.message : String(e) });
    }

    if (isFirebaseOrdersMode) {
      try { await applyOrderSettlement(savedOrder); result.paymentSettlementApplied = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", success: true }, null, 2)); }
      catch (e) { result.paymentSettlementApplied = false; result.warnings.push(`Payment-agent settlement failed: ${e instanceof Error ? e.message : String(e)}`); logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", error: e instanceof Error ? e.message : String(e) }); }
    }

    try { await customerLedgerService.applyOrderCustomerReceivables(savedOrder as any); result.customerReceivablesApplied = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", success: true }, null, 2)); }
    catch (e) { result.customerReceivablesApplied = false; result.warnings.push(`Customer receivable update failed: ${e instanceof Error ? e.message : String(e)}`); logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", error: e instanceof Error ? e.message : String(e) }); }

    await recalculateFromOrders(mergedOrders);
    await reloadCustomers();
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: savedOrder.id, orderNumber: savedOrder.number, ...result }, null, 2));

    if (result.warnings.length === 0) pushToast({ tone: "success", text: "Order saved successfully." });
    else if (result.productSyncFailures.length) pushToast({ tone: "info", text: `Order saved, but product sync failed for ${result.productSyncFailures.length} line.` });
    else if (!result.customerReceivablesApplied) pushToast({ tone: "info", text: "Order saved, but customer receivable update failed." });
    else if (!result.paymentSettlementApplied) pushToast({ tone: "info", text: "Order saved, but payment-agent settlement failed." });
    else pushToast({ tone: "info", text: `Order saved with warnings: ${result.warnings[0]}` });
    setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history");
  };

  const onCancel = () => { setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history"); pushToast({ tone: "info", text: "Draft reset to new order." }); };
  const changeOrderStatus = async (order: Order, nextStatus: Order["status"]) => {
    setStatusUpdatingId(order.id);
    const updated = { ...order, status: nextStatus, updatedAt: new Date().toISOString() };
    if (isFirebaseOrdersMode) {
      await upsertFirebaseOrder(updated as any);
      await reloadFirebaseOrders();
    } else {
      upsertOrder(updated);
    }
    setStatusUpdatingId(null);
  };

  const startEdit = async (o: Order) => {
    setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id)));
    const copy = JSON.parse(JSON.stringify(o));
    if (copy.status === "draft") {
      const peek = await peekNextOrderNumber();
      copy.number = peek;
      copy.orderNumber = peek;
    }
    setDraft(copy);
    setMode("edit");
  };
  const startAdd = async () => {
    logDataFlow("Orders", JSON.stringify({ event: "add_order_started" }, null, 2));
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    try {
      const reserved = await peekNextOrderNumber();
      const nextDraft = createEmptyDraft(orders, "", reserved);
      setDraft(nextDraft);
      setMode("add");
      logDataFlow("Orders", JSON.stringify({ event: "add_order_fresh_form_opened", orderId: nextDraft.id, orderNumber: nextDraft.number || nextDraft.orderNumber }, null, 2));
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not allocate order number." });
    }
  };
  const drafts = useMemo(() => (isFirebaseOrdersMode ? firebaseDraftOrders : orders.filter((o) => o.status === "draft")), [isFirebaseOrdersMode, orders, firebaseDraftOrders]);
  const formatPlainAmount = (value: number) =>
    value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const getPaymentAgentName = (order: Order) =>
    paymentAgents.find((p) => p.id === (order.paymentAgentId || order.paymentBy) || p.id === order.paymentBy)?.name
    || order.paymentAgentSnapshot?.name
    || "—";
  const getTotalCtns = (order: Order) => order.lines.reduce((sum, line) => sum + (Number(line.totalCtns) || 0), 0);


  const handleRemoveLine = (lineId: string) => {
    if (editingOrderId && originalLineIds.has(lineId)) {
      const ok = confirm("Deleting this line will remove/archive the generated product linked to this line after you save changes. Continue?");
      if (!ok) return;
      setRemovedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
    }
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
  };

  const autosaveStatus = useDraftAutosave({ enabled: isFirebaseOrdersMode && (mode === "add" || mode === "edit"), draft: { ...draft, number: "", orderNumber: "" }, activeUploads, autosaveDraft, onSaved: (saved) => setDraft((d) => ({ ...d, id: saved.id })) });

  const removeOrder = async (o: Order) => {
    if (!confirm("Deleting this order will remove it from order history and remove/archive generated products created from its lines. This may affect Products and Dashboard totals. Continue?")) return;
    if (isFirebaseOrdersMode) {
      const result: OrderSideEffectResult = { mode: "archive", orderSaved: false, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: false, paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: false, blocked: false, warnings: [], errors: [] };
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "archive" }, null, 2));
      try { await reverseOrderSettlement(o); result.paymentSettlementReversed = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: o.id, mode: "archive", step: "reverse_payment_settlement", success: true }, null, 2)); }
      catch (e) { result.blocked = true; result.errors.push("Archive blocked because payment-agent reversal failed."); logError("order_side_effect_step_failed", { orderId: o.id, mode: "archive", step: "reverse_payment_settlement", error: e instanceof Error ? e.message : String(e) }); pushToast({ tone: "danger", text: "Archive blocked because payment-agent reversal failed." }); return; }
      try { await customerLedgerService.reverseOrderCustomerReceivables(o as any); result.customerReceivablesReversed = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: o.id, mode: "archive", step: "reverse_customer_receivables", success: true }, null, 2)); }
      catch (e) { result.blocked = true; result.errors.push("Archive blocked because customer receivable reversal failed."); logError("order_side_effect_step_failed", { orderId: o.id, mode: "archive", step: "reverse_customer_receivables", error: e instanceof Error ? e.message : String(e) }); pushToast({ tone: "danger", text: "Archive blocked because customer receivable reversal failed." }); return; }
      try { await archiveProductsForOrder(o); result.generatedProductsArchived = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: o.id, mode: "archive", step: "archive_generated_products", success: true }, null, 2)); }
      catch (e) { result.generatedProductsArchived = false; result.warnings.push("Generated product archive failed."); logError("order_side_effect_step_failed", { orderId: o.id, mode: "archive", step: "archive_generated_products", error: e instanceof Error ? e.message : String(e) }); }
      await archiveFirebaseOrder(o.id);
      await reloadFirebaseOrders();
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: o.id, orderNumber: o.number || o.orderNumber, ...result }, null, 2));
      pushToast({ tone: result.warnings.length ? "info" : "success", text: result.warnings.length ? `Order ${o.number || o.orderNumber} archived, but generated product archive failed.` : `Order ${o.number || o.orderNumber} archived successfully.` });
      return;
    }
    deleteOrder(o.id);
    await recalculateFromOrders(orders.filter((x) => x.id !== o.id && x.status === "saved"));
    await archiveProductsForOrder(o);
    pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} deleted and related generated products archived.` });
    if (editingOrderId === o.id) onCancel();
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg">
        <div className="flex-1 max-w-md"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search order history..." className="input" /></div>
        <Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase.">Filter</Button>
        <Button size="sm" variant="secondary" disabled title="Sorting is not enabled in this phase.">Sort</Button>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("drafts")}>Draft ({drafts.length})</Button>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {(mode === "add" || mode === "edit") && <>
          {isFirebaseOrdersMode && <div className="text-[11px] text-fg-subtle px-5">{autosaveStatus === "saving" ? "Saving draft..." : autosaveStatus === "saved" ? "Draft saved" : autosaveStatus === "error" ? "Draft autosave failed" : ""}</div>}
          <div className="card p-3 text-[12px] text-fg-subtle">{editingOrder ? `Editing order ${editingOrder.number || editingOrder.orderNumber}` : "Create new order"}</div>
          <OrderForm draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} supplierSuggestions={supplierSuggestions} customerSuggestions={customerSuggestions} />
          {!validation.isValid && <div className="card p-3 text-[12px]"><div className="font-semibold mb-1">Missing before Save Order</div><ul className="list-disc pl-5 space-y-0.5 text-fg-subtle">{validation.missingFields.map((item) => <li key={item}>{item}</li>)}{validation.lineIssues.flatMap((line) => line.issues.map((issue) => <li key={`${line.lineId}-${issue}`}>{`Line ${line.lineNumber}: ${issue}`}</li>))}</ul></div>}
          <OrderFooter total={total} onCancel={onCancel} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={editingOrderId ? "Save Changes" : "Save Order"} disableSaveOrder={!validation.isValid} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />
        </>}
        {mode === "drafts" && <section className="card p-4"><div className="font-semibold mb-2">Draft Orders</div>{drafts.length === 0 ? <div className="text-[12px] text-fg-subtle">No draft orders yet.</div> : <div className="space-y-2">{drafts.map((o)=>{ const check = validateOrderForSave(o); return <div key={o.id} className="rounded border border-border p-3 flex items-center justify-between gap-3"><div className="text-[12px] space-y-0.5"><div className="font-semibold">{o.number || o.orderNumber || "Draft"}</div><div className="text-fg-subtle">WeChat ID: {o.wechatId || "—"} · Payment Agent: {getPaymentAgentName(o)}</div><div className="text-fg-subtle">{o.lines.length} lines · {getTotalCtns(o)} CTNS · {formatPlainAmount(orderTotal(o))}</div><div className="text-fg-subtle">{isFirebaseOrdersMode && o.draftAutosavedAt ? `Autosaved ${formatDate(o.draftAutosavedAt)}` : `Updated ${formatDate(o.updatedAt || o.date)}`} · {check.missingFields.length + check.lineIssues.length} missing items</div></div><div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={async () => { logDataFlow("Orders", JSON.stringify({ event: "complete_draft_opened", orderId: o.id, orderNumber: o.number || o.orderNumber }, null, 2)); await startEdit(o); }}>Continue</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button></div></div>})}</div>}</section>}

        <section className="card p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing first 10</div></div>
          <div className="space-y-2">{history.length === 0 ? <div className="text-[12px] text-fg-subtle">No orders yet. Click Add Order to create one.</div> : history.map((o) => (
            <div key={o.id} className="rounded border border-border p-3 flex items-center justify-between gap-3">
              <div className="text-[12px] space-y-1">
                <div className="font-semibold">{o.number || o.orderNumber || "Draft"} — {o.wechatId || "—"}</div>
                <div className="text-fg-subtle">Payment Agent: {getPaymentAgentName(o)}</div>
                <div className="flex items-center gap-1.5">
                  {o.lines.slice(0, 5).map((line) => {
                    const photo = line.productPhotoUrl || line.photoUrl || "";
                    const label = line.marka?.trim() || line.details?.trim() || "Product";
                    return photo ? <img key={line.id} src={photo} alt={label} title={label} className="h-7 w-7 rounded border border-border object-cover" /> : <div key={line.id} title={label} className="grid h-7 w-7 place-items-center rounded border border-dashed border-border text-[10px] text-fg-subtle">—</div>;
                  })}
                  {o.lines.length > 5 ? <span className="text-[11px] text-fg-subtle">+{o.lines.length - 5}</span> : null}
                </div>
                <div className="text-fg-subtle">{getTotalCtns(o)} CTNS · {formatPlainAmount(orderTotal(o))}</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="date" className="input h-8 text-[12px]" value={o.loadingDate ?? ""} onChange={(e) => { const updated = { ...o, loadingDate: e.target.value, updatedAt: new Date().toISOString() }; if (isFirebaseOrdersMode) { upsertFirebaseOrder(updated as any).then(reloadFirebaseOrders); } else { upsertOrder(updated); } }} />
                {o.status !== "draft" && o.status !== "archived" ? <select className="input h-8 text-[12px]" value={o.status} disabled={statusUpdatingId === o.id} onChange={(e) => changeOrderStatus(o, e.target.value as Order["status"])}><option value="saved">saved</option><option value="loading">loading</option><option value="shipped">shipped</option><option value="received">received</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select> : <span className="text-[11px] text-fg-subtle">{o.status}</span>}
                <Button size="sm" variant="secondary" onClick={() => setViewOrder(o)}>View</Button><Button size="sm" variant="secondary" onClick={() => startEdit(o)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button>
              </div>
            </div>
          ))}</div>
        </section>
      </main>
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} />
    </div>
  );
}
