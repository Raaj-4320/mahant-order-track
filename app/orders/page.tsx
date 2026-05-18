"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatDate } from "@/lib/data";
import { formatIndianDateTime } from "@/lib/dateFormat";
import { Order, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
import { ArrowUpDown, Bell, CalendarDays, ChevronDown, Eye, Filter, LayoutGrid, List, Moon, Search, SquarePen, Sun, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/ThemeProvider";

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
  const [hasAttemptedFinalSave, setHasAttemptedFinalSave] = useState(false);
  const [showDraftIncompleteConfirm, setShowDraftIncompleteConfirm] = useState(false);
  const [validationWarning, setValidationWarning] = useState<{ visible: boolean; items: string[] }>({ visible: false, items: [] });
  const isOrderModalOpen = mode === "add" || mode === "edit";
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerPaymentQuery, setHeaderPaymentQuery] = useState("");
  const [headerPaymentOpen, setHeaderPaymentOpen] = useState(false);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle } = useTheme();

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
  const headerPaymentSuggestions = useMemo(() => {
    const q = headerPaymentQuery.trim().toLowerCase();
    return paymentAgents.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.agentCode || "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 4);
  }, [paymentAgents, headerPaymentQuery]);
  const paymentLabel = (p: any) => (p.creditBalance ?? 0) > 0 ? `${p.name} — Credit: ${(p.creditBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : p.name;
  useEffect(() => {
    if (headerPaymentOpen) return;
    setHeaderPaymentQuery(selectedPaymentAgent ? paymentLabel(selectedPaymentAgent) : "");
  }, [selectedPaymentAgent, headerPaymentOpen]);


  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const onSave = async (status: Order["status"], forceDraft = false) => {
    logDataFlow("Orders", JSON.stringify({ event: status === "draft" ? "draft_save_started" : "order_save_started", status, lineCount: draft.lines.length, displayedOrderNumber: draft.number || draft.orderNumber }, null, 2));
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });

    if (status === "draft") {
      if (!hasAnyDraftContent(draft)) return pushToast({ tone: "info", text: "Add at least one field before saving a draft." });
      if (!forceDraft && !validation.isValid) {
        setShowDraftIncompleteConfirm(true);
        return;
      }
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
      setHasAttemptedFinalSave(false);
      setShowDraftIncompleteConfirm(false);
      setValidationWarning({ visible: false, items: [] });
      logDataFlow("Orders", JSON.stringify({ event: "draft_save_completed", orderId: draftOrder.id, persistedOrderNumber: "" }, null, 2));
      return pushToast({ tone: "success", text: "Draft saved. Use Complete Draft to finish it." });
    }

    setHasAttemptedFinalSave(true);
    logOrder("save_validation_result", { isValid: validation.isValid, missing: validation.missingFields.length, lineIssues: validation.lineIssues.length });
    if (!validation.isValid) {
      const missingItems = [
        ...validation.missingFields.map((item) => `${item}.`),
        ...validation.lineIssues.flatMap((line) => line.issues.map((issue) => `Line ${line.lineNumber}: ${issue}.`)),
      ];
      setValidationWarning({ visible: true, items: missingItems });
      return;
    }


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
    setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history"); setHasAttemptedFinalSave(false); setValidationWarning({ visible: false, items: [] });
  };

  const onCancel = () => { setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders, "")); setMode("history"); setHasAttemptedFinalSave(false); setShowDraftIncompleteConfirm(false); setValidationWarning({ visible: false, items: [] }); pushToast({ tone: "info", text: "Draft reset to new order." }); };
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
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setValidationWarning({ visible: false, items: [] });
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
      setHasAttemptedFinalSave(false);
      setShowDraftIncompleteConfirm(false);
      setValidationWarning({ visible: false, items: [] });
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
  const fmtDateTime = (order: Order) => {
    const raw = order.date || order.createdAt || order.updatedAt;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return formatDate(raw);
    return formatIndianDateTime(d);
  };


  const handleRemoveLine = (lineId: string) => {
    if (editingOrderId && originalLineIds.has(lineId)) {
      setRemovedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
    }
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
  };

  const autosaveStatus = useDraftAutosave({ enabled: isFirebaseOrdersMode && (mode === "add" || mode === "edit"), draft: { ...draft, number: "", orderNumber: "" }, activeUploads, autosaveDraft, onSaved: (saved) => setDraft((d) => ({ ...d, id: saved.id })) });

  const removeOrder = async (o: Order) => {
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

  useEffect(() => {
    if (!validationWarning.visible) return;
    const timer = window.setTimeout(() => setValidationWarning((prev) => ({ ...prev, visible: false })), 5000);
    return () => window.clearTimeout(timer);
  }, [validationWarning.visible, validationWarning.items]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    if (pickerOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border bg-bg">
        <div className="min-w-[280px] flex-1 max-w-xl"><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search orders, suppliers, customers..." leadingIcon={<Search size={15} />} /></div>
        <div className="relative" ref={pickerRef}>
          <Button size="sm" onClick={() => setPickerOpen((v) => !v)}><List size={14} /><span className="text-fg-muted">Order</span><span className="font-semibold">{(editingOrder?.number || draft.number || history[0]?.number || "—")}</span><ChevronDown size={13} /></Button>
          {pickerOpen && <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card max-h-[320px] overflow-y-auto">{activeOrders.slice(0,30).map((o) => <button key={o.id} onClick={() => { setPickerOpen(false); startEdit(o); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors"><div className="flex items-center justify-between"><span className="font-semibold">{o.number || o.orderNumber || "Draft"}</span><span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span></div><div className="mt-0.5 text-[11.5px] text-fg-muted">{o.lines.length} lines · {formatPlainAmount(orderTotal(o))}</div></button>)}</div>}
        </div>
        <Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase."><Filter size={14} />Filter</Button>
        <Button size="sm" variant="secondary" disabled title="Sorting is not enabled in this phase."><ArrowUpDown size={14} />Sort</Button>
        <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">{([{ v: "list", I: List }, { v: "grid", I: LayoutGrid }, { v: "calendar", I: CalendarDays }] as const).map(({ v, I }) => <button key={v} onClick={() => setView(v)} className={cn("grid h-6 w-7 place-items-center rounded-md text-fg-muted transition-colors", view===v && "bg-brand text-brand-fg")}><I size={13} /></button>)}</div>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("drafts")}>Draft ({drafts.length})</Button>
        <button aria-label="Notifications" className="relative grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"><Bell size={14} /></button>
        <button aria-label="Toggle theme" onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {mode === "drafts" && <section className="card p-4"><div className="font-semibold mb-2">Draft Orders</div>{drafts.length === 0 ? <div className="text-[12px] text-fg-subtle">No draft orders yet.</div> : <div className="space-y-2">{drafts.map((o)=>{ const check = validateOrderForSave(o); return <div key={o.id} className="rounded border border-border p-3 flex items-center justify-between gap-3"><div className="text-[12px] space-y-0.5"><div className="font-semibold">{o.number || o.orderNumber || "Draft"}</div><div className="text-fg-subtle">WeChat ID: {o.wechatId || "—"} · Payment Agent: {getPaymentAgentName(o)}</div><div className="text-fg-subtle">{o.lines.length} lines · {getTotalCtns(o)} CTNS · {formatPlainAmount(orderTotal(o))}</div><div className="text-fg-subtle">{isFirebaseOrdersMode && o.draftAutosavedAt ? `Autosaved ${formatDate(o.draftAutosavedAt)}` : `Updated ${formatDate(o.updatedAt || o.date)}`} · {check.missingFields.length + check.lineIssues.length} missing items</div></div><div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={async () => { logDataFlow("Orders", JSON.stringify({ event: "complete_draft_opened", orderId: o.id, orderNumber: o.number || o.orderNumber }, null, 2)); await startEdit(o); }}>Continue</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button></div></div>})}</div>}</section>}

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing first {history.length} of {activeOrders.length}</div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Order Number</th><th>Payment Agent</th><th>WeChat ID</th><th>Products</th><th>Total CTNS</th><th>Total Amount</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</td></tr> : history.map((o) => {
                  const productCount = o.lines.length;
                  return <tr key={o.id} className="border-t border-border/80 hover:bg-bg-subtle/40">
                    <td className="px-4 py-3"><div className="font-semibold">{o.number || o.orderNumber || "Draft"}</div><div className="text-[11.5px] text-fg-subtle">{fmtDateTime(o)}</div></td>
                    <td><div>{getPaymentAgentName(o)}</div></td>
                    <td>{o.wechatId || <span className="text-fg-subtle">No WeChat ID</span>}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {o.lines.slice(0, 3).map((line) => {
                          const photo = (line as any).productPhotoUrl || (line as any).productImage || (line as any).image || line.photoUrl || "";
                          const label = line.marka?.trim() || line.details?.trim() || "Product";
                          return photo ? <img key={line.id} src={photo} alt={label} title={label} className="h-8 w-8 rounded border border-border object-cover" /> : <div key={line.id} title={label} className="grid h-8 w-8 place-items-center rounded border border-dashed border-border text-[10px] text-fg-subtle">—</div>;
                        })}
                        {o.lines.length > 3 ? <span className="text-[11px] text-fg-subtle rounded-full border border-border px-1.5 py-0.5">+{o.lines.length - 3}</span> : null}
                      </div>
                      <div className="text-[11px] text-fg-subtle mt-0.5">{productCount} {productCount === 1 ? "Product" : "Products"}</div>
                    </td>
                    <td><div className="font-semibold">{getTotalCtns(o)}</div><div className="text-[11px] text-fg-subtle">{productCount} {productCount === 1 ? "Product" : "Products"}</div></td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatPlainAmount(orderTotal(o))}</td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1.5">
                        <input type="date" className="input h-8 text-[12px] w-[138px]" value={o.loadingDate ?? ""} onChange={(e) => { const updated = { ...o, loadingDate: e.target.value, updatedAt: new Date().toISOString() }; if (isFirebaseOrdersMode) { upsertFirebaseOrder(updated as any).then(reloadFirebaseOrders); } else { upsertOrder(updated); } }} />
                        {o.status !== "draft" && o.status !== "archived" ? <select className="input h-8 text-[12px] w-[108px]" value={o.status} disabled={statusUpdatingId === o.id} onChange={(e) => changeOrderStatus(o, e.target.value as Order["status"])}><option value="saved">saved</option><option value="loading">loading</option><option value="shipped">shipped</option><option value="received">received</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select> : <span className="text-[11px] text-fg-subtle">{o.status}</span>}
                        <Button size="sm" variant="secondary" title="View" onClick={() => setViewOrder(o)}><Eye size={13} /></Button>
                        <Button size="sm" variant="secondary" title="Edit" onClick={() => startEdit(o)}><SquarePen size={13} /></Button>
                        <Button size="sm" variant="secondary" title="Delete" onClick={() => removeOrder(o)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {isOrderModalOpen && <div className="fixed inset-0 z-50 bg-black/45 p-3 md:p-6" onClick={onCancel}>
        <div className="relative mx-auto w-full max-w-[1400px] h-[90vh] rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-border px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold">{editingOrder ? (editingOrder.status === "draft" ? "Complete Draft" : "Edit Order") : "Add Order"}</h3>
                {isFirebaseOrdersMode && <div className="text-[11px] text-fg-subtle mt-0.5">{autosaveStatus === "saving" ? "Saving draft..." : autosaveStatus === "saved" ? "Draft saved" : autosaveStatus === "error" ? "Draft autosave failed" : ""}</div>}
              </div>
              <Button size="sm" variant="secondary" onClick={onCancel}>✕</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[minmax(220px,0.8fr)_minmax(145px,0.55fr)_minmax(160px,0.55fr)_minmax(220px,0.8fr)]">
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Payment By</span><div className="relative"><Input value={headerPaymentQuery} onFocus={() => setHeaderPaymentOpen(true)} onBlur={() => window.setTimeout(() => setHeaderPaymentOpen(false),120)} onChange={(e)=>{const next=e.target.value; setHeaderPaymentQuery(next); setHeaderPaymentOpen(true); setDraft((d)=>({...d,paymentBy:next,paymentAgentId:""}));}} placeholder="Search payment agent" />{headerPaymentOpen && headerPaymentSuggestions.length>0 ? <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">{headerPaymentSuggestions.map((p)=><button key={p.id} type="button" className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderPaymentOpen(false); const label=paymentLabel(p); setHeaderPaymentQuery(label); setDraft((d)=>({...d,paymentBy:p.id,paymentAgentId:p.id}));}}>{paymentLabel(p)}</button>)}</div>:null}</div></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Date</span><Input type="date" value={draft.date} onChange={(e)=>setDraft((d)=>({...d,date:e.target.value}))} /></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Order Number</span><Input value={draft.number} readOnly /></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>WeChat ID</span><Input value={draft.wechatId} onChange={(e)=>setDraft((d)=>({...d,wechatId:e.target.value}))} /></label>
            </div>
          </div>
          {validationWarning.visible ? <div className="absolute left-1/2 top-[84px] z-[70] w-[92%] max-w-[560px] -translate-x-1/2 rounded-xl border border-amber-400 bg-amber-50 p-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-amber-900">Missing before Save Order</div>
                <ul className="mt-1 list-disc pl-5 text-[12px] text-amber-800 space-y-0.5">{validationWarning.items.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul>
              </div>
              <button className="text-amber-800 text-xs rounded px-1 py-0.5 hover:bg-amber-100" onClick={() => setValidationWarning({ visible: false, items: [] })}>✕</button>
            </div>
          </div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderForm showOrderInfo={false} draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} supplierSuggestions={supplierSuggestions} customerSuggestions={customerSuggestions} />
          </div>
          <OrderFooter total={total} onCancel={onCancel} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={editingOrderId ? "Save Changes" : "Save Order"} disableSaveOrder={false} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />
        </div>
      </div>}
      {showDraftIncompleteConfirm && <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Save incomplete draft?</div><div className="text-sm text-fg-subtle">This draft has empty required fields. Save it anyway?</div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowDraftIncompleteConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => onSave("draft", true)}>Save Draft Anyway</Button></div></div></div>}
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} />
    </div>
  );
}
