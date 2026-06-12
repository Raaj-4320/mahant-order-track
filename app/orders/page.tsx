"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatDate } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import { Order, PaymentAgent, orderTotal } from "@/lib/types";
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
import { logCustomer, logDB, logError, logOrder, logPageAccess, logDataFlow } from "@/lib/logger";
import { ensureFinalOrderNumber, peekNextOrderNumber } from "@/services/orderNumberService";
import { ArrowUpDown, Bell, CalendarDays, ChevronDown, Eye, Filter, LayoutGrid, List, Moon, Search, SquarePen, Sun, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { useTheme } from "@/components/ThemeProvider";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import { LoadingDateControl } from "@/components/orders/LoadingDateControl";
import { OrderStatusControl } from "@/components/orders/OrderStatusControl";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import { getLineDetailsParts, joinLineDetails, seedDetailBoxesFromLegacy, withDerivedLegacyDetails } from "@/lib/orderLineDetails";
import { orderLifecycleService } from "@/services/orderLifecycleService";

const today = () => new Date().toISOString().slice(0, 10);
const createEmptyDraft = (_orders: Order[], reservedOrderNumber = ""): Order => ({
  id: `ord-${Date.now()}`,
  orderNumber: reservedOrderNumber,
  number: reservedOrderNumber,
  date: today(),
  loadingDate: undefined,
  paymentAgentId: "",
  paymentBy: "",
  wechatId: "",
  status: "draft",
  paymentStatus: "pending",
  paidToPaymentAgentNow: 0,
  lines: [{ ...newLine(), details: "", marka: "", totalCtns: 0, pcsPerCtn: 0, rmbPerPcs: 0, productPhotoUrl: "", photoUrl: "" }],
});

const meaningfulLine = (l: Order["lines"][number]) => !!(joinLineDetails(l) || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs);

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

type RowEditState = {
  loadingDate: string | undefined;
  status: Order["status"];
  saving: boolean;
};
const STATUS_OPTIONS_WITH_DATE: Array<{ value: Order["status"]; label: string }> = [
  { value: "packed", label: "Loaded" },
  { value: "received", label: "Received" },
  { value: "delayed", label: "Delayed" },
  { value: "cancelled", label: "Cancelled" },
];
const STATUS_OPTIONS_NO_DATE: Array<{ value: Order["status"]; label: string }> = [{ value: "saved", label: "Saved" }];

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

const normalizePaymentAgentValue = (value?: string) => (value || "").trim().toLowerCase();

export default function OrdersPage() {
  type OrdersMode = "history" | "add" | "drafts" | "edit";
  const ordersSourceSelection = useMemo(() => ordersDataSourceSelection(), []);
  const ordersDataSource = ordersSourceSelection.source;
  const isFirebaseOrdersMode = ordersDataSource === "firebase";
  useEffect(() => {
    logPageAccess("Orders", { component: "app/orders/page.tsx", source: ordersSourceSelection.source, sourceReason: ordersSourceSelection.reason });
}, [ordersSourceSelection]);

  const { orders, upsertOrder, deleteOrder, pushToast } = useStore();
  const { data: paymentAgents, recalculateFromOrders, applyOrderSettlement, reverseOrderSettlement, upsertPaymentAgent, reload: reloadPaymentAgents } = usePaymentAgents();
  const { data: firebaseOrders, isLoading: isOrdersLoading, error: ordersLoadError, draftOrders: firebaseDraftOrders, autosaveDraft, upsertOrder: upsertFirebaseOrder, reload: reloadFirebaseOrders } = useOrders();
  const { data: customers, isLoading: isCustomersLoading, reload: reloadCustomers } = useCustomers();
  const [query, setQuery] = useState("");
  const [activeUploads, setActiveUploads] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Order>(createEmptyDraft(orders));
  const [mode, setMode] = useState<OrdersMode>("history");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [hasAttemptedFinalSave, setHasAttemptedFinalSave] = useState(false);
  const [showDraftIncompleteConfirm, setShowDraftIncompleteConfirm] = useState(false);
  const [validationWarning, setValidationWarning] = useState<{ visible: boolean; items: string[] }>({ visible: false, items: [] });
  const isOrderModalOpen = mode === "add" || mode === "edit";
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerPaymentQuery, setHeaderPaymentQuery] = useState("");
  const [headerPaymentOpen, setHeaderPaymentOpen] = useState(false);
  const [headerWechatOpen, setHeaderWechatOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; caption?: string } | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle } = useTheme();

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const history = useMemo(() => activeOrders.filter((o) => { const q=query.toLowerCase().trim(); if(!q) return true; const customerText=o.lines.map(l=>l.customerSnapshot?.name || "").join(" ").toLowerCase(); const payment=getOrderPaymentAgentDisplay(o, paymentAgents).value.toLowerCase(); return (o.number || o.orderNumber || "").toLowerCase().includes(q)||o.wechatId.toLowerCase().includes(q)||customerText.includes(q)||payment.includes(q); }).slice(0, 10), [activeOrders, query, paymentAgents]);

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
  const customerSuggestions = useMemo(() => {
    const fromCustomerRows = customers.map((c) => c.name?.trim()).filter(Boolean) as string[];
    const fromOrders = activeOrders.flatMap((o) => o.lines.map((l) => (l.customerName || l.customerSnapshot?.name || "").trim())).filter(Boolean) as string[];
    return Array.from(new Set([...fromCustomerRows, ...fromOrders])).slice(0, 20);
  }, [customers, activeOrders]);
  const selectedPaymentAgentId = draft.paymentAgentId || draft.paymentBy;
  const selectedPaymentAgent = paymentAgents.find((p) => p.id === selectedPaymentAgentId || normalizePaymentAgentValue(p.name) === normalizePaymentAgentValue(selectedPaymentAgentId) || p.agentCode === selectedPaymentAgentId) ?? null;
  const settlement = useMemo(() => calculatePaymentAgentSettlement({ orderTotal: total, existingCredit: selectedPaymentAgent?.creditBalance ?? 0, paidNow: draft.paidToPaymentAgentNow ?? 0 }), [total, selectedPaymentAgent, draft.paidToPaymentAgentNow]);
  const validation = useMemo(() => validateOrderForSave(draft), [draft]);
  const headerPaymentSuggestions = useMemo(() => {
    const q = headerPaymentQuery.trim().toLowerCase();
    return paymentAgents.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.agentCode || "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 4);
  }, [paymentAgents, headerPaymentQuery]);
  const paymentLabel = (p: any) => (p.creditBalance ?? 0) > 0 ? `${p.name} â€” Credit: ${(p.creditBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : p.name;

  const headerWechatSuggestions = useMemo(() => {
    const q = (draft.wechatId || "").trim().toLowerCase();
    return wechatSuggestions
      .filter((w) => w && (!q || w.toLowerCase().includes(q)))
      .slice(0, 4);
  }, [wechatSuggestions, draft.wechatId]);
  useEffect(() => {
    if (headerPaymentOpen) return;
    setHeaderPaymentQuery(selectedPaymentAgent ? paymentLabel(selectedPaymentAgent) : (draft.paymentBy || ""));
  }, [selectedPaymentAgent, draft.paymentBy, headerPaymentOpen]);


  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const ensureFirebaseOrderWriteReady = () => {
    if (!isFirebaseOrdersMode) return true;
    if (!ordersSourceSelection.hasBusinessId) {
      pushToast({ tone: "danger", text: "Firebase business id is missing. Set NEXT_PUBLIC_FIREBASE_BUSINESS_ID before saving orders." });
      return false;
    }
    return true;
  };

  const resolveOrCreatePaymentAgentByName = async (rawName: string) => {
    const cleanName = rawName.trim();
    if (!cleanName) return null;
    const existing = paymentAgents.find((agent) => normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(cleanName));
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const created: PaymentAgent = {
      id: `pa-${Date.now()}`,
      name: cleanName,
      initials: cleanName.slice(0, 2).toUpperCase(),
      agentCode: `AG-${Math.floor(Math.random() * 900 + 100)}`,
      status: "active",
      openingCreditBalance: 0,
      creditBalance: 0,
      totalOrderAmount: 0,
      totalPaidAmount: 0,
      currentDuePayable: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await upsertPaymentAgent(created);
      await reloadPaymentAgents();
      return created;
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    setRowEdits((prev) => {
      const next: Record<string, RowEditState> = {};
      activeOrders.forEach((order) => {
        const pending = prev[order.id];
        if (!pending) return;
        if (pending.saving) {
          next[order.id] = pending;
          return;
        }
        const dirty = pending.loadingDate !== order.loadingDate || pending.status !== order.status;
        if (dirty) next[order.id] = pending;
      });
      return next;
    });
  }, [activeOrders]);

  const getRowValue = (order: Order): RowEditState => {
    const pending = rowEdits[order.id];
    return pending ?? { loadingDate: order.loadingDate, status: order.status, saving: false };
  };
  const resolveStatusOptions = (order: Order, rowValue: RowEditState) => {
    const options = rowValue.loadingDate ? STATUS_OPTIONS_WITH_DATE : STATUS_OPTIONS_NO_DATE;
    return options;
  };

  const setRowEdit = (order: Order, patch: Partial<Pick<RowEditState, "loadingDate" | "status">>, trace: "date_selected" | "status_selected") => {
    setRowEdits((prev) => {
      const current = prev[order.id] ?? { loadingDate: order.loadingDate, status: order.status, saving: false };
      const next = { ...current, ...patch } as RowEditState;
      if (trace === "date_selected") {
        if (next.loadingDate) {
          next.status = "packed";
        } else {
          next.status = "saved";
        }
      }
      if (trace === "status_selected" && !next.loadingDate && next.status !== "saved") {
        next.status = "saved";
      }
      if (trace === "status_selected" && next.loadingDate && next.status === "saved") {
        next.status = "packed";
      }
      const dirty = next.loadingDate !== order.loadingDate || next.status !== order.status;
      if (!dirty && !current.saving) {
        const copy = { ...prev };
        delete copy[order.id];
        return copy;
      }
      return { ...prev, [order.id]: { ...next, saving: current.saving } };
    });
  };

  const saveRowEdit = async (order: Order) => {
    const pending = rowEdits[order.id];
    if (!pending || pending.saving) return;
    const dirty = pending.loadingDate !== order.loadingDate || pending.status !== order.status;
    if (!dirty) return;
    if (!ensureFirebaseOrderWriteReady()) return;
    const updated = { ...order, loadingDate: pending.loadingDate, status: pending.status, updatedAt: new Date().toISOString() };
    setRowEdits((prev) => ({ ...prev, [order.id]: { ...pending, saving: true } }));
try {
      if (isFirebaseOrdersMode) {
        await upsertFirebaseOrder(updated);
        if (isOrderEligibleForCreditSettlement(updated)) await applyOrderSettlement(updated);
        else await reverseOrderSettlement(updated);
        await reloadFirebaseOrders();
      } else {
        upsertOrder(updated);
        await recalculateFromOrders(orders.filter((x) => x.id !== updated.id).concat(updated));
      }
      setRowEdits((prev) => {
        const copy = { ...prev };
        delete copy[order.id];
        return copy;
      });
      pushToast({ tone: "success", text: "Order row updated." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRowEdits((prev) => ({ ...prev, [order.id]: { ...pending, saving: false } }));
      logError("order_row_update_failure", { orderId: order.id, error: message, attemptedLoadingDate: updated.loadingDate, attemptedStatus: updated.status });
      pushToast({ tone: "danger", text: "Failed to save row changes." });
    }
  };

  const onSave = async (status: Order["status"], forceDraft = false) => {
    logDataFlow("Orders", JSON.stringify({ event: status === "draft" ? "draft_save_started" : "order_save_started", status, lineCount: draft.lines.length, displayedOrderNumber: draft.number || draft.orderNumber }, null, 2));
    if (!ensureFirebaseOrderWriteReady()) return;
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });

    if (status === "draft") {
      if (!hasAnyDraftContent(draft)) return pushToast({ tone: "info", text: "Add at least one field before saving a draft." });
      if (!forceDraft && !validation.isValid) {
        setShowDraftIncompleteConfirm(true);
        return;
      }
      let resolvedDraftAgent = paymentAgents.find((agent) => agent.id === (draft.paymentAgentId || draft.paymentBy) || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(draft.paymentBy)) ?? null;
      if (!resolvedDraftAgent && draft.paymentBy.trim()) {
        try {
          resolvedDraftAgent = await resolveOrCreatePaymentAgentByName(draft.paymentBy);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
          return;
        }
      }
      const draftOrder = {
        ...draft,
        number: "",
        orderNumber: "",
        status: "draft" as const,
        paymentAgentId: resolvedDraftAgent?.id || "",
        paymentBy: resolvedDraftAgent?.id || draft.paymentBy || "",
        paymentAgentSnapshot: resolvedDraftAgent ? { id: resolvedDraftAgent.id, name: resolvedDraftAgent.name, code: resolvedDraftAgent.agentCode } : draft.paymentAgentSnapshot,
      };
      try {
        if (isFirebaseOrdersMode) {
          await upsertFirebaseOrder({ ...draftOrder, draftAutosavedAt: new Date().toISOString() } as any);
          await reloadFirebaseOrders();
        } else {
          upsertOrder(draftOrder);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Draft save failed.";
        pushToast({ tone: "danger", text: message });
        return;
      }
      setEditingOrderId(null);
      setRemovedLineIds([]);
      setOriginalLineIds(new Set());
      setDraft(createEmptyDraft(orders));
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
    const knownCustomerIdsBeforeSave = new Set(customers.map((customer) => customer.id));
    const knownPaymentAgentIdsBeforeSave = new Set(paymentAgents.map((agent) => agent.id));
    let resolvedLines = draft.lines;
    try {
      resolvedLines = (await resolveCustomersForOrderLines(draft.lines, customers, now)).map((line) =>
        withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)),
      );
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
    const requestedOrderNumber = (draft.number || draft.orderNumber || "").trim();
    const duplicateOrder = activeOrders.find((o) => o.id !== draft.id && (o.number || o.orderNumber || "").trim() === requestedOrderNumber);
    if (requestedOrderNumber && duplicateOrder) {
      setValidationWarning({ visible: true, items: [`Order Number ${requestedOrderNumber} already exists.`] });
      return;
    }
    let resolvedAgent = paymentAgents.find((agent) => agent.id === (draft.paymentAgentId || draft.paymentBy) || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(draft.paymentBy)) ?? null;
    if (!resolvedAgent && draft.paymentBy.trim()) {
      try {
        resolvedAgent = await resolveOrCreatePaymentAgentByName(draft.paymentBy);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
        return;
      }
    }
    const finalOrderNumber = requestedOrderNumber || await ensureFinalOrderNumber({ ...draft, number: "", orderNumber: "", status: "saved" as const });
    const resolvedPaymentAgentId = resolvedAgent?.id || "";
    let savedOrder: Order & { paymentByName?: string; paymentAgentName?: string } = {
      ...draft,
      number: finalOrderNumber,
      orderNumber: finalOrderNumber,
      lines: resolvedLines,
      status: "saved" as const,
      paymentAgentId: resolvedPaymentAgentId,
      paymentBy: resolvedPaymentAgentId || draft.paymentBy,
      paymentByName: resolvedAgent?.name || draft.paymentBy || "",
      paymentAgentName: resolvedAgent?.name || draft.paymentBy || "",
      paymentAgentSnapshot: resolvedAgent ? { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode } : draft.paymentAgentSnapshot,
      paymentAgentSettlementSnapshot: {
        ...settlement,
        orderTotal: settlement.orderTotal,
        existingCredit: settlement.existingCredit,
        paymentAgentId: resolvedPaymentAgentId,
        paymentAgentName: resolvedAgent?.name || selectedPaymentAgent?.name,
        updatedAt: now,
        createdAt: draft.paymentAgentSettlementSnapshot?.createdAt || now,
      },
    };
    try {
      if (isFirebaseOrdersMode) {
        await upsertFirebaseOrder(savedOrder as any);
        await reloadFirebaseOrders();
      } else {
        upsertOrder(savedOrder);
      }
      logDB("upsert_order_success", { orderId: savedOrder.id, status: savedOrder.status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError("upsert_order_failure", { orderId: savedOrder.id, error: message });
      pushToast({ tone: "danger", text: message });
      return;
    }
    const mergedOrders = activeOrders.some((o) => o.id === savedOrder.id) ? activeOrders.map((o) => (o.id === savedOrder.id ? savedOrder : o)) : [savedOrder, ...activeOrders];
    logCustomer("skipped_unrelated_customer_upserts", { reason: "normal_save_should_not_rewrite_unrelated_customers", affectedCustomerIds: Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean))) });
    const result: OrderSideEffectResult = { mode: editingOrderId ? "edit" : "create", orderSaved: true, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: !isFirebaseOrdersMode && Boolean(selectedPaymentAgentId), paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: editingOrderId ? false : true, blocked: false, warnings: [], errors: [] };
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

    if (isFirebaseOrdersMode && (savedOrder.paymentAgentId || savedOrder.paymentBy)) {
      try { await applyOrderSettlement(savedOrder); result.paymentSettlementApplied = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", success: true }, null, 2)); }
      catch (e) { result.paymentSettlementApplied = false; result.warnings.push(`Payment-agent settlement failed: ${e instanceof Error ? e.message : String(e)}`); logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", error: e instanceof Error ? e.message : String(e) }); }
    }

    try { await customerLedgerService.applyOrderCustomerReceivables(savedOrder as any); result.customerReceivablesApplied = true; logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", success: true }, null, 2)); }
    catch (e) { result.customerReceivablesApplied = false; result.warnings.push(`Customer receivable update failed: ${e instanceof Error ? e.message : String(e)}`); logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", error: e instanceof Error ? e.message : String(e) }); }

    if (isFirebaseOrdersMode) {
      try {
        savedOrder = { ...savedOrder, ...((await orderLifecycleService.syncOrderLifecycleMetadata(savedOrder, {
          knownCustomerIds: knownCustomerIdsBeforeSave,
          knownPaymentAgentIds: knownPaymentAgentIdsBeforeSave,
        })) || {}) };
        await reloadFirebaseOrders();
        logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "sync_lifecycle_metadata", success: true }, null, 2));
      } catch (e) {
        result.warnings.push(`Lifecycle sync failed: ${e instanceof Error ? e.message : String(e)}`);
        logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "sync_lifecycle_metadata", error: e instanceof Error ? e.message : String(e) });
      }
    }

    await recalculateFromOrders(mergedOrders);
    await reloadCustomers();
    await reloadPaymentAgents();
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: savedOrder.id, orderNumber: savedOrder.number, ...result }, null, 2));

    if (result.warnings.length === 0) pushToast({ tone: "success", text: "Order saved successfully." });
    else if (result.productSyncFailures.length) pushToast({ tone: "info", text: `Order saved, but product sync failed for ${result.productSyncFailures.length} line.` });
    else if (!result.customerReceivablesApplied) pushToast({ tone: "info", text: "Order saved, but customer receivable update failed." });
    else if (!result.paymentSettlementApplied) pushToast({ tone: "info", text: "Order saved, but payment-agent settlement failed." });
    else pushToast({ tone: "info", text: `Order saved with warnings: ${result.warnings[0]}` });
    setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders)); setMode("history"); setHasAttemptedFinalSave(false); setValidationWarning({ visible: false, items: [] });
  };

  const onCancel = () => { setEditingOrderId(null); setRemovedLineIds([]); setOriginalLineIds(new Set()); setDraft(createEmptyDraft(orders)); setMode("history"); setHasAttemptedFinalSave(false); setShowDraftIncompleteConfirm(false); setValidationWarning({ visible: false, items: [] }); pushToast({ tone: "info", text: "Draft reset to new order." }); };

  const startEdit = async (o: Order) => {
    if (o.status === "draft" && !ensureFirebaseOrderWriteReady()) return;
    setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id)));
    const copy = JSON.parse(JSON.stringify(o));
    if (copy.status === "draft") {
      const peek = await peekNextOrderNumber();
      copy.number = peek;
      copy.orderNumber = peek;
    }
    setDraft({ ...copy, lines: (copy.lines || []).map((line: Order["lines"][number]) => seedDetailBoxesFromLegacy(line)) });
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    setMode("edit");
  };
  const startAdd = async () => {
    logDataFlow("Orders", JSON.stringify({ event: "add_order_started" }, null, 2));
    if (!ensureFirebaseOrderWriteReady()) return;
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    try {
      const reserved = await peekNextOrderNumber();
      const nextDraft = createEmptyDraft(orders, reserved);
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
  const getPaymentAgentMeta = (order: Order) => getOrderPaymentAgentDisplay(order, paymentAgents);
  const getOrderLines = (order: Order) => order.lines || [];
  const getLineCtns = (line: Order["lines"][number]) => Number(line.totalCtns) || 0;
  const getLinePcsPerCtn = (line: Order["lines"][number]) => Number(line.pcsPerCtn) || 0;
  const getLineTotalPcs = (line: Order["lines"][number]) => getLineCtns(line) * getLinePcsPerCtn(line);
  const getLineRate = (line: Order["lines"][number]) => Number(line.rmbPerPcs) || 0;
  const getLineAmount = (line: Order["lines"][number]) => getLineTotalPcs(line) * getLineRate(line);
  const getOrderTotalCtns = (order: Order) => getOrderLines(order).reduce((sum, line) => sum + getLineCtns(line), 0);
  const getOrderTotalAmount = (order: Order) => getOrderLines(order).reduce((sum, line) => sum + getLineAmount(line), 0);
  const getFirstDraftPhoto = (order: Order) => order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.productPhotoUrl || order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.photoUrl || "";
  const renderDraftMissing = () => <span className="text-[var(--danger)]">Not present</span>;
  const getDraftMarkaSummary = (order: Order) => {
    const markas = Array.from(new Set(order.lines.map((line) => (line.marka || "").trim()).filter(Boolean)));
    if (markas.length === 0) return null;
    return markas.length === 1 ? markas[0] : `${markas[0]} +${markas.length - 1} more`;
  };
  const getLineProductPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
    return candidate.productPhotoUrl || candidate.productImage || candidate.image || "";
  };
  const getLineDimPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { dimensionPhotoUrl?: string; sizePhotoUrl?: string };
    return candidate.photoUrl || candidate.dimensionPhotoUrl || candidate.sizePhotoUrl || "";
  };
  const getLineCustomerName = (line: Order["lines"][number]) => line.customerName || line.customerSnapshot?.name || line.customerId || "â€”";
  const getVisibleLineDetails = (line: Order["lines"][number]) => {
    const parts = getLineDetailsParts(line);
    const values = [parts.detail1, parts.detail2, parts.detail3].map((part) => part.trim()).filter(Boolean);
    if (values.length > 0) return values;
    return line.details?.trim() ? [line.details.trim()] : [];
  };
  const getHistoryRowTone = (loadingDate?: string) => {
    return loadingDate?.trim()
      ? "bg-emerald-50/70 dark:bg-emerald-950/20"
      : "bg-amber-50/75 dark:bg-amber-950/20";
  };
  const fmtOrderDate = (order: Order) => {
    const raw = order.date || order.createdAt || order.updatedAt;
    if (!raw) return "â€”";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return formatDate(raw);
    return formatIndianDate(d);
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
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      try {
        await orderLifecycleService.softDeleteOrder(o, "orders-page");
      } catch (e) {
        logError("order_side_effect_step_failed", { orderId: o.id, mode: "soft_delete", step: "soft_delete_order", error: e instanceof Error ? e.message : String(e) });
        pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Order delete failed." });
        return;
      }
      await reloadFirebaseOrders();
      await reloadCustomers();
      await reloadPaymentAgents();
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} moved to Recycle Bin.` });
      return;
    }
    deleteOrder(o.id);
