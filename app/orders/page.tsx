"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatAmount, formatDate } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import { Order, PaymentAgent, lineTotalPcs, lineTotalRmb, orderTotal } from "@/lib/types";
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
import { ArrowUpDown, BadgePercent, Boxes, CalendarDays, Check, ChevronDown, Eye, Filter, IndianRupee, LayoutGrid, List, MessageCircleMore, Moon, Package2, Search, ShoppingBag, SquarePen, Sun, Trash2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { useTheme } from "@/components/ThemeProvider";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { TablePagination } from "@/components/table/TablePagination";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import { LoadingDateControl } from "@/components/orders/LoadingDateControl";
import { OrderStatusControl } from "@/components/orders/OrderStatusControl";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import { getLineDetailsParts, joinLineDetails, seedDetailBoxesFromLegacy, withDerivedLegacyDetails } from "@/lib/orderLineDetails";
import { orderLifecycleService } from "@/services/orderLifecycleService";
import { getMeaningfulOrderLines } from "@/services/orderValidation";

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
type FlatHistoryRow = {
  key: string;
  order: Order;
  line: Order["lines"][number] | null;
  paymentMeta: ReturnType<typeof getOrderPaymentAgentDisplay>;
};
type OrdersFilterState = {
  status: "all" | Order["status"];
  loadingDate: "all" | "set" | "unset";
  paymentAgent: "all" | "set" | "unset";
  dateFrom: string;
  dateTo: string;
  orderNumber: string;
  customer: string;
  marka: string;
};

type OrdersSortOption =
  | "orderDateDesc"
  | "orderDateAsc"
  | "loadingDate"
  | "orderNumber"
  | "amountDesc"
  | "amountAsc"
  | "status";
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
  const { data: paymentAgents, isLoading: paymentAgentsLoading, recalculateFromOrders, applyOrderSettlement, reverseOrderSettlement, upsertPaymentAgent, reload: reloadPaymentAgents } = usePaymentAgents();
  const { data: firebaseOrders, isLoading: isOrdersLoading, error: ordersLoadError, draftOrders: firebaseDraftOrders, autosaveDraft, upsertOrder: upsertFirebaseOrder, reload: reloadFirebaseOrders } = useOrders();
  const { data: customers, isLoading: isCustomersLoading, reload: reloadCustomers } = useCustomers();
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<OrdersSortOption>("orderDateDesc");
  const [filters, setFilters] = useState<OrdersFilterState>({
    status: "all",
    loadingDate: "all",
    paymentAgent: "all",
    dateFrom: "",
    dateTo: "",
    orderNumber: "",
    customer: "",
    marka: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [activeUploads, setActiveUploads] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Order>(createEmptyDraft(orders));
  const [mode, setMode] = useState<OrdersMode>("history");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [hasAttemptedFinalSave, setHasAttemptedFinalSave] = useState(false);
  const [showDraftIncompleteConfirm, setShowDraftIncompleteConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [validationWarning, setValidationWarning] = useState<{ visible: boolean; items: string[] }>({ visible: false, items: [] });
  const isOrderModalOpen = mode === "add" || mode === "edit";
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerPaymentQuery, setHeaderPaymentQuery] = useState("");
  const [headerPaymentOpen, setHeaderPaymentOpen] = useState(false);
  const [headerWechatOpen, setHeaderWechatOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; caption?: string } | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});
  const [orderSaveState, setOrderSaveState] = useState<"idle" | "saving" | "syncing">("idle");
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const wechatNormalizationStartedRef = useRef(false);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle } = useTheme();

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const filteredOrders = useMemo(
    () =>
      activeOrders.filter((order) => {
        const q = query.toLowerCase().trim();
        const payment = getOrderPaymentAgentDisplay(order, paymentAgents).value;
        const customerText = order.lines.map((line) => line.customerSnapshot?.name || line.customerName || "").join(" ");
        const markaText = order.lines.map((line) => line.marka || "").join(" ");
        const detailText = order.lines.map((line) => joinLineDetails(line)).join(" ");
        const hasLoadingDate = Boolean(order.loadingDate?.trim());
        const hasPaymentAgent = Boolean((order.paymentAgentId || order.paymentBy || "").trim());
        const orderDate = order.date || "";
        if (filters.status !== "all" && order.status !== filters.status) return false;
        if (filters.loadingDate === "set" && !hasLoadingDate) return false;
        if (filters.loadingDate === "unset" && hasLoadingDate) return false;
        if (filters.paymentAgent === "set" && !hasPaymentAgent) return false;
        if (filters.paymentAgent === "unset" && hasPaymentAgent) return false;
        if (filters.dateFrom && orderDate < filters.dateFrom) return false;
        if (filters.dateTo && orderDate > filters.dateTo) return false;
        if (filters.orderNumber.trim() && !(order.number || order.orderNumber || "").toLowerCase().includes(filters.orderNumber.trim().toLowerCase())) return false;
        if (filters.customer.trim() && !customerText.toLowerCase().includes(filters.customer.trim().toLowerCase())) return false;
        if (filters.marka.trim() && !`${markaText} ${detailText}`.toLowerCase().includes(filters.marka.trim().toLowerCase())) return false;
        if (!q) return true;
        const searchable = [
          order.number || order.orderNumber || "",
          order.wechatId || "",
          payment,
          order.status,
          order.date,
          order.loadingDate || "",
          formatAmount(orderTotal(order)),
          formatAmount((order.lines || []).reduce((sum, line) => sum + (Number(line.totalCtns) || 0), 0)),
          customerText,
          markaText,
          detailText,
          ...order.lines.flatMap((line) => [formatAmount(lineTotalRmb(line)), formatAmount(lineTotalPcs(line)), formatAmount(line.rmbPerPcs || 0)]),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      }),
    [activeOrders, filters, query, paymentAgents],
  );
  const sortedOrders = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...filteredOrders].sort((left, right) => {
      switch (sortBy) {
        case "orderDateAsc":
          return (left.date || "").localeCompare(right.date || "");
        case "loadingDate":
          return (left.loadingDate || "9999-99-99").localeCompare(right.loadingDate || "9999-99-99");
        case "orderNumber":
          return collator.compare(left.number || left.orderNumber || "", right.number || right.orderNumber || "");
        case "amountDesc":
          return orderTotal(right) - orderTotal(left);
        case "amountAsc":
          return orderTotal(left) - orderTotal(right);
        case "status":
          return collator.compare(left.status, right.status);
        case "orderDateDesc":
        default:
          return (right.date || "").localeCompare(left.date || "");
      }
    });
  }, [filteredOrders, sortBy]);
  const history = useMemo<FlatHistoryRow[]>(() => sortedOrders.flatMap<FlatHistoryRow>((order) => {
    const paymentMeta = getOrderPaymentAgentDisplay(order, paymentAgents);
    const orderLines = (order.lines || []).filter((line) => meaningfulLine(line));
    if (orderLines.length === 0) return [{ key: `${order.id}::fallback`, order, line: null, paymentMeta }];
    return orderLines.map((line, index) => ({ key: `${order.id}::${line.id || index}`, order, line, paymentMeta }));
  }), [sortedOrders, paymentAgents]);
  const totalPages = Math.max(1, Math.ceil(history.length / rowsPerPage));
  const pagedHistory = useMemo(() => history.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [history, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
      result: { count: allOrders.length, reachedComponent: true, renderedRows: pagedHistory.length },
      counts: { saved: allOrders.filter((o) => o.status === "saved").length, draft: allOrders.filter((o) => o.status === "draft").length, archived: allOrders.filter((o) => o.status === "archived").length },
      customersLoadedCount: customers.length,
      sampleOrders: filteredOrders.slice(0, 5).map(summarizeOrderForLog),
      query: query.trim() || undefined,
    });
  }, [isFirebaseOrdersMode, isOrdersLoading, isCustomersLoading, ordersLoadError, firebaseOrders, orders, pagedHistory.length, filteredOrders, query, customers.length]);
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
  const paymentLabel = (p: any) => (p.creditBalance ?? 0) > 0 ? `${p.name} — Credit: ${formatAmount(p.creditBalance ?? 0)}` : p.name;

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

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filters, sortBy, rowsPerPage, mode]);


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

  useEffect(() => {
    if (wechatNormalizationStartedRef.current) return;
    if (isFirebaseOrdersMode && isOrdersLoading) return;

    const dirtyOrders = activeOrders.filter((order) => {
      const normalized = order.wechatId.trim();
      return normalized !== order.wechatId;
    });

    if (dirtyOrders.length === 0) {
      wechatNormalizationStartedRef.current = true;
      return;
    }

    wechatNormalizationStartedRef.current = true;

    void (async () => {
      try {
        if (isFirebaseOrdersMode) {
          for (const order of dirtyOrders) {
            await upsertFirebaseOrder({
              ...order,
              wechatId: order.wechatId.trim(),
              updatedAt: new Date().toISOString(),
            });
          }
          await reloadFirebaseOrders();
        } else {
          dirtyOrders.forEach((order) => {
            upsertOrder({
              ...order,
              wechatId: order.wechatId.trim(),
              updatedAt: new Date().toISOString(),
            });
          });
        }
        pushToast({ tone: "info", text: `Normalized WeChat ID spacing for ${dirtyOrders.length} saved order${dirtyOrders.length === 1 ? "" : "s"}.` });
      } catch (error) {
        wechatNormalizationStartedRef.current = false;
        pushToast({ tone: "danger", text: "Failed to normalize saved WeChat IDs." });
      }
    })();
  }, [activeOrders, isFirebaseOrdersMode, isOrdersLoading, pushToast, reloadFirebaseOrders, upsertFirebaseOrder, upsertOrder]);

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
    setOrderSaveState("saving");

    const meaningfulLines = getMeaningfulOrderLines(draft.lines).map((line) => withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)));
    const cleanedDraft = {
      ...draft,
      wechatId: draft.wechatId.trim(),
      lines: meaningfulLines,
      paymentAgentSnapshot: draft.paymentBy.trim() || draft.paymentAgentId ? draft.paymentAgentSnapshot : undefined,
    };

    if (status === "draft") {
      if (!hasAnyDraftContent(cleanedDraft)) return pushToast({ tone: "info", text: "Add at least one field before saving a draft." });
      if (!forceDraft && !validation.isValid) {
        setOrderSaveState("idle");
        setShowDraftIncompleteConfirm(true);
        return;
      }
      let resolvedDraftAgent = paymentAgents.find((agent) => agent.id === (cleanedDraft.paymentAgentId || cleanedDraft.paymentBy) || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(cleanedDraft.paymentBy)) ?? null;
      if (!resolvedDraftAgent && cleanedDraft.paymentBy.trim()) {
        try {
          resolvedDraftAgent = await resolveOrCreatePaymentAgentByName(cleanedDraft.paymentBy);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setOrderSaveState("idle");
          pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
          return;
        }
      }
      const draftOrder = {
        ...cleanedDraft,
        number: cleanedDraft.number,
        orderNumber: cleanedDraft.orderNumber || cleanedDraft.number,
        status: "draft" as const,
        paymentAgentId: resolvedDraftAgent?.id || "",
        paymentBy: resolvedDraftAgent?.id || cleanedDraft.paymentBy || "",
        paymentAgentSnapshot: resolvedDraftAgent
          ? { id: resolvedDraftAgent.id, name: resolvedDraftAgent.name, code: resolvedDraftAgent.agentCode }
          : cleanedDraft.paymentBy.trim()
            ? cleanedDraft.paymentAgentSnapshot
            : undefined,
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
        setOrderSaveState("idle");
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
      setOrderSaveState("idle");
      logDataFlow("Orders", JSON.stringify({ event: "draft_save_completed", orderId: draftOrder.id, persistedOrderNumber: draftOrder.number || draftOrder.orderNumber || "" }, null, 2));
      return pushToast({ tone: "success", text: "Draft saved. Use Complete Draft to finish it." });
    }

    setHasAttemptedFinalSave(true);
    logOrder("save_validation_result", { isValid: validation.isValid, missing: validation.missingFields.length, lineIssues: validation.lineIssues.length });
    if (!validation.isValid) {
      const missingItems = [
        ...validation.missingFields.map((item) => `${item}.`),
        ...validation.lineIssues.flatMap((line) => line.issues.map((issue) => `Line ${line.lineNumber}: ${issue}.`)),
      ];
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: missingItems });
      return;
    }

    const now = new Date().toISOString();
    logOrder("save_order_lines_before_resolution", { lines: draft.lines.map((l) => ({ lineId: l.id, customerId: l.customerId, customerName: l.customerName, lineTotal: (l.totalCtns||0)*(l.pcsPerCtn||0)*(l.rmbPerPcs||0) })) });
    const knownCustomerIdsBeforeSave = new Set(customers.map((customer) => customer.id));
    const knownPaymentAgentIdsBeforeSave = new Set(paymentAgents.map((agent) => agent.id));
    let resolvedLines = meaningfulLines;
    try {
      resolvedLines = (await resolveCustomersForOrderLines(meaningfulLines, customers, now)).map((line) =>
        withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)),
      );
      const knownIds = new Set(customers.map((c) => c.id));
      const affectedCustomerIds = Array.from(new Set(resolvedLines.map((l) => l.customerId).filter(Boolean)));
      const createdCustomerIds = affectedCustomerIds.filter((id) => !knownIds.has(id));
      const reusedCustomerIds = affectedCustomerIds.filter((id) => knownIds.has(id));
      logCustomer("save_order_customer_resolution_summary", { affectedCustomerIds, createdCustomerIds, reusedCustomerIds });
      logOrder("customer_resolution_success", { resolvedLines: resolvedLines.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError("customer_resolution_failure", { error: message });
      setOrderSaveState("idle");
      pushToast({ tone: "danger", text: message || "Customer resolution failed." });
      return;
    }
    const requestedOrderNumber = (draft.number || draft.orderNumber || "").trim();
    const duplicateOrder = activeOrders.find((o) => o.id !== draft.id && (o.number || o.orderNumber || "").trim() === requestedOrderNumber);
    if (requestedOrderNumber && duplicateOrder) {
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: [`Order Number ${requestedOrderNumber} already exists.`] });
      return;
    }
    let resolvedAgent = paymentAgents.find((agent) => agent.id === (cleanedDraft.paymentAgentId || cleanedDraft.paymentBy) || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(cleanedDraft.paymentBy)) ?? null;
    if (!resolvedAgent && cleanedDraft.paymentBy.trim()) {
      try {
        resolvedAgent = await resolveOrCreatePaymentAgentByName(cleanedDraft.paymentBy);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOrderSaveState("idle");
        pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
        return;
      }
    }
    const finalOrderNumber = requestedOrderNumber || await ensureFinalOrderNumber({ ...cleanedDraft, number: "", orderNumber: "", status: "saved" as const });
    const resolvedPaymentAgentId = resolvedAgent?.id || "";
    let savedOrder: Order & { paymentByName?: string; paymentAgentName?: string } = {
      ...cleanedDraft,
      number: finalOrderNumber,
      orderNumber: finalOrderNumber,
      lines: resolvedLines,
      status: "saved" as const,
      paymentAgentId: resolvedPaymentAgentId,
      paymentBy: resolvedPaymentAgentId || cleanedDraft.paymentBy,
      paymentByName: resolvedAgent?.name || cleanedDraft.paymentBy || "",
      paymentAgentName: resolvedAgent?.name || cleanedDraft.paymentBy || "",
      paymentAgentSnapshot: resolvedAgent
        ? { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode }
        : cleanedDraft.paymentBy.trim()
          ? cleanedDraft.paymentAgentSnapshot
          : undefined,
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
      setOrderSaveState("idle");
      pushToast({ tone: "danger", text: message });
      return;
    }
    const mergedOrders = activeOrders.some((o) => o.id === savedOrder.id) ? activeOrders.map((o) => (o.id === savedOrder.id ? savedOrder : o)) : [savedOrder, ...activeOrders];
    logCustomer("skipped_unrelated_customer_upserts", { reason: "normal_save_should_not_rewrite_unrelated_customers", affectedCustomerIds: Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean))) });
    const result: OrderSideEffectResult = { mode: editingOrderId ? "edit" : "create", orderSaved: true, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: !isFirebaseOrdersMode && Boolean(selectedPaymentAgentId), paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: editingOrderId ? false : true, blocked: false, warnings: [], errors: [] };
    const affectedCustomerIds = Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean)));
    const generatedProductIds = savedOrder.lines.map((l) => `order-line-${savedOrder.id}-${l.id}`);
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: savedOrder.id, orderNumber: savedOrder.number, mode: result.mode, affectedCustomerIds, affectedPaymentAgentId: savedOrder.paymentAgentId || savedOrder.paymentBy, generatedProductIds }, null, 2));

    setOrderSaveState("syncing");
    resetOrderComposer(false);
    pushToast({ tone: "success", text: "Order saved. Finishing background sync…" });

    void (async () => {
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

      if (result.warnings.length > 0) {
        if (result.productSyncFailures.length) pushToast({ tone: "info", text: `Order saved, but product sync failed for ${result.productSyncFailures.length} line.` });
        else if (!result.customerReceivablesApplied) pushToast({ tone: "info", text: "Order saved, but customer receivable update failed." });
        else if (!result.paymentSettlementApplied) pushToast({ tone: "info", text: "Order saved, but payment-agent settlement failed." });
        else pushToast({ tone: "info", text: `Order saved with warnings: ${result.warnings[0]}` });
      }
      setOrderSaveState("idle");
    })().catch((error) => {
      logError("order_side_effects_background_failure", { orderId: savedOrder.id, error: error instanceof Error ? error.message : String(error) });
      pushToast({ tone: "danger", text: "Order saved, but background sync failed." });
      setOrderSaveState("idle");
    });
    return;
  };

  const resetOrderComposer = (notify = true) => {
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    setDraft(createEmptyDraft(orders));
    setMode("history");
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    if (notify) pushToast({ tone: "info", text: "Draft reset to new order." });
  };

  const requestExitComposer = () => {
    if (!isOrderModalOpen) return;
    setShowExitConfirm(true);
  };

  const startEdit = async (o: Order) => {
    if (o.status === "draft" && !ensureFirebaseOrderWriteReady()) return;
    setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id)));
    const copy = JSON.parse(JSON.stringify(o));
    setDraft({ ...copy, wechatId: (copy.wechatId || "").trim(), lines: (copy.lines || []).map((line: Order["lines"][number]) => seedDetailBoxesFromLegacy(line)) });
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
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
      setShowExitConfirm(false);
      setValidationWarning({ visible: false, items: [] });
      setMode("add");
      logDataFlow("Orders", JSON.stringify({ event: "add_order_fresh_form_opened", orderId: nextDraft.id, orderNumber: nextDraft.number || nextDraft.orderNumber }, null, 2));
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not allocate order number." });
    }
  };
  const drafts = useMemo(() => (isFirebaseOrdersMode ? firebaseDraftOrders : orders.filter((o) => o.status === "draft")), [isFirebaseOrdersMode, orders, firebaseDraftOrders]);
  const formatPlainAmount = (value: number) => formatAmount(value);
  const getPaymentAgentMeta = (order: Order) => getOrderPaymentAgentDisplay(order, paymentAgents);
  const getLineCtns = (line: Order["lines"][number]) => Number(line.totalCtns) || 0;
  const getLinePcsPerCtn = (line: Order["lines"][number]) => Number(line.pcsPerCtn) || 0;
  const getLineTotalPcs = (line: Order["lines"][number]) => lineTotalPcs(line);
  const getLineRate = (line: Order["lines"][number]) => Number(line.rmbPerPcs) || 0;
  const getLineAmount = (line: Order["lines"][number]) => lineTotalRmb(line);
  const getOrderTotalCtns = (order: Order) => (order.lines || []).reduce((sum, line) => sum + getLineCtns(line), 0);
  const getOrderTotalAmount = (order: Order) => (order.lines || []).reduce((sum, line) => sum + getLineAmount(line), 0);
  const getFirstDraftPhoto = (order: Order) => order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.productPhotoUrl || order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.photoUrl || "";
  const renderDraftMissing = () => <span className="text-[var(--danger)]">Not present</span>;
  const getDraftMarkaSummary = (order: Order) => {
    const markas = Array.from(new Set(order.lines.map((line) => (line.marka || "").trim()).filter(Boolean)));
    if (markas.length === 0) return null;
    return markas.length === 1 ? markas[0] : `${markas[0]} +${markas.length - 1} more`;
  };
  const getLineProductPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
    return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
  };
  const getDisplayWechatId = (order: Order) => order.wechatId?.trim() || "—";
  const getVisibleLineDetails = (line: Order["lines"][number]) => {
    const parts = getLineDetailsParts(line);
    const values = [parts.detail1, parts.detail2, parts.detail3].map((part) => part.trim()).filter(Boolean);
    if (values.length > 0) return values;
    return line.details?.trim() ? [line.details.trim()] : [];
  };
  const getCardCustomerValue = (line: Order["lines"][number] | null, paymentMeta: ReturnType<typeof getOrderPaymentAgentDisplay>) => {
    const lineCustomer = line?.customerSnapshot?.name?.trim() || line?.customerName?.trim();
    if (lineCustomer) return lineCustomer;
    return paymentMeta.value?.trim() || "—";
  };
  const getHistoryRowTone = (loadingDate?: string) => {
    return "bg-[var(--bg-card)]";
  };
  const historyCalendarGroups = useMemo(() => {
    const groups = new Map<string, FlatHistoryRow[]>();
    pagedHistory.forEach((row) => {
      const key = row.order.loadingDate || row.order.date || "No Date";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [pagedHistory]);
const historyGridTemplate = "95px 115px minmax(48px,0.6fr) minmax(48px,0.48fr) 108px minmax(62px,0.66fr) 72px 48px 48px 86px 48px 74px 120px 102px";
  const fmtOrderDate = (order: Order) => {
    const raw = order.date || order.createdAt || order.updatedAt;
    if (!raw) return "—";
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

  const autosaveStatus = useDraftAutosave({ enabled: isFirebaseOrdersMode && (mode === "add" || mode === "edit"), draft, activeUploads, autosaveDraft, onSaved: (saved) => setDraft((d) => ({ ...d, id: saved.id })) });

  const removeOrder = (o: Order) => {
    setPendingDeleteOrder(o);
  };

  const confirmRemoveOrder = async () => {
    if (!pendingDeleteOrder || deleteBusy) return;
    const o = pendingDeleteOrder;
    setDeleteBusy(true);
    if (isFirebaseOrdersMode) {
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      try {
        await orderLifecycleService.softDeleteOrder(o, "orders-page");
      } catch (e) {
        logError("order_side_effect_step_failed", { orderId: o.id, mode: "soft_delete", step: "soft_delete_order", error: e instanceof Error ? e.message : String(e) });
        pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Order delete failed." });
        setDeleteBusy(false);
        return;
      }
      await reloadFirebaseOrders();
      await reloadCustomers();
      await reloadPaymentAgents();
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} moved to Recycle Bin.` });
      setPendingDeleteOrder(null);
      setDeleteBusy(false);
      return;
    }
    try {
      deleteOrder(o.id);
      await recalculateFromOrders(orders.filter((x) => x.id !== o.id && x.status === "saved"));
      await archiveProductsForOrder(o);
      pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} deleted and related generated products archived.` });
      if (editingOrderId === o.id) resetOrderComposer(false);
      setPendingDeleteOrder(null);
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Order delete failed." });
    } finally {
      setDeleteBusy(false);
    }
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

  useEffect(() => {
    if (!isOrderModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestExitComposer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOrderModalOpen]);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border bg-bg">
        <div className="min-w-[280px] flex-1 max-w-xl"><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search order no., payment agent, WeChat, marka, details, customer, amounts, status, dates..." leadingIcon={<Search size={15} />} /></div>
        <div className="relative" ref={pickerRef}>
          <Button size="sm" onClick={() => setPickerOpen((v) => !v)}><List size={14} /><span className="text-fg-muted">Order</span><span className="font-semibold">{(editingOrder?.number || draft.number || history[0]?.order.number || history[0]?.order.orderNumber || "—")}</span><ChevronDown size={13} /></Button>
          {pickerOpen && <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card max-h-[320px] overflow-y-auto">{activeOrders.slice(0,30).map((o) => <button key={o.id} onClick={() => { setPickerOpen(false); startEdit(o); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors"><div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{o.number || o.orderNumber || "Draft"}</span><span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span></div><div className="mt-0.5 text-[11.5px] text-fg-muted">{o.lines.length} lines Â· {formatPlainAmount(orderTotal(o))}</div></button>)}</div>}
        </div>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => { setFilterOpen((prev) => !prev); setSortOpen(false); }}><Filter size={14} />Filter</Button>
          {filterOpen ? <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-xl border border-border bg-bg-card p-3 shadow-card space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-subtle">Status<select className="input mt-1 h-8 w-full text-[12px]" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as OrdersFilterState["status"] }))}><option value="all">All</option><option value="draft">Draft</option><option value="saved">Saved</option><option value="packed">Loaded</option><option value="received">Received</option><option value="delayed">Delayed</option><option value="cancelled">Cancelled</option></select></label>
              <label className="text-[11px] text-fg-subtle">Loading Date<select className="input mt-1 h-8 w-full text-[12px]" value={filters.loadingDate} onChange={(e) => setFilters((prev) => ({ ...prev, loadingDate: e.target.value as OrdersFilterState["loadingDate"] }))}><option value="all">All</option><option value="set">Set</option><option value="unset">Not set</option></select></label>
              <label className="text-[11px] text-fg-subtle">Payment Agent<select className="input mt-1 h-8 w-full text-[12px]" value={filters.paymentAgent} onChange={(e) => setFilters((prev) => ({ ...prev, paymentAgent: e.target.value as OrdersFilterState["paymentAgent"] }))}><option value="all">All</option><option value="set">Set</option><option value="unset">Not set</option></select></label>
              <label className="text-[11px] text-fg-subtle">Order Number<Input className="mt-1 h-8 text-[12px]" value={filters.orderNumber} onChange={(e) => setFilters((prev) => ({ ...prev, orderNumber: e.target.value }))} placeholder="e.g. PP-302" /></label>
              <label className="text-[11px] text-fg-subtle">Date From<Input className="mt-1 h-8 text-[12px]" type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} /></label>
              <label className="text-[11px] text-fg-subtle">Date To<Input className="mt-1 h-8 text-[12px]" type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} /></label>
            </div>
            <label className="block text-[11px] text-fg-subtle">Customer<Input className="mt-1 h-8 text-[12px]" value={filters.customer} onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))} placeholder="Search customer" /></label>
            <label className="block text-[11px] text-fg-subtle">Marka / Product<Input className="mt-1 h-8 text-[12px]" value={filters.marka} onChange={(e) => setFilters((prev) => ({ ...prev, marka: e.target.value }))} placeholder="Search marka or details" /></label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFilters({ status: "all", loadingDate: "all", paymentAgent: "all", dateFrom: "", dateTo: "", orderNumber: "", customer: "", marka: "" })}>Reset</Button>
            </div>
          </div> : null}
        </div>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => { setSortOpen((prev) => !prev); setFilterOpen(false); }}><ArrowUpDown size={14} />Sort</Button>
          {sortOpen ? <div className="absolute left-0 top-full z-20 mt-2 w-[240px] rounded-xl border border-border bg-bg-card p-2 shadow-card">{[
            ["orderDateDesc", "Newest order date"],
            ["orderDateAsc", "Oldest order date"],
            ["loadingDate", "Loading date"],
            ["orderNumber", "Order number"],
            ["amountDesc", "Total amount high to low"],
            ["amountAsc", "Total amount low to high"],
            ["status", "Status"],
          ].map(([value, label]) => <button key={value} type="button" className={cn("block w-full rounded-md px-3 py-2 text-left text-[12px] transition-colors hover:bg-bg-subtle", sortBy === value && "bg-bg-subtle font-medium")} onClick={() => { setSortBy(value as OrdersSortOption); setSortOpen(false); }}>{label}</button>)}</div> : null}
        </div>
        <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">{([{ v: "list", I: List }, { v: "grid", I: LayoutGrid }, { v: "calendar", I: CalendarDays }] as const).map(({ v, I }) => <button key={v} onClick={() => setView(v)} className={cn("grid h-6 w-7 place-items-center rounded-md text-fg-muted transition-colors", view===v && "bg-brand text-brand-fg")}><I size={13} /></button>)}</div>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant={mode === "drafts" ? "primary" : "secondary"} onClick={() => setMode((prev) => prev === "drafts" ? "history" : "drafts")}>Draft ({drafts.length})</Button>
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
                    <td className="px-4 py-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">{photo ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage({ src: photo, alt: "Draft line photo" })}><img src={photo} alt="draft line" className="h-full w-full object-cover" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">—</span>}</div></td>
                    <td>{o.wechatId?.trim() ? <span>{o.wechatId.trim()}</span> : renderDraftMissing()}</td>
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

        {view === "grid" ? (
          <section className="card overflow-hidden">
            {pagedHistory.length === 0 ? <div className="py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</div> : <div>{pagedHistory.map((row) => {
              const { order, line, paymentMeta } = row;
              const rowValue = getRowValue(order);
              const rowDirty = rowValue.loadingDate !== order.loadingDate || rowValue.status !== order.status;
              const canEditOperationalFields = order.status !== "draft" && order.status !== "archived";
              const productPhoto = line ? getLineProductPhoto(line) : "";
              const detailLines = line ? getVisibleLineDetails(line) : [];
              const customerValue = getCardCustomerValue(line, paymentMeta);
              const totalPcs = line ? getLineTotalPcs(line) : 0;
              const ctns = line ? getLineCtns(line) : getOrderTotalCtns(order);
              const pcsPerCtn = line ? getLinePcsPerCtn(line) : 0;
              const rate = line ? getLineRate(line) : 0;
              const amount = line ? getLineAmount(line) : getOrderTotalAmount(order);
              return <div
                key={row.key}
                className="w-full border-b border-border bg-[var(--bg-card)] last:border-b-0"
              >
                <div className="flex flex-col gap-5 border-b border-[#e8ebef] px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-stretch">
                    <div className="min-w-[180px]">
                      <div className="text-[26px] font-extrabold leading-none text-slate-950">{order.number || order.orderNumber || "Draft"}</div>
                      <div className="mt-3 flex items-center gap-2 text-[15px] font-medium text-slate-500">
                        <CalendarDays size={16} />
                        <span>{fmtOrderDate(order)}</span>
                      </div>
                    </div>
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="min-w-[220px] text-center">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-400">Customer</div>
                      <div className="mt-3 flex items-center gap-3 text-[21px] font-bold leading-tight text-slate-950">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/92 text-slate-600 shadow-sm ring-1 ring-[#e6e8ec]">
                          <UserRound size={19} />
                        </span>
                        <span className="min-w-0 break-words">{customerValue || "—"}</span>
                      </div>
                    </div>
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="min-w-[220px] text-center">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-400">WeChat ID</div>
                      <div className="mt-3 flex items-center gap-3 text-[21px] font-bold leading-tight text-slate-950">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-200">
                          <MessageCircleMore size={19} />
                        </span>
                        <span className="min-w-0 break-words">{getDisplayWechatId(order)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:self-stretch">
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                      <div className="text-[12px] [&_button]:max-w-full">
                        {canEditOperationalFields ? (
                          <OrderStatusControl
                            neutral={false}
                            debugOrderId={order.id}
                            options={resolveStatusOptions(order, rowValue)}
                            value={rowValue.status}
                            onChange={(next) => { setRowEdit(order, { status: next }, "status_selected"); }}
                            showDot
                            portalWidth={220}
                            buttonClassName="h-11 rounded-full border border-[#dfe3e8] bg-white px-5 text-[18px] font-extrabold text-slate-800 shadow-sm"
                          />
                        ) : (
                          <span className="inline-flex h-11 items-center gap-3 rounded-full border border-[#dfe3e8] bg-white px-5 text-[18px] font-extrabold text-slate-800 shadow-sm">
                            <span className="h-2.5 w-2.5 rounded-full bg-current/80" />
                            <span>{order.status === "packed" ? "Loaded" : order.status}</span>
                          </span>
                        )}
                      </div>
                      <button type="button" title="View" aria-label="View" className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-[#e5e7eb] bg-white/95 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white" onClick={() => setViewOrder(order)}><Eye size={22} /></button>
                      <button type="button" title="Edit" aria-label="Edit" className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-[#e5e7eb] bg-white/95 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white" onClick={() => startEdit(order)}><SquarePen size={22} /></button>
                      <button type="button" title="Delete" aria-label="Delete" className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-rose-100 bg-white/95 text-rose-600 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-rose-50" onClick={() => removeOrder(order)}><Trash2 size={22} /></button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-6 border-b border-[#e8ebef] px-7 py-7 lg:flex-row lg:items-center">
                  <div className="shrink-0">
                    {productPhoto ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ src: productPhoto, alt: "Product photo" })}
                        className="grid h-[132px] w-[132px] place-items-center overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/90 shadow-sm"
                      >
                        <img src={getCloudinaryOptimizedUrl(productPhoto, { width: 280, height: 280, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" />
                      </button>
                    ) : (
                      <div className="grid h-[132px] w-[132px] place-items-center rounded-2xl border border-dashed border-[#d8dce2] bg-white/70 text-center text-[14px] font-medium text-slate-400">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[28px] font-extrabold leading-tight text-slate-950">{line?.marka?.trim() || "—"}</div>
                    {detailLines.length ? <div className="mt-3 text-[19px] font-medium leading-relaxed text-slate-600">{detailLines.join(" · ")}</div> : null}
                    <div className="mt-5 text-[19px] leading-relaxed">
                      <span className="font-medium text-slate-500">WeChat: </span>
                      <span className="font-semibold text-emerald-700">{getDisplayWechatId(order)}</span>
                    </div>
                  </div>
                </div>
                <div className="px-7 py-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center">
                    {[
                      { label: "CTNS", value: formatPlainAmount(ctns), icon: <Package2 size={21} />, tint: "bg-violet-100 text-violet-700", valueClass: "text-slate-950" },
                      { label: "PCS/CTN", value: formatPlainAmount(pcsPerCtn), icon: <Boxes size={21} />, tint: "bg-orange-100 text-orange-700", valueClass: "text-slate-950" },
                      { label: "TOTAL PCS", value: formatPlainAmount(totalPcs), icon: <ShoppingBag size={21} />, tint: "bg-sky-100 text-sky-700", valueClass: "text-slate-950" },
                      { label: "RATE", value: formatPlainAmount(rate), icon: <BadgePercent size={21} />, tint: "bg-rose-100 text-rose-700", valueClass: "text-slate-950" },
                      { label: "TOTAL AMOUNT", value: formatPlainAmount(amount), icon: <IndianRupee size={23} />, tint: "bg-emerald-100 text-emerald-700", valueClass: "text-emerald-700 text-[30px]" },
                    ].map((stat, index) => (
                      <div key={`${row.key}-${stat.label}`} className={cn("flex min-w-0 items-center gap-4 rounded-2xl lg:rounded-none", index < 5 && "lg:pr-4", index < 4 && "lg:border-r lg:border-[#e8ebef]")}>
                        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", stat.tint)}>
                          {stat.icon}
                        </div>
                        <div className="min-w-0 text-center">
                          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</div>
                          <div className={cn("mt-1 text-[25px] font-extrabold leading-none", stat.valueClass)}>{stat.value}</div>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white/85 px-4 py-4 text-center shadow-sm lg:ml-auto lg:min-w-[220px]">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400">Loading Date</div>
                      <div className="w-full [&_button]:w-full">
                        {canEditOperationalFields ? (
                          <LoadingDateControl
                            debugOrderId={order.id}
                            value={rowValue.loadingDate}
                            onChange={(next) => { setRowEdit(order, { loadingDate: next }, "date_selected"); }}
                            portalWidth={280}
                            buttonClassName="flex h-11 w-full items-center justify-between rounded-2xl border border-[#dfe3e8] bg-white px-4 text-[18px] font-semibold text-slate-800 shadow-sm"
                          />
                        ) : (
                          <span className="inline-flex h-11 w-full items-center justify-between rounded-2xl border border-[#dfe3e8] bg-white px-4 text-[18px] font-semibold text-slate-800 shadow-sm">
                            <span className="inline-flex items-center gap-3">
                              <CalendarDays size={18} className="text-slate-400" />
                              <span>{order.loadingDate ? formatDate(order.loadingDate) : "Set date"}</span>
                            </span>
                            <ChevronDown size={18} className="text-slate-400" />
                          </span>
                        )}
                      </div>
                      {canEditOperationalFields && rowDirty ? <button type="button" className="text-[13px] font-semibold text-brand transition hover:underline" onClick={() => { void saveRowEdit(order); }}>{rowValue.saving ? "Saving..." : "Save changes"}</button> : null}
                    </div>
                  </div>
                </div>
              </div>;
            })}</div>}
          </section>
        ) : null}

        {view === "calendar" ? (
          <section className="card p-4">
            {historyCalendarGroups.length === 0 ? <div className="py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</div> : <div className="space-y-4">{historyCalendarGroups.map(([dateKey, rows]) => <div key={dateKey} className="space-y-2"><div className="text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{dateKey === "No Date" ? "No Date" : formatDate(dateKey)}</div><div className="grid gap-2">{rows.map((row) => {
              const productPhoto = row.line ? getLineProductPhoto(row.line) : "";
              return <div key={row.key} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
                <div className="min-w-[88px]">
                  <div className="text-[14px] font-bold">{row.order.number || row.order.orderNumber || "Draft"}</div>
                  <div className="text-[11px] text-fg-subtle">{getDisplayWechatId(row.order)}</div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-subtle">{productPhoto ? <img src={getCloudinaryOptimizedUrl(productPhoto, { width: 80, height: 80, crop: "fit" })} alt="product" className="h-full w-full object-contain" /> : <span className="text-[10px] text-fg-subtle">—</span>}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{row.line?.marka?.trim() || "—"}</div>
                  <div className="truncate text-[12px] text-fg-subtle">{row.line ? getVisibleLineDetails(row.line).join(" · ") || "—" : "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] text-fg-subtle">{getPaymentAgentMeta(row.order).value}</div>
                  <div className="text-[15px] font-bold text-[var(--success)]">{formatPlainAmount(row.line ? getLineAmount(row.line) : getOrderTotalAmount(row.order))}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => setViewOrder(row.order)}><Eye size={14} /></button>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => startEdit(row.order)}><SquarePen size={14} /></button>
                </div>
              </div>;
            })}</div></div>)}</div>}
          </section>
        ) : null}

        {view === "list" && <section className="card overflow-hidden">
          {/* <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing 1 to {pagedHistory.length} of {history.length} rows</div></div> */}
          <div className="overflow-x-auto">
            <div className="w-full min-w-0 px-0.5 py-1">
              <div className="grid items-center border-b border-border bg-white text-[12px] font-semibold uppercase tracking-[0.01em] text-fg-muted" style={{ gridTemplateColumns: historyGridTemplate }}>
                <div className="px-1 py-1.5 text-center">Order Number</div>
                <div className="px-1 py-1.5 text-center">Loading Date</div>
                <div className="px-1 py-1.5 text-center">Paid By</div>
                <div className="px-1 py-1.5 text-left">WeChat ID</div>
                <div className="px-1 py-1.5 text-center"> Photo</div>
                <div className="px-1 py-1.5 text-left">Marka</div>
                <div className="px-1 py-1.5 text-left">Details</div>
                <div className="px-1 py-1.5 text-center">CTNS</div>
                <div className="px-1 py-1.5 text-center leading-[1.05]"><div>PCS/</div><div>CTN</div></div>
                <div className="px-1 py-1.5 text-center">Total PCS</div>
                <div className="px-1 py-1.5 text-center">Rate</div>
                <div className="px-1 py-1.5 text-right">Total Amount</div>
                <div className="px-1 py-1.5 text-center">Status</div>
                <div className="px-1 py-1.5 text-center">Actions</div>
              </div>
              <div className="space-y-2 pt-2">
                {pagedHistory.length === 0 ? <div className="px-4 py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</div> : pagedHistory.map((row) => {
                  const { order, line, paymentMeta } = row;
                  const paymentName = paymentMeta.value;
                  const canEditOperationalFields = order.status !== "draft" && order.status !== "archived";
                  const rowValue = getRowValue(order);
                  const rowDirty = rowValue.loadingDate !== order.loadingDate || rowValue.status !== order.status;
                  const effectiveLoadingDate = rowValue.loadingDate || order.loadingDate;
                  const rowClass = "grid items-center border-b border-border transition-colors last:border-b-0";
                  const productPhoto = line ? getLineProductPhoto(line) : "";
                  const detailLines = line ? getVisibleLineDetails(line) : [];
                  const detailTitle = detailLines.length > 0 ? detailLines.join("\n") : "—";
                  const ctns = line ? getLineCtns(line) : getOrderTotalCtns(order);
                  const pcsPerCtn = line ? getLinePcsPerCtn(line) : 0;
                  const totalPcs = line ? getLineTotalPcs(line) : 0;
                  const rate = line ? getLineRate(line) : 0;
                  const amount = line ? getLineAmount(line) : getOrderTotalAmount(order);
                  const marka = line?.marka?.trim() || "—";

                  return <div key={row.key} className={rowClass} style={{ gridTemplateColumns: historyGridTemplate }}>
                    <div className="min-w-0 pl-2 pr-1 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[17px] font-bold leading-tight" title={order.number || order.orderNumber || "Draft"}>{order.number || order.orderNumber || "Draft"}</div>
                        <div className="mt-0.5 text-[12px] text-fg-subtle tabular-nums">{fmtOrderDate(order)}</div>
                      </div>
                    </div>
                    <div className="min-w-0 pl-1 pr-3 py-2">
                      <div className="min-w-0 [&_button]:max-w-full [&_button]:text-[13.5px] [&_button]:leading-tight">
                        {canEditOperationalFields ? <LoadingDateControl compact debugOrderId={order.id} value={rowValue.loadingDate} onChange={(next) => { setRowEdit(order, { loadingDate: next }, "date_selected"); }} /> : <span className="inline-flex max-w-full whitespace-nowrap rounded-full border border-border bg-bg-subtle px-1.5 py-0.5 text-[10.5px] text-fg-muted">{order.loadingDate ? formatDate(order.loadingDate) : "Set date"}</span>}
                      </div>
                    </div>
                    <div className="min-w-0 pl-2 pr-1 py-2"><div className={cn("block w-full min-w-0 truncate text-[14px] font-semibold leading-tight", paymentMeta.isMissing && "text-[var(--danger)]")} title={paymentName}>{paymentName}</div></div>
                    <div className="min-w-0 px-1 py-2"><div className="block w-full min-w-0 truncate text-[14px] font-semibold leading-tight" title={getDisplayWechatId(order)}>{getDisplayWechatId(order)}</div></div>
                    <div className="min-w-0 px-1 py-2"><div className="flex justify-center">{productPhoto ? <button type="button" onClick={() => setPreviewImage({ src: productPhoto, alt: "Product photo" })} className="grid h-[80px] w-[80px] shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle"><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 132, height: 132, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">—</span>}</div></div>
                    <div className="min-w-0 px-1 py-2"><div className="text-[14px] text-[15px] font-semibold leading-tight" title={marka}>{marka}</div></div>
                    <div className="min-w-0 px-1 py-2"><div className="space-y-px text-[14px] font-medium leading-[1.15] text-fg" title={detailLines.length > 0 ? detailLines.join("\n") : "—"}>{detailLines.length > 0 ? detailLines.map((detail, index) => <div key={`${row.key}-detail-${index}`}>{detail}</div>) : <div>—</div>}</div></div>
                    <div className="px-1 py-2 text-center text-[14px] font-semibold tabular-nums">{ctns.toLocaleString()}</div>
                    <div className="px-1 py-2 text-center text-[14px] font-semibold tabular-nums">{pcsPerCtn.toLocaleString()}</div>
                    <div className="px-1 py-2 text-center text-[14x] font-semibold tabular-nums">{totalPcs.toLocaleString()}</div>
                    <div className="px-1 py-2 text-center text-[14px] font-semibold tabular-nums">{formatPlainAmount(rate)}</div>
                    <div className="px-1 py-2 text-right text-[16px] font-bold tabular-nums ">{formatPlainAmount(amount)}</div>
                    <div className="min-w-0 px-1 py-2 text-center"><div className="mx-auto max-w-full text-[12px] [&_button]:max-w-full">{canEditOperationalFields ? <OrderStatusControl compact neutral debugOrderId={order.id} options={resolveStatusOptions(order, rowValue)} value={rowValue.status} onChange={(next) => { setRowEdit(order, { status: next }, "status_selected"); }} /> : <span className="inline-flex rounded-full border border-border bg-bg-subtle px-1 py-0.5 text-[12px] text-fg">{order.status === "packed" ? "Loaded" : order.status}</span>}</div>{canEditOperationalFields && rowDirty ? <button type="button" title="Save row changes" aria-label="Save row changes" className="mt-1 inline-flex text-[10.5px] font-semibold text-brand transition-colors hover:underline disabled:opacity-60" disabled={rowValue.saving} onClick={() => { void saveRowEdit(order); }}>{rowValue.saving ? "Saving..." : "Save"}</button> : null}</div>
                    <div className="px-0.5 py-2"><div className="flex justify-center gap-1 whitespace-nowrap"><button type="button" title="View" aria-label="View" className="grid h-[26px] w-[26px] place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => setViewOrder(order)}><Eye size={13} /></button><button type="button" title="Edit" aria-label="Edit" className="grid h-[26px] w-[26px] place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => startEdit(order)}><SquarePen size={13} /></button><button type="button" title="Delete" aria-label="Delete" className="grid h-[26px] w-[26px] place-items-center rounded-md text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10" onClick={() => removeOrder(order)}><Trash2 size={13} /></button></div></div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </section>}
      <ImageLightbox src={previewImage?.src} alt={previewImage?.alt} caption={previewImage?.caption} open={Boolean(previewImage?.src)} onClose={() => setPreviewImage(null)} />
      </main>
      {isOrderModalOpen && <div className="fixed inset-0 z-50 bg-black/45 p-3 md:p-6" onClick={requestExitComposer}>
        <div className="relative mx-auto w-full max-w-[1400px] h-[90vh] rounded-2xl border border-border bg-bg-card shadow-card flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-border px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-semibold">{editingOrder ? (editingOrder.status === "draft" ? "Complete Draft" : "Edit Order") : "Add Order"}</h3>
                {isFirebaseOrdersMode && <div className="text-[11px] text-fg-subtle mt-0.5">{autosaveStatus === "saving" ? "Saving draft..." : autosaveStatus === "saved" ? "Draft saved" : autosaveStatus === "error" ? "Draft autosave failed" : ""}</div>}
              </div>
              <Button size="sm" variant="secondary" onClick={requestExitComposer} aria-label="Close order editor"><X size={16} /></Button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[minmax(220px,0.8fr)_minmax(145px,0.55fr)_minmax(145px,0.55fr)_minmax(160px,0.55fr)_minmax(220px,0.8fr)]">
              <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted"><span>Payment By</span><div className="relative"><Input value={headerPaymentQuery} onFocus={() => setHeaderPaymentOpen(true)} onBlur={() => window.setTimeout(() => setHeaderPaymentOpen(false),120)} onChange={(e)=>{const next=e.target.value;
setHeaderPaymentQuery(next); setHeaderPaymentOpen(true); setDraft((d)=>({...d,paymentBy:next,paymentAgentId:"", paymentAgentSnapshot: undefined}));}} placeholder="Search payment agent" />{headerPaymentQuery || draft.paymentAgentId || draft.paymentBy ? <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-fg-subtle transition-colors hover:text-fg" onMouseDown={(e) => { e.preventDefault(); setHeaderPaymentQuery(""); setHeaderPaymentOpen(false); setDraft((d) => ({ ...d, paymentBy: "", paymentAgentId: "", paymentAgentSnapshot: undefined })); }}>Clear</button> : null}{headerPaymentOpen && headerPaymentSuggestions.length>0 ? <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">{headerPaymentSuggestions.map((p)=><button key={p.id} type="button" className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderPaymentOpen(false); const label=paymentLabel(p); setHeaderPaymentQuery(label); setDraft((d)=>({...d,paymentBy:p.id,paymentAgentId:p.id, paymentAgentSnapshot: { id: p.id, name: p.name, code: p.agentCode }}));}}>{paymentLabel(p)}</button>)}</div>:null}</div></label>
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
              <button className="text-amber-800 text-xs rounded px-1 py-0.5 hover:bg-amber-100" onClick={() => setValidationWarning({ visible: false, items: [] })}><X size={14} /></button>
            </div>
          </div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderForm showOrderInfo={false} draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} customerSuggestions={customerSuggestions} onPreviewImage={(src) => setPreviewImage({ src, alt: "Order line photo preview" })} />
          </div>
          <OrderFooter total={total} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={orderSaveState === "saving" ? "Saving Order..." : orderSaveState === "syncing" ? "Syncing..." : (editingOrderId ? "Save Changes" : "Save Order")} saveDraftLabel={orderSaveState === "saving" ? "Saving Draft..." : "Save as Draft"} disableSaveDraft={orderSaveState !== "idle"} disableSaveOrder={orderSaveState !== "idle"} paymentAgent={selectedPaymentAgent} settlement={settlement} paidNow={draft.paidToPaymentAgentNow ?? 0} onPaidNowChange={(value) => setDraft((d) => ({ ...d, paidToPaymentAgentNow: Math.max(0, Number(value) || 0) }))} />
        </div>
      </div>}
      {showExitConfirm ? <div className="fixed inset-0 z-[65] bg-black/50 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Exit order editor?</div><div className="text-sm text-fg-subtle">Pressing Escape or closing the modal will not discard your work immediately. Choose what to do with the current order.</div><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setShowExitConfirm(false)}>Continue editing</Button><Button variant="secondary" onClick={() => resetOrderComposer()}>Exit without saving</Button><Button variant="primary" onClick={() => { setShowExitConfirm(false); void onSave("draft", true); }}>Save as Draft</Button></div></div></div> : null}
      {showDraftIncompleteConfirm && <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Save incomplete draft?</div><div className="text-sm text-fg-subtle">This draft has empty required fields. Save it anyway?</div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowDraftIncompleteConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => onSave("draft", true)}>Save Draft Anyway</Button></div></div></div>}
      <ConfirmDialog
        open={Boolean(pendingDeleteOrder)}
        title="Delete this order?"
        description={pendingDeleteOrder ? `Do you want to delete order ${pendingDeleteOrder.number || pendingDeleteOrder.orderNumber}?` : ""}
        confirmLabel={isFirebaseOrdersMode ? "Move to Recycle Bin" : "Delete Order"}
        danger
        busy={deleteBusy}
        onCancel={() => { if (!deleteBusy) setPendingDeleteOrder(null); }}
        onConfirm={() => { void confirmRemoveOrder(); }}
      />
      <LoadingOverlay
        open={orderSaveState !== "idle" || isOrdersLoading || isCustomersLoading || paymentAgentsLoading}
        title={orderSaveState === "saving" ? "Saving order" : orderSaveState === "syncing" ? "Finishing sync" : "Loading"}
        message={orderSaveState === "saving" ? "Saving your order now…" : orderSaveState === "syncing" ? "Order is saved. Updating linked data in the background…" : "Fetching the latest data…"}
      />
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} />
    </div>
  );
}
