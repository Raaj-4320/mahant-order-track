"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatAmount, formatDate } from "@/lib/data";
import { formatDisplayNumber, formatWholeMoney } from "@/lib/numbers";
import { formatIndianDate } from "@/lib/dateFormat";
import { Customer, Order, OrderNumberSeries, PaymentAgent, PaymentAgentOrderSplit, lineTotalPcs, lineTotalRmb, orderLinesTotal, orderShippingPrice, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { calculatePaymentAgentSettlement } from "@/services/settlement/paymentAgentSettlement";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { useOrderNumberSeries } from "@/hooks/useOrderNumberSeries";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { hasAnyDraftContent, validateOrderForSave } from "@/services/orderValidation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { useCustomers } from "@/hooks/useCustomers";
import { customerLedgerService } from "@/services/customerLedgerService";
import { applyTypedCustomerToLine, CUSTOMER_NOT_LINKED, findCustomerByTypedName, getLineCustomerDisplay, getResolvedLineCustomerName, resolveCustomersForOrderLines } from "@/services/customers/customerResolution";
import { createCustomerIdFromName, normalizeCustomerName } from "@/services/customers/customerIdentity";
import { logCustomer, logDB, logError, logOrder, logPageAccess, logDataFlow } from "@/lib/logger";
import { BadgePercent, Boxes, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, IndianRupee, LayoutGrid, List, MessageCircleMore, Moon, Package2, Search, ShoppingBag, SquarePen, Sun, Trash2, WalletCards, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getOrderPaymentAgentDisplay, resolveOrderPaymentAgent } from "@/lib/orderDisplay";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { useTheme } from "@/components/ThemeProvider";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { TablePagination } from "@/components/table/TablePagination";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import { LoadingDateControl } from "@/components/orders/LoadingDateControl";
import { OrderStatusControl } from "@/components/orders/OrderStatusControl";
import { PaymentAgentHeaderPicker } from "@/components/orders/PaymentAgentHeaderPicker";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";
import { getLineDetailsParts, joinLineDetails, seedDetailBoxesFromLegacy, withDerivedLegacyDetails } from "@/lib/orderLineDetails";
import { orderLifecycleService } from "@/services/orderLifecycleService";
import { getMeaningfulOrderLines } from "@/services/orderValidation";
import { buildSeriesPrefix, deriveOrderSeriesFields, formatSeriesOrderNumber, getSeriesSuggestion, normalizeSeriesLabel, orderNumberExists, parseOrderNumber } from "@/lib/orderNumberSeries";
import { getOrderNumberSeriesService } from "@/services/orderNumberSeriesService";
import { getPaymentAgentsService } from "@/services/paymentAgentsService";
import { measurePerfAsync, measurePerfSync, runPerfAction } from "@/lib/perfDebug";
import { getOrderPaymentAgentSplits } from "@/services/settlement/paymentAgentSplits";

const today = () => new Date().toISOString().slice(0, 10);
const createPaymentAgentSplitId = () => `pas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createEmptyPaymentAgentSplit = (): PaymentAgentOrderSplit => ({
  id: createPaymentAgentSplitId(),
  paymentAgentId: "",
  paymentBy: "",
  paymentAgentName: "",
  assignedAmount: 0,
  paidNow: 0,
});
const LAST_SELECTED_ORDER_SERIES_KEY = "orders:lastSelectedSeriesId";
const LAST_SELECTED_ORDER_CATEGORY_KEY = "orders:lastSelectedCategory";
const PAGE_SIZE = 100;
const SAVE_AUDIT_ENABLED = process.env.NODE_ENV !== "production";
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
  shippingPrice: 0,
  paymentAgentSplits: [createEmptyPaymentAgentSplit()],
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
type OutsideEditField =
  | "orderNumber"
  | "wechat"
  | "payment"
  | "customer"
  | "marka"
  | "details"
  | "totalCtns"
  | "pcsPerCtn"
  | "rate"
  | "shipping"
  | (string & {});
type OutsideEditState = {
  activeField: OutsideEditField | null;
  lineId?: string;
  value: string;
  saving: boolean;
  customerSelection?: {
    customerId: string;
    customerName: string;
    customerSnapshot?: Order["lines"][number]["customerSnapshot"];
  } | null;
};
type OutsideEditConfirmState = {
  orderId: string;
  field: OutsideEditField;
  lineId?: string;
};
type FlatHistoryRow = {
  key: string;
  order: Order;
  line: Order["lines"][number] | null;
  extraLines: Order["lines"][number][];
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

type SaveTimingStep = {
  step: string;
  at: number;
  meta?: Record<string, unknown>;
};

const createSaveTimingProfile = (label: string, meta?: Record<string, unknown>) => {
  const perf = typeof performance !== "undefined" ? performance : null;
  const startedAt = perf?.now() ?? Date.now();
  const steps: SaveTimingStep[] = [{ step: "save:start", at: startedAt, meta }];
  let flushed = false;

  const mark = (step: string, nextMeta?: Record<string, unknown>) => {
    const at = perf?.now() ?? Date.now();
    steps.push({ step, at, meta: nextMeta });
    return at;
  };

  const flush = (finalStep = "save:done", nextMeta?: Record<string, unknown>) => {
    if (flushed) return;
    flushed = true;
    const finalAt = mark(finalStep, nextMeta);
    if (!SAVE_AUDIT_ENABLED) return;
    const rows = steps.map((entry, index) => ({
      step: entry.step,
      elapsedMs: Number((entry.at - startedAt).toFixed(2)),
      deltaMs: Number((entry.at - (index === 0 ? startedAt : steps[index - 1]!.at)).toFixed(2)),
      meta: entry.meta ? JSON.stringify(entry.meta) : "",
    }));
    console.groupCollapsed(`[Orders Save Audit] ${label} | ${Number((finalAt - startedAt).toFixed(2))}ms`);
    console.table(rows);
    console.groupEnd();
  };

  return { mark, flush };
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
  customerNames: Array.from(new Set(o.lines.map((l) => getResolvedLineCustomerName(l)).filter(Boolean))).slice(0, 10),
  supplierNames: Array.from(new Set(o.lines.map((l) => l.supplierName || l.supplierSnapshot?.name || "").filter(Boolean))).slice(0, 10),
  generatedLineIds: o.lines.map((l) => l.id),
  linePhotoFlags: o.lines.map((l) => ({ lineId: l.id, hasProductPhoto: Boolean(l.productPhotoUrl), hasDimensionPhoto: Boolean(l.photoUrl) })),
});

const normalizePaymentAgentValue = (value?: string) => (value || "").trim().toLowerCase();
const normalizePaymentSplitAmount = (value: number | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const normalizeDraftPaymentSplit = (split: PaymentAgentOrderSplit): PaymentAgentOrderSplit => ({
  ...split,
  id: split.id || createPaymentAgentSplitId(),
  paymentAgentId: (split.paymentAgentId || "").trim(),
  paymentBy: (split.paymentBy || "").trim(),
  paymentAgentName: (split.paymentAgentName || "").trim(),
  paymentAgentSnapshot: split.paymentAgentSnapshot
    ? {
        id: (split.paymentAgentSnapshot.id || "").trim(),
        name: (split.paymentAgentSnapshot.name || "").trim(),
        code: (split.paymentAgentSnapshot.code || "").trim() || undefined,
      }
    : undefined,
  assignedAmount: normalizePaymentSplitAmount(split.assignedAmount),
  paidNow: normalizePaymentSplitAmount(split.paidNow),
  note: (split.note || "").trim() || undefined,
});
const isPaymentAgentSplitEmpty = (split: PaymentAgentOrderSplit) =>
  !(split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name || normalizePaymentSplitAmount(split.assignedAmount) || normalizePaymentSplitAmount(split.paidNow) || (split.note || "").trim());
const getEditablePaymentAgentSplits = (order: Order): PaymentAgentOrderSplit[] => {
  const existing = getOrderPaymentAgentSplits(order).map(normalizeDraftPaymentSplit);
  return existing.length > 0 ? existing : [createEmptyPaymentAgentSplit()];
};
const applyLegacyPaymentAgentFromSplits = (order: Order, rawSplits: PaymentAgentOrderSplit[]): Order => {
  const splits = rawSplits.map(normalizeDraftPaymentSplit);
  const firstSplit = splits.find((split) => !isPaymentAgentSplitEmpty(split)) ?? null;
  return {
    ...order,
    paymentAgentSplits: splits,
    paymentAgentId: firstSplit?.paymentAgentId || "",
    paymentBy: firstSplit ? firstSplit.paymentAgentId || firstSplit.paymentBy || firstSplit.paymentAgentName || "" : "",
    paymentByName: firstSplit?.paymentAgentName || "",
    paymentAgentName: firstSplit?.paymentAgentName || "",
    paymentAgentSnapshot: firstSplit?.paymentAgentSnapshot
      ? {
          id: firstSplit.paymentAgentSnapshot.id || "",
          name: firstSplit.paymentAgentSnapshot.name || "",
          code: firstSplit.paymentAgentSnapshot.code || undefined,
        }
      : undefined,
    paidToPaymentAgentNow: firstSplit?.paidNow ?? 0,
  };
};
const hasLinkedPaymentAgent = (order: Pick<Order, "paymentBy" | "paymentAgentId">) =>
  Boolean(order.paymentBy.trim() || order.paymentAgentId.trim());
const hasLinkedCustomerInOrder = (order: Pick<Order, "lines">) =>
  order.lines.some((line) => Boolean(line.customerId?.trim()));
const normalizeEditableOrderNumber = (value?: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^.+-\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return trimmed;
  const [, prefix, digits] = match;
  return `${prefix}${String(Number(digits))}`;
};

const getStoredSelectedSeriesId = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_SELECTED_ORDER_SERIES_KEY) || "";
};
const getStoredSelectedCategory = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_SELECTED_ORDER_CATEGORY_KEY) || "";
};

function OutsideCustomerEditor({
  value,
  inputClassName,
  placeholder,
  saving,
  suspendCancel,
  customerOptions,
  onChange,
  onEnter,
  onEscape,
  onCancel,
  onSelect,
}: {
  value: string;
  inputClassName: string;
  placeholder: string;
  saving: boolean;
  suspendCancel: boolean;
  customerOptions: string[];
  onChange: (nextValue: string) => void;
  onEnter: () => void;
  onEscape: () => void;
  onCancel: () => void;
  onSelect: (option: string) => void;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const updateLayout = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLayout({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, []);

  return (
    <div ref={anchorRef} className="relative z-30">
      <Input
        value={value}
        autoFocus
        placeholder={placeholder}
        className={inputClassName}
        compact
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onEscape();
          }
        }}
        onBlur={() => {
          if (!saving && !suspendCancel) {
            window.setTimeout(() => onCancel(), 120);
          }
        }}
      />
      {layout && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[9999] max-h-52 overflow-auto rounded-xl border border-black/10 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
              style={{ top: layout.top, left: layout.left, width: layout.width }}
            >
              {customerOptions.length === 0 ? (
                <div className="px-3 py-2 text-[11.5px] text-slate-500">No matching customer</div>
              ) : customerOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[12.5px] text-slate-700 transition-colors hover:bg-slate-50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(option);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

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
  const { data: customers, isLoading: isCustomersLoading, reload: reloadCustomers, upsertCustomer } = useCustomers();
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
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
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);
  const [draftPage, setDraftPage] = useState(1);
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
  const [selectedOrderCategory, setSelectedOrderCategory] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [seriesPickerOpen, setSeriesPickerOpen] = useState(false);
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [seriesForm, setSeriesForm] = useState({ label: "", startNumber: "" });
  const [seriesCreateError, setSeriesCreateError] = useState("");
  const [seriesCreateBusy, setSeriesCreateBusy] = useState(false);
  const [headerWechatOpen, setHeaderWechatOpen] = useState(false);
  const [popupCustomerIssues, setPopupCustomerIssues] = useState<Record<string, string | null>>({});
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; caption?: string } | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});
  const [outsideEdits, setOutsideEdits] = useState<Record<string, OutsideEditState>>({});
  const [outsideEditConfirm, setOutsideEditConfirm] = useState<OutsideEditConfirmState | null>(null);
  const [orderSaveState, setOrderSaveState] = useState<"idle" | "saving">("idle");
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [orderLineIndexes, setOrderLineIndexes] = useState<Record<string, number>>({});
  const wechatNormalizationStartedRef = useRef(false);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const seriesPickerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle } = useTheme();

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const { data: orderSeries, isLoading: isOrderSeriesLoading, createSeries: createOrderSeries, reload: reloadOrderSeries } = useOrderNumberSeries(activeOrders);
  const lineTotal = useMemo(() => orderLinesTotal(draft), [draft]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const orderCategoryTabs = useMemo(() => {
    const discovered = new Set<string>();
    orderSeries.forEach((series) => {
      const label = series.label?.trim();
      if (label) discovered.add(label);
    });
    activeOrders.forEach((order) => {
      const parsed = parseOrderNumber(order.number || order.orderNumber);
      if (parsed?.category) discovered.add(parsed.category);
    });
    return Array.from(discovered).sort((left, right) => left.localeCompare(right));
  }, [orderSeries, activeOrders]);
  const effectiveOrderCategory = selectedOrderCategory || orderCategoryTabs[0] || "";
  const filteredOrders = useMemo(
    () =>
      measurePerfSync("calc", "orders.filteredOrders", { ordersCount: activeOrders.length, query, statusFilter: filters.status }, () => activeOrders.filter((order) => {
        const q = query.toLowerCase().trim();
        const parsedOrderNumber = parseOrderNumber(order.number || order.orderNumber);
        const payment = getOrderPaymentAgentDisplay(order, paymentAgents).value;
        const customerText = order.lines.map((line) => getResolvedLineCustomerName(line)).join(" ");
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
        if (!q && effectiveOrderCategory && parsedOrderNumber?.category !== effectiveOrderCategory) return false;
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
      })),
    [activeOrders, effectiveOrderCategory, filters, query, paymentAgents],
  );
  const sortedOrders = useMemo(() => {
    return measurePerfSync("calc", "orders.sortedOrders", { ordersCount: filteredOrders.length, category: effectiveOrderCategory || "all" }, () => {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      return [...filteredOrders].sort((left, right) => {
      if (effectiveOrderCategory) {
        const leftParsed = parseOrderNumber(left.number || left.orderNumber);
        const rightParsed = parseOrderNumber(right.number || right.orderNumber);
        const numericDiff = (rightParsed?.numericNumber ?? Number.NEGATIVE_INFINITY) - (leftParsed?.numericNumber ?? Number.NEGATIVE_INFINITY);
        if (numericDiff !== 0) return numericDiff;
      }
      const rightDate = right.date || right.createdAt || right.updatedAt || "";
      const leftDate = left.date || left.createdAt || left.updatedAt || "";
      const dateDiff = rightDate.localeCompare(leftDate);
      if (dateDiff !== 0) return dateDiff;
      const rightParsed = parseOrderNumber(right.number || right.orderNumber);
      const leftParsed = parseOrderNumber(left.number || left.orderNumber);
      const numericDiff = (rightParsed?.numericNumber ?? Number.NEGATIVE_INFINITY) - (leftParsed?.numericNumber ?? Number.NEGATIVE_INFINITY);
      if (numericDiff !== 0) return numericDiff;
        return collator.compare(right.number || right.orderNumber || "", left.number || left.orderNumber || "");
      });
    });
  }, [effectiveOrderCategory, filteredOrders]);
  const pickerOrders = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...activeOrders].sort((left, right) => {
      const rightDate = right.date || right.createdAt || right.updatedAt || "";
      const leftDate = left.date || left.createdAt || left.updatedAt || "";
      const dateDiff = rightDate.localeCompare(leftDate);
      if (dateDiff !== 0) return dateDiff;
      const rightParsed = parseOrderNumber(right.number || right.orderNumber);
      const leftParsed = parseOrderNumber(left.number || left.orderNumber);
      const numericDiff = (rightParsed?.numericNumber ?? Number.NEGATIVE_INFINITY) - (leftParsed?.numericNumber ?? Number.NEGATIVE_INFINITY);
      if (numericDiff !== 0) return numericDiff;
      return collator.compare(right.number || right.orderNumber || "", left.number || left.orderNumber || "");
    });
  }, [activeOrders]);
  const history = useMemo<FlatHistoryRow[]>(() => measurePerfSync("calc", "orders.historyRows", { ordersCount: sortedOrders.length }, () => sortedOrders.flatMap<FlatHistoryRow>((order) => {
    const paymentMeta = getOrderPaymentAgentDisplay(order, paymentAgents);
    const orderLines = (order.lines || []).filter((line) => meaningfulLine(line));
    if (orderLines.length === 0) return [{ key: `${order.id}::fallback`, order, line: null, extraLines: [], paymentMeta }];
    const [firstLine, ...extraLines] = orderLines;
    return [{ key: `${order.id}::${firstLine.id || "first"}`, order, line: firstLine, extraLines, paymentMeta }];
  })), [sortedOrders, paymentAgents]);
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
  const selectedOrderSeries = useMemo(() => orderSeries.find((series) => series.id === selectedSeriesId) ?? null, [orderSeries, selectedSeriesId]);
  const wechatSuggestions = useMemo(() => Array.from(new Set(activeOrders.map((o) => o.wechatId.trim()).filter(Boolean))).slice(0, 5), [activeOrders]);
  const customerSuggestions = useMemo(() => {
    const fromCustomerRows = customers
      .filter((customer) => customer.status !== "inactive" && customer.lifecycle?.status !== "deleted")
      .map((c) => c.name?.trim())
      .filter(Boolean) as string[];
    const fromOrders = activeOrders.flatMap((o) => o.lines.map((l) => getResolvedLineCustomerName(l))).filter(Boolean) as string[];
    return Array.from(new Set([...fromCustomerRows, ...fromOrders]));
  }, [customers, activeOrders]);
  const selectedPaymentAgentId = draft.paymentAgentId || draft.paymentBy;
  const validation = useMemo(() => validateOrderForSave(draft), [draft]);
  const seriesPreview = useMemo(() => {
    const normalizedLabel = normalizeSeriesLabel(seriesForm.label);
    const startNumber = Number(seriesForm.startNumber);
    if (!normalizedLabel) return "";
    if (!Number.isInteger(startNumber) || startNumber <= 0) return `${buildSeriesPrefix(normalizedLabel)}...`;
    return formatSeriesOrderNumber(buildSeriesPrefix(normalizedLabel), startNumber);
  }, [seriesForm.label, seriesForm.startNumber]);
  const seriesSuggestions = useMemo(() => orderSeries.map((series) => ({ ...series, suggestion: getSeriesSuggestion(series) })), [orderSeries]);
  const headerWechatSuggestions = useMemo(() => {
    const q = (draft.wechatId || "").trim().toLowerCase();
    return wechatSuggestions
      .filter((w) => w && (!q || w.toLowerCase().includes(q)))
      .slice(0, 4);
  }, [wechatSuggestions, draft.wechatId]);
  useEffect(() => {
    if (editingOrderId) return;
    if (selectedSeriesId) return;
    const storedSeriesId = getStoredSelectedSeriesId();
    const nextSeriesId = orderSeries.find((series) => series.id === storedSeriesId)?.id || orderSeries.find((series) => series.isDefault)?.id || orderSeries[0]?.id || "";
    if (nextSeriesId) {
      setSelectedSeriesId(nextSeriesId);
    }
  }, [orderSeries, selectedSeriesId, editingOrderId]);

  useEffect(() => {
    if (!selectedSeriesId || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_SELECTED_ORDER_SERIES_KEY, selectedSeriesId);
  }, [selectedSeriesId]);

  useEffect(() => {
    if (mode !== "add") return;
    if ((draft.number || draft.orderNumber || "").trim()) return;
    if (!selectedOrderSeries) return;
    const suggestion = getSeriesSuggestion(selectedOrderSeries);
    setDraft((current) => ({
      ...current,
      number: suggestion,
      orderNumber: suggestion,
      ...deriveOrderSeriesFields(suggestion),
    }));
  }, [mode, draft.number, draft.orderNumber, selectedOrderSeries]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filters, rowsPerPage, mode, selectedOrderCategory]);

  useEffect(() => {
    if (!orderCategoryTabs.length) {
      if (selectedOrderCategory) setSelectedOrderCategory("");
      return;
    }
    if (!selectedOrderCategory) {
      const storedCategory = getStoredSelectedCategory();
      if (storedCategory && orderCategoryTabs.includes(storedCategory)) {
        setSelectedOrderCategory(storedCategory);
        return;
      }
    }
    if (!selectedOrderCategory || !orderCategoryTabs.includes(selectedOrderCategory)) {
      setSelectedOrderCategory(orderCategoryTabs[0]);
    }
  }, [orderCategoryTabs, selectedOrderCategory]);

  useEffect(() => {
    if (!selectedOrderCategory || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_SELECTED_ORDER_CATEGORY_KEY, selectedOrderCategory);
  }, [selectedOrderCategory]);

  const onUploadingChange = (isUploading: boolean) => setActiveUploads((p) => Math.max(0, p + (isUploading ? 1 : -1)));

  const ensureFirebaseOrderWriteReady = () => {
    if (!isFirebaseOrdersMode) return true;
    if (!ordersSourceSelection.hasBusinessId) {
      pushToast({ tone: "danger", text: "Firebase business id is missing. Set NEXT_PUBLIC_FIREBASE_BUSINESS_ID before saving orders." });
      return false;
    }
    return true;
  };

  const applySeriesToDraft = (series: OrderNumberSeries | null, nextNumberOverride?: number) => {
    if (!series) return;
    const nextOrderNumber = formatSeriesOrderNumber(series.prefix, nextNumberOverride ?? series.nextNumber);
    setSelectedSeriesId(series.id);
    setDraft((current) => ({
      ...current,
      number: nextOrderNumber,
      orderNumber: nextOrderNumber,
      ...deriveOrderSeriesFields(nextOrderNumber),
    }));
  };

  const handleSeriesChange = (seriesId: string) => {
    const nextSeries = orderSeries.find((series) => series.id === seriesId) ?? null;
    if (!nextSeries) return;
    setSeriesPickerOpen(false);
    applySeriesToDraft(nextSeries);
  };

  const handleOrderNumberInputChange = (rawValue: string) => {
    const trimmed = rawValue.trim();
    let nextValue = normalizeEditableOrderNumber(trimmed);
    if (selectedOrderSeries && /^\d+$/.test(trimmed)) {
      nextValue = formatSeriesOrderNumber(selectedOrderSeries.prefix, Number(trimmed));
    }
    const parsed = parseOrderNumber(nextValue);
    if (parsed) {
      const matchedSeries = orderSeries.find((series) => series.prefix === parsed.prefix);
      if (matchedSeries) {
        setSelectedSeriesId(matchedSeries.id);
      }
    }
    setDraft((current) => ({
      ...current,
      number: nextValue,
      orderNumber: nextValue,
      ...deriveOrderSeriesFields(nextValue),
    }));
  };

  const openCreateSeriesModal = () => {
    setSeriesPickerOpen(false);
    setSeriesCreateError("");
    setSeriesForm({ label: "", startNumber: "" });
    setShowCreateSeriesModal(true);
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
      return created;
    } catch (error) {
      throw error;
    }
  };

  const resolvePaymentAgentSplitsForSave = async (
    rawSplits: PaymentAgentOrderSplit[] | undefined,
    expectedTotal: number,
  ): Promise<{ splits: PaymentAgentOrderSplit[]; primaryAgent: PaymentAgent | null }> => {
    const normalizedSplits = (rawSplits ?? []).map(normalizeDraftPaymentSplit).filter((split) => !isPaymentAgentSplitEmpty(split));
    if (normalizedSplits.length === 0) {
      return { splits: [], primaryAgent: null };
    }

    const initialIssues = normalizedSplits.flatMap((split, index) => {
      const issues: string[] = [];
      if (normalizePaymentSplitAmount(split.assignedAmount) < 0) issues.push(`Payment split ${index + 1}: amount cannot be negative.`);
      if (normalizePaymentSplitAmount(split.paidNow) < 0) issues.push(`Payment split ${index + 1}: paid now cannot be negative.`);
      if (!(split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name)) {
        issues.push(`Payment split ${index + 1}: choose a payment agent.`);
      }
      return issues;
    });
    if (initialIssues.length > 0) {
      throw new Error(initialIssues[0]!);
    }

    const localAgents = [...paymentAgents];
    const resolvedSplits: PaymentAgentOrderSplit[] = [];

    for (const split of normalizedSplits) {
      const typedName = split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy;
      let resolvedAgent =
        localAgents.find((agent) => agent.id === split.paymentAgentId)
        ?? localAgents.find((agent) => agent.id === split.paymentBy)
        ?? localAgents.find((agent) => normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(typedName))
        ?? null;

      if (!resolvedAgent && typedName.trim()) {
        resolvedAgent = await resolveOrCreatePaymentAgentByName(typedName);
        if (resolvedAgent && !localAgents.some((agent) => agent.id === resolvedAgent!.id)) {
          localAgents.push(resolvedAgent);
        }
      }

      const nextName = resolvedAgent?.name || typedName.trim();
      const nextSettlement = calculatePaymentAgentSettlement({
        orderTotal: normalizePaymentSplitAmount(split.assignedAmount),
        existingCredit: resolvedAgent?.creditBalance ?? 0,
        paidNow: normalizePaymentSplitAmount(split.paidNow),
      });
      resolvedSplits.push({
        ...split,
        paymentAgentId: resolvedAgent?.id || split.paymentAgentId || "",
        paymentBy: resolvedAgent?.id || split.paymentBy || nextName,
        paymentAgentName: nextName,
        paymentAgentSnapshot: resolvedAgent
          ? { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode }
          : split.paymentAgentSnapshot && split.paymentAgentSnapshot.name
            ? split.paymentAgentSnapshot
            : undefined,
        assignedAmount: normalizePaymentSplitAmount(split.assignedAmount),
        paidNow: normalizePaymentSplitAmount(split.paidNow),
        settlementSnapshot: {
          ...nextSettlement,
          orderPortionTotal: nextSettlement.orderTotal,
          createdAt: split.settlementSnapshot?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const duplicateKeys = new Set<string>();
    for (const split of resolvedSplits) {
      const key = split.paymentAgentId || normalizePaymentAgentValue(split.paymentAgentName || split.paymentBy);
      if (!key) continue;
      if (duplicateKeys.has(key)) {
        throw new Error("Duplicate payment agents are not allowed in splits.");
      }
      duplicateKeys.add(key);
    }

    const assignedTotal = resolvedSplits.reduce((sum, split) => sum + normalizePaymentSplitAmount(split.assignedAmount), 0);
    if (Math.abs(assignedTotal - expectedTotal) > 0.0001) {
      throw new Error(`Payment split total must equal ${expectedTotal}.`);
    }

    return {
      splits: resolvedSplits,
      primaryAgent: resolvedSplits[0]
        ? localAgents.find((agent) => agent.id === resolvedSplits[0]!.paymentAgentId) ?? null
        : null,
    };
  };

  const resolveOrCreateCustomerByName = async (rawName: string): Promise<Customer | null> => {
    const cleanName = rawName.trim();
    if (!cleanName) return null;

    const existing = findCustomerByTypedName(
      customers.filter((customer) => customer.status !== "inactive" && customer.lifecycle?.status !== "deleted"),
      cleanName,
    );
    if (existing) {
      return existing;
    }

    if (!upsertCustomer) {
      throw new Error("Customer create flow is not enabled for this data source.");
    }

    const now = new Date().toISOString();
    const baseId = createCustomerIdFromName(cleanName);
    const idConflict = customers.some((customer) => customer.id === baseId);
    const nextId = idConflict ? `${baseId}-${Date.now()}` : baseId;
    const codeSuffix = cleanName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 6) || "CUS";
    const created = await upsertCustomer({
      id: nextId,
      customerCode: `CU-${codeSuffix}`,
      name: cleanName,
      displayName: cleanName,
      normalizedName: normalizeCustomerName(cleanName),
      source: "order-line",
      status: "active",
      totalOrders: 0,
      totalSpent: 0,
      outstandingAmount: 0,
      totalReceived: 0,
      storeCreditBalance: 0,
      totalReceivableGenerated: 0,
      currentReceivable: 0,
      createdAt: now,
      updatedAt: now,
    });
    return created;
  };

  const setDraftPaymentAgentSplits = (updater: PaymentAgentOrderSplit[] | ((current: PaymentAgentOrderSplit[]) => PaymentAgentOrderSplit[])) => {
    setDraft((current) => {
      const existingSplits = getEditablePaymentAgentSplits(current);
      const nextSplits = typeof updater === "function" ? updater(existingSplits) : updater;
      return applyLegacyPaymentAgentFromSplits(current, nextSplits.length > 0 ? nextSplits : [createEmptyPaymentAgentSplit()]);
    });
  };

  const handleCreateSeries = async () => {
    const normalizedLabel = normalizeSeriesLabel(seriesForm.label);
    const startNumber = Number(seriesForm.startNumber);
    if (!normalizedLabel) {
      setSeriesCreateError("Series label is required.");
      return;
    }
    if (!Number.isInteger(startNumber) || startNumber <= 0) {
      setSeriesCreateError("Starting number must be a positive integer.");
      return;
    }
    const normalizedPrefix = buildSeriesPrefix(normalizedLabel);
    const firstOrderNumber = formatSeriesOrderNumber(normalizedPrefix, startNumber);
    if (orderNumberExists(activeOrders, firstOrderNumber)) {
      setSeriesCreateError("This order number already exists. Choose another starting number.");
      return;
    }
    if (orderSeries.some((series) => series.prefix === normalizedPrefix)) {
      setSeriesCreateError("This series already exists.");
      return;
    }
    setSeriesCreateBusy(true);
    setSeriesCreateError("");
    try {
      const created = await createOrderSeries({ label: normalizedLabel, startNumber });
      setShowCreateSeriesModal(false);
      setSeriesForm({ label: "", startNumber: "" });
      applySeriesToDraft(created, created.nextNumber);
      pushToast({ tone: "success", text: `Series ${created.prefix} created.` });
    } catch (error) {
      setSeriesCreateError(error instanceof Error ? error.message : "Could not create series.");
    } finally {
      setSeriesCreateBusy(false);
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
  const getOutsideFieldValue = (order: Order, field: OutsideEditField, line?: Order["lines"][number] | null) => {
    if (field === "orderNumber") return order.number || order.orderNumber || "";
    if (field === "wechat") return order.wechatId?.trim() || "";
    if (field === "payment") return order.paymentAgentSnapshot?.name?.trim() || order.paymentByName?.trim() || order.paymentAgentName?.trim() || order.paymentBy?.trim() || "";
    if (field === "shipping") return order.shippingPrice ? String(order.shippingPrice) : "";
    if (!line) return "";
    if (field === "customer") return line.customerName?.trim() || line.customerSnapshot?.name?.trim() || "";
    if (field === "marka") return line.marka?.trim() || "";
    if (field === "details") return joinLineDetails(line).trim() || "";
    if (field === "totalCtns") return Number(line.totalCtns) ? String(line.totalCtns) : "";
    if (field === "pcsPerCtn") return Number(line.pcsPerCtn) ? String(line.pcsPerCtn) : "";
    if (field === "rate") return Number(line.rmbPerPcs) ? String(line.rmbPerPcs) : "";
    return "";
  };
  const getOutsideEditValue = (order: Order): OutsideEditState => {
    const pending = outsideEdits[order.id];
    return pending ?? { activeField: null, lineId: undefined, value: "", saving: false, customerSelection: null };
  };
  const setOutsideEditValue = (orderId: string, patch: Partial<OutsideEditState>) => {
    setOutsideEdits((prev) => {
      const current = prev[orderId] ?? { activeField: null, lineId: undefined, value: "", saving: false, customerSelection: null };
      return { ...prev, [orderId]: { ...current, ...patch } };
    });
  };
  const openOutsideField = (order: Order, field: OutsideEditField, line?: Order["lines"][number] | null) => {
    setOutsideEdits((prev) => ({
      ...prev,
      [order.id]: {
        activeField: field,
        lineId: line?.id,
        value: getOutsideFieldValue(order, field, line),
        saving: false,
        customerSelection: field === "customer" && line
          ? {
              customerId: line.customerId?.trim() || "",
              customerName: line.customerName?.trim() || line.customerSnapshot?.name?.trim() || "",
              customerSnapshot: line.customerSnapshot,
            }
          : null,
      },
    }));
  };
  const cancelOutsideField = (orderId: string) => {
    setOutsideEditConfirm((current) => (current?.orderId === orderId ? null : current));
    setOutsideEdits((prev) => {
      const copy = { ...prev };
      delete copy[orderId];
      return copy;
    });
  };
  const isOutsideFieldEditing = (order: Order, field: OutsideEditField, line?: Order["lines"][number] | null) => {
    const current = getOutsideEditValue(order);
    return current.activeField === field && (field === "orderNumber" || field === "wechat" || field === "payment" || field === "shipping"
      ? !current.lineId
      : current.lineId === line?.id);
  };
  const hasOutsideFieldChanged = (order: Order, field: OutsideEditField, rawValue: string, line?: Order["lines"][number] | null) => {
    const trimmedValue = rawValue.trim();
    if (field === "orderNumber") {
      return normalizeEditableOrderNumber(trimmedValue) !== normalizeEditableOrderNumber(order.number || order.orderNumber || "");
    }
    if (field === "wechat") {
      return trimmedValue !== (order.wechatId?.trim() || "");
    }
    if (field === "payment") {
      const resolvedCurrentAgent = resolveOrderPaymentAgent(order, paymentAgents);
      const currentPaymentId = resolvedCurrentAgent?.id || order.paymentAgentId?.trim() || "";
      const currentPaymentName = normalizePaymentAgentValue(
        resolvedCurrentAgent?.name ||
        order.paymentAgentSnapshot?.name ||
        order.paymentByName ||
        order.paymentAgentName ||
        order.paymentBy ||
        "",
      );
      const resolvedNextAgent = paymentAgents.find((agent) => agent.id === trimmedValue || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(trimmedValue)) ?? null;
      const nextPaymentId = resolvedNextAgent?.id || "";
      const nextPaymentName = normalizePaymentAgentValue(resolvedNextAgent?.name || trimmedValue);
      return currentPaymentId !== nextPaymentId || currentPaymentName !== nextPaymentName;
    }
    if (field === "shipping") {
      return (Number(rawValue) || 0) !== (Number(order.shippingPrice) || 0);
    }
    if (!line) return false;
    if (field === "customer") {
      const currentOutsideEdit = outsideEdits[order.id];
      const resolved = !trimmedValue || trimmedValue === CUSTOMER_NOT_LINKED
        ? { customerId: "", customerName: "", customerSnapshot: undefined }
        : currentOutsideEdit?.customerSelection
          ? currentOutsideEdit.customerSelection
          : applyTypedCustomerToLine(line, trimmedValue, customers);
      const currentCustomerId = line.customerId?.trim() || "";
      const currentCustomerName = normalizePaymentAgentValue(line.customerName || "");
      const nextCustomerId = resolved.customerId?.trim() || "";
      const nextCustomerName = normalizePaymentAgentValue(resolved.customerName || "");
      return currentCustomerId !== nextCustomerId || currentCustomerName !== nextCustomerName;
    }
    if (field === "marka") {
      return trimmedValue !== (line.marka?.trim() || "");
    }
    if (field === "details") {
      return trimmedValue !== joinLineDetails(line).trim();
    }
    if (field === "totalCtns") {
      return (rawValue === "" ? 0 : Number(rawValue)) !== (Number(line.totalCtns) || 0);
    }
    if (field === "pcsPerCtn") {
      return (rawValue === "" ? 0 : Number(rawValue)) !== (Number(line.pcsPerCtn) || 0);
    }
    if (field === "rate") {
      return (rawValue === "" ? 0 : Number(rawValue)) !== (Number(line.rmbPerPcs) || 0);
    }
    return false;
  };
  const hasComposerChanges = () => {
    if (editingOrderId) {
      if (!editingOrder) return false;
      const baseline = {
        ...editingOrder,
        wechatId: (editingOrder.wechatId || "").trim(),
        number: normalizeEditableOrderNumber(editingOrder.number || editingOrder.orderNumber),
        orderNumber: normalizeEditableOrderNumber(editingOrder.orderNumber || editingOrder.number),
        lines: (editingOrder.lines || []).map((line) => seedDetailBoxesFromLegacy(line)),
      };
      const current = {
        ...draft,
        wechatId: (draft.wechatId || "").trim(),
        number: normalizeEditableOrderNumber(draft.number || draft.orderNumber),
        orderNumber: normalizeEditableOrderNumber(draft.orderNumber || draft.number),
        lines: (draft.lines || []).map((line) => seedDetailBoxesFromLegacy(line)),
      };
      return JSON.stringify(current) !== JSON.stringify(baseline);
    }
    return hasAnyDraftContent(draft);
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

  const runOutsideEditBackgroundSync = async (previousOrder: Order, nextOrder: Order) => {
    if (!isFirebaseOrdersMode) return;

    const paymentAgentsService = getPaymentAgentsService();
    const orderNumberSeriesService = getOrderNumberSeriesService();
    const mergedOrders = activeOrders.some((entry) => entry.id === nextOrder.id)
      ? activeOrders.map((entry) => (entry.id === nextOrder.id ? nextOrder : entry))
      : [nextOrder, ...activeOrders];
    const orderNumberChanged = normalizeEditableOrderNumber(previousOrder.number || previousOrder.orderNumber)
      !== normalizeEditableOrderNumber(nextOrder.number || nextOrder.orderNumber);
    const shouldRefreshCustomers = hasLinkedCustomerInOrder(previousOrder) || hasLinkedCustomerInOrder(nextOrder);
    const shouldRefreshPaymentAgents = hasLinkedPaymentAgent(previousOrder) || hasLinkedPaymentAgent(nextOrder);
    const warnings: string[] = [];
    const syncTasks: Promise<void>[] = [];

    if (orderNumberChanged) {
      syncTasks.push((async () => {
        try {
          await measurePerfAsync("sync", "orders.outsideEdit.syncOrderSeries", { orderId: nextOrder.id }, () => orderNumberSeriesService.syncOrderNumberSeriesFromOrder(nextOrder, mergedOrders));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Order series sync failed: ${message}`);
          logError("outside_edit_order_series_sync_failure", { orderId: nextOrder.id, error: message });
        }
      })());
    }

    syncTasks.push((async () => {
      try {
        if (nextOrder.paymentAgentId || nextOrder.paymentBy) {
          await measurePerfAsync("sync", "orders.outsideEdit.applyPaymentAgentSettlement", { orderId: nextOrder.id, paymentAgentId: nextOrder.paymentAgentId || nextOrder.paymentBy || "" }, () => paymentAgentsService.applyOrderSettlement?.(nextOrder) ?? Promise.resolve());
        } else if (previousOrder.paymentAgentId || previousOrder.paymentBy) {
          await measurePerfAsync("sync", "orders.outsideEdit.reversePaymentAgentSettlement", { orderId: nextOrder.id }, () => paymentAgentsService.reverseOrderSettlement?.(nextOrder) ?? Promise.resolve());
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Payment-agent settlement failed: ${message}`);
        logError("outside_edit_payment_agent_sync_failure", { orderId: nextOrder.id, error: message });
      }
    })());

    if (nextOrder.status === "saved") {
      syncTasks.push((async () => {
        try {
          const sync = await measurePerfAsync("sync", "orders.outsideEdit.syncOrderLinesToProducts", { orderId: nextOrder.id }, () => syncOrderLinesToProducts(nextOrder));
          if (sync.failed > 0) warnings.push(`Product sync failed for ${sync.failed} line(s).`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Product sync failed: ${message}`);
          logError("outside_edit_product_sync_failure", { orderId: nextOrder.id, error: message });
        }
      })());
    }

    syncTasks.push((async () => {
      try {
        await measurePerfAsync("sync", "orders.outsideEdit.applyCustomerReceivables", { orderId: nextOrder.id }, () => customerLedgerService.applyOrderCustomerReceivables(nextOrder));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Customer receivable update failed: ${message}`);
        logError("outside_edit_customer_receivable_sync_failure", { orderId: nextOrder.id, error: message });
      }
    })());

    syncTasks.push((async () => {
      try {
        await measurePerfAsync("sync", "orders.outsideEdit.syncLifecycleMetadata", { orderId: nextOrder.id }, () => orderLifecycleService.syncOrderLifecycleMetadata(nextOrder, {
          knownCustomerIds: new Set(customers.map((customer) => customer.id)),
          knownPaymentAgentIds: new Set(paymentAgents.map((agent) => agent.id)),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Lifecycle sync failed: ${message}`);
        logError("outside_edit_lifecycle_sync_failure", { orderId: nextOrder.id, error: message });
      }
    })());

    await Promise.allSettled(syncTasks);

    const refreshTasks: Promise<unknown>[] = [];
    if (shouldRefreshCustomers) {
      refreshTasks.push(measurePerfAsync("reload", "orders.outsideEdit.reloadCustomers", { orderId: nextOrder.id }, () => reloadCustomers()));
    }
    if (shouldRefreshPaymentAgents) {
      refreshTasks.push(measurePerfAsync("reload", "orders.outsideEdit.reloadPaymentAgents", { orderId: nextOrder.id }, () => reloadPaymentAgents()));
    }
    if (orderNumberChanged) {
      refreshTasks.push(measurePerfAsync("reload", "orders.outsideEdit.reloadOrderSeries", { orderId: nextOrder.id }, () => reloadOrderSeries()));
    }
    await Promise.allSettled(refreshTasks);

    if (warnings.length > 0) {
      pushToast({ tone: "info", text: `Order updated, but ${warnings[0]}` });
    }
  };

  const persistOutsideEditedOrder = async (nextOrder: Order) => {
    if (isFirebaseOrdersMode) {
      return upsertFirebaseOrder(nextOrder as any);
    }

    upsertOrder(nextOrder);
    const mergedOrders = orders.filter((entry) => entry.id !== nextOrder.id).concat(nextOrder);
    await recalculateFromOrders(mergedOrders);
    return nextOrder;
  };

  const requestOutsideFieldSave = (order: Order, field: OutsideEditField, line?: Order["lines"][number] | null) => {
    const current = getOutsideEditValue(order);
    if (current.saving) return;
    const targetLineId = line?.id || current.lineId;
    const targetLine = targetLineId ? order.lines.find((entry) => entry.id === targetLineId) ?? null : null;
    if (!hasOutsideFieldChanged(order, field, current.value, targetLine)) {
      cancelOutsideField(order.id);
      return;
    }
    setOutsideEditConfirm({ orderId: order.id, field, lineId: targetLineId || undefined });
  };

  const saveOutsideField = async (order: Order, field: OutsideEditField, line?: Order["lines"][number] | null) => {
    return runPerfAction("outside-edit-save", { orderId: order.id, field, lineId: line?.id || null }, async () => {
      const current = getOutsideEditValue(order);
      if (current.saving) return;
      const targetLineId = line?.id || current.lineId;
      const targetLine = targetLineId ? order.lines.find((entry) => entry.id === targetLineId) ?? null : null;
      const rawValue = current.value;
      if (!hasOutsideFieldChanged(order, field, rawValue, targetLine)) {
        setOutsideEditConfirm(null);
        cancelOutsideField(order.id);
        return;
      }
      const trimmedValue = rawValue.trim();
      const clearingCustomer = field === "customer" && !trimmedValue;
      if (!clearingCustomer && field !== "customer" && !trimmedValue) {
        setOutsideEditConfirm(null);
        cancelOutsideField(order.id);
        return;
      }
      const nextOrder: Order = {
        ...order,
        lines: order.lines.map((entry) => ({ ...entry })),
      };

      setOutsideEditValue(order.id, { saving: true });
      setOutsideEditConfirm(null);

      try {
      if (field === "orderNumber") {
        const nextNumber = normalizeEditableOrderNumber(trimmedValue);
        if (!nextNumber) throw new Error("Order number is required.");
        if (orderNumberExists(orders.filter((entry) => entry.id !== order.id), nextNumber)) throw new Error("Order number already exists.");
        nextOrder.number = nextNumber;
        nextOrder.orderNumber = nextNumber;
        Object.assign(nextOrder, deriveOrderSeriesFields(nextNumber));
      } else if (field === "wechat") {
        nextOrder.wechatId = trimmedValue;
      } else if (field === "payment") {
        let resolvedAgent = paymentAgents.find((agent) => agent.id === trimmedValue || normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(trimmedValue)) ?? null;
        if (trimmedValue && !resolvedAgent) resolvedAgent = await resolveOrCreatePaymentAgentByName(trimmedValue);
        const nextPaymentAgentId = resolvedAgent?.id || "";
        const settlementPreview = calculatePaymentAgentSettlement({
          orderTotal: orderTotal(nextOrder),
          existingCredit: resolvedAgent?.creditBalance ?? 0,
          paidNow: order.paidToPaymentAgentNow ?? 0,
        });
        nextOrder.paymentAgentId = nextPaymentAgentId;
        nextOrder.paymentBy = nextPaymentAgentId || trimmedValue;
        nextOrder.paymentByName = resolvedAgent?.name || trimmedValue;
        nextOrder.paymentAgentName = resolvedAgent?.name || trimmedValue;
        nextOrder.paymentAgentSnapshot = nextPaymentAgentId
          ? { id: nextPaymentAgentId, name: resolvedAgent?.name || trimmedValue, code: resolvedAgent?.agentCode || "" }
          : { id: "", name: "", code: "" };
        nextOrder.paymentAgentSettlementSnapshot = {
          ...settlementPreview,
          orderTotal: settlementPreview.orderTotal,
          existingCredit: settlementPreview.existingCredit,
          paymentAgentId: nextPaymentAgentId,
          paymentAgentName: resolvedAgent?.name || trimmedValue,
          updatedAt: new Date().toISOString(),
          createdAt: order.paymentAgentSettlementSnapshot?.createdAt || new Date().toISOString(),
        };
      } else if (field === "shipping") {
        nextOrder.shippingPrice = Math.max(0, Number(rawValue) || 0);
      } else {
        if (!targetLine) throw new Error("Order line not found.");
        const nextLine = nextOrder.lines.find((entry) => entry.id === targetLine.id);
        if (!nextLine) throw new Error("Order line not found.");
        if (field === "customer") {
          if (clearingCustomer) {
            Object.assign(nextLine, { customerId: "", customerName: "", customerSnapshot: undefined });
          } else {
            const selectedCustomer = current.customerSelection;
            if (selectedCustomer?.customerId) {
              Object.assign(nextLine, {
                customerId: selectedCustomer.customerId,
                customerName: selectedCustomer.customerName,
                customerSnapshot: selectedCustomer.customerSnapshot,
              });
            } else {
              const createdCustomer = await resolveOrCreateCustomerByName(trimmedValue);
              if (!createdCustomer) throw new Error("Could not create customer.");
              Object.assign(nextLine, {
                customerId: createdCustomer.id,
                customerName: createdCustomer.name,
                customerSnapshot: { id: createdCustomer.id, name: createdCustomer.name, code: createdCustomer.customerCode },
              });
            }
          }
        } else if (field === "marka") {
          nextLine.marka = rawValue;
        } else if (field === "details") {
          nextLine.details = trimmedValue;
          nextLine.detail1 = trimmedValue;
          nextLine.detail2 = "";
          nextLine.detail3 = "";
        } else if (field === "totalCtns") {
          nextLine.totalCtns = rawValue === "" ? 0 : Number(rawValue);
        } else if (field === "pcsPerCtn") {
          nextLine.pcsPerCtn = rawValue === "" ? 0 : Number(rawValue);
        } else if (field === "rate") {
          nextLine.rmbPerPcs = rawValue === "" ? 0 : Number(rawValue);
        }
      }

      nextOrder.updatedAt = new Date().toISOString();
      const savedOrder = await measurePerfAsync("sync", "orders.persistOutsideEditedOrder", { orderId: order.id, field }, () => persistOutsideEditedOrder(nextOrder));
      cancelOutsideField(order.id);
      const successLabels: Record<OutsideEditField, string> = {
        orderNumber: "Order number updated.",
        wechat: "WeChat ID updated.",
        payment: "Paid By updated.",
        customer: "Customer updated.",
        marka: "Marka updated.",
        details: "Details updated.",
        totalCtns: "CTNs updated.",
        pcsPerCtn: "PCS/CTN updated.",
        rate: "Rate updated.",
        shipping: "Shipping updated.",
      };
      pushToast({ tone: "success", text: isFirebaseOrdersMode ? `${successLabels[field]} Related data is syncing in background.` : successLabels[field] });
      if (isFirebaseOrdersMode && savedOrder) {
        void runOutsideEditBackgroundSync(order, savedOrder).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          logError("outside_edit_background_sync_failure", { orderId: savedOrder.id, error: message });
          pushToast({ tone: "info", text: "Order updated, but background sync failed." });
        });
      }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOutsideEditValue(order.id, { saving: false });
        pushToast({ tone: "danger", text: `${field} update failed: ${message}` });
      }
    });
  };

  const onSave = async (status: Order["status"], forceDraft = false) => {
    return runPerfAction("full-order-save", { orderId: draft.id, status, mode: editingOrderId ? "edit" : "create" }, async () => {
    const saveAudit = createSaveTimingProfile(status === "draft" ? "draft-save" : editingOrderId ? "edit-save" : "new-order-save", {
      orderId: draft.id,
      mode: editingOrderId ? "edit" : "create",
      requestedStatus: status,
      lineCount: draft.lines.length,
    });
    logDataFlow("Orders", JSON.stringify({ event: status === "draft" ? "draft_save_started" : "order_save_started", status, lineCount: draft.lines.length, displayedOrderNumber: draft.number || draft.orderNumber }, null, 2));
    if (!ensureFirebaseOrderWriteReady()) return;
    if (activeUploads > 0) return pushToast({ tone: "info", text: "Please wait for image uploads to finish before saving." });
    if ((draft.paidToPaymentAgentNow ?? 0) < 0) return pushToast({ tone: "danger", text: "Paid Now cannot be negative." });
    setOrderSaveState("saving");

    const meaningfulLines = getMeaningfulOrderLines(draft.lines).map((line) => withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)));
    const normalizedDraftSplits = (draft.paymentAgentSplits ?? []).map(normalizeDraftPaymentSplit);
    const paymentAgentCleared = normalizedDraftSplits.filter((split) => !isPaymentAgentSplitEmpty(split)).length === 0;
    const cleanedDraft = {
      ...draft,
      number: normalizeEditableOrderNumber(draft.number || draft.orderNumber),
      orderNumber: normalizeEditableOrderNumber(draft.orderNumber || draft.number),
      ...deriveOrderSeriesFields(normalizeEditableOrderNumber(draft.orderNumber || draft.number)),
      wechatId: draft.wechatId.trim(),
      shippingPrice: Math.max(0, Number(draft.shippingPrice) || 0),
      lines: meaningfulLines,
      paymentAgentSplits: normalizedDraftSplits,
      paymentByName: paymentAgentCleared ? "" : draft.paymentByName || "",
      paymentAgentName: paymentAgentCleared ? "" : draft.paymentAgentName || "",
      paymentAgentSnapshot: paymentAgentCleared ? undefined : draft.paymentAgentSnapshot,
    };

    if (status === "draft") {
      if (!hasAnyDraftContent(cleanedDraft)) return pushToast({ tone: "info", text: "Add at least one field before saving a draft." });
      if (!forceDraft && !validation.isValid) {
        setOrderSaveState("idle");
        saveAudit.flush("save:blocked", { stage: "draft_validation" });
        setShowDraftIncompleteConfirm(true);
        return;
      }
      saveAudit.mark("validation:done", { draftMode: true, forceDraft, isValid: validation.isValid });
      let draftSplitResolution: Awaited<ReturnType<typeof resolvePaymentAgentSplitsForSave>>;
      try {
        saveAudit.mark("paymentAgentResolve:start");
        draftSplitResolution = await resolvePaymentAgentSplitsForSave(
          cleanedDraft.paymentAgentSplits,
          orderTotal({ ...cleanedDraft, lines: meaningfulLines }),
        );
        saveAudit.mark("paymentAgentResolve:end", {
          resolvedAgentId: draftSplitResolution.primaryAgent?.id || null,
          splitCount: draftSplitResolution.splits.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOrderSaveState("idle");
        saveAudit.flush("save:error", { stage: "payment_agent_resolve", message });
        pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
        return;
      }
      const draftOrderBase = applyLegacyPaymentAgentFromSplits(cleanedDraft, draftSplitResolution.splits);
      const primaryDraftSplit = draftSplitResolution.splits[0];
      const draftOrder = {
        ...draftOrderBase,
        number: cleanedDraft.number,
        orderNumber: cleanedDraft.orderNumber || cleanedDraft.number,
        ...deriveOrderSeriesFields(cleanedDraft.orderNumber || cleanedDraft.number),
        status: "draft" as const,
      paymentAgentSettlementSnapshot: (() => {
        const now = new Date().toISOString();
        return primaryDraftSplit?.settlementSnapshot
          ? {
              orderTotal: primaryDraftSplit.settlementSnapshot.orderPortionTotal,
              existingCredit: primaryDraftSplit.settlementSnapshot.existingCredit,
              creditUsed: primaryDraftSplit.settlementSnapshot.creditUsed,
              payableAfterCredit: primaryDraftSplit.settlementSnapshot.payableAfterCredit,
              remainingPayable: primaryDraftSplit.settlementSnapshot.remainingPayable,
              newCreditCreated: primaryDraftSplit.settlementSnapshot.newCreditCreated,
              resultingCreditBalance: primaryDraftSplit.settlementSnapshot.resultingCreditBalance,
              paidNow: primaryDraftSplit.settlementSnapshot.paidNow,
              status: primaryDraftSplit.settlementSnapshot.status,
              paymentAgentId: draftOrderBase.paymentAgentId || "",
              paymentAgentName: draftOrderBase.paymentAgentName || "",
              createdAt: primaryDraftSplit.settlementSnapshot.createdAt || now,
              updatedAt: now,
            }
          : undefined;
      })(),
      };
      saveAudit.mark("orderPayload:built", { status: "draft" });
      try {
        saveAudit.mark("orderWrite:start", { firebase: isFirebaseOrdersMode });
        if (isFirebaseOrdersMode) {
          await upsertFirebaseOrder({ ...draftOrder, draftAutosavedAt: new Date().toISOString() } as any);
        } else {
          upsertOrder(draftOrder);
        }
        saveAudit.mark("orderWrite:end");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Draft save failed.";
        setOrderSaveState("idle");
        saveAudit.flush("save:error", { stage: "order_write", message });
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
      setPopupCustomerIssues({});
      setOrderSaveState("idle");
      saveAudit.mark("ui:modalClosed");
      logDataFlow("Orders", JSON.stringify({ event: "draft_save_completed", orderId: draftOrder.id, persistedOrderNumber: draftOrder.number || draftOrder.orderNumber || "" }, null, 2));
      saveAudit.flush("save:done", { path: "draft" });
      return pushToast({ tone: "success", text: "Draft saved. Use Complete Draft to finish it." });
    }

    setHasAttemptedFinalSave(true);
    logOrder("save_validation_result", { isValid: validation.isValid, missing: validation.missingFields.length, lineIssues: validation.lineIssues.length });
    const popupCustomerValidationIssues = Object.entries(popupCustomerIssues)
      .filter(([, issue]) => Boolean(issue))
      .map(([lineId, issue]) => {
        const lineIndex = draft.lines.findIndex((line) => line.id === lineId);
        return `Line ${lineIndex >= 0 ? lineIndex + 1 : "?"}: ${issue}`;
      });
    if (popupCustomerValidationIssues.length > 0) {
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: popupCustomerValidationIssues });
      saveAudit.flush("save:blocked", { stage: "popup_customer_validation", issues: popupCustomerValidationIssues.length });
      return;
    }
    if (!validation.isValid) {
      const missingItems = [
        ...validation.missingFields.map((item) => `${item}.`),
        ...validation.lineIssues.flatMap((line) => line.issues.map((issue) => `Line ${line.lineNumber}: ${issue}.`)),
      ];
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: missingItems });
      saveAudit.flush("save:blocked", { stage: "validation", missingItems: missingItems.length });
      return;
    }
    saveAudit.mark("validation:done", { missingFields: validation.missingFields.length, lineIssues: validation.lineIssues.length });

    const now = new Date().toISOString();
    logOrder("save_order_lines_before_resolution", { lines: draft.lines.map((l) => ({ lineId: l.id, customerId: l.customerId, customerName: l.customerName, lineTotal: (l.totalCtns||0)*(l.pcsPerCtn||0)*(l.rmbPerPcs||0) })) });
    const knownCustomerIdsBeforeSave = new Set(customers.map((customer) => customer.id));
    const knownPaymentAgentIdsBeforeSave = new Set(paymentAgents.map((agent) => agent.id));
    let resolvedLines = meaningfulLines;
    try {
      saveAudit.mark("customerResolution:start", { lines: meaningfulLines.length, knownCustomers: customers.length });
      resolvedLines = (await resolveCustomersForOrderLines(meaningfulLines, customers, now, resolveOrCreateCustomerByName)).map((line) =>
        withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)),
      );
      const knownIds = new Set(customers.map((c) => c.id));
      const affectedCustomerIds = Array.from(new Set(resolvedLines.map((l) => l.customerId).filter(Boolean)));
      const createdCustomerIds = affectedCustomerIds.filter((id) => !knownIds.has(id));
      const reusedCustomerIds = affectedCustomerIds.filter((id) => knownIds.has(id));
      logCustomer("save_order_customer_resolution_summary", { affectedCustomerIds, createdCustomerIds, reusedCustomerIds });
      logOrder("customer_resolution_success", { resolvedLines: resolvedLines.length });
      saveAudit.mark("customerResolution:end", { affectedCustomerIds: affectedCustomerIds.length, createdCustomerIds: createdCustomerIds.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError("customer_resolution_failure", { error: message });
      setOrderSaveState("idle");
      saveAudit.flush("save:error", { stage: "customer_resolution", message });
      pushToast({ tone: "danger", text: message || "Customer resolution failed." });
      return;
    }
    const requestedOrderNumber = (draft.number || draft.orderNumber || "").trim();
    const fallbackOrderNumber = selectedOrderSeries ? getSeriesSuggestion(selectedOrderSeries) : "";
    const finalOrderNumber = normalizeEditableOrderNumber(requestedOrderNumber || fallbackOrderNumber);
    if (!finalOrderNumber) {
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: ["Order Number is required."] });
      saveAudit.flush("save:blocked", { stage: "order_number_missing" });
      return;
    }
    if (orderNumberExists(activeOrders, finalOrderNumber, draft.id)) {
      setOrderSaveState("idle");
      setValidationWarning({ visible: true, items: [`Order Number ${finalOrderNumber} already exists.`] });
      saveAudit.flush("save:blocked", { stage: "duplicate_order_number", orderNumber: finalOrderNumber });
      return;
    }
    let splitResolution: Awaited<ReturnType<typeof resolvePaymentAgentSplitsForSave>>;
    try {
      saveAudit.mark("paymentAgentResolve:start");
      splitResolution = await resolvePaymentAgentSplitsForSave(
        cleanedDraft.paymentAgentSplits,
        orderTotal({ ...cleanedDraft, lines: resolvedLines }),
      );
      saveAudit.mark("paymentAgentResolve:end", {
        resolvedAgentId: splitResolution.primaryAgent?.id || null,
        splitCount: splitResolution.splits.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOrderSaveState("idle");
      saveAudit.flush("save:error", { stage: "payment_agent_resolve", message });
      pushToast({ tone: "danger", text: `Payment agent create failed: ${message}` });
      return;
    }
    const resolvedAgent = splitResolution.primaryAgent;
    const resolvedDraftWithSplits = applyLegacyPaymentAgentFromSplits(cleanedDraft, splitResolution.splits);
    const resolvedPaymentAgentId = resolvedAgent?.id || resolvedDraftWithSplits.paymentAgentId || "";
    const primaryResolvedSplit = splitResolution.splits[0];
    const primarySettlementSnapshot = primaryResolvedSplit?.settlementSnapshot;
    const finalOrderSeriesFields = deriveOrderSeriesFields(finalOrderNumber);
    let savedOrder: Order = {
      ...resolvedDraftWithSplits,
      number: finalOrderNumber,
      orderNumber: finalOrderNumber,
      ...finalOrderSeriesFields,
      lines: resolvedLines,
      status: "saved" as const,
      subtotal: orderLinesTotal({ ...cleanedDraft, lines: resolvedLines }),
      grandTotal: orderTotal({ ...cleanedDraft, lines: resolvedLines }),
      dueAmount: orderTotal({ ...cleanedDraft, lines: resolvedLines }),
      paymentAgentId: resolvedPaymentAgentId,
      paymentBy: resolvedPaymentAgentId || resolvedDraftWithSplits.paymentBy,
      paymentByName: resolvedDraftWithSplits.paymentByName || "",
      paymentAgentName: resolvedDraftWithSplits.paymentAgentName || "",
      paymentAgentSnapshot: resolvedAgent
        ? { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode }
        : resolvedDraftWithSplits.paymentAgentSnapshot,
      paymentAgentSettlementSnapshot: primarySettlementSnapshot
        ? {
            orderTotal: primarySettlementSnapshot.orderPortionTotal,
            existingCredit: primarySettlementSnapshot.existingCredit,
            creditUsed: primarySettlementSnapshot.creditUsed,
            payableAfterCredit: primarySettlementSnapshot.payableAfterCredit,
            remainingPayable: primarySettlementSnapshot.remainingPayable,
            newCreditCreated: primarySettlementSnapshot.newCreditCreated,
            resultingCreditBalance: primarySettlementSnapshot.resultingCreditBalance,
            paidNow: primarySettlementSnapshot.paidNow,
            status: primarySettlementSnapshot.status,
            paymentAgentId: resolvedPaymentAgentId,
            paymentAgentName: resolvedAgent?.name || resolvedDraftWithSplits.paymentAgentName || "",
            updatedAt: now,
            createdAt: primarySettlementSnapshot.createdAt || draft.paymentAgentSettlementSnapshot?.createdAt || now,
          }
        : undefined,
    };
    saveAudit.mark("orderPayload:built", { finalOrderNumber, resolvedLines: resolvedLines.length, resolvedPaymentAgentId: resolvedPaymentAgentId || null });
    try {
      saveAudit.mark("orderWrite:start", { firebase: isFirebaseOrdersMode });
      if (isFirebaseOrdersMode) {
        await upsertFirebaseOrder(savedOrder as any);
      } else {
          upsertOrder(savedOrder);
      }
      saveAudit.mark("orderWrite:end");
      logDB("upsert_order_success", { orderId: savedOrder.id, status: savedOrder.status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError("upsert_order_failure", { orderId: savedOrder.id, error: message });
      setOrderSaveState("idle");
      saveAudit.flush("save:error", { stage: "order_write", message });
      pushToast({ tone: "danger", text: message });
      return;
    }
    const mergedOrders = activeOrders.some((o) => o.id === savedOrder.id) ? activeOrders.map((o) => (o.id === savedOrder.id ? savedOrder : o)) : [savedOrder, ...activeOrders];
    logCustomer("skipped_unrelated_customer_upserts", { reason: "normal_save_should_not_rewrite_unrelated_customers", affectedCustomerIds: Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean))) });
    const result: OrderSideEffectResult = { mode: editingOrderId ? "edit" : "create", orderSaved: true, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: !isFirebaseOrdersMode && Boolean(selectedPaymentAgentId), paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: editingOrderId ? false : true, blocked: false, warnings: [], errors: [] };
    const affectedCustomerIds = Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean)));
    const generatedProductIds = savedOrder.lines.map((l) => `order-line-${savedOrder.id}-${l.id}`);
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: savedOrder.id, orderNumber: savedOrder.number, mode: result.mode, affectedCustomerIds, affectedPaymentAgentId: savedOrder.paymentAgentId || savedOrder.paymentBy, generatedProductIds }, null, 2));

    setOrderSaveState("idle");
    saveAudit.mark("ui:modalClosed");
    resetOrderComposer(false);
    pushToast({ tone: "info", text: "Order saved. Syncing ledgers..." });

    void (async () => {
      const paymentAgentsService = getPaymentAgentsService();
      const orderNumberSeriesService = getOrderNumberSeriesService();
      saveAudit.mark("backgroundSync:start");
      const syncTasks: Promise<unknown>[] = [];

      syncTasks.push((async () => {
        saveAudit.mark("seriesUpdate:start");
        try {
          await orderNumberSeriesService.syncOrderNumberSeriesFromOrder(savedOrder, mergedOrders);
          logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "sync_order_series", success: true }, null, 2));
        } catch (error) {
          result.warnings.push(`Order series sync failed: ${error instanceof Error ? error.message : String(error)}`);
          logError("order_series_sync_failure", { orderId: savedOrder.id, orderNumber: savedOrder.number, error: error instanceof Error ? error.message : String(error) });
        } finally {
          saveAudit.mark("seriesUpdate:end");
        }
      })());

      syncTasks.push((async () => {
        if (editingOrderId && removedLineIds.length) {
          try {
            await archiveProductsForRemovedOrderLines(editingOrderId, removedLineIds);
            result.generatedProductsArchived = true;
            logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "archive_removed_line_products", success: true }, null, 2));
          } catch (e) {
            result.generatedProductsArchived = false;
            result.warnings.push("Removed-line product archive failed.");
            logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "archive_removed_line_products", error: e instanceof Error ? e.message : String(e) });
          }
        }

        try {
          const sync = await measurePerfAsync("sync", "orders.syncOrderLinesToProducts", { orderId: savedOrder.id }, () => syncOrderLinesToProducts(savedOrder));
          result.productsSynced = sync.failed === 0;
          result.productSyncFailures = sync.failures.map((f) => ({ lineId: f.lineId, reason: f.reason, errorCode: f.errorCode, errorMessage: f.errorMessage }));
          if (!result.productsSynced) result.warnings.push(`Product sync failed for ${sync.failed} line(s).`);
          logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "sync_products", success: result.productsSynced, productSyncFailures: result.productSyncFailures }, null, 2));
        } catch (e) {
          result.productsSynced = false;
          result.warnings.push("Product sync failed.");
          logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "sync_products", error: e instanceof Error ? e.message : String(e) });
        }
      })());

      if (isFirebaseOrdersMode && (savedOrder.paymentAgentId || savedOrder.paymentBy)) {
        syncTasks.push((async () => {
          saveAudit.mark("paymentAgentLedger:start");
          try {
            await measurePerfAsync("sync", "orders.applyPaymentAgentSettlement", { orderId: savedOrder.id, paymentAgentId: savedOrder.paymentAgentId || savedOrder.paymentBy || "" }, () => paymentAgentsService.applyOrderSettlement?.(savedOrder) ?? Promise.resolve());
            result.paymentSettlementApplied = true;
            logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", success: true }, null, 2));
          } catch (e) {
            result.paymentSettlementApplied = false;
            result.warnings.push(`Payment-agent settlement failed: ${e instanceof Error ? e.message : String(e)}`);
            logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_payment_settlement", error: e instanceof Error ? e.message : String(e) });
          } finally {
            saveAudit.mark("paymentAgentLedger:end", { applied: result.paymentSettlementApplied });
          }
        })());
      }

      syncTasks.push((async () => {
        saveAudit.mark("customerLedger:start");
        try {
          await measurePerfAsync("sync", "orders.applyCustomerReceivables", { orderId: savedOrder.id }, () => customerLedgerService.applyOrderCustomerReceivables(savedOrder as any));
          result.customerReceivablesApplied = true;
          logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", success: true }, null, 2));
        } catch (e) {
          result.customerReceivablesApplied = false;
          result.warnings.push(`Customer receivable update failed: ${e instanceof Error ? e.message : String(e)}`);
          logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "apply_customer_receivables", error: e instanceof Error ? e.message : String(e) });
        } finally {
          saveAudit.mark("customerLedger:end", { applied: result.customerReceivablesApplied });
        }
      })());

      if (isFirebaseOrdersMode) {
        syncTasks.push((async () => {
          saveAudit.mark("lifecycleSync:start");
          try {
            savedOrder = { ...savedOrder, ...((await measurePerfAsync("sync", "orders.syncLifecycleMetadata", { orderId: savedOrder.id }, () => orderLifecycleService.syncOrderLifecycleMetadata(savedOrder, {
              knownCustomerIds: knownCustomerIdsBeforeSave,
              knownPaymentAgentIds: knownPaymentAgentIdsBeforeSave,
            }))) || {}) };
            logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "sync_lifecycle_metadata", success: true }, null, 2));
          } catch (e) {
            result.warnings.push(`Lifecycle sync failed: ${e instanceof Error ? e.message : String(e)}`);
            logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "sync_lifecycle_metadata", error: e instanceof Error ? e.message : String(e) });
          } finally {
            saveAudit.mark("lifecycleSync:end");
          }
        })());
      }

      await Promise.allSettled(syncTasks);

      saveAudit.mark("stateRefresh:start");
      const refreshTasks: Promise<unknown>[] = [];
      if (isFirebaseOrdersMode) {
        refreshTasks.push(measurePerfAsync("reload", "orders.reloadFirebaseOrders", { orderId: savedOrder.id }, () => reloadFirebaseOrders()));
      } else {
        refreshTasks.push(measurePerfAsync("reload", "orders.recalculatePaymentAgentsFromOrders", { orderId: savedOrder.id, ordersCount: mergedOrders.length }, () => recalculateFromOrders(mergedOrders)));
      }
      refreshTasks.push(measurePerfAsync("reload", "orders.reloadCustomers", { orderId: savedOrder.id }, () => reloadCustomers()));
      refreshTasks.push(measurePerfAsync("reload", "orders.reloadPaymentAgents", { orderId: savedOrder.id }, () => reloadPaymentAgents()));
      refreshTasks.push(measurePerfAsync("reload", "orders.reloadOrderSeries", { orderId: savedOrder.id }, () => reloadOrderSeries()));
      await Promise.allSettled(refreshTasks);
      saveAudit.mark("stateRefresh:end");
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: savedOrder.id, orderNumber: savedOrder.number, ...result }, null, 2));

      if (result.warnings.length > 0) {
        if (result.productSyncFailures.length) pushToast({ tone: "info", text: `Order saved, but product sync failed for ${result.productSyncFailures.length} line.` });
        else if (result.warnings.some((warning) => warning.startsWith("Order series sync failed"))) pushToast({ tone: "info", text: result.warnings.find((warning) => warning.startsWith("Order series sync failed")) || "Order series sync failed." });
        else if (!result.customerReceivablesApplied) pushToast({ tone: "info", text: `Order saved, but ${result.warnings.find((warning) => warning.startsWith("Customer receivable update failed")) || "customer receivable update failed."}` });
        else if (!result.paymentSettlementApplied) pushToast({ tone: "info", text: `Order saved, but ${result.warnings.find((warning) => warning.startsWith("Payment-agent settlement failed")) || "payment-agent settlement failed."}` });
        else pushToast({ tone: "info", text: `Order saved with warnings: ${result.warnings[0]}` });
      }
      setOrderSaveState("idle");
      saveAudit.flush("save:done", { warnings: result.warnings.length, mode: result.mode });
    })().catch((error) => {
      logError("order_side_effects_background_failure", { orderId: savedOrder.id, error: error instanceof Error ? error.message : String(error) });
      pushToast({ tone: "danger", text: "Order saved, but background sync failed." });
      setOrderSaveState("idle");
      saveAudit.flush("save:error", { stage: "background_sync", message: error instanceof Error ? error.message : String(error) });
    });
    return;
    });
  };

  const resetOrderComposer = (notify = true) => {
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    setExpandedOrderIds({});
    const preferredSeries = orderSeries.find((series) => series.id === selectedSeriesId) ?? orderSeries[0] ?? null;
    const nextDraft = createEmptyDraft(orders, preferredSeries ? getSeriesSuggestion(preferredSeries) : "");
    setDraft({ ...nextDraft, ...deriveOrderSeriesFields(nextDraft.number || nextDraft.orderNumber) });
    setMode("history");
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    setPopupCustomerIssues({});
    if (notify) pushToast({ tone: "info", text: "Draft reset to new order." });
  };

  const requestExitComposer = () => {
    if (!isOrderModalOpen) return;
    if (!hasComposerChanges()) {
      resetOrderComposer(false);
      return;
    }
    setShowExitConfirm(true);
  };

  const startEdit = async (o: Order) => {
    if (o.status === "draft" && !ensureFirebaseOrderWriteReady()) return;
    setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id)));
    setExpandedOrderIds({});
    const copy = JSON.parse(JSON.stringify(o));
    const normalizedOrderNumber = normalizeEditableOrderNumber(copy.number || copy.orderNumber);
    const matchedSeries = orderSeries.find((series) => series.prefix === (parseOrderNumber(normalizedOrderNumber)?.prefix || "")) ?? null;
    setSelectedSeriesId(matchedSeries?.id || "");
    setDraft(applyLegacyPaymentAgentFromSplits({
      ...copy,
      number: normalizedOrderNumber,
      orderNumber: normalizedOrderNumber,
      ...deriveOrderSeriesFields(normalizedOrderNumber),
      wechatId: (copy.wechatId || "").trim(),
      lines: (copy.lines || []).map((line: Order["lines"][number]) => seedDetailBoxesFromLegacy(line)),
    }, getEditablePaymentAgentSplits(copy)));
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    setPopupCustomerIssues({});
    setMode("edit");
  };
  const startAdd = async () => {
    logDataFlow("Orders", JSON.stringify({ event: "add_order_started" }, null, 2));
    if (!ensureFirebaseOrderWriteReady()) return;
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    setExpandedOrderIds({});
    const preferredSeries = orderSeries.find((series) => series.id === selectedSeriesId) ?? orderSeries.find((series) => series.isDefault) ?? orderSeries[0] ?? null;
    if (preferredSeries) {
      setSelectedSeriesId(preferredSeries.id);
    }
    const reserved = preferredSeries ? getSeriesSuggestion(preferredSeries) : "";
    const nextDraft = createEmptyDraft(orders, normalizeEditableOrderNumber(reserved));
    setDraft({ ...nextDraft, ...deriveOrderSeriesFields(nextDraft.number || nextDraft.orderNumber) });
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    setPopupCustomerIssues({});
    setMode("add");
    logDataFlow("Orders", JSON.stringify({ event: "add_order_fresh_form_opened", orderId: nextDraft.id, orderNumber: nextDraft.number || nextDraft.orderNumber }, null, 2));
  };
  const drafts = useMemo(() => (isFirebaseOrdersMode ? firebaseDraftOrders : orders.filter((o) => o.status === "draft")), [isFirebaseOrdersMode, orders, firebaseDraftOrders]);
  const draftTotalPages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const pagedDrafts = useMemo(() => drafts.slice((draftPage - 1) * PAGE_SIZE, draftPage * PAGE_SIZE), [drafts, draftPage]);
  const formatPlainAmount = (value: number) => formatAmount(value);
  const formatPlainNumber = (value: number) => formatDisplayNumber(value, { maxFractionDigits: 6 });
  const formatFinalAmount = (value: number) => formatWholeMoney(value);
  const getPaymentAgentMeta = (order: Order) => getOrderPaymentAgentDisplay(order, paymentAgents);
  const getLineCtns = (line: Order["lines"][number]) => Number(line.totalCtns) || 0;
  const getLinePcsPerCtn = (line: Order["lines"][number]) => Number(line.pcsPerCtn) || 0;
  const getLineTotalPcs = (line: Order["lines"][number]) => lineTotalPcs(line);
  const getLineRate = (line: Order["lines"][number]) => Number(line.rmbPerPcs) || 0;
  const getLineAmount = (line: Order["lines"][number]) => lineTotalRmb(line);
  const getOrderTotalCtns = (order: Order) => (order.lines || []).reduce((sum, line) => sum + getLineCtns(line), 0);
  const getOrderTotalAmount = (order: Order) => orderTotal(order);
  const getOrderShippingAmount = (order: Order) => orderShippingPrice(order);
  const getFirstDraftPhoto = (order: Order) => order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.productPhotoUrl || order.lines.find((line) => line.productPhotoUrl || line.photoUrl)?.photoUrl || "";
  const renderDraftMissing = () => <span className="text-[var(--danger)]">Not present</span>;
  useEffect(() => {
    setDraftPage(1);
  }, [mode]);

  useEffect(() => {
    setDraftPage((page) => Math.min(page, draftTotalPages));
  }, [draftTotalPages]);

  const getDraftMarkaSummary = (order: Order) => {
    const markas = Array.from(new Set(order.lines.map((line) => (line.marka || "").trim()).filter(Boolean)));
    if (markas.length === 0) return null;
    return markas.length === 1 ? markas[0] : `${markas[0]} +${markas.length - 1} more`;
  };
  const getLineProductPhoto = (line: Order["lines"][number]) => {
    const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
    return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
  };
  const getDisplayWechatId = (order: Order) => order.wechatId?.trim() || "Not Set";
  const isMissingCustomerDisplay = (value: string) =>
    value === CUSTOMER_NOT_LINKED || value === "Deleted Customer" || value === "Invalid Customer Reference";
  const getVisibleLineDetails = (line: Order["lines"][number]) => {
    const parts = getLineDetailsParts(line);
    const values = [parts.detail1, parts.detail2, parts.detail3].map((part) => part.trim()).filter(Boolean);
    if (values.length > 0) return values;
    return line.details?.trim() ? [line.details.trim()] : [];
  };
  const getCardCustomerValue = (line: Order["lines"][number] | null) => {
    return line ? getLineCustomerDisplay(line, customers) : "-";
  };
  const isLineMatchedByQuery = (line: Order["lines"][number]) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return false;
    const searchable = [
      line.marka || "",
      joinLineDetails(line),
      getResolvedLineCustomerName(line),
      formatAmount(getLineAmount(line)),
      formatAmount(getLineTotalPcs(line)),
      formatAmount(getLineRate(line)),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedQuery);
  };
  const isOrderExpanded = (row: FlatHistoryRow) =>
    Boolean(expandedOrderIds[row.order.id]) ||
    (query.trim().length > 0 && row.extraLines.some((line) => isLineMatchedByQuery(line)));
  const updateOutsideDecimalValue = (orderId: string, nextValue: string) => {
    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
      setOutsideEditValue(orderId, { value: nextValue });
    }
  };
  const getOutsideEditTargetLine = (order: Order) => {
    const outsideEdit = getOutsideEditValue(order);
    if (!outsideEdit.lineId) return null;
    return order.lines.find((entry) => entry.id === outsideEdit.lineId) ?? null;
  };
  const pendingOutsideEditOrder = outsideEditConfirm
    ? activeOrders.find((entry) => entry.id === outsideEditConfirm.orderId) ?? null
    : null;
  const pendingOutsideEditLine = pendingOutsideEditOrder && outsideEditConfirm?.lineId
    ? pendingOutsideEditOrder.lines.find((entry) => entry.id === outsideEditConfirm.lineId) ?? null
    : null;
  const renderOutsideEditableField = ({
    order,
    field,
    line,
    displayValue,
    placeholder,
    title,
    buttonClassName,
    inputClassName,
    type = "text",
    inputMode,
    numeric = false,
    listId,
    listOptions = [],
  }: {
    order: Order;
    field: OutsideEditField;
    line?: Order["lines"][number] | null;
    displayValue: string;
    placeholder: string;
    title?: string;
    buttonClassName: string;
    inputClassName: string;
    type?: "text" | "number";
    inputMode?: "text" | "decimal" | "numeric" | "search" | "email" | "tel" | "url" | "none";
    numeric?: boolean;
    listId?: string;
    listOptions?: string[];
  }) => {
    const outsideEdit = getOutsideEditValue(order);
    const editing = isOutsideFieldEditing(order, field, line);
    if (editing) {
      const normalizedValue = outsideEdit.value.trim().toLowerCase();
      const customerOptions = field === "customer"
        ? listOptions.filter((option) => option && option.toLowerCase().includes(normalizedValue)).slice(0, 4)
        : [];
      if (field === "customer") {
        return (
          <OutsideCustomerEditor
            value={outsideEdit.value}
            inputClassName={inputClassName}
            placeholder={placeholder}
            saving={outsideEdit.saving}
            suspendCancel={outsideEditConfirm?.orderId === order.id}
            customerOptions={customerOptions}
            onChange={(nextValue) => setOutsideEditValue(order.id, { value: nextValue, customerSelection: null })}
            onEnter={() => requestOutsideFieldSave(order, field, line)}
            onEscape={() => cancelOutsideField(order.id)}
            onCancel={() => cancelOutsideField(order.id)}
            onSelect={(option) => {
              const matchedCustomer = findCustomerByTypedName(customers, option);
              setOutsideEditValue(order.id, {
                value: option,
                customerSelection: matchedCustomer
                  ? {
                      customerId: matchedCustomer.id,
                      customerName: matchedCustomer.name,
                      customerSnapshot: { id: matchedCustomer.id, name: matchedCustomer.name, code: matchedCustomer.customerCode },
                    }
                  : null,
              });
            }}
          />
        );
      }
      return (
        <div className="relative z-30">
          <Input
            value={outsideEdit.value}
            type={numeric ? "text" : type}
            inputMode={inputMode}
            list={field === "customer" ? undefined : listId}
            autoFocus
            placeholder={placeholder}
            className={cn(inputClassName, numeric && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")}
            compact={field === "customer"}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (numeric) updateOutsideDecimalValue(order.id, nextValue);
              else setOutsideEditValue(order.id, { value: nextValue, customerSelection: field === "customer" ? null : undefined });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                requestOutsideFieldSave(order, field, line);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelOutsideField(order.id);
              }
            }}
            onBlur={() => {
              if (!outsideEdit.saving && outsideEditConfirm?.orderId !== order.id) {
                window.setTimeout(() => cancelOutsideField(order.id), 120);
              }
            }}
          />
          {field !== "customer" && listId && listOptions.length > 0 ? <datalist id={listId}>{listOptions.map((option) => <option key={option} value={option} />)}</datalist> : null}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={buttonClassName}
        title={title || displayValue || placeholder}
        onClick={() => openOutsideField(order, field, line)}
      >
        {displayValue || placeholder}
      </button>
    );
  };
  const getSelectedOrderLineIndex = (orderId: string, lineCount: number) => {
    const rawIndex = orderLineIndexes[orderId] ?? 0;
    if (lineCount <= 0) return 0;
    return Math.min(Math.max(rawIndex, 0), lineCount - 1);
  };
  const changeOrderLineIndex = (orderId: string, lineCount: number, direction: -1 | 1) => {
    setOrderLineIndexes((prev) => {
      const currentIndex = prev[orderId] ?? 0;
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), Math.max(lineCount - 1, 0));
      if (nextIndex === currentIndex) return prev;
      return { ...prev, [orderId]: nextIndex };
    });
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
const historyGridTemplate = "98px minmax(92px,0.62fr) 96px minmax(190px,1.2fr) 58px 62px 76px 72px 118px minmax(108px,0.85fr) 108px minmax(108px,0.8fr) 104px";
  const fmtOrderDate = (order: Order) => {
    const raw = order.date || order.createdAt || order.updatedAt;
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return formatDate(raw);
    return formatIndianDate(d);
  };


  const handleRemoveLine = (lineId: string) => {
    if (editingOrderId && originalLineIds.has(lineId)) {
      setRemovedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
    }
    setPopupCustomerIssues((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
  };

  const autosaveStatus = useDraftAutosave({ enabled: isFirebaseOrdersMode && (mode === "add" || mode === "edit"), draft, activeUploads, autosaveDraft, onSaved: (saved) => setDraft((d) => ({ ...d, id: saved.id })) });

  const removeOrder = (o: Order) => {
    setPendingDeleteOrder(o);
  };

  const confirmRemoveOrder = async () => {
    if (!pendingDeleteOrder || deleteBusy) return;
    const o = pendingDeleteOrder;
    const deleteAudit = createSaveTimingProfile("order-delete", { orderId: o.id, orderNumber: o.number || o.orderNumber, mode: isFirebaseOrdersMode ? "soft_delete" : "local_delete" });
    setDeleteBusy(true);
    if (isFirebaseOrdersMode) {
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      try {
        deleteAudit.mark("lifecycleSync:start");
        await orderLifecycleService.softDeleteOrder(o, "orders-page");
        deleteAudit.mark("lifecycleSync:end");
      } catch (e) {
        logError("order_side_effect_step_failed", { orderId: o.id, mode: "soft_delete", step: "soft_delete_order", error: e instanceof Error ? e.message : String(e) });
        pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Order delete failed." });
        setDeleteBusy(false);
        deleteAudit.flush("save:error", { stage: "soft_delete", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      deleteAudit.mark("stateRefresh:start");
      await reloadFirebaseOrders();
      await reloadCustomers();
      await reloadPaymentAgents();
      deleteAudit.mark("stateRefresh:end");
      logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_completed", orderId: o.id, orderNumber: o.number || o.orderNumber, mode: "soft_delete" }, null, 2));
      pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} moved to Recycle Bin.` });
      setPendingDeleteOrder(null);
      setDeleteBusy(false);
      deleteAudit.flush("save:done");
      return;
    }
    try {
      deleteAudit.mark("orderWrite:start");
      deleteOrder(o.id);
      await recalculateFromOrders(orders.filter((x) => x.id !== o.id && x.status === "saved"));
      await archiveProductsForOrder(o);
      deleteAudit.mark("orderWrite:end");
      pushToast({ tone: "success", text: `Order ${o.number || o.orderNumber} deleted and related generated products archived.` });
      if (editingOrderId === o.id) resetOrderComposer(false);
      setPendingDeleteOrder(null);
      deleteAudit.flush("save:done");
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Order delete failed." });
      deleteAudit.flush("save:error", { stage: "local_delete", message: e instanceof Error ? e.message : String(e) });
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
    const onClick = (e: MouseEvent) => {
      if (seriesPickerRef.current && !seriesPickerRef.current.contains(e.target as Node)) setSeriesPickerOpen(false);
    };
    if (seriesPickerOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [seriesPickerOpen]);

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
          <Button size="sm" onClick={() => setPickerOpen((v) => !v)}><List size={14} /><span className="text-fg-muted">Order</span><span className="font-semibold">{(editingOrder?.number || draft.number || history[0]?.order.number || history[0]?.order.orderNumber || "-")}</span><ChevronDown size={13} /></Button>
          {pickerOpen && <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card max-h-[320px] overflow-y-auto">{pickerOrders.slice(0,30).map((o) => <button key={o.id} onClick={() => { setPickerOpen(false); startEdit(o); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors"><div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{o.number || o.orderNumber || "Draft"}</span><span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span></div><div className="mt-0.5 text-[11.5px] text-fg-muted">{o.lines.length} lines | {formatFinalAmount(orderTotal(o))}</div></button>)}</div>}
        </div>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => { setFilterOpen((prev) => !prev); }}><Filter size={14} />Filter</Button>
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
        <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">{([{ v: "list", I: List }, { v: "grid", I: LayoutGrid }, { v: "calendar", I: CalendarDays }] as const).map(({ v, I }) => <button key={v} onClick={() => setView(v)} className={cn("grid h-6 w-7 place-items-center rounded-md text-fg-muted transition-colors", view===v && "bg-brand text-brand-fg")}><I size={13} /></button>)}</div>
        <Button size="sm" variant="primary" onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant={mode === "drafts" ? "primary" : "secondary"} onClick={() => setMode((prev) => prev === "drafts" ? "history" : "drafts")}>Draft ({drafts.length})</Button>
        <button aria-label="Toggle theme" onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
      {ordersDataSource === "mock" ? <div className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-[12px] font-medium text-amber-900">{ordersSourceSelection.hasFirebaseConfig ? "Mock mode is enabled; order and customer data is local and will not persist to Firebase." : "Firebase is not configured; app is running in mock mode and data will not persist."}</div> : null}
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {mode === "history" && orderCategoryTabs.length ? <section className="card p-2.5"><div className="flex flex-wrap items-center gap-2">{orderCategoryTabs.map((category) => { const isActive = effectiveOrderCategory === category; return <button key={category} type="button" onClick={() => setSelectedOrderCategory(category)} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors", isActive ? "border-brand bg-brand text-brand-fg" : "border-border bg-bg-card text-fg hover:bg-bg-subtle")}>{category}</button>; })}</div></section> : null}
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
                {pagedDrafts.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No draft orders yet.</td></tr> : pagedDrafts.map((o) => {
                  const photo = getFirstDraftPhoto(o);
                  const paymentMeta = getPaymentAgentMeta(o);
                  const marka = getDraftMarkaSummary(o);
                  const totalPcs = o.lines.reduce((sum, line) => sum + ((Number(line.totalCtns) || 0) * (Number(line.pcsPerCtn) || 0)), 0);
                  const totalCtns = getOrderTotalCtns(o);
                  const totalAmount = getOrderTotalAmount(o);
                  return <tr key={o.id} className="border-t border-border/80 hover:bg-bg-subtle/40 align-middle">
                    <td className="px-4 py-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">{photo ? <button type="button" title="Open image preview" aria-label="Open image preview" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage({ src: photo, alt: "Draft line photo" })}><img src={photo} alt="draft line" className="h-full w-full object-cover" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">-</span>}</div></td>
                    <td>{o.wechatId?.trim() ? <span>{o.wechatId.trim()}</span> : renderDraftMissing()}</td>
                    <td>{paymentMeta.isMissing ? renderDraftMissing() : <span>{paymentMeta.value}</span>}</td>
                    <td>{marka ? <span>{marka}</span> : renderDraftMissing()}</td>
                    <td>{(totalPcs > 0 || totalCtns > 0) ? <span>{formatPlainNumber(totalPcs)} PCS / {formatPlainNumber(totalCtns)} CTNS</span> : renderDraftMissing()}</td>
                    <td className="tabular-nums">{totalAmount > 0 ? <span>{formatFinalAmount(totalAmount)}</span> : renderDraftMissing()}</td>
                    <td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={async () => { logDataFlow("Orders", JSON.stringify({ event: "complete_draft_opened", orderId: o.id, orderNumber: o.number || o.orderNumber }, null, 2)); await startEdit(o); }}>Continue</Button><Button size="sm" variant="secondary" onClick={() => removeOrder(o)}>Delete</Button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <TablePagination total={drafts.length} currentPage={draftPage} pageSize={PAGE_SIZE} onPageChange={setDraftPage} label="draft orders" />
        </section>}

        {view === "grid" ? (
          <section className="card overflow-visible">
            {pagedHistory.length === 0 ? <div className="py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</div> : <div>{pagedHistory.map((row) => {
              const { order, line, paymentMeta } = row;
              const paymentName = paymentMeta.value;
              const rowValue = getRowValue(order);
              const rowDirty = rowValue.loadingDate !== order.loadingDate || rowValue.status !== order.status;
              const canEditOperationalFields = order.status !== "draft" && order.status !== "archived";
              const productPhoto = line ? getLineProductPhoto(line) : "";
              const detailLines = line ? getVisibleLineDetails(line) : [];
              const totalPcs = line ? getLineTotalPcs(line) : 0;
              const ctns = line ? getLineCtns(line) : getOrderTotalCtns(order);
              const pcsPerCtn = line ? getLinePcsPerCtn(line) : 0;
              const rate = line ? getLineRate(line) : 0;
              const amount = getOrderTotalAmount(order);
              const shippingAmount = getOrderShippingAmount(order);
              const customerValue = getCardCustomerValue(line);
              const customerMissing = isMissingCustomerDisplay(customerValue);
              const expanded = isOrderExpanded(row);
              return <div
                key={row.key}
                className="w-full border-b border-border bg-[var(--bg-card)] last:border-b-0"
              >
                <div className="flex flex-col gap-5 border-b border-[#e8ebef] px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-stretch">
                    <div className="min-w-[180px]">
                      {renderOutsideEditableField({
                        order,
                        field: "orderNumber",
                        displayValue: order.number || order.orderNumber || "Draft",
                        placeholder: "Set order number",
                        buttonClassName: "block w-full rounded-xl px-2 py-1 text-left text-[26px] font-extrabold leading-none text-slate-950 transition-colors hover:bg-white/70",
                        inputClassName: "h-11 min-w-0 text-[18px] font-bold",
                      })}
                      <div className="mt-3 flex items-center gap-2 text-[15px] font-medium text-slate-500">
                        <CalendarDays size={16} />
                        <span>{fmtOrderDate(order)}</span>
                      </div>
                    </div>
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="min-w-[220px] text-center">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-400">Customer</div>
                      <div className="mt-3 flex items-center gap-3 text-[21px] font-bold leading-tight text-slate-950">
                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/92 text-slate-600 shadow-sm ring-1 ring-[#e6e8ec]" />
                        <div className="min-w-0 flex-1">
                          {line ? renderOutsideEditableField({
                            order,
                            field: "customer",
                            line,
                            displayValue: customerValue || "-",
                            placeholder: "Set customer",
                            title: customerValue,
                            buttonClassName: cn("block w-full rounded-xl px-2 py-1 text-left text-[21px] font-bold leading-tight transition-colors hover:bg-white/70", customerMissing && "text-[var(--danger)]"),
                            inputClassName: "h-10 min-w-0 text-[15px] font-semibold",
                            listId: `outside-customer-${order.id}-${line.id}`,
                            listOptions: customerSuggestions,
                          }) : <span className="min-w-0 break-words">-</span>}
                        </div>
                      </div>
                    </div>
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="min-w-[220px] text-center">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-400">WeChat ID</div>
                      <div className="mt-3 flex items-center gap-3 text-[21px] font-bold leading-tight text-slate-950">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-200">
                          <MessageCircleMore size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                          {renderOutsideEditableField({
                            order,
                            field: "wechat",
                            displayValue: getDisplayWechatId(order),
                            placeholder: "Set WeChat ID",
                            buttonClassName: cn("block w-full rounded-xl px-2 py-1 text-left text-[21px] font-bold leading-tight transition-colors hover:bg-white/70", !order.wechatId?.trim() && "text-[var(--danger)]"),
                            inputClassName: "h-10 min-w-0 text-[15px] font-semibold",
                            listId: `outside-wechat-${order.id}`,
                            listOptions: wechatSuggestions,
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="hidden w-px self-stretch bg-[#e8ebef] lg:block" />
                    <div className="min-w-[240px] text-center">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-400">Paid By</div>
                      <div className="mt-3 flex items-center gap-3 text-[21px] font-bold leading-tight text-slate-950">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
                          <WalletCards size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                          {renderOutsideEditableField({
                            order,
                            field: "payment",
                            displayValue: paymentName,
                            placeholder: "Set Paid By",
                            buttonClassName: cn("block w-full rounded-xl px-2 py-1 text-left text-[21px] font-bold leading-tight transition-colors hover:bg-white/70", paymentMeta.isMissing && "text-[var(--danger)]"),
                            inputClassName: "h-10 min-w-0 text-[15px] font-semibold",
                            listId: `outside-payment-${order.id}`,
                            listOptions: paymentAgents.map((agent) => agent.name),
                          })}
                        </div>
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
                    {line ? renderOutsideEditableField({
                      order,
                      field: "marka",
                      line,
                      displayValue: line.marka?.trim() || "-",
                      placeholder: "Set marka",
                      buttonClassName: "block w-full rounded-xl px-2 py-1 text-left text-[28px] font-extrabold leading-tight text-slate-950 transition-colors hover:bg-white/70",
                      inputClassName: "h-11 min-w-0 text-[18px] font-bold",
                    }) : <div className="text-[28px] font-extrabold leading-tight text-slate-950">-</div>}
                    {row.extraLines.length > 0 ? <button type="button" className="mt-3 text-[13px] font-semibold text-brand transition-colors hover:underline" onClick={() => setExpandedOrderIds((prev) => ({ ...prev, [order.id]: !expanded }))}>{expanded ? "Show Less" : `See More (+${row.extraLines.length})`}</button> : null}
                    <div className="mt-5 text-[19px] leading-relaxed">
                      <span className="font-medium text-slate-500">WeChat: </span>
                      <span className="font-semibold text-emerald-700">{getDisplayWechatId(order)}</span>
                    </div>
                  </div>
                </div>
                <div className={cn("overflow-hidden border-b border-[#e8ebef] transition-all duration-200", expanded && row.extraLines.length > 0 ? "max-h-[640px] px-7 py-4 opacity-100" : "max-h-0 px-7 py-0 opacity-0")}>
                  <div className="space-y-2">
                      {row.extraLines.map((extraLine, index) => <div key={`${order.id}-grid-extra-${extraLine.id || index}`} className={cn("grid grid-cols-[88px_minmax(0,1fr)_110px_110px] items-center gap-3 rounded-xl border border-border/70 bg-white/85 px-3 py-3", isLineMatchedByQuery(extraLine) && "border-brand/40 bg-brand/5")}>
                        <div className="text-[12px] font-semibold text-fg-subtle">Sub Line {index + 2}</div>
                        <div className="min-w-0"><div className="truncate text-[15px] font-semibold">{renderOutsideEditableField({
                          order,
                          field: "marka",
                          line: extraLine,
                          displayValue: extraLine.marka?.trim() || "-",
                          placeholder: "Set marka",
                          buttonClassName: "block w-full rounded-md px-1 py-0.5 text-left text-[15px] font-semibold transition-colors hover:bg-white/70",
                          inputClassName: "h-8 min-w-0 text-[12px] font-semibold",
                        })}</div></div>
                        <div className={cn("text-center text-[14px] font-semibold tabular-nums", getLineAmount(extraLine) > 0 ? "text-fg" : "text-[var(--danger)]")}>{formatFinalAmount(getLineAmount(extraLine))}</div>
                        <div className="text-center text-[13px] font-semibold">{renderOutsideEditableField({
                          order,
                          field: "customer",
                          line: extraLine,
                          displayValue: getCardCustomerValue(extraLine),
                          placeholder: "Set customer",
                          buttonClassName: cn("block w-full rounded-md px-1 py-0.5 text-center text-[13px] font-semibold transition-colors hover:bg-white/70", isMissingCustomerDisplay(getCardCustomerValue(extraLine)) && "text-[var(--danger)]"),
                          inputClassName: "h-8 min-w-0 text-[12px]",
                          listId: `outside-customer-${order.id}-${extraLine.id}`,
                          listOptions: customerSuggestions,
                        })}</div>
                      </div>)}
                  </div>
                </div>
                <div className="px-7 py-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center">
                      {[
                        { label: "CTNS", value: formatPlainAmount(ctns), editableField: "totalCtns" as const, icon: <Package2 size={21} />, tint: "bg-violet-100 text-violet-700", valueClass: "text-slate-950" },
                        { label: "PCS/CTN", value: formatPlainAmount(pcsPerCtn), editableField: "pcsPerCtn" as const, icon: <Boxes size={21} />, tint: "bg-orange-100 text-orange-700", valueClass: "text-slate-950" },
                        { label: "TOTAL PCS", value: formatPlainAmount(totalPcs), editableField: null, icon: <ShoppingBag size={21} />, tint: "bg-sky-100 text-sky-700", valueClass: "text-slate-950" },
                        { label: "RATE", value: formatPlainAmount(rate), editableField: "rate" as const, icon: <BadgePercent size={21} />, tint: "bg-rose-100 text-rose-700", valueClass: "text-slate-950" },
                        { label: "TOTAL AMOUNT", value: formatFinalAmount(amount), editableField: null, icon: <IndianRupee size={23} />, tint: "bg-emerald-100 text-emerald-700", valueClass: amount > 0 ? "text-emerald-700 text-[30px]" : "text-[var(--danger)] text-[30px]" },
                      ].map((stat, index) => (
                      <div key={`${row.key}-${stat.label}`} className={cn("flex min-w-0 items-center gap-4 rounded-2xl lg:rounded-none", index < 6 && "lg:pr-4", index < 5 && "lg:border-r lg:border-[#e8ebef]")}>
                        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", stat.tint)}>
                          {stat.icon}
                        </div>
                        <div className="min-w-0 text-center">
                          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</div>
                          <div className={cn("mt-1 text-[25px] font-extrabold leading-none", stat.valueClass)}>
                            {stat.editableField && line
                              ? renderOutsideEditableField({
                                  order,
                                  field: stat.editableField,
                                  line,
                                  displayValue: stat.value,
                                  placeholder: `Set ${stat.label.toLowerCase()}`,
                                  buttonClassName: "block w-full rounded-xl px-1 py-1 text-center transition-colors hover:bg-white/70",
                                  inputClassName: "h-10 min-w-0 text-center text-[14px] font-semibold",
                                  inputMode: "decimal",
                                  numeric: true,
                                })
                              : stat.label === "TOTAL AMOUNT" ? (
                                <div className="space-y-1">
                                  {shippingAmount > 0 || isOutsideFieldEditing(order, "shipping") ? (
                                    <div className="text-[17px] font-semibold text-rose-600">
                                      {renderOutsideEditableField({
                                        order,
                                        field: "shipping",
                                        displayValue: formatFinalAmount(shippingAmount),
                                        placeholder: "Set shipping",
                                        buttonClassName: "block w-full rounded-xl px-1 py-0.5 text-center transition-colors hover:bg-white/70",
                                        inputClassName: "h-8 min-w-0 text-center text-[16px] font-semibold",
                                        inputMode: "decimal",
                                        numeric: true,
                                      })}
                                    </div>
                                  ) : null}
                                  <div>{stat.value}</div>
                                </div>
                              ) : stat.value}
                          </div>
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
                          <span className="inline-flex h-11 w-full items-center justify-between rounded-2xl border border-[#dfe3e8] bg-white px-4 text-[14px] font-semibold text-slate-800 shadow-sm">
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-subtle">{productPhoto ? <img src={getCloudinaryOptimizedUrl(productPhoto, { width: 80, height: 80, crop: "fit" })} alt="product" className="h-full w-full object-contain" /> : <span className="text-[10px] text-fg-subtle">-</span>}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{row.line?.marka?.trim() || "-"}</div>
                  <div className="truncate text-[12px] text-fg-subtle">{row.line ? getVisibleLineDetails(row.line).join(" | ") || "-" : "-"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] text-fg-subtle">{getPaymentAgentMeta(row.order).value}</div>
                  <div className="text-[15px] font-bold text-[var(--success)]">{formatFinalAmount(getOrderTotalAmount(row.order))}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => setViewOrder(row.order)}><Eye size={14} /></button>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => startEdit(row.order)}><SquarePen size={14} /></button>
                </div>
              </div>;
            })}</div></div>)}</div>}
          </section>
        ) : null}

        {view === "list" && <section className="card overflow-visible">
          {/* <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing 1 to {pagedHistory.length} of {history.length} rows</div></div> */}
          <div className="overflow-x-auto">
            <div className="w-full min-w-0 px-0.5 py-1">
              <div className="sticky top-0 z-20 grid items-center border-b border-border bg-white text-[12.5px] font-semibold uppercase tracking-[0.01em] text-fg-muted shadow-[0_1px_0_rgba(15,23,42,0.06)]" style={{ gridTemplateColumns: historyGridTemplate }}>
                <div className="px-1 py-1.5 text-center">Order Number</div>
                <div className="px-1 py-1.5 text-left">WeChat ID</div>
                <div className="px-1 py-1.5 text-center">Product Photo</div>
                <div className="px-1 py-1.5 text-center">Marka</div>
                <div className="px-1 py-1.5 text-center">CTNS</div>
                <div className="px-1 py-1.5 text-center leading-[1.05]"><div>PCS/</div><div>CTN</div></div>
                <div className="px-1 py-1.5 text-center">Total Pieces</div>
                <div className="px-1 py-1.5 text-center">Price/Pc</div>
                <div className="px-1 py-1.5 text-center">Main Total Amount</div>
                <div className="px-1 py-1.5 text-center">Customer</div>
                <div className="px-1 py-1.5 text-center">Loading Date</div>
                <div className="px-1 py-1.5 text-center">Paid By</div>
                <div className="px-1 py-1.5 text-center">Actions</div>
              </div>
              <div className="space-y-2 pt-2">
                {pagedHistory.length === 0 ? <div className="px-4 py-8 text-center text-fg-subtle">No orders yet. Click Add Order to create one.</div> : pagedHistory.map((row) => {
                  const { order, line, extraLines, paymentMeta } = row;
                  const paymentName = paymentMeta.value;
                  const canEditOperationalFields = order.status !== "draft" && order.status !== "archived";
                  const rowValue = getRowValue(order);
                  const rowDirty = rowValue.loadingDate !== order.loadingDate || rowValue.status !== order.status;
                  const orderLines = line ? [line, ...extraLines] : [];
                  const selectedLineIndex = getSelectedOrderLineIndex(order.id, orderLines.length);
                  const selectedLine = orderLines[selectedLineIndex] ?? null;
                  const rowClass = "grid items-center border-b border-border transition-colors last:border-b-0";
                  const productPhoto = selectedLine ? getLineProductPhoto(selectedLine) : "";
                  const ctns = selectedLine ? getLineCtns(selectedLine) : 0;
                  const pcsPerCtn = selectedLine ? getLinePcsPerCtn(selectedLine) : 0;
                  const totalPcs = selectedLine ? getLineTotalPcs(selectedLine) : 0;
                  const rate = selectedLine ? getLineRate(selectedLine) : 0;
                  const amount = getOrderTotalAmount(order);
                  const shippingAmount = getOrderShippingAmount(order);
                  const marka = selectedLine?.marka?.trim() || "-";
                  const customerName = getCardCustomerValue(selectedLine);
                  const hasMultipleLines = orderLines.length > 1;
                  const customerMissing = isMissingCustomerDisplay(customerName);

                  return <div key={row.key} className="rounded-lg border border-border/70 bg-bg-card">
                    <div className={rowClass} style={{ gridTemplateColumns: historyGridTemplate }}>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        <div className="min-w-0">
                          {renderOutsideEditableField({
                            order,
                            field: "orderNumber",
                            displayValue: order.number || order.orderNumber || "Draft",
                            placeholder: "Set order number",
                            buttonClassName: "block w-full rounded-md px-1 py-1 text-center text-[18px] font-bold leading-tight transition-colors hover:bg-bg-subtle",
                            inputClassName: "h-8 min-w-0 text-[13px] font-semibold",
                          })}
                        </div>
                      </div>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        {renderOutsideEditableField({
                          order,
                          field: "wechat",
                          displayValue: getDisplayWechatId(order),
                          placeholder: "Set WeChat ID",
                          buttonClassName: cn("block w-full rounded-md px-1 py-1 text-center text-[14.5px] font-semibold leading-tight transition-colors hover:bg-bg-subtle", !order.wechatId?.trim() && "text-[var(--danger)]"),
                          inputClassName: "h-8 min-w-0 text-[13px]",
                          listId: `outside-wechat-${order.id}`,
                          listOptions: wechatSuggestions,
                        })}
                      </div>
                      <div className="min-w-0 px-0.5 py-1.5">
                        <div className="flex justify-center">{productPhoto ? <button type="button" onClick={() => setPreviewImage({ src: productPhoto, alt: "Product photo" })} className="grid h-[74px] w-[74px] shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle"><img src={getCloudinaryOptimizedUrl(productPhoto, { width: 120, height: 120, crop: "fit" })} alt="product" className="h-full w-full object-contain" loading="lazy" decoding="async" /></button> : <span className="text-[10px] text-fg-subtle">-</span>}</div></div>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {hasMultipleLines ? (
                            <button
                              type="button"
                              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border bg-white text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => changeOrderLineIndex(order.id, orderLines.length, -1)}
                              disabled={selectedLineIndex === 0}
                              aria-label="Previous product line"
                            >
                              <ChevronLeft size={13} />
                            </button>
                          ) : null}
                          <div className="min-w-0 flex-1 text-center">
                            {selectedLine ? renderOutsideEditableField({
                              order,
                              field: "marka",
                              line: selectedLine,
                              displayValue: marka,
                              placeholder: "Set marka",
                              title: marka,
                              buttonClassName: "block w-full rounded-md px-1 py-1 text-center text-[14px] font-semibold leading-[1.2] whitespace-normal break-normal [overflow-wrap:normal] [word-break:normal] transition-colors hover:bg-bg-subtle",
                              inputClassName: "h-8 min-w-0 text-[12px]",
                            }) : <div className="text-[14px] font-semibold leading-[1.2]">-</div>}
                          </div>
                          {hasMultipleLines ? <span className="shrink-0 text-[11px] font-semibold text-fg-subtle">{`${selectedLineIndex + 1}/${orderLines.length}`}</span> : null}
                          {hasMultipleLines ? (
                            <button
                              type="button"
                              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border bg-white text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => changeOrderLineIndex(order.id, orderLines.length, 1)}
                              disabled={selectedLineIndex === orderLines.length - 1}
                              aria-label="Next product line"
                            >
                              <ChevronRight size={13} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="px-0.5 py-1.5 text-center text-[14.5px] font-semibold tabular-nums">
                        {selectedLine ? renderOutsideEditableField({
                          order,
                          field: "totalCtns",
                          line: selectedLine,
                          displayValue: formatPlainNumber(ctns),
                          placeholder: "Set CTNs",
                          buttonClassName: "block w-full rounded-md px-1 py-1 text-center transition-colors hover:bg-bg-subtle",
                          inputClassName: "h-8 min-w-0 text-center text-[13px]",
                          inputMode: "decimal",
                          numeric: true,
                        }) : formatPlainNumber(ctns)}
                      </div>
                      <div className="px-0.5 py-1.5 text-center text-[14.5px] font-semibold tabular-nums">
                        {selectedLine ? renderOutsideEditableField({
                          order,
                          field: "pcsPerCtn",
                          line: selectedLine,
                          displayValue: formatPlainNumber(pcsPerCtn),
                          placeholder: "Set PCS/CTN",
                          buttonClassName: "block w-full rounded-md px-1 py-1 text-center transition-colors hover:bg-bg-subtle",
                          inputClassName: "h-8 min-w-0 text-center text-[13px]",
                          inputMode: "decimal",
                          numeric: true,
                        }) : formatPlainNumber(pcsPerCtn)}
                      </div>
                      <div className="px-0.5 py-1.5 text-center text-[14.5px] font-semibold tabular-nums">{formatPlainNumber(totalPcs)}</div>
                      <div className="px-0.5 py-1.5 text-center text-[15px] font-semibold tabular-nums">
                        {selectedLine ? renderOutsideEditableField({
                          order,
                          field: "rate",
                          line: selectedLine,
                          displayValue: formatPlainAmount(rate),
                          placeholder: "Set rate",
                          buttonClassName: "block w-full rounded-md px-1 py-1 text-center transition-colors hover:bg-bg-subtle",
                          inputClassName: "h-8 min-w-0 text-center text-[13px]",
                          inputMode: "decimal",
                          numeric: true,
                        }) : formatPlainAmount(rate)}
                      </div>
                      <div className="px-0.5 py-1.5 tabular-nums">
                        <div className="flex flex-col items-center justify-center gap-0.5 text-center">
                          {shippingAmount > 0 || isOutsideFieldEditing(order, "shipping") ? (
                            <div className="text-[16px] font-semibold leading-none text-rose-600">
                              {renderOutsideEditableField({
                                order,
                                field: "shipping",
                                displayValue: formatFinalAmount(shippingAmount),
                                placeholder: "Set shipping",
                                buttonClassName: "block w-full rounded-md px-1 py-0.5 text-center transition-colors hover:bg-bg-subtle",
                                inputClassName: "h-7 min-w-0 text-center text-[15px]",
                                inputMode: "decimal",
                                numeric: true,
                              })}
                            </div>
                          ) : null}
                          <div className={cn("text-[16px] font-bold leading-none", amount > 0 ? "text-fg" : "text-[var(--danger)]")}>{formatFinalAmount(amount)}</div>
                        </div>
                      </div>
                      <div className="min-w-0 px-1 py-1.5"><div className={cn("block w-full min-w-0 truncate text-center text-[14.5px] font-semibold leading-tight", customerMissing && "text-[var(--danger)]")} title={customerName}>{selectedLine ? renderOutsideEditableField({
                        order,
                        field: "customer",
                        line: selectedLine,
                        displayValue: customerName,
                        placeholder: "Set customer",
                        buttonClassName: cn("block w-full rounded-md px-1 py-1 text-center text-[14.5px] font-semibold leading-tight transition-colors hover:bg-bg-subtle", customerMissing && "text-[var(--danger)]"),
                        inputClassName: "h-8 min-w-0 text-[13px]",
                        listId: `outside-customer-${order.id}-${selectedLine.id}`,
                        listOptions: customerSuggestions,
                      }) : customerName}</div></div>
                      <div className="min-w-0 pl-1 pr-2 py-1.5 text-center">
                        <div className="min-w-0 [&_button]:max-w-full [&_button]:text-[13.5px] [&_button]:leading-tight">
                          {canEditOperationalFields ? <LoadingDateControl compact debugOrderId={order.id} value={rowValue.loadingDate} onChange={(next) => { setRowEdit(order, { loadingDate: next }, "date_selected"); }} /> : <span className="text-[15px] text-fg-muted">{order.loadingDate ? formatDate(order.loadingDate) : "Set date"}</span>}
                        </div>
                        {canEditOperationalFields && rowDirty ? <button type="button" title="Save row changes" aria-label="Save row changes" className="mt-1 inline-flex text-[10.5px] font-semibold text-brand transition-colors hover:underline disabled:opacity-60" disabled={rowValue.saving} onClick={() => { void saveRowEdit(order); }}>{rowValue.saving ? "Saving..." : "Save"}</button> : null}
                      </div>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        {renderOutsideEditableField({
                          order,
                          field: "payment",
                          displayValue: paymentName,
                          placeholder: "Set Paid By",
                          buttonClassName: cn("block w-full rounded-md px-1 py-1 text-center text-[14.5px] font-semibold leading-tight transition-colors hover:bg-bg-subtle", paymentMeta.isMissing && "text-[var(--danger)]"),
                          inputClassName: "h-8 min-w-0 text-[13px]",
                          listId: `outside-payment-${order.id}`,
                          listOptions: paymentAgents.map((agent) => agent.name),
                        })}
                      </div>
                      <div className="px-0.5 py-1.5">
                        <div className="flex justify-center gap-0.5 whitespace-nowrap">
                          <button type="button" title="View" aria-label="View" className="grid h-[28px] w-[28px] place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => setViewOrder(order)}><Eye size={14} /></button>
                          <button type="button" title="Edit" aria-label="Edit" className="grid h-[28px] w-[28px] place-items-center rounded-md text-fg transition-colors hover:bg-bg-subtle" onClick={() => startEdit(order)}><SquarePen size={14} /></button>
                          <button type="button" title="Delete" aria-label="Delete" className="grid h-[28px] w-[28px] place-items-center rounded-md text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10" onClick={() => removeOrder(order)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </section>}
        {mode === "history" ? <TablePagination total={history.length} currentPage={currentPage} pageSize={rowsPerPage} onPageChange={setCurrentPage} label="orders" /> : null}
      <ImageLightbox src={previewImage?.src} alt={previewImage?.alt} caption={previewImage?.caption} open={Boolean(previewImage?.src)} onClose={() => setPreviewImage(null)} />
      <ConfirmDialog
        open={Boolean(outsideEditConfirm && pendingOutsideEditOrder)}
        title="Save outside edit?"
        description="This field has real changes. Save them now or cancel and keep the previous value."
        confirmLabel="Save"
        cancelLabel="Cancel"
        busy={Boolean(pendingOutsideEditOrder && getOutsideEditValue(pendingOutsideEditOrder).saving)}
        onCancel={() => {
          if (pendingOutsideEditOrder) {
            cancelOutsideField(pendingOutsideEditOrder.id);
          }
          setOutsideEditConfirm(null);
        }}
        onConfirm={() => {
          if (!pendingOutsideEditOrder || !outsideEditConfirm) {
            setOutsideEditConfirm(null);
            return;
          }
          void saveOutsideField(pendingOutsideEditOrder, outsideEditConfirm.field, pendingOutsideEditLine);
        }}
      />
      </main>
      {isOrderModalOpen && <div className="fixed inset-0 z-50 bg-black/50 p-2 backdrop-blur-[2px] md:p-4">
        <div className="relative mx-auto flex h-[92vh] w-full max-w-[1520px] flex-col overflow-hidden rounded-[24px] border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-border/70 px-4 py-4">
            <div className="grid items-end gap-3 xl:grid-cols-[minmax(760px,2.8fr)_140px_minmax(340px,1.18fr)_minmax(175px,0.62fr)_44px]">
              <section className="min-w-0">
                <PaymentAgentHeaderPicker
                  splits={getEditablePaymentAgentSplits(draft)}
                  paymentAgents={paymentAgents}
                  onChange={setDraftPaymentAgentSplits}
                  onAdd={() => setDraftPaymentAgentSplits((current) => [...current, createEmptyPaymentAgentSplit()])}
                  onRemove={(splitId) => setDraftPaymentAgentSplits((current) => current.length <= 1 ? [createEmptyPaymentAgentSplit()] : current.filter((split) => split.id !== splitId))}
                />
              </section>
              <section className="min-w-0">
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-muted"><span className="font-medium tracking-[0.01em]">Date</span><Input className="h-10 rounded-xl px-3 text-[13px]" type="date" value={draft.date} onChange={(e)=>setDraft((d)=>({...d,date:e.target.value}))} /></label>
              </section>
              <section className="min-w-0 xl:col-span-1">
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-muted">
                  <span className="font-medium tracking-[0.01em]">Order Number</span>
                  <div className="relative" ref={seriesPickerRef}>
                    <Input
                      className="min-w-0 h-10 rounded-xl px-3 pr-10 text-[13px]"
                      value={draft.number}
                      onChange={(e) => handleOrderNumberInputChange(e.target.value)}
                      placeholder={selectedOrderSeries ? getSeriesSuggestion(selectedOrderSeries) : orderSeries.length ? "Type or select order number" : "Create a series first"}
                    />
                    <button
                      type="button"
                      className={cn(
                        "absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle transition-colors",
                        seriesPickerOpen ? "bg-bg-subtle text-fg" : "hover:bg-bg-subtle hover:text-fg",
                        (isOrderSeriesLoading || orderSeries.length === 0) && "cursor-not-allowed opacity-70",
                      )}
                      onClick={() => {
                        if (!isOrderSeriesLoading && orderSeries.length > 0) setSeriesPickerOpen((open) => !open);
                      }}
                      disabled={isOrderSeriesLoading || orderSeries.length === 0}
                      aria-label="Toggle order number suggestions"
                    >
                      <ChevronDown size={14} className={cn("transition-transform", seriesPickerOpen && "rotate-180")} />
                    </button>
                    {seriesPickerOpen ? (
                      <div className="absolute left-0 top-full z-40 mt-2 w-full min-w-[320px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
                        <div className="border-b border-border/80 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Order Series</div>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-1.5">
                          {seriesSuggestions.map((series) => (
                            <button
                              key={series.id}
                              type="button"
                              className={cn("block w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bg-subtle", selectedOrderSeries?.id === series.id && "bg-bg-subtle")}
                              onClick={() => handleSeriesChange(series.id)}
                            >
                              <div className="text-[13px] font-semibold text-fg">{series.suggestion}</div>
                            </button>
                          ))}
                          <button type="button" className="mt-1 block w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-bg-subtle" onClick={openCreateSeriesModal}>
                            <div className="text-[13px] font-semibold text-fg">+ Add New Series</div>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {orderSeries.length === 0 ? <div className="pt-0.5 text-[10.5px] text-amber-700">No order number series yet. Create one before saving a new order number.</div> : null}
                </label>
              </section>
              <section className="min-w-0">
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-muted"><span className="font-medium tracking-[0.01em]">WeChat ID</span><div className="relative"><Input className="h-10 rounded-xl px-3 text-[13px]" value={draft.wechatId} onFocus={() => setHeaderWechatOpen(true)} onBlur={() => window.setTimeout(() => setHeaderWechatOpen(false), 120)} onChange={(e)=>{const next=e.target.value; setHeaderWechatOpen(true); setDraft((d)=>({...d,wechatId:next}));}} />{headerWechatOpen && headerWechatSuggestions.length>0 ? <div className="absolute z-30 mt-1.5 max-h-44 w-full overflow-auto rounded-xl border border-border bg-bg-card shadow-card">{headerWechatSuggestions.map((w)=><button key={w} type="button" className="block w-full px-3 py-2 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderWechatOpen(false); setDraft((d)=>({...d,wechatId:w}));}}>{w}</button>)}</div> : null}</div></label>
              </section>
              <section className="min-w-0">
                <div className="flex h-full items-end justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 w-10 rounded-xl p-0"
                    onClick={requestExitComposer}
                    aria-label="Close order editor"
                    title="Close"
                  >
                    <X size={15} />
                  </Button>
                </div>
              </section>
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
          <div className="min-h-0 flex-1 overflow-hidden bg-bg-subtle/20">
            <OrderForm showOrderInfo={false} draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} customerSuggestions={customerSuggestions} onPreviewImage={(src) => setPreviewImage({ src, alt: "Order line photo preview" })} onCustomerValidityChange={(lineId, issue) => setPopupCustomerIssues((prev) => ({ ...prev, [lineId]: issue }))} />
          </div>
          <OrderFooter lineTotal={lineTotal} shippingPrice={getOrderShippingAmount(draft)} total={total} onCancel={requestExitComposer} showCancel={false} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={orderSaveState === "saving" ? "Saving Order..." : (editingOrderId ? "Save Changes" : "Save Order")} saveDraftLabel={orderSaveState === "saving" ? "Saving Draft..." : "Save as Draft"} disableSaveDraft={orderSaveState !== "idle"} disableSaveOrder={orderSaveState !== "idle"} paymentAgents={paymentAgents} paymentAgentSplits={getEditablePaymentAgentSplits(draft)} onPaymentAgentSplitsChange={setDraftPaymentAgentSplits} onShippingPriceChange={(value) => setDraft((d) => ({ ...d, shippingPrice: value }))} />
        </div>
      </div>}
      {showExitConfirm ? <div className="fixed inset-0 z-[65] bg-black/50 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">{editingOrderId ? "Save changes before closing?" : "Save order before closing?"}</div><div className="text-sm text-fg-subtle">{editingOrderId ? "You made changes to this order. Save them now or discard them." : "Save this order as a draft before closing, or discard it."}</div><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => { setShowExitConfirm(false); resetOrderComposer(); }}>{editingOrderId ? "Discard Changes" : "Discard Order"}</Button><Button variant="primary" onClick={() => { setShowExitConfirm(false); void onSave(editingOrderId ? "saved" : "draft", true); }}>{editingOrderId ? "Save Changes" : "Save Draft"}</Button></div></div></div> : null}
      {showCreateSeriesModal ? <div className="fixed inset-0 z-[75] bg-black/50 grid place-items-center p-4" onClick={() => { if (!seriesCreateBusy) setShowCreateSeriesModal(false); }}><div className="card w-full max-w-md p-4 space-y-4" onClick={(e) => e.stopPropagation()}><div className="space-y-1"><div className="text-lg font-semibold">Add New Series</div><div className="text-sm text-fg-subtle">Create a new order number series and switch this order to it immediately.</div></div><label className="flex flex-col gap-1 text-sm text-fg-muted"><span>Series Label</span><Input value={seriesForm.label} onChange={(e) => { setSeriesCreateError(""); setSeriesForm((prev) => ({ ...prev, label: e.target.value })); }} placeholder="LLL" autoFocus /></label><label className="flex flex-col gap-1 text-sm text-fg-muted"><span>Starting Number</span><Input value={seriesForm.startNumber} onChange={(e) => { setSeriesCreateError(""); setSeriesForm((prev) => ({ ...prev, startNumber: e.target.value.replace(/[^\d]/g, "") })); }} placeholder="501" inputMode="numeric" /></label><div className="rounded-lg border border-border bg-bg-subtle px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-fg-subtle">Preview</div><div className="mt-1 text-base font-semibold text-fg">{seriesPreview || "-"}</div></div>{seriesCreateError ? <div className="text-sm text-[var(--danger)]">{seriesCreateError}</div> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowCreateSeriesModal(false)} disabled={seriesCreateBusy}>Cancel</Button><Button type="button" variant="primary" onClick={() => { void handleCreateSeries(); }} disabled={seriesCreateBusy}>{seriesCreateBusy ? "Creating..." : "Create Series"}</Button></div></div></div> : null}
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
        open={orderSaveState === "saving"}
        title={orderSaveState === "saving" ? "Saving order" : "Loading"}
        message={orderSaveState === "saving" ? "Saving your order now..." : "Fetching the latest data..."}
      />
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} />
    </div>
  );
}