await recalculateFromOrders(orders.filter((x) => x.id !== o.id && x.status === "saved"));
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
        <div className="min-w-[280px] flex-1 max-w-xl"><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search orders, customers..." leadingIcon={<Search size={15} />} /></div>
        <div className="relative" ref={pickerRef}>
          <Button size="sm" onClick={() => setPickerOpen((v) => !v)}><List size={14} /><span className="text-fg-muted">Order</span><span className="font-semibold">{(editingOrder?.number || draft.number || history[0]?.number || "â€”")}</span><ChevronDown size={13} /></Button>
          {pickerOpen && <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card max-h-[320px] overflow-y-auto">{activeOrders.slice(0,30).map((o) => <button key={o.id} onClick={() => { setPickerOpen(false); startEdit(o); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors"><div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{o.number || o.orderNumber || "Draft"}</span><span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span></div><div className="mt-0.5 text-[11.5px] text-fg-muted">{o.lines.length} lines Â· {formatPlainAmount(orderTotal(o))}</div></button>)}</div>}
        </div>
        <Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase."><Filter size={14} />Filter</Button>
        <Button size="sm" variant="secondary" disabled title="Sorting is not enabled in this phase."><ArrowUpDown size={14} />Sort</Button>
        <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">{([{ v: "list", I: List }, { v: "grid", I: LayoutGrid }, { v: "calendar", I: CalendarDays }] as const).map(({ v, I }) => <button key={v} onClick={() => setView(v)} className={cn("grid h-6 w-7 place-items-center rounded-md text-fg-muted transition-colors", view===v && "bg-brand text-brand-fg")}><I size={13} /></button>)}</div>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("drafts")}>Draft ({drafts.length})</Button>
        <button aria-label="Notifications" className="relative grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"><Bell size={14} /></button>
        <button aria-label="Toggle theme" onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
      {ordersDataSource === "mock" ? <div className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-[12px] font-medium text-amber-900">{ordersSourceSelection.hasFirebaseConfig ? "Mock mode is enabled; order and customer data is local and will not persist to Firebase." : "Firebase is not configured; app is running in mock mode and data will not persist."}</div> : null}
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {mode === "drafts" && <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Draft Orders</h3><div className="text-[12px] text-fg-subtle">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-bg-subtle/70">
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Photo</th><th>WeChat ID</th><th>Payment Agent</th><th>Marka</th><th>Total Quantity & CTN</th><th>Order Total</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No draft orders yet.</td></tr> : drafts.map((o) => {
                  const photo = getFirstDraftPhoto(o);
                  const paymentMeta = getPaymentAgentMeta(o);
                  const marka = getDraftMarkaSummary(o);
                  const totalPcs = o.lines.reduce((sum, line) => sum + ((Number(line.totalCtns) || 0) * (Number(line.pcsPerCtn) || 0)), 0);
                  const totalCtns = getOrderTotalCtns(o);
                  const totalAmount = getOrderTotalAmount(o);
                  return <tr key={o.id} className="border-t border-border/80 hover:bg-bg-subtle/40 align-middle">
                    <td className="px-4 py-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">{photo ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage({ src: photo, alt: "Draft line photo" })}><img src={photo} alt="draft line" className="h-full w-full object-cover" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">â€”</span>}</div></td>
                    <td>{o.wechatId?.trim() ? <span>{o.wechatId}</span> : renderDraftMissing()}</td>
                    <td>{paymentMeta.isMissing ? renderDraftMissing() : <span>{paymentMeta.value}</span>}</td>
                    <td>{marka ? <span>{marka}</span> : renderDraftMissing()}</td>
                    <td>{(totalPcs > 0 || totalCtns > 0) ? <span>{totalPcs.toLocaleString()} PCS / {totalCtns.toLocaleString()} CTNS</span> : renderDraftMissing()}</td>
                    <td className="tabular-nums">{totalAmount > 0 ? <span>{formatPlainAmount(totalAmount)}</span> : renderDraftMissing()}</td>
                    <td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={async () => { logDataFlow("Orders", JSON.stringify({ event: "complete_draft_opened", orderId: o.id, orderNumber: o.number || o.orderNumber }, null, 2)); await startEdit(o); }}>Continue</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>}

        <section className="card overflow-hidden">
          {/* <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing 1 to {history.length} of {activeOrders.length} orders</div></div> */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead className="bg-bg-subtle/70">
                <tr className="text-left text-[13px] uppercase  text-fg-subtle">
                  <th className="px-4 py-2 w-[220px]">Order Number</th><th className="w-[175px]">Paid By</th><th className="w-[165px]">WeChat ID</th><th className="w-[136px]">Loading Date</th><th className="w-[120px]">Total CTNS</th><th className="w-[138px]">Total Amount</th><th className="w-[112px]">Status</th><th className="text-right px-4 w-[144px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</td></tr> : history.map((o) => {
                  const paymentMeta = getPaymentAgentMeta(o);
                  const paymentName = paymentMeta.value;
                  const canEditOperationalFields = o.status !== "draft" && o.status !== "archived";
                  const rowValue = getRowValue(o);
                  const rowDirty = rowValue.loadingDate !== o.loadingDate || rowValue.status !== o.status;
                  const effectiveLoadingDate = rowValue.loadingDate || o.loadingDate;
                  const rowTone = getHistoryRowTone(effectiveLoadingDate);
                  const middleCellClass = cn("border-y border-border transition-colors", rowTone);
                  const firstCellClass = cn("rounded-l-2xl border border-r-0 border-border transition-colors", rowTone);
                  const lastCellClass = cn("rounded-r-2xl border border-l-0 border-border transition-colors", rowTone);
                  const orderLines = getOrderLines(o);
                  const isSingleLineOrder = orderLines.length === 1;
                  const singleLine = orderLines[0];
                  const totalCtns = getOrderTotalCtns(o);
                  const totalAmount = getOrderTotalAmount(o);

                  if (isSingleLineOrder && singleLine) {
                    const productPhoto = getLineProductPhoto(singleLine);
                    const lineTotalPcs = getLineTotalPcs(singleLine);
                    const pcsPerCtn = getLinePcsPerCtn(singleLine);
                    const marka = singleLine.marka?.trim() || "—";

                    return <Fragment key={o.id}>
                      <tr className="align-middle h-[60px]">
                        <td className={cn(firstCellClass, "px-4 py-2.5")}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[18px] font-semibold leading-tight" title={o.number || o.orderNumber || "Draft"}>{o.number || o.orderNumber || "Draft"}</div>
                              <div className="mt-0.5 text-[12px] text-fg-subtle tabular-nums">{fmtOrderDate(o)}</div>
                            </div>
                            <div className="w-[74px] shrink-0">
                              {productPhoto ? <button type="button" onClick={() => setPreviewImage({ src: productPhoto, alt: "Product photo" })} className="grid h-[58px] w-[58px] place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle"><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 144, height: 144, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : null}
                              <div className={cn("mt-1 text-[12.5px] font-semibold leading-tight text-fg", productPhoto ? "w-[74px]" : "w-full")} title={marka}>{marka}</div>
                            </div>
                          </div>
                        </td>
                        <td className={cn(middleCellClass, "px-3 py-2.5")}><div className={cn("truncate text-[15px] font-medium", paymentMeta.isMissing && "text-[var(--danger)]")} title={paymentName}>{paymentName}</div></td>
                        <td className={cn(middleCellClass, "px-3 py-2.5")}><div className="truncate text-[15px] font-medium" title={o.wechatId || "—"}>{o.wechatId || "—"}</div></td>
                        <td className={cn(middleCellClass, "px-2 py-2.5")}>{canEditOperationalFields ? <LoadingDateControl compact debugOrderId={o.id} value={rowValue.loadingDate} onChange={(next) => { setRowEdit(o, { loadingDate: next }, "date_selected"); }} /> : <span className="inline-flex rounded-full border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg-muted">{o.loadingDate ? formatDate(o.loadingDate) : "Set date"}</span>}</td>
                        <td className={cn(middleCellClass, "px-3 py-2.5")}>
                          <div className="text-[16px] font-semibold tabular-nums leading-tight">{totalCtns.toLocaleString()}</div>
                          <div className="mt-1 text-[12px] text-fg-subtle tabular-nums">{pcsPerCtn.toLocaleString()} pcs/ctn</div>
                          <div className="text-[12px] text-fg-subtle tabular-nums">{lineTotalPcs.toLocaleString()} total pcs</div>
                        </td>
                        <td className={cn(middleCellClass, "px-3 py-2.5 text-[20px] font-bold tabular-nums text-[var(--success)] leading-tight")}>{formatPlainAmount(totalAmount)}</td>
                        <td className={cn(middleCellClass, "px-2 py-2.5")}><div className="text-[14px]">{canEditOperationalFields ? <OrderStatusControl compact neutral debugOrderId={o.id} options={resolveStatusOptions(o, rowValue)} value={rowValue.status} onChange={(next) => { setRowEdit(o, { status: next }, "status_selected"); }} /> : <span className="inline-flex rounded-full border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg">{o.status === "packed" ? "Loaded" : o.status}</span>}</div></td>
                        <td className={cn(lastCellClass, "px-3 py-2.5")}><div className="flex justify-end gap-1">{canEditOperationalFields && rowDirty ? <Button size="sm" variant="primary" title="Save row changes" disabled={rowValue.saving} onClick={() => { void saveRowEdit(o); }}>Save</Button> : null}<Button size="sm" variant="secondary" title="View" onClick={() => setViewOrder(o)}><Eye size={13} /></Button><Button size="sm" variant="secondary" title="Edit" onClick={() => startEdit(o)}><SquarePen size={13} /></Button><Button size="sm" variant="secondary" title="Delete" onClick={() => removeOrder(o)}><Trash2 size={13} /></Button></div></td>
                      </tr>
                    </Fragment>;
                  }

                  return <Fragment key={o.id}>
                    <tr className="align-middle h-[60px]">
                      <td className={cn(firstCellClass, "px-4 py-2.5")}><div className="truncate text-[18px] font-semibold leading-tight" title={o.number || o.orderNumber || "Draft"}>{o.number || o.orderNumber || "Draft"}</div><div className="mt-0.5 text-[12px] text-fg-subtle tabular-nums">{fmtOrderDate(o)}</div></td>
                      <td className={cn(middleCellClass, "px-3 py-2.5")}><div className={cn("truncate text-[15px] font-medium", paymentMeta.isMissing && "text-[var(--danger)]")} title={paymentName}>{paymentName}</div>{o.paymentAgentSnapshot?.name && o.paymentAgentSnapshot?.name !== paymentName ? <div className="truncate text-[11px] text-fg-subtle" title={o.paymentAgentSnapshot.name}>{o.paymentAgentSnapshot.name}</div> : null}</td>
                      <td className={cn(middleCellClass, "px-3 py-2.5")}><div className="truncate text-[15px] font-medium" title={o.wechatId || "—"}>{o.wechatId || "—"}</div></td>
                      <td className={cn(middleCellClass, "px-2 py-2.5")}>{canEditOperationalFields ? <LoadingDateControl compact debugOrderId={o.id} value={rowValue.loadingDate} onChange={(next) => { setRowEdit(o, { loadingDate: next }, "date_selected"); }} /> : <span className="inline-flex rounded-full border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg-muted">{o.loadingDate ? formatDate(o.loadingDate) : "Set date"}</span>}</td>
                      <td className={cn(middleCellClass, "px-3 py-2.5 text-[16px] font-semibold tabular-nums")}>{totalCtns.toLocaleString()}</td>
                      <td className={cn(middleCellClass, "px-3 py-2.5 text-[20px] font-bold tabular-nums text-[var(--success)] leading-tight")}>{formatPlainAmount(totalAmount)}</td>
                      <td className={cn(middleCellClass, "px-2 py-2.5")}><div className="text-[14px]">{canEditOperationalFields ? <OrderStatusControl compact neutral debugOrderId={o.id} options={resolveStatusOptions(o, rowValue)} value={rowValue.status} onChange={(next) => { setRowEdit(o, { status: next }, "status_selected"); }} /> : <span className="inline-flex rounded-full border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg">{o.status === "packed" ? "Loaded" : o.status}</span>}</div></td>
                      <td className={cn(lastCellClass, "px-3 py-2.5")}><div className="flex justify-end gap-1">{canEditOperationalFields && rowDirty ? <Button size="sm" variant="primary" title="Save row changes" disabled={rowValue.saving} onClick={() => { void saveRowEdit(o); }}>Save</Button> : null}<Button size="sm" variant="secondary" title="View" onClick={() => setViewOrder(o)}><Eye size={13} /></Button><Button size="sm" variant="secondary" title="Edit" onClick={() => startEdit(o)}><SquarePen size={13} /></Button><Button size="sm" variant="secondary" title="Delete" onClick={() => removeOrder(o)}><Trash2 size={13} /></Button></div></td>
                    </tr>
                    <tr>
                      <td colSpan={8} className="px-0 pb-4 pt-2">
                        <div className="ml-[2.5%] w-[92.5%] overflow-x-auto rounded-xl border border-border/70 bg-bg-subtle/55">
                          <table className="w-full min-w-[980px] table-auto text-[12px]">
                            <thead className="bg-bg-subtle/50">
                              <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-fg-subtle">
                                <th className="w-[76px] px-2 py-2">Dim Photo</th>
                                <th className="w-[88px] px-2 py-2">Product Photo</th>
                                <th className="min-w-[190px] px-3 py-2">Marka</th>
                                <th className="w-[130px] px-2 py-2">Details</th>
                                <th className="w-[56px] px-2 py-2 whitespace-nowrap">CTNS</th>
                                <th className="w-[66px] px-2 py-2 whitespace-nowrap">PCS/CTN</th>
                                <th className="w-[70px] px-2 py-2 whitespace-nowrap">Total PCS</th>
                                <th className="w-[76px] px-2 py-2 whitespace-nowrap">Rate</th>
                                <th className="w-[118px] px-3 py-2 whitespace-nowrap">Line Total Amount</th>
                                <th className="w-[144px] px-3 py-2">Customer</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderLines.map((line) => {
                                const dimPhoto = getLineDimPhoto(line);
                                const productPhoto = getLineProductPhoto(line);
                                const lineTotalPcs = getLineTotalPcs(line);
                                const lineRate = getLineRate(line);
                                const lineAmount = getLineAmount(line);
                                const detailLines = getVisibleLineDetails(line);
                                const detailTitle = detailLines.length > 0 ? detailLines.join("\n") : "—";

                                return <tr key={line.id} className="border-t border-border/70 align-middle">
                                  <td className="px-2 py-2.5 align-top">{dimPhoto ? <button type="button" onClick={() => setPreviewImage({ src: dimPhoto, alt: "Dim photo" })} className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle"><img src={getCloudinaryOptimizedUrl(dimPhoto, { width: 120, height: 120, crop: "fit" })} alt="dim" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">—</span>}</td>
                                  <td className="px-2 py-2.5 align-top">{productPhoto ? <button type="button" onClick={() => setPreviewImage({ src: productPhoto, alt: "Product photo" })} className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-xl border border-border bg-bg-subtle"><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 180, height: 180, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">—</span>}</td>
                                  <td className="px-3 py-2.5 align-top"><div className="text-[17px] font-semibold leading-tight" title={line.marka || "—"}>{line.marka || "—"}</div></td>
                                  <td className="px-2 py-2.5 align-top"><div className="space-y-0.5 text-[13.5px] font-medium leading-tight text-fg-muted" title={detailTitle}>{detailLines.length > 0 ? detailLines.map((detail, index) => <div key={`${line.id}-detail-${index}`}>{detail}</div>) : <div>—</div>}</div></td>
                                  <td className="px-2 py-2.5 align-top text-[14px] font-semibold tabular-nums whitespace-nowrap">{getLineCtns(line).toLocaleString()}</td>
                                  <td className="px-2 py-2.5 align-top text-[14px] font-semibold tabular-nums whitespace-nowrap">{getLinePcsPerCtn(line).toLocaleString()}</td>
                                  <td className="px-2 py-2.5 align-top text-[14px] font-semibold tabular-nums whitespace-nowrap">{lineTotalPcs.toLocaleString()}</td>
                                  <td className="px-2 py-2.5 align-top text-[14px] font-medium tabular-nums whitespace-nowrap">{formatPlainAmount(lineRate)}</td>
                                  <td className="px-3 py-2.5 align-top text-[17px] font-bold tabular-nums whitespace-nowrap text-[var(--success)]">{formatPlainAmount(lineAmount)}</td>
                                  <td className="px-3 py-2.5 align-top"><div className="truncate text-[14px] font-medium" title={getLineCustomerName(line)}>{getLineCustomerName(line)}</div></td>
                                </tr>;
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      <ImageLightbox src={previewImage?.src} alt={previewImage?.alt} caption={previewImage?.caption} open={Boolean(previewImage?.src)} onClose={() => setPreviewImage(null)} />
      </main>
      {isOrderModalOpen && <div className="fixed inset-0 z-50 bg-black/45 p-3 md:p-6" onClick={onCancel}>
        <div className="relative mx-auto w-full max-w-[1400px] h-[90vh] rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-border px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold">{editingOrder ? (editingOrder.status === "draft" ? "Complete Draft" : "Edit Order") : "Add Order"}</h3>
                {isFirebaseOrdersMode && <div className="text-[11px] text-fg-subtle mt-0.5">{autosaveStatus === "saving" ? "Saving draft..." : autosaveStatus === "saved" ? "Draft saved" : autosaveStatus === "error" ? "Draft autosave failed" : ""}</div>}
              </div>
              <Button size="sm" variant="secondary" onClick={onCancel}>âœ•</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[minmax(220px,0.8fr)_minmax(145px,0.55fr)_minmax(145px,0.55fr)_minmax(160px,0.55fr)_minmax(220px,0.8fr)]">
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Payment By</span><div className="relative"><Input value={headerPaymentQuery} onFocus={() => setHeaderPaymentOpen(true)} onBlur={() => window.setTimeout(() => setHeaderPaymentOpen(false),120)} onChange={(e)=>{const next=e.target.value;
setHeaderPaymentQuery(next); setHeaderPaymentOpen(true); setDraft((d)=>({...d,paymentBy:next,paymentAgentId:""}));}} placeholder="Search payment agent" />{headerPaymentOpen && headerPaymentSuggestions.length>0 ? <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">{headerPaymentSuggestions.map((p)=><button key={p.id} type="button" className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderPaymentOpen(false); const label=paymentLabel(p); setHeaderPaymentQuery(label); setDraft((d)=>({...d,paymentBy:p.id,paymentAgentId:p.id}));}}>{paymentLabel(p)}</button>)}</div>:null}</div></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Date</span><Input type="date" value={draft.date} onChange={(e)=>setDraft((d)=>({...d,date:e.target.value}))} /></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Loading Date</span><Input type="date" value={draft.loadingDate || ""} onChange={(e)=>setDraft((d)=>({...d,loadingDate:e.target.value || undefined}))} /></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Order Number</span><Input value={draft.number} onChange={(e)=>setDraft((d)=>({...d,number:e.target.value,orderNumber:e.target.value}))} /></label>
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>WeChat ID</span><div className="relative"><Input value={draft.wechatId} onFocus={() => setHeaderWechatOpen(true)} onBlur={() => window.setTimeout(() => setHeaderWechatOpen(false), 120)} onChange={(e)=>{const next=e.target.value; setHeaderWechatOpen(true); setDraft((d)=>({...d,wechatId:next}));}} />{headerWechatOpen && headerWechatSuggestions.length>0 ? <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">{headerWechatSuggestions.map((w)=><button key={w} type="button" className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderWechatOpen(false); setDraft((d)=>({...d,wechatId:w}));}}>{w}</button>)}</div> : null}</div></label>
            </div>
          </div>
          {validationWarning.visible ? <div className="absolute left-1/2 top-[84px] z-[70] w-[92%] max-w-[560px] -translate-x-1/2 rounded-xl border border-amber-400 bg-amber-50 p-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-amber-900">Missing before Save Order</div>
                <ul className="mt-1 list-disc pl-5 text-[12px] text-amber-800 space-y-0.5">{validationWarning.items.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}</ul>
              </div>
              <button className="text-amber-800 text-xs rounded px-1 py-0.5 hover:bg-amber-100" onClick={() => setValidationWarning({ visible: false, items: [] })}>âœ•</button>
            </div>
          </div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderForm showOrderInfo={false} draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} customerSuggestions={customerSuggestions} onPreviewImage={(src) => setPreviewImage({ src, alt: "Order line photo preview" })} />
          </div>
          <OrderFooter total={total} onCancel={onCancel} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={editingOrderId ? "Save Changes" : "Save Order"} disableSaveOrder={false} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />
        </div>
      </div>}
      {showDraftIncompleteConfirm && <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Save incomplete draft?</div><div className="text-sm text-fg-subtle">This draft has empty required fields. Save it anyway?</div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowDraftIncompleteConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => onSave("draft", true)}>Save Draft Anyway</Button></div></div></div>}
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} />
    </div>
  );
}



