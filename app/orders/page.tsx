"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import { OrderFooter } from "@/components/orders/OrderFooter";
import { formatAmount, formatDate } from "@/lib/data";
import { formatDisplayNumber, formatRate, formatWholeMoney } from "@/lib/numbers";
import { formatIndianDate } from "@/lib/dateFormat";
import { Customer, Order, OrderNumberSeries, PaymentAgent, PaymentAgentLedgerEntry, PaymentAgentOrderSplit, PaymentAgentPaymentEvent, lineTotalPcs, lineTotalRmb, orderLinesTotal, orderShippingPrice, orderTotal } from "@/lib/types";
import { syncOrderLinesToProducts, archiveProductsForOrder, archiveProductsForRemovedOrderLines } from "@/services/productCatalogSync";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
import { BadgePercent, Boxes, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, Filter, IndianRupee, List, Moon, Package2, Search, ShoppingBag, SquarePen, Sun, Trash2, WalletCards, X } from "lucide-react";
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
import { getOrderPaymentAgentLinkedAgentIds, getOrderPaymentAgentSplits } from "@/services/settlement/paymentAgentSplits";
import { calculatePaymentAgentLiveFinance, splitOrderPortionAmount, splitUsedAmount } from "@/services/paymentAgentDirectFinanceSync";

const today = () => new Date().toISOString().slice(0, 10);
const createPaymentAgentSplitId = () => `pas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createPaymentAgentPaymentEventId = () => `pae-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createEmptyPaymentAgentSplit = (): PaymentAgentOrderSplit => ({
  id: createPaymentAgentSplitId(),
  paymentAgentId: "",
  paymentBy: "",
  paymentAgentName: "",
  assignedAmount: 0,
  paidNow: 0,
});
const createEmptyPaymentAgentPaymentEvent = (seed?: Partial<PaymentAgentPaymentEvent>): PaymentAgentPaymentEvent => ({
  id: createPaymentAgentPaymentEventId(),
  paymentAgentId: seed?.paymentAgentId || "",
  paymentBy: seed?.paymentBy || "",
  paymentAgentName: seed?.paymentAgentName || "",
  paymentAgentSnapshot: seed?.paymentAgentSnapshot,
  amount: Number(seed?.amount) || 0,
  note: seed?.note,
});
const normalizeOrderLineSortOrder = (lines: Order["lines"]) =>
  [...lines]
    .sort((left, right) => {
      const leftOrder = typeof left.sortOrder === "number" ? left.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.sortOrder === "number" ? right.sortOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .map((line, index) => ({ ...line, sortOrder: index }));
const getDefaultMarkaFromOrderNumber = (orderNumber?: string | null) => {
  const parsed = parseOrderNumber(orderNumber || "");
  const rawPrefix = parsed?.prefix?.trim() || "";
  const normalizedPrefix = rawPrefix.replace(/(?:\s*-\s*)+$/g, "").trim();
  return normalizedPrefix ? `${normalizedPrefix} - ` : "";
};
const LAST_SELECTED_ORDER_SERIES_KEY = "orders:lastSelectedSeriesId";
const LAST_SELECTED_ORDER_CATEGORY_KEY = "orders:lastSelectedCategory";
const ORDER_COPY_CLIPBOARD_KEY = "orders:copied-order-payload";
const PAGE_SIZE = 100;
const SAVE_AUDIT_ENABLED = process.env.NODE_ENV !== "production";
const createEmptyDraft = (_orders: Order[], reservedOrderNumber = "", defaultMarka = ""): Order => ({
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
  paymentAgentPaymentEvents: [createEmptyPaymentAgentPaymentEvent()],
  paymentAgentSplits: [createEmptyPaymentAgentSplit()],
  lines: [{ ...newLine(defaultMarka), details: "", marka: defaultMarka, totalCtns: 0, pcsPerCtn: 0, rmbPerPcs: 0, productPhotoUrl: "", photoUrl: "" }],
});

const meaningfulLine = (l: Order["lines"][number]) => !!(joinLineDetails(l) || l.marka?.trim() || l.productPhotoUrl || l.photoUrl || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs || l.customerRate?.trim());

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
  | "customer"
  | "marka"
  | "details"
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
type CopiedOrderLinePayload = {
  productImage: string;
  markaSuffix: string;
  totalCtns: number;
  pcsPerCtn: number;
  rmbPerPcs: number;
};
type CopiedOrderPayload = {
  wechatId: string;
  lines: CopiedOrderLinePayload[];
};

function PaymentStatusAmount({
  amount,
  isFullySettled,
  paidAmount,
  remainingPayable,
  paymentAgentSummary,
  paymentBreakdown,
}: {
  amount: number;
  isFullySettled: boolean;
  paidAmount: number;
  remainingPayable: number;
  paymentAgentSummary: string;
  paymentBreakdown: Array<{ agentName: string; amount: number }>;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || isFullySettled) return;

    const updateLayout = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLayout({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [open, isFullySettled]);

  return (
    <div
      ref={anchorRef}
      className="inline-block"
      onMouseEnter={() => {
        if (!isFullySettled) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <div className={cn("text-[16px] font-bold leading-none", isFullySettled ? "text-emerald-700" : "text-amber-600")}>
        {formatAmount(amount)}
      </div>
      {!isFullySettled && remainingPayable > 0 ? (
        <div className="mt-0.5 text-[16px] font-bold leading-none text-rose-600">
          {formatAmount(remainingPayable)}
        </div>
      ) : null}
      {open && !isFullySettled && layout && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed isolate z-[9999] w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.18)] dark:border-amber-200/40 dark:bg-slate-950 dark:text-slate-100"
              style={{ top: layout.top, left: layout.left }}
            >
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">Payment Status</div>
              <div className="mt-1.5 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg-subtle">Paid</span>
                  <span className="font-semibold tabular-nums text-fg">{formatAmount(paidAmount)}</span>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 dark:border-amber-200/10 dark:bg-slate-900">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-fg-subtle">Agent Breakdown</span>
                    <span className="text-[10px] font-medium text-fg-subtle">{paymentBreakdown.length || 1}</span>
                  </div>
                  {paymentBreakdown.length > 0 ? (
                    <div className="space-y-1">
                      {paymentBreakdown.map((entry) => (
                        <div key={`${entry.agentName}-${entry.amount}`} className="flex items-start justify-between gap-2">
                          <span className="max-w-[132px] break-words leading-4 text-fg">{entry.agentName}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-fg">{formatAmount(entry.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-right font-medium leading-4 text-fg">
                      {paymentAgentSummary || "Not Paid"}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-amber-100 pt-1.5 dark:border-amber-200/15">
                  <span className="text-fg-subtle">Left</span>
                  <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{formatAmount(remainingPayable)}</span>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
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
const normalizeSearchText = (...parts: Array<string | number | undefined | null>) =>
  parts
    .flatMap((part) => String(part ?? "").split(/\s+/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
const matchesSearchQuery = (searchableText: string, rawQuery: string) => {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return true;
  if (searchableText.includes(normalizedQuery)) return true;
  const words = normalizedQuery.split(" ").filter(Boolean);
  return words.every((word) => searchableText.includes(word));
};
const normalizePaymentSplitAmount = (value: number | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const normalizePaymentEventAmount = (value: number | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};
const getOrderPaymentStatusBreakdown = (order: Order) => {
  const grouped = new Map<string, { agentName: string; amount: number }>();
  const savedEvents = (order.paymentAgentPaymentEvents ?? [])
    .map(normalizeDraftPaymentEvent)
    .filter((event) => !isPaymentAgentPaymentEventEmpty(event))
    .filter((event) => normalizePaymentEventAmount(event.amount) > 0);

  if (savedEvents.length > 0) {
    savedEvents.forEach((event) => {
      const agentName =
        event.paymentAgentSnapshot?.name?.trim()
        || event.paymentAgentName?.trim()
        || event.paymentBy?.trim()
        || event.paymentAgentId?.trim()
        || "Payment Agent";
      const key = normalizePaymentAgentValue(event.paymentAgentId || event.paymentBy || agentName);
      const current = grouped.get(key) || { agentName, amount: 0 };
      current.amount += Math.max(0, normalizePaymentEventAmount(event.amount));
      grouped.set(key, current);
    });
  } else {
    getOrderPaymentAgentSplits(order).forEach((split) => {
      const creditUsed = Number(split.settlementSnapshot?.creditUsed);
      const paidNow = Number(split.settlementSnapshot?.paidNow);
      const legacyPaidNow = Number(split.paidNow);
      const amountPaid = Number.isFinite(creditUsed)
        ? Math.max(0, creditUsed)
        : Number.isFinite(paidNow)
          ? Math.max(0, paidNow)
          : Number.isFinite(legacyPaidNow)
            ? Math.max(0, legacyPaidNow)
            : 0;
      if (amountPaid <= 0) return;
      const agentName =
        split.paymentAgentSnapshot?.name?.trim()
        || split.paymentAgentName?.trim()
        || split.paymentBy?.trim()
        || split.paymentAgentId?.trim()
        || "Payment Agent";
      const key = normalizePaymentAgentValue(split.paymentAgentId || split.paymentBy || agentName);
      const current = grouped.get(key) || { agentName, amount: 0 };
      current.amount += amountPaid;
      grouped.set(key, current);
    });
  }

  const paymentBreakdown = Array.from(grouped.values()).filter((entry) => entry.amount > 0);
  const paidAmount = paymentBreakdown.reduce((sum, entry) => sum + entry.amount, 0);
  const paymentAgentSummary = paymentBreakdown.map((entry) => entry.agentName).join(", ");

  return { paidAmount, paymentBreakdown, paymentAgentSummary };
};
const calculateOrderAgentPaidTotal = (splits: PaymentAgentOrderSplit[]) =>
  splits.reduce((sum, split) => sum + normalizePaymentSplitAmount(split.paidNow), 0);
const calculateOrderRemainingPayable = (orderAmount: number, splits: PaymentAgentOrderSplit[]) =>
  Math.max(0, orderAmount - calculateOrderAgentPaidTotal(splits));
const getOrderPaymentStatusFromDue = (totalAmount: number, dueAmount: number) => {
  if (dueAmount <= 0) return "paid" as const;
  if (dueAmount >= totalAmount) return "pending" as const;
  return "partial" as const;
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
const normalizeDraftPaymentEvent = (event: PaymentAgentPaymentEvent): PaymentAgentPaymentEvent => ({
  ...event,
  id: event.id || createPaymentAgentPaymentEventId(),
  paymentAgentId: (event.paymentAgentId || "").trim(),
  paymentBy: (event.paymentBy || "").trim(),
  paymentAgentName: (event.paymentAgentName || "").trim(),
  paymentAgentSnapshot: event.paymentAgentSnapshot
    ? {
        id: (event.paymentAgentSnapshot.id || "").trim(),
        name: (event.paymentAgentSnapshot.name || "").trim(),
        code: (event.paymentAgentSnapshot.code || "").trim() || undefined,
      }
    : undefined,
  amount: normalizePaymentEventAmount(event.amount),
  note: (event.note || "").trim() || undefined,
});
const isPaymentAgentSplitEmpty = (split: PaymentAgentOrderSplit) =>
  !(split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name || normalizePaymentSplitAmount(split.assignedAmount) || normalizePaymentSplitAmount(split.paidNow) || (split.note || "").trim());
const isPaymentAgentPaymentEventEmpty = (event: PaymentAgentPaymentEvent) =>
  !(event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name || normalizePaymentEventAmount(event.amount) || (event.note || "").trim());
const buildOrderLineSearchText = (
  line: Order["lines"][number],
  order: Order,
  customers: Customer[],
) =>
  normalizeSearchText(
    line.productSnapshot?.name,
    line.marka,
    line.detail1,
    line.detail2,
    line.detail3,
    line.details,
    joinLineDetails(line),
    getResolvedLineCustomerName(line),
    getLineCustomerDisplay(line, customers),
    lineTotalPcs(line),
    line.rmbPerPcs,
    lineTotalRmb(line),
    order.number || order.orderNumber || "",
    order.wechatId || "",
  );
const buildOrderSearchText = (
  order: Order,
  paymentLabel: string,
  customers: Customer[],
) =>
  normalizeSearchText(
    order.number || order.orderNumber || "",
    order.wechatId || "",
    paymentLabel,
    order.status,
    order.paymentStatus,
    order.date,
    order.loadingDate || "",
    orderTotal(order),
    (order.lines || []).reduce((sum, line) => sum + (Number(line.totalCtns) || 0), 0),
    ...(order.lines || []).flatMap((line) => [
      line.productSnapshot?.name || "",
      line.marka || "",
      line.detail1 || "",
      line.detail2 || "",
      line.detail3 || "",
      line.details || "",
      joinLineDetails(line),
      getResolvedLineCustomerName(line),
      getLineCustomerDisplay(line, customers),
      lineTotalPcs(line),
      line.rmbPerPcs || 0,
      lineTotalRmb(line),
    ]),
  );
const getEditablePaymentAgentSplits = (order: Order): PaymentAgentOrderSplit[] => {
  const existing = getOrderPaymentAgentSplits(order).map(normalizeDraftPaymentSplit);
  return existing.length > 0 ? existing : [createEmptyPaymentAgentSplit()];
};
const getEditablePaymentAgentEvents = (order: Order): PaymentAgentPaymentEvent[] => {
  const existing = (order.paymentAgentPaymentEvents ?? []).map(normalizeDraftPaymentEvent);
  if (existing.length > 0) return existing;
  const virtualEvents = getOrderPaymentAgentSplits(order).map((split) =>
    normalizeDraftPaymentEvent({
      id: `virtual-${split.id}`,
      paymentAgentId: split.paymentAgentId,
      paymentBy: split.paymentBy,
      paymentAgentName: split.paymentAgentName,
      paymentAgentSnapshot: split.paymentAgentSnapshot,
      amount: normalizePaymentSplitAmount(split.assignedAmount) || normalizePaymentSplitAmount(split.paidNow) || normalizePaymentSplitAmount(split.settlementSnapshot?.orderPortionTotal),
      note: split.note,
      createdAt: split.createdAt,
      updatedAt: split.updatedAt,
    }),
  );
  return virtualEvents.length > 0 ? virtualEvents : [createEmptyPaymentAgentPaymentEvent()];
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
    paidToPaymentAgentNow: 0,
  };
};
const applyPaymentAgentDraftState = (
  order: Order,
  rawSplits: PaymentAgentOrderSplit[],
  rawEvents: PaymentAgentPaymentEvent[],
): Order => {
  const splits = rawSplits.map(normalizeDraftPaymentSplit);
  const base = applyLegacyPaymentAgentFromSplits(order, splits);
  const events = rawEvents.map(normalizeDraftPaymentEvent);
  return {
    ...base,
    paymentAgentSplits: splits,
    paymentAgentPaymentEvents: events.length > 0 ? events : [createEmptyPaymentAgentPaymentEvent()],
  };
};
const hasLinkedPaymentAgent = (order: Order) =>
  getOrderPaymentAgentLinkedAgentIds(order).length > 0;
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

const normalizeComposerLineForComparison = (line: Order["lines"][number]) => {
  const seeded = seedDetailBoxesFromLegacy(line);
  return {
    supplierId: (seeded.supplierId || "").trim(),
    picDim: (seeded.picDim || "").trim(),
    productId: (seeded.productId || "").trim(),
    marka: (seeded.marka || "").trim(),
    details: (seeded.details || "").trim(),
    detail1: (seeded.detail1 || "").trim(),
    detail2: (seeded.detail2 || "").trim(),
    detail3: (seeded.detail3 || "").trim(),
    totalCtns: Number(seeded.totalCtns) || 0,
    pcsPerCtn: Number(seeded.pcsPerCtn) || 0,
    rmbPerPcs: Number(seeded.rmbPerPcs) || 0,
    customerRate: (seeded.customerRate || "").trim(),
    customerId: (seeded.customerId || "").trim(),
    customerName: (seeded.customerName || "").trim(),
    customerSnapshot: seeded.customerSnapshot
      ? {
          id: (seeded.customerSnapshot.id || "").trim(),
          name: (seeded.customerSnapshot.name || "").trim(),
        }
      : undefined,
    productPhotoUrl: (seeded.productPhotoUrl || "").trim(),
    photoUrl: (seeded.photoUrl || "").trim(),
  };
};

const normalizeComposerSplitForComparison = (split: PaymentAgentOrderSplit) => ({
  paymentAgentId: (split.paymentAgentId || "").trim(),
  paymentBy: (split.paymentBy || "").trim(),
  paymentAgentName: (split.paymentAgentName || "").trim(),
  paymentAgentSnapshot: split.paymentAgentSnapshot
    ? {
        id: (split.paymentAgentSnapshot.id || "").trim(),
        name: (split.paymentAgentSnapshot.name || "").trim(),
        code: (split.paymentAgentSnapshot.code || "").trim(),
      }
    : undefined,
  assignedAmount: Number(split.assignedAmount) || 0,
  paidNow: Number(split.paidNow) || 0,
  note: (split.note || "").trim(),
});
const normalizeComposerPaymentEventForComparison = (event: PaymentAgentPaymentEvent) => ({
  paymentAgentId: (event.paymentAgentId || "").trim(),
  paymentBy: (event.paymentBy || "").trim(),
  paymentAgentName: (event.paymentAgentName || "").trim(),
  paymentAgentSnapshot: event.paymentAgentSnapshot
    ? {
        id: (event.paymentAgentSnapshot.id || "").trim(),
        name: (event.paymentAgentSnapshot.name || "").trim(),
        code: (event.paymentAgentSnapshot.code || "").trim(),
      }
    : undefined,
  amount: Number(event.amount) || 0,
  note: (event.note || "").trim(),
});

const normalizeComposerOrderForComparison = (order: Order) => ({
  date: order.date || "",
  loadingDate: order.loadingDate || "",
  wechatId: (order.wechatId || "").trim(),
  number: normalizeEditableOrderNumber(order.number || order.orderNumber),
  orderNumber: normalizeEditableOrderNumber(order.orderNumber || order.number),
  paymentAgentId: (order.paymentAgentId || "").trim(),
  paymentBy: (order.paymentBy || "").trim(),
  paymentByName: (order.paymentByName || "").trim(),
  paymentAgentName: (order.paymentAgentName || "").trim(),
  paymentAgentSnapshot: order.paymentAgentSnapshot
    ? {
        id: (order.paymentAgentSnapshot.id || "").trim(),
        name: (order.paymentAgentSnapshot.name || "").trim(),
        code: (order.paymentAgentSnapshot.code || "").trim(),
      }
    : undefined,
  shippingPrice: Number(order.shippingPrice) || 0,
  lines: (order.lines || []).map(normalizeComposerLineForComparison),
  paymentAgentSplits: getEditablePaymentAgentSplits(order).map(normalizeComposerSplitForComparison),
  paymentAgentPaymentEvents: getEditablePaymentAgentEvents(order).map(normalizeComposerPaymentEventForComparison),
});

const getStoredSelectedSeriesId = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_SELECTED_ORDER_SERIES_KEY) || "";
};
const getStoredSelectedCategory = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_SELECTED_ORDER_CATEGORY_KEY) || "";
};

const sortSuggestionsAlphabetically = (items: string[]) =>
  [...items].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }));

const getStoredCopiedOrderPayload = (): CopiedOrderPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORDER_COPY_CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CopiedOrderPayload;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return {
      wechatId: typeof parsed.wechatId === "string" ? parsed.wechatId : "",
      lines: parsed.lines.map((line) => ({
        productImage: typeof line.productImage === "string" ? line.productImage : "",
        markaSuffix: typeof line.markaSuffix === "string" ? line.markaSuffix : "",
        totalCtns: Number(line.totalCtns) || 0,
        pcsPerCtn: Number(line.pcsPerCtn) || 0,
        rmbPerPcs: Number(line.rmbPerPcs) || 0,
      })),
    };
  } catch {
    return null;
  }
};

const getTopPrefixSuggestions = (items: string[], query: string, limit = 4) => {
  const normalizedQuery = query.trim().toLowerCase();
  const uniqueSorted = sortSuggestionsAlphabetically(Array.from(new Set(items.filter(Boolean))));
  if (!normalizedQuery) return uniqueSorted.slice(0, limit);
  return uniqueSorted.filter((item) => item.toLowerCase().startsWith(normalizedQuery)).slice(0, limit);
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
              className="fixed z-[9999] max-h-52 overflow-auto rounded-xl border border-border bg-bg-card shadow-card"
              style={{ top: layout.top, left: layout.left, width: layout.width }}
            >
              {customerOptions.length === 0 ? (
                <div className="px-3 py-2 text-[11.5px] text-fg-subtle">No matching customer</div>
              ) : customerOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[12.5px] text-fg transition-colors hover:bg-bg-subtle"
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

function OutsideSuggestionEditor({
  value,
  inputClassName,
  placeholder,
  saving,
  suspendCancel,
  options,
  emptyLabel,
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
  options: string[];
  emptyLabel: string;
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
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        className={inputClassName}
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
              className="fixed z-[9999] max-h-52 overflow-auto rounded-xl border border-border bg-bg-card shadow-card"
              style={{ top: layout.top, left: layout.left, width: layout.width }}
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-[11.5px] text-fg-subtle">{emptyLabel}</div>
              ) : options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[12.5px] text-fg transition-colors hover:bg-bg-subtle"
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
  type OrdersMode = "history" | "add" | "drafts" | "edit" | "payment-check";
  const ordersSourceSelection = useMemo(() => ordersDataSourceSelection(), []);
  const ordersDataSource = ordersSourceSelection.source;
  const isFirebaseOrdersMode = ordersDataSource === "firebase";
  useEffect(() => {
    logPageAccess("Orders", { component: "app/orders/page.tsx", source: ordersSourceSelection.source, sourceReason: ordersSourceSelection.reason });
}, [ordersSourceSelection]);

  const { orders, upsertOrder, deleteOrder, pushToast } = useStore();
  const { data: paymentAgents, isLoading: paymentAgentsLoading, recalculateFromOrders, applyOrderSettlement, reverseOrderSettlement, reload: reloadPaymentAgents } = usePaymentAgents();
  const { data: firebaseOrders, isLoading: isOrdersLoading, error: ordersLoadError, draftOrders: firebaseDraftOrders, autosaveDraft, upsertOrder: upsertFirebaseOrder, reload: reloadFirebaseOrders } = useOrders();
  const { data: customers, isLoading: isCustomersLoading, reload: reloadCustomers, upsertCustomer } = useCustomers();
  const paymentAgentsService = useMemo(() => getPaymentAgentsService(), []);
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
  const [composerBaseline, setComposerBaseline] = useState<ReturnType<typeof normalizeComposerOrderForComparison> | null>(null);
  const [validationWarning, setValidationWarning] = useState<{ visible: boolean; items: string[] }>({ visible: false, items: [] });
  const isOrderModalOpen = mode === "add" || mode === "edit";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedOrderCategory, setSelectedOrderCategory] = useState(() => getStoredSelectedCategory());
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
  const [liveComposerPaymentAgentsById, setLiveComposerPaymentAgentsById] = useState<Record<string, PaymentAgent>>({});
  const [paymentAgentLedgerEntries, setPaymentAgentLedgerEntries] = useState<PaymentAgentLedgerEntry[]>([]);
  const [outsideEdits, setOutsideEdits] = useState<Record<string, OutsideEditState>>({});
  const [outsideEditConfirm, setOutsideEditConfirm] = useState<OutsideEditConfirmState | null>(null);
  const [orderSaveState, setOrderSaveState] = useState<"idle" | "saving">("idle");
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pendingDeleteSeriesCategory, setPendingDeleteSeriesCategory] = useState<string | null>(null);
  const [deleteSeriesBusy, setDeleteSeriesBusy] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [orderLineIndexes, setOrderLineIndexes] = useState<Record<string, number>>({});
  const [copiedOrderPayload, setCopiedOrderPayload] = useState<CopiedOrderPayload | null>(() => getStoredCopiedOrderPayload());
  const [orderContextMenu, setOrderContextMenu] = useState<{ order: Order; x: number; y: number } | null>(null);
  const wechatNormalizationStartedRef = useRef(false);
  const manuallyEditedPaymentSplitIdsRef = useRef<Set<string>>(new Set());
  const autoManagedPaymentSplitIdsRef = useRef<Set<string>>(new Set());
  const manuallyEditedPaymentEventIdsRef = useRef<Set<string>>(new Set());
  const autoManagedPaymentEventIdsRef = useRef<Set<string>>(new Set());
  const previousDraftMarkaDefaultRef = useRef("");
  const rowEditSaveInFlightRef = useRef<Set<string>>(new Set());
  const outsideEditSaveInFlightRef = useRef<Set<string>>(new Set());
  const orderSaveInFlightRef = useRef(false);
  const createSeriesInFlightRef = useRef(false);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const seriesPickerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggle } = useTheme();

  const activeOrders = useMemo(() => (isFirebaseOrdersMode ? firebaseOrders : orders).filter((o) => o.status !== "archived"), [isFirebaseOrdersMode, firebaseOrders, orders]);
  const { data: orderSeries, isLoading: isOrderSeriesLoading, createSeries: createOrderSeries, deleteSeries: deleteOrderSeries, reload: reloadOrderSeries } = useOrderNumberSeries(activeOrders);
  const lineTotal = useMemo(() => orderLinesTotal(draft), [draft]);
  const total = useMemo(() => orderTotal(draft), [draft]);
  const currentDraftDefaultMarka = useMemo(
    () => getDefaultMarkaFromOrderNumber(draft.number || draft.orderNumber),
    [draft.number, draft.orderNumber],
  );
  const composerPaymentAgentIds = useMemo(
    () =>
      Array.from(new Set(
        getEditablePaymentAgentSplits(draft)
          .map((split) => split.paymentAgentId || split.paymentBy)
          .filter((value): value is string => Boolean(value?.trim())),
      )),
    [draft],
  );
  const composerPaymentAgents = useMemo(() => {
    const merged = new Map(paymentAgents.map((agent) => [agent.id, agent]));
    Object.values(liveComposerPaymentAgentsById).forEach((agent) => {
      if (!agent?.id) return;
      merged.set(agent.id, agent);
    });
    return Array.from(merged.values());
  }, [liveComposerPaymentAgentsById, paymentAgents]);

  useEffect(() => {
    let cancelled = false;

    if (!isOrderModalOpen || composerPaymentAgentIds.length === 0) {
      setLiveComposerPaymentAgentsById({});
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const freshAgents = await Promise.all(
        composerPaymentAgentIds.map(async (agentId) => {
          try {
            return await paymentAgentsService.getPaymentAgentById(agentId);
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      const next: Record<string, PaymentAgent> = {};
      freshAgents.forEach((agent) => {
        if (!agent?.id) return;
        next[agent.id] = agent;
      });
      setLiveComposerPaymentAgentsById(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [composerPaymentAgentIds, isOrderModalOpen, paymentAgentsService]);

  useEffect(() => {
    let cancelled = false;

    if (!isOrderModalOpen) {
      return () => {
        cancelled = true;
      };
    }

    void paymentAgentsService.listPaymentAgentLedger()
      .then((entries) => {
        if (cancelled) return;
        setPaymentAgentLedgerEntries(entries);
      })
      .catch(() => {
        if (cancelled) return;
        setPaymentAgentLedgerEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOrderModalOpen, paymentAgentsService]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!copiedOrderPayload) {
      window.localStorage.removeItem(ORDER_COPY_CLIPBOARD_KEY);
      return;
    }
    window.localStorage.setItem(ORDER_COPY_CLIPBOARD_KEY, JSON.stringify(copiedOrderPayload));
  }, [copiedOrderPayload]);

  useEffect(() => {
    if (!orderContextMenu) return;
    const closeMenu = () => setOrderContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [orderContextMenu]);

  const composerPaymentAgentLiveFinanceById = useMemo(() => {
    const next = new Map<string, ReturnType<typeof calculatePaymentAgentLiveFinance>>();
    composerPaymentAgents.forEach((agent) => {
      next.set(agent.id, calculatePaymentAgentLiveFinance(agent, activeOrders, paymentAgentLedgerEntries));
    });
    return next;
  }, [activeOrders, composerPaymentAgents, paymentAgentLedgerEntries]);

  const buildCopiedOrderPayload = (order: Order): CopiedOrderPayload => {
    const orderPrefix = getDefaultMarkaFromOrderNumber(order.number || order.orderNumber);
    return {
      wechatId: (order.wechatId || "").trim(),
      lines: (order.lines || []).map((line) => {
        const rawMarka = (line.marka || "").trim();
        const markaSuffix = orderPrefix && rawMarka.startsWith(orderPrefix)
          ? rawMarka.slice(orderPrefix.length).trim()
          : rawMarka.replace(/^[^-]+-\s*/, "").trim() || rawMarka;
        return {
          productImage: (line.productPhotoUrl || line.photoUrl || "").trim(),
          markaSuffix,
          totalCtns: Number(line.totalCtns) || 0,
          pcsPerCtn: Number(line.pcsPerCtn) || 0,
          rmbPerPcs: Number(line.rmbPerPcs) || 0,
        };
      }),
    };
  };

  const copyOrderForPaste = (order: Order) => {
    const payload = buildCopiedOrderPayload(order);
    setCopiedOrderPayload(payload);
    setOrderContextMenu(null);
    pushToast({ tone: "success", text: `Copied order ${order.number || order.orderNumber || ""}.` });
  };

  const pasteCopiedOrderIntoDraft = () => {
    if (!copiedOrderPayload || copiedOrderPayload.lines.length === 0) return;
    setDraft((current) => {
      const markaPrefix = getDefaultMarkaFromOrderNumber(current.number || current.orderNumber);
      const nextLines = copiedOrderPayload.lines.map((copiedLine, index) => ({
        ...newLine(markaPrefix),
        productPhotoUrl: copiedLine.productImage,
        photoUrl: "",
        marka: copiedLine.markaSuffix ? `${markaPrefix}${copiedLine.markaSuffix}` : markaPrefix,
        totalCtns: copiedLine.totalCtns,
        pcsPerCtn: copiedLine.pcsPerCtn,
        rmbPerPcs: copiedLine.rmbPerPcs,
        sortOrder: index,
      }));
      return {
        ...current,
        wechatId: copiedOrderPayload.wechatId,
        lines: normalizeOrderLineSortOrder(nextLines),
      };
    });
    pushToast({ tone: "success", text: "Copied order pasted into new order." });
  };

  const composerAvailableCreditByAgentId = useMemo(
    () =>
      Object.fromEntries(
        Array.from(composerPaymentAgentLiveFinanceById.entries()).map(([agentId, finance]) => [agentId, finance.available]),
      ),
    [composerPaymentAgentLiveFinanceById],
  );

  const markDraftPaymentEventAsManual = (eventId: string) => {
    manuallyEditedPaymentEventIdsRef.current.add(eventId);
    autoManagedPaymentEventIdsRef.current.delete(eventId);
  };

  const handleViewOrderPaymentAgentEventsChange = (events: PaymentAgentPaymentEvent[]) => {
    setViewOrder((current) => {
      if (!current) return current;
      const nextOrder = applyPaymentAgentDraftState(current, getEditablePaymentAgentSplits(current), events);
      if (isOrderModalOpen && current.id === draft.id) {
        setDraft(nextOrder);
      }
      return nextOrder;
    });
  };

  const getDraftSplitAvailableCredit = (split: PaymentAgentOrderSplit) => {
    const matchedAgent =
      composerPaymentAgents.find((agent) => agent.id === split.paymentAgentId)
      ?? composerPaymentAgents.find((agent) => agent.id === split.paymentBy)
      ?? composerPaymentAgents.find((agent) => normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy));

    return matchedAgent ? (composerPaymentAgentLiveFinanceById.get(matchedAgent.id)?.available ?? 0) : 0;
  };

  const getSafeAutoAllocatedAmount = (split: PaymentAgentOrderSplit, orderAmount: number) =>
    Math.max(0, Math.min(orderAmount, getDraftSplitAvailableCredit(split)));
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
  const emptySeriesCategories = useMemo(() => {
    const categoriesWithOrders = new Set(
      activeOrders
        .map((order) => parseOrderNumber(order.number || order.orderNumber)?.category || "")
        .filter(Boolean),
    );
    const categories = new Set<string>();
    orderSeries.forEach((series) => {
      const label = normalizeSeriesLabel(series.label);
      if (label && !categoriesWithOrders.has(label)) categories.add(label);
    });
    return categories;
  }, [orderSeries, activeOrders]);
  const effectiveOrderCategory = selectedOrderCategory || orderCategoryTabs[0] || "";
  const filteredOrders = useMemo(
    () =>
      measurePerfSync("calc", "orders.filteredOrders", { ordersCount: activeOrders.length, query, statusFilter: filters.status }, () => activeOrders.filter((order) => {
        const q = normalizeSearchText(query);
        const parsedOrderNumber = parseOrderNumber(order.number || order.orderNumber);
        const payment = getOrderPaymentAgentDisplay(order, paymentAgents).value;
        const customerText = order.lines.map((line) => getResolvedLineCustomerName(line)).join(" ");
        const markaText = order.lines.map((line) => line.marka || "").join(" ");
        const detailText = order.lines.map((line) => joinLineDetails(line)).join(" ");
        const hasLoadingDate = Boolean(order.loadingDate?.trim());
        const hasPaymentAgent = hasLinkedPaymentAgent(order);
        const orderDate = order.date || "";
        if (filters.status !== "all" && order.status !== filters.status) return false;
        if (filters.loadingDate === "set" && !hasLoadingDate) return false;
        if (filters.loadingDate === "unset" && hasLoadingDate) return false;
        if (filters.paymentAgent === "set" && !hasPaymentAgent) return false;
        if (filters.paymentAgent === "unset" && hasPaymentAgent) return false;
        if (filters.dateFrom && orderDate < filters.dateFrom) return false;
        if (filters.dateTo && orderDate > filters.dateTo) return false;
        if (filters.orderNumber.trim() && !matchesSearchQuery(normalizeSearchText(order.number || order.orderNumber || ""), filters.orderNumber)) return false;
        if (filters.customer.trim() && !matchesSearchQuery(normalizeSearchText(customerText), filters.customer)) return false;
        if (filters.marka.trim() && !matchesSearchQuery(normalizeSearchText(markaText, detailText), filters.marka)) return false;
        if (!q && effectiveOrderCategory && parsedOrderNumber?.category !== effectiveOrderCategory) return false;
        if (!q) return true;
        const searchable = buildOrderSearchText(order, payment, customers);
        return matchesSearchQuery(searchable, q);
      })),
    [activeOrders, customers, effectiveOrderCategory, filters, query, paymentAgents],
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
    return getTopPrefixSuggestions(wechatSuggestions, draft.wechatId || "", 4);
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
    if (showCreateSeriesModal) return;
    createSeriesInFlightRef.current = false;
    setSeriesCreateBusy(false);
  }, [showCreateSeriesModal]);

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
    if (mode !== "add") {
      previousDraftMarkaDefaultRef.current = currentDraftDefaultMarka;
      return;
    }

    const previousDefaultMarka = previousDraftMarkaDefaultRef.current;
    const nextDefaultMarka = currentDraftDefaultMarka;

    if (previousDefaultMarka === nextDefaultMarka) return;

    setDraft((current) => {
      let changed = false;
      const nextLines = current.lines.map((line) => {
        const currentMarka = line.marka || "";
        const shouldReplace =
          !currentMarka.trim() ||
          currentMarka === previousDefaultMarka;

        if (!shouldReplace) return line;
        if (currentMarka === nextDefaultMarka) return line;

        changed = true;
        return {
          ...line,
          marka: nextDefaultMarka,
        };
      });

      return changed ? { ...current, lines: nextLines } : current;
    });

    previousDraftMarkaDefaultRef.current = nextDefaultMarka;
  }, [currentDraftDefaultMarka, mode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filters, rowsPerPage, mode, selectedOrderCategory]);

  useEffect(() => {
    if (isOrderSeriesLoading || isOrdersLoading) return;
    if (!orderCategoryTabs.length) {
      if (selectedOrderCategory) setSelectedOrderCategory("");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LAST_SELECTED_ORDER_CATEGORY_KEY);
      }
      return;
    }
    if (!selectedOrderCategory || !orderCategoryTabs.includes(selectedOrderCategory)) {
      setSelectedOrderCategory(orderCategoryTabs[0]);
    }
  }, [isOrderSeriesLoading, isOrdersLoading, orderCategoryTabs, selectedOrderCategory]);

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
    createSeriesInFlightRef.current = false;
    setSeriesPickerOpen(false);
    setSeriesCreateError("");
    setSeriesCreateBusy(false);
    setSeriesForm({ label: "", startNumber: "" });
    setShowCreateSeriesModal(true);
  };

  const requestDeleteSeriesCategory = (category: string) => {
    if (!emptySeriesCategories.has(category)) return;
    setPendingDeleteSeriesCategory(category);
  };

  const confirmDeleteSeriesCategory = async () => {
    if (!pendingDeleteSeriesCategory) return;
    const category = pendingDeleteSeriesCategory;
    const matchingSeries = orderSeries.filter((series) => normalizeSeriesLabel(series.label) === category);
    if (matchingSeries.length === 0) {
      setPendingDeleteSeriesCategory(null);
      return;
    }
    setDeleteSeriesBusy(true);
    try {
      for (const series of matchingSeries) {
        await deleteOrderSeries(series.id);
      }
      if (selectedOrderCategory === category) {
        const nextCategory = orderCategoryTabs.find((entry) => entry !== category) || "";
        setSelectedOrderCategory(nextCategory);
      }
      setPendingDeleteSeriesCategory(null);
      pushToast({ tone: "success", text: `Order series category ${category} deleted.` });
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Could not delete order series category." });
    } finally {
      setDeleteSeriesBusy(false);
    }
  };

  const resolveExistingPaymentAgentByName = async (rawName: string) => {
    const cleanName = rawName.trim();
    if (!cleanName) return null;
    const existing = composerPaymentAgents.find((agent) => normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(cleanName));
    return existing ?? null;
  };

  const resolvePaymentAgentEventsForSave = async (
    rawEvents: PaymentAgentPaymentEvent[] | undefined,
    expectedTotal: number,
    rawSplits: PaymentAgentOrderSplit[] = [],
  ): Promise<{ events: PaymentAgentPaymentEvent[]; splits: PaymentAgentOrderSplit[]; primaryAgent: PaymentAgent | null }> => {
    const normalizedEvents = (rawEvents ?? [])
      .map(normalizeDraftPaymentEvent)
      .filter((event) => !isPaymentAgentPaymentEventEmpty(event))
      .filter((event) => normalizePaymentEventAmount(event.amount) > 0);
    if (normalizedEvents.length === 0) {
      return { events: [], splits: [], primaryAgent: null };
    }

    const initialIssues = normalizedEvents.flatMap((event, index) => {
      const issues: string[] = [];
      if (normalizePaymentEventAmount(event.amount) < 0) issues.push(`Payment event ${index + 1}: amount cannot be negative.`);
      if (!(event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name)) {
        issues.push(`Payment event ${index + 1}: choose a payment agent.`);
      }
      return issues;
    });
    if (initialIssues.length > 0) {
      throw new Error(initialIssues[0]!);
    }

    const localAgents = [...composerPaymentAgents];
    const resolvedEvents: PaymentAgentPaymentEvent[] = [];

    for (const event of normalizedEvents) {
      const typedName = event.paymentAgentName || event.paymentAgentSnapshot?.name || event.paymentBy;
      let resolvedAgent =
        localAgents.find((agent) => agent.id === event.paymentAgentId)
        ?? localAgents.find((agent) => agent.id === event.paymentBy)
        ?? localAgents.find((agent) => normalizePaymentAgentValue(agent.name) === normalizePaymentAgentValue(typedName))
        ?? null;

      if (!resolvedAgent && typedName.trim()) {
        resolvedAgent = await resolveExistingPaymentAgentByName(typedName);
      }

      if (!resolvedAgent) {
        throw new Error(`Payment event ${resolvedEvents.length + 1}: add the payment agent from the Payment Agents tab first, then select it here.`);
      }

      resolvedEvents.push({
        ...event,
        paymentAgentId: resolvedAgent.id,
        paymentBy: resolvedAgent.id,
        paymentAgentName: resolvedAgent.name,
        paymentAgentSnapshot: { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode },
        amount: normalizePaymentEventAmount(event.amount),
      });
    }

    const groupedByAgent = new Map<string, { agent: PaymentAgent; totalCreditUsedNow: number; events: PaymentAgentPaymentEvent[] }>();
    resolvedEvents.forEach((event) => {
      const agent = localAgents.find((candidate) => candidate.id === event.paymentAgentId) ?? null;
      if (!agent) return;
      const current = groupedByAgent.get(agent.id) || { agent, totalCreditUsedNow: 0, events: [] };
      current.totalCreditUsedNow += normalizePaymentEventAmount(event.amount);
      current.events.push(event);
      groupedByAgent.set(agent.id, current);
    });

    const normalizedSourceSplits = rawSplits
      .map(normalizeDraftPaymentSplit)
      .filter((split) => !isPaymentAgentSplitEmpty(split));

    const resolvedAgentGroups = Array.from(groupedByAgent.values());
    const hasSingleResolvedAgent = resolvedAgentGroups.length === 1;

    const resolvedSplits: PaymentAgentOrderSplit[] = resolvedAgentGroups.map(({ agent, totalCreditUsedNow, events }) => {
      const sourceSplit = normalizedSourceSplits.find((split) =>
        normalizePaymentAgentValue(split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name) ===
        normalizePaymentAgentValue(agent.id || agent.name),
      ) ?? null;
      const existingCredit = composerPaymentAgentLiveFinanceById.get(agent.id)?.available ?? 0;
      const explicitAssignedAmount = normalizePaymentSplitAmount(sourceSplit?.assignedAmount);
      const assignedAmount = hasSingleResolvedAgent
        ? expectedTotal
        : Math.max(explicitAssignedAmount, totalCreditUsedNow);
      if (!hasSingleResolvedAgent && assignedAmount <= 0) {
        throw new Error(`Payment split for ${agent.name} is missing an assigned order amount.`);
      }
      const creditUsed = Math.min(totalCreditUsedNow, existingCredit, assignedAmount);
      const remainingPayable = Math.max(0, assignedAmount - creditUsed);
      const splitStatus: "paid" | "partial" | "unpaid" = assignedAmount <= 0 ? "unpaid" : remainingPayable > 0 ? "partial" : "paid";
      const firstEvent = events[0];
      return {
        id: sourceSplit?.id || firstEvent?.id || createPaymentAgentSplitId(),
        paymentAgentId: agent.id,
        paymentBy: agent.id,
        paymentAgentName: agent.name,
        paymentAgentSnapshot: { id: agent.id, name: agent.name, code: agent.agentCode },
        assignedAmount,
        paidNow: creditUsed,
        note: events.map((entry) => entry.note?.trim()).filter(Boolean).join(" | ") || undefined,
        settlementSnapshot: {
          orderPortionTotal: assignedAmount,
          existingCredit,
          creditUsed,
          payableAfterCredit: remainingPayable,
          remainingPayable,
          newCreditCreated: 0,
          resultingCreditBalance: Math.max(0, existingCredit - creditUsed),
          paidNow: 0,
          status: splitStatus,
          createdAt: sourceSplit?.settlementSnapshot?.createdAt || firstEvent?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    });

    const assignedTotal = resolvedSplits.reduce((sum, split) => sum + normalizePaymentSplitAmount(split.assignedAmount), 0);
    const usedTotal = calculateOrderAgentPaidTotal(resolvedSplits);
    if (assignedTotal > expectedTotal) {
      throw new Error(`Total assigned amount cannot exceed order total ${expectedTotal}.`);
    }
    if (usedTotal > expectedTotal) {
      throw new Error(`Total paid amount cannot exceed order total ${expectedTotal}.`);
    }
    resolvedSplits.forEach((split, index) => {
      const assignedAmount = normalizePaymentSplitAmount(split.assignedAmount);
      const creditUsed = normalizePaymentSplitAmount(split.settlementSnapshot?.creditUsed ?? split.paidNow);
      if (creditUsed > assignedAmount) {
        throw new Error(`Payment split ${index + 1}: credit used cannot exceed assigned amount.`);
      }
    });

    return {
      events: resolvedEvents,
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
      const existingEvents = getEditablePaymentAgentEvents(current);
      const nextSplits = typeof updater === "function" ? updater(existingSplits) : updater;
      const normalizedSplits = nextSplits.length > 0 ? nextSplits : [createEmptyPaymentAgentSplit()];
      const selectedSplits = normalizedSplits.filter((split) =>
        Boolean(
          split.paymentAgentId?.trim() ||
            split.paymentBy?.trim() ||
            split.paymentAgentName?.trim() ||
            split.paymentAgentSnapshot?.name?.trim(),
        ),
      );
      const nextOrderTotal = orderTotal(current);
      const hydratedSplits =
        selectedSplits.length === 1
          ? normalizedSplits.map((split) => {
              if (split.id !== selectedSplits[0]?.id) return split;
              if (manuallyEditedPaymentSplitIdsRef.current.has(split.id)) return split;
              const currentPaidNow = Number(split.paidNow) || 0;
              const currentAssignedAmount = Number(split.assignedAmount) || 0;
              if (currentPaidNow > 0 || currentAssignedAmount > 0) return split;
              autoManagedPaymentSplitIdsRef.current.add(split.id);
              const safeAutoAmount = getSafeAutoAllocatedAmount(split, nextOrderTotal);
              return {
                ...split,
                assignedAmount: safeAutoAmount,
                paidNow: safeAutoAmount,
              };
            })
          : normalizedSplits;
      const allowedAgentKeys = new Set(
        hydratedSplits
          .map((split) => normalizePaymentAgentValue(split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name))
          .filter(Boolean),
      );
      const nextEvents = existingEvents.filter((event) => {
        const key = normalizePaymentAgentValue(event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name);
        return !key || allowedAgentKeys.has(key);
      });
      const nextEventsWithSeedRows = [...nextEvents];
      selectedSplits.forEach((split) => {
        const splitKey = normalizePaymentAgentValue(
          split.paymentAgentId || split.paymentBy || split.paymentAgentName || split.paymentAgentSnapshot?.name,
        );
        if (!splitKey) return;
        const alreadyHasEvent = nextEventsWithSeedRows.some((event) =>
          normalizePaymentAgentValue(
            event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name,
          ) === splitKey,
        );
        if (alreadyHasEvent) return;
        nextEventsWithSeedRows.push(createEmptyPaymentAgentPaymentEvent({
          paymentAgentId: split.paymentAgentId,
          paymentBy: split.paymentBy,
          paymentAgentName: split.paymentAgentName,
          paymentAgentSnapshot: split.paymentAgentSnapshot,
          amount: 0,
        }));
      });
      return applyPaymentAgentDraftState(current, hydratedSplits, nextEventsWithSeedRows);
    });
  };

  const setDraftPaymentAgentEvents = (updater: PaymentAgentPaymentEvent[] | ((current: PaymentAgentPaymentEvent[]) => PaymentAgentPaymentEvent[])) => {
    setDraft((current) => {
      const existingEvents = getEditablePaymentAgentEvents(current);
      const nextEvents = typeof updater === "function" ? updater(existingEvents) : updater;
      return applyPaymentAgentDraftState(current, getEditablePaymentAgentSplits(current), nextEvents.length > 0 ? nextEvents : [createEmptyPaymentAgentPaymentEvent()]);
    });
  };

  useEffect(() => {
    const editableSplits = getEditablePaymentAgentSplits(draft);
    const selectedSplits = editableSplits.filter((split) =>
      Boolean(
        split.paymentAgentId?.trim() ||
          split.paymentBy?.trim() ||
          split.paymentAgentName?.trim() ||
          split.paymentAgentSnapshot?.name?.trim(),
      ),
    );

    if (selectedSplits.length !== 1) return;

    const targetSplit = selectedSplits[0];
    if (!targetSplit) return;
    const editableEvents = getEditablePaymentAgentEvents(draft);
    const matchingEvents = editableEvents.filter((event) =>
      normalizePaymentAgentValue(event.paymentAgentId || event.paymentBy || event.paymentAgentName || event.paymentAgentSnapshot?.name) ===
      normalizePaymentAgentValue(targetSplit.paymentAgentId || targetSplit.paymentBy || targetSplit.paymentAgentName || targetSplit.paymentAgentSnapshot?.name),
    );
    const targetEvent = matchingEvents[0];
    if (!targetEvent) {
      const safeAutoAmount = getSafeAutoAllocatedAmount(targetSplit, total);
      setDraft((current) =>
        applyPaymentAgentDraftState(
          current,
          getEditablePaymentAgentSplits(current),
          [...getEditablePaymentAgentEvents(current), createEmptyPaymentAgentPaymentEvent({
            paymentAgentId: targetSplit.paymentAgentId,
            paymentBy: targetSplit.paymentBy,
            paymentAgentName: targetSplit.paymentAgentName,
            paymentAgentSnapshot: targetSplit.paymentAgentSnapshot,
            amount: safeAutoAmount,
          })],
        ),
      );
      return;
    }
    if (manuallyEditedPaymentEventIdsRef.current.has(targetEvent.id)) return;

    const currentAmount = Number(targetEvent.amount) || 0;
    const shouldAutoManage =
      autoManagedPaymentEventIdsRef.current.has(targetEvent.id) ||
      currentAmount === 0;

    if (!shouldAutoManage) return;

    autoManagedPaymentEventIdsRef.current.add(targetEvent.id);
    const safeAutoAmount = getSafeAutoAllocatedAmount(targetSplit, total);

    if (currentAmount === safeAutoAmount) return;

    setDraft((current) =>
      applyPaymentAgentDraftState(
        current,
        getEditablePaymentAgentSplits(current),
        getEditablePaymentAgentEvents(current).map((event) =>
          event.id === targetEvent.id
            ? {
                ...event,
                amount: safeAutoAmount,
              }
            : event,
        ),
      ),
    );
  }, [draft, total, paymentAgents]);

  const handleCreateSeries = async () => {
    if (createSeriesInFlightRef.current) return;
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
    createSeriesInFlightRef.current = true;
    setSeriesCreateBusy(true);
    setSeriesCreateError("");
    try {
      const created = await createOrderSeries({ label: normalizedLabel, startNumber });
      createSeriesInFlightRef.current = false;
      setShowCreateSeriesModal(false);
      setSeriesForm({ label: "", startNumber: "" });
      applySeriesToDraft(created, created.nextNumber);
      pushToast({ tone: "success", text: `Series ${created.prefix} created.` });
    } catch (error) {
      createSeriesInFlightRef.current = false;
      setSeriesCreateError(error instanceof Error ? error.message : "Could not create series.");
    } finally {
      createSeriesInFlightRef.current = false;
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
    if (field === "shipping") return order.shippingPrice ? String(order.shippingPrice) : "";
    if (!line) return "";
    if (field === "customer") return line.customerName?.trim() || line.customerSnapshot?.name?.trim() || "";
    if (field === "marka") return line.marka?.trim() || "";
    if (field === "details") return joinLineDetails(line).trim() || "";
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
    return current.activeField === field && (field === "orderNumber" || field === "wechat" || field === "shipping"
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
    return false;
  };
  const hasComposerChanges = () => {
    if (!composerBaseline) return false;
    const current = normalizeComposerOrderForComparison(draft);
    return JSON.stringify(current) !== JSON.stringify(composerBaseline);
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
    if (rowEditSaveInFlightRef.current.has(order.id)) return;
    const dirty = pending.loadingDate !== order.loadingDate || pending.status !== order.status;
    if (!dirty) return;
    if (!ensureFirebaseOrderWriteReady()) return;
    rowEditSaveInFlightRef.current.add(order.id);
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
    } finally {
      rowEditSaveInFlightRef.current.delete(order.id);
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
        const nextLinkedPaymentAgentIds = getOrderPaymentAgentLinkedAgentIds(nextOrder);
        const previousLinkedPaymentAgentIds = getOrderPaymentAgentLinkedAgentIds(previousOrder);
        if (nextLinkedPaymentAgentIds.length > 0) {
          await measurePerfAsync("sync", "orders.outsideEdit.applyPaymentAgentSettlement", { orderId: nextOrder.id, paymentAgentId: nextLinkedPaymentAgentIds[0] || "" }, () => paymentAgentsService.applyOrderSettlement?.(nextOrder) ?? Promise.resolve());
        } else if (previousLinkedPaymentAgentIds.length > 0) {
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
      if (outsideEditSaveInFlightRef.current.has(order.id)) return;
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
      if (!clearingCustomer && field !== "customer" && field !== "wechat" && field !== "shipping" && !trimmedValue) {
        setOutsideEditConfirm(null);
        cancelOutsideField(order.id);
        return;
      }
      const nextOrder: Order = {
        ...order,
        lines: order.lines.map((entry) => ({ ...entry })),
      };

      outsideEditSaveInFlightRef.current.add(order.id);
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
        }
      }

      nextOrder.updatedAt = new Date().toISOString();
      const savedOrder = await measurePerfAsync("sync", "orders.persistOutsideEditedOrder", { orderId: order.id, field }, () => persistOutsideEditedOrder(nextOrder));
      cancelOutsideField(order.id);
      const successLabels: Record<OutsideEditField, string> = {
        orderNumber: "Order number updated.",
        wechat: "WeChat ID updated.",
        customer: "Customer updated.",
        marka: "Marka updated.",
        details: "Details updated.",
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
      } finally {
        outsideEditSaveInFlightRef.current.delete(order.id);
      }
    });
  };

  const onSave = async (status: Order["status"], forceDraft = false) => {
    return runPerfAction("full-order-save", { orderId: draft.id, status, mode: editingOrderId ? "edit" : "create" }, async () => {
    if (orderSaveInFlightRef.current) return;
    orderSaveInFlightRef.current = true;
    let orderSaveGuardReleased = false;
    const releaseOrderSaveGuard = () => {
      if (orderSaveGuardReleased) return;
      orderSaveGuardReleased = true;
      orderSaveInFlightRef.current = false;
    };
    try {
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

    const meaningfulLines = normalizeOrderLineSortOrder(getMeaningfulOrderLines(draft.lines).map((line) => withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line))));
    const normalizedDraftSplits = (draft.paymentAgentSplits ?? []).map(normalizeDraftPaymentSplit);
    const normalizedDraftEvents = (draft.paymentAgentPaymentEvents ?? []).map(normalizeDraftPaymentEvent);
    const paymentAgentCleared = normalizedDraftSplits.filter((split) => !isPaymentAgentSplitEmpty(split)).length === 0;
    const cleanedDraft = {
      ...draft,
      number: normalizeEditableOrderNumber(draft.number || draft.orderNumber),
      orderNumber: normalizeEditableOrderNumber(draft.orderNumber || draft.number),
      ...deriveOrderSeriesFields(normalizeEditableOrderNumber(draft.orderNumber || draft.number)),
      wechatId: draft.wechatId.trim(),
      shippingPrice: Math.max(0, Number(draft.shippingPrice) || 0),
      lines: meaningfulLines,
      paymentAgentPaymentEvents: normalizedDraftEvents,
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
      let draftSplitResolution: Awaited<ReturnType<typeof resolvePaymentAgentEventsForSave>>;
      try {
        saveAudit.mark("paymentAgentResolve:start");
        draftSplitResolution = await resolvePaymentAgentEventsForSave(
          cleanedDraft.paymentAgentPaymentEvents,
          orderTotal({ ...cleanedDraft, lines: meaningfulLines }),
          cleanedDraft.paymentAgentSplits ?? [],
        );
        saveAudit.mark("paymentAgentResolve:end", {
          resolvedAgentId: draftSplitResolution.primaryAgent?.id || null,
          splitCount: draftSplitResolution.splits.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOrderSaveState("idle");
        saveAudit.flush("save:error", { stage: "payment_agent_resolve", message });
        pushToast({ tone: "danger", text: `Payment agent selection failed: ${message}` });
        return;
      }
      const draftOrderBase = applyPaymentAgentDraftState(cleanedDraft, draftSplitResolution.splits, draftSplitResolution.events);
      const draftPaidAmount = calculateOrderAgentPaidTotal(draftSplitResolution.splits);
      const draftTotalAmount = orderTotal({ ...cleanedDraft, lines: meaningfulLines });
      const draftDueAmount = calculateOrderRemainingPayable(draftTotalAmount, draftSplitResolution.splits);
      const draftOrder = {
        ...draftOrderBase,
        number: cleanedDraft.number,
        orderNumber: cleanedDraft.orderNumber || cleanedDraft.number,
        ...deriveOrderSeriesFields(cleanedDraft.orderNumber || cleanedDraft.number),
        status: "draft" as const,
        paidAmount: draftPaidAmount,
        dueAmount: draftDueAmount,
        paymentStatus: getOrderPaymentStatusFromDue(draftTotalAmount, draftDueAmount),
        paymentAgentSettlementSnapshot: undefined,
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
      setDraft(createEmptyDraft(orders, "", ""));
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
      resolvedLines = normalizeOrderLineSortOrder((await resolveCustomersForOrderLines(meaningfulLines, customers, now, resolveOrCreateCustomerByName)).map((line) =>
        withDerivedLegacyDetails(seedDetailBoxesFromLegacy(line)),
      ));
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
    let splitResolution: Awaited<ReturnType<typeof resolvePaymentAgentEventsForSave>>;
    try {
      saveAudit.mark("paymentAgentResolve:start");
      splitResolution = await resolvePaymentAgentEventsForSave(
        cleanedDraft.paymentAgentPaymentEvents,
        orderTotal({ ...cleanedDraft, lines: resolvedLines }),
        cleanedDraft.paymentAgentSplits ?? [],
      );
      saveAudit.mark("paymentAgentResolve:end", {
        resolvedAgentId: splitResolution.primaryAgent?.id || null,
        splitCount: splitResolution.splits.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOrderSaveState("idle");
      saveAudit.flush("save:error", { stage: "payment_agent_resolve", message });
      pushToast({ tone: "danger", text: `Payment agent selection failed: ${message}` });
      return;
    }
    const resolvedAgent = splitResolution.primaryAgent;
    const resolvedSplitsForSave = splitResolution.splits.map(normalizeDraftPaymentSplit);
    const resolvedEventsForSave = splitResolution.events.map(normalizeDraftPaymentEvent);
    const resolvedDraftWithSplits = applyPaymentAgentDraftState(
      {
        ...cleanedDraft,
        paymentAgentSplits: [],
        paymentAgentPaymentEvents: [],
      },
      resolvedSplitsForSave,
      resolvedEventsForSave,
    );
    const resolvedPaymentAgentId = resolvedAgent?.id || resolvedDraftWithSplits.paymentAgentId || "";
    const finalOrderSeriesFields = deriveOrderSeriesFields(finalOrderNumber);
    const finalTotalAmount = orderTotal({ ...cleanedDraft, lines: resolvedLines });
    const finalPaidAmount = calculateOrderAgentPaidTotal(resolvedSplitsForSave);
    const finalDueAmount = calculateOrderRemainingPayable(finalTotalAmount, resolvedSplitsForSave);
    let savedOrder: Order = {
      ...resolvedDraftWithSplits,
      number: finalOrderNumber,
      orderNumber: finalOrderNumber,
      ...finalOrderSeriesFields,
      lines: resolvedLines,
      status: "saved" as const,
      subtotal: orderLinesTotal({ ...cleanedDraft, lines: resolvedLines }),
      grandTotal: finalTotalAmount,
      paidAmount: finalPaidAmount,
      dueAmount: finalDueAmount,
      paymentStatus: getOrderPaymentStatusFromDue(finalTotalAmount, finalDueAmount),
      paymentAgentSplits: resolvedSplitsForSave,
      paymentAgentPaymentEvents: resolvedEventsForSave,
      paymentAgentId: resolvedPaymentAgentId,
      paymentBy: resolvedPaymentAgentId || resolvedDraftWithSplits.paymentBy,
      paymentByName: resolvedDraftWithSplits.paymentByName || "",
      paymentAgentName: resolvedDraftWithSplits.paymentAgentName || "",
      paymentAgentSnapshot: resolvedAgent
        ? { id: resolvedAgent.id, name: resolvedAgent.name, code: resolvedAgent.agentCode }
        : resolvedDraftWithSplits.paymentAgentSnapshot,
      paymentAgentSettlementSnapshot: undefined,
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
    const savedOrderPaymentAgentIds = getOrderPaymentAgentLinkedAgentIds(savedOrder);
    const result: OrderSideEffectResult = { mode: editingOrderId ? "edit" : "create", orderSaved: true, productsSynced: false, productSyncFailures: [], paymentSettlementApplied: !isFirebaseOrdersMode && savedOrderPaymentAgentIds.length > 0, paymentSettlementReversed: false, customerReceivablesApplied: false, customerReceivablesReversed: false, generatedProductsArchived: editingOrderId ? false : true, blocked: false, warnings: [], errors: [] };
    const affectedCustomerIds = Array.from(new Set(savedOrder.lines.map((l) => l.customerId).filter(Boolean)));
    const generatedProductIds = savedOrder.lines.map((l) => `order-line-${savedOrder.id}-${l.id}`);
    logDataFlow("Orders", JSON.stringify({ event: "order_side_effects_started", orderId: savedOrder.id, orderNumber: savedOrder.number, mode: result.mode, affectedCustomerIds, affectedPaymentAgentIds: savedOrderPaymentAgentIds, generatedProductIds }, null, 2));

    setOrderSaveState("idle");
    saveAudit.mark("ui:modalClosed");
    resetOrderComposer(false);
    pushToast({ tone: "info", text: "Order saved. Syncing ledgers..." });
    releaseOrderSaveGuard();

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

      if (isFirebaseOrdersMode && savedOrderPaymentAgentIds.length > 0) {
        syncTasks.push((async () => {
          saveAudit.mark("paymentAgentLedger:start");
          try {
            await measurePerfAsync("sync", "orders.applyPaymentAgentSettlement", { orderId: savedOrder.id, paymentAgentId: savedOrderPaymentAgentIds[0] || "" }, () => paymentAgentsService.applyOrderSettlement?.(savedOrder) ?? Promise.resolve());
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
      } else if (isFirebaseOrdersMode && editingOrder && getOrderPaymentAgentLinkedAgentIds(editingOrder).length > 0) {
        syncTasks.push((async () => {
          saveAudit.mark("paymentAgentLedger:start");
          try {
            await measurePerfAsync("sync", "orders.reversePaymentAgentSettlement", { orderId: editingOrder.id, paymentAgentId: getOrderPaymentAgentLinkedAgentIds(editingOrder)[0] || "" }, () => paymentAgentsService.reverseOrderSettlement?.(editingOrder) ?? Promise.resolve());
            result.paymentSettlementReversed = true;
            logDataFlow("Orders", JSON.stringify({ event: "order_side_effect_step_completed", orderId: savedOrder.id, mode: result.mode, step: "reverse_payment_settlement", success: true }, null, 2));
          } catch (e) {
            result.paymentSettlementReversed = false;
            result.warnings.push(`Payment-agent settlement reversal failed: ${e instanceof Error ? e.message : String(e)}`);
            logError("order_side_effect_step_failed", { orderId: savedOrder.id, mode: result.mode, step: "reverse_payment_settlement", error: e instanceof Error ? e.message : String(e) });
          } finally {
            saveAudit.mark("paymentAgentLedger:end", { reversed: result.paymentSettlementReversed });
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
    } finally {
      releaseOrderSaveGuard();
    }
    });
  };

  const resetOrderComposer = (notify = true) => {
    manuallyEditedPaymentSplitIdsRef.current.clear();
    autoManagedPaymentSplitIdsRef.current.clear();
    manuallyEditedPaymentEventIdsRef.current.clear();
    autoManagedPaymentEventIdsRef.current.clear();
    previousDraftMarkaDefaultRef.current = "";
    setEditingOrderId(null);
    setComposerBaseline(null);
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
    if (!editingOrderId && !hasAnyDraftContent(draft)) {
      resetOrderComposer(false);
      return;
    }
    if (!hasComposerChanges()) {
      resetOrderComposer(false);
      return;
    }
    setShowExitConfirm(true);
  };

  const startEdit = async (o: Order) => {
    if (o.status === "draft" && !ensureFirebaseOrderWriteReady()) return;
    manuallyEditedPaymentSplitIdsRef.current.clear();
    autoManagedPaymentSplitIdsRef.current.clear();
    manuallyEditedPaymentEventIdsRef.current.clear();
    autoManagedPaymentEventIdsRef.current.clear();
    previousDraftMarkaDefaultRef.current = "";
    setEditingOrderId(o.id); setRemovedLineIds([]); setOriginalLineIds(new Set(o.lines.map(l=>l.id)));
    setExpandedOrderIds({});
    const copy = JSON.parse(JSON.stringify(o));
    const normalizedOrderNumber = normalizeEditableOrderNumber(copy.number || copy.orderNumber);
    const matchedSeries = orderSeries.find((series) => series.prefix === (parseOrderNumber(normalizedOrderNumber)?.prefix || "")) ?? null;
    setSelectedSeriesId(matchedSeries?.id || "");
    const preparedDraft = applyPaymentAgentDraftState({
      ...copy,
      number: normalizedOrderNumber,
      orderNumber: normalizedOrderNumber,
      ...deriveOrderSeriesFields(normalizedOrderNumber),
      wechatId: (copy.wechatId || "").trim(),
      lines: normalizeOrderLineSortOrder((copy.lines || []).map((line: Order["lines"][number]) => seedDetailBoxesFromLegacy(line))),
    }, getEditablePaymentAgentSplits(copy), getEditablePaymentAgentEvents(copy));
    setDraft(preparedDraft);
    setComposerBaseline(normalizeComposerOrderForComparison(preparedDraft));
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
    manuallyEditedPaymentSplitIdsRef.current.clear();
    autoManagedPaymentSplitIdsRef.current.clear();
    previousDraftMarkaDefaultRef.current = "";
    setEditingOrderId(null);
    setRemovedLineIds([]);
    setOriginalLineIds(new Set());
    setExpandedOrderIds({});
    const preferredSeries = orderSeries.find((series) => series.id === selectedSeriesId) ?? orderSeries.find((series) => series.isDefault) ?? orderSeries[0] ?? null;
    if (preferredSeries) {
      setSelectedSeriesId(preferredSeries.id);
    }
    const reserved = preferredSeries ? getSeriesSuggestion(preferredSeries) : "";
    const reservedOrderNumber = normalizeEditableOrderNumber(reserved);
    const nextDraft = createEmptyDraft(orders, reservedOrderNumber, getDefaultMarkaFromOrderNumber(reservedOrderNumber));
    const preparedDraft = { ...nextDraft, ...deriveOrderSeriesFields(nextDraft.number || nextDraft.orderNumber) };
    setDraft(preparedDraft);
    setComposerBaseline(normalizeComposerOrderForComparison(preparedDraft));
    setHasAttemptedFinalSave(false);
    setShowDraftIncompleteConfirm(false);
    setShowExitConfirm(false);
    setValidationWarning({ visible: false, items: [] });
    setPopupCustomerIssues({});
    setMode("add");
    logDataFlow("Orders", JSON.stringify({ event: "add_order_fresh_form_opened", orderId: nextDraft.id, orderNumber: nextDraft.number || nextDraft.orderNumber }, null, 2));
  };
  const drafts = useMemo(() => (isFirebaseOrdersMode ? firebaseDraftOrders : orders.filter((o) => o.status === "draft")), [isFirebaseOrdersMode, orders, firebaseDraftOrders]);
  const paymentAuditOrders = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...activeOrders]
      .filter((order) => order.status !== "draft" && order.status !== "archived")
      .sort((left, right) => {
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
  const getOrderPrimaryPhoto = (order: Order) => {
    const candidate = order.lines.find((line) => line.productPhotoUrl || line.photoUrl || (line as Order["lines"][number] & { productImage?: string; image?: string }).productImage || (line as Order["lines"][number] & { productImage?: string; image?: string }).image);
    const line = candidate as Order["lines"][number] & { productImage?: string; image?: string } | undefined;
    return line?.productPhotoUrl || line?.productImage || line?.image || line?.photoUrl || "";
  };
  const getPhotoFileName = (photoUrl: string) => {
    if (!photoUrl) return "No image";
    const cleaned = photoUrl.split("?")[0].split("#")[0];
    return cleaned.split("/").filter(Boolean).pop() || "No image";
  };
  const paymentAuditRows = useMemo(() => paymentAuditOrders.flatMap((order) => {
    const paymentMeta = getOrderPaymentAgentDisplay(order, paymentAgents);
    const paymentSplits = getOrderPaymentAgentSplits(order);
    const photoUrl = getOrderPrimaryPhoto(order);
    const photoName = getPhotoFileName(photoUrl);

    if (paymentSplits.length === 0) {
      const orderAmount = getOrderTotalAmount(order);
      const paidAmount = Math.max(0, Number.isFinite(Number(order.paidAmount)) ? Number(order.paidAmount) : 0);
      const remainingPayable = Math.max(0, Number.isFinite(Number(order.dueAmount)) ? Number(order.dueAmount) : Math.max(0, orderAmount - paidAmount));
      return [{
        id: `${order.id}:unlinked`,
        order,
        photoUrl,
        photoName,
        paymentAgentName: paymentMeta.value,
        paidAmount,
        remainingPayable,
        isPaid: remainingPayable <= 0,
        orderAmount,
      }];
    }

    return paymentSplits.map((split) => {
      const orderAmount = Math.max(0, splitOrderPortionAmount(order, split));
      const paidAmount = Math.max(0, splitUsedAmount(split));
      const remainingFromSnapshot = Number(split.settlementSnapshot?.remainingPayable);
      const remainingPayable = Math.max(
        0,
        Number.isFinite(remainingFromSnapshot) ? remainingFromSnapshot : Math.max(0, orderAmount - paidAmount),
      );
      const agentName =
        split.paymentAgentSnapshot?.name?.trim()
        || split.paymentAgentName?.trim()
        || split.paymentBy?.trim()
        || split.paymentAgentId?.trim()
        || paymentMeta.value;
      return {
        id: `${order.id}:${split.id}`,
        order,
        photoUrl,
        photoName,
        paymentAgentName: agentName,
        paidAmount,
        remainingPayable,
        isPaid: remainingPayable <= 0,
        orderAmount,
      };
    });
  }), [paymentAuditOrders, paymentAgents]);
  const paymentAuditSummary = useMemo(() => {
    const totals = new Map<string, { name: string; totalPaid: number; orderCount: number; orderIds: Set<string> }>();
    paymentAuditRows.forEach((row) => {
      const name = row.paymentAgentName || "Unlinked";
      const current = totals.get(name) || { name, totalPaid: 0, orderCount: 0, orderIds: new Set<string>() };
      current.totalPaid += row.paidAmount;
      current.orderIds.add(row.order.id);
      current.orderCount = current.orderIds.size;
      totals.set(name, current);
    });
    return Array.from(totals.values()).map(({ orderIds: _orderIds, ...summary }) => summary).sort((left, right) => right.totalPaid - left.totalPaid);
  }, [paymentAuditRows]);
  const orderHeaderTabs = useMemo(
    () => orderCategoryTabs,
    [orderCategoryTabs],
  );
  const draftTotalPages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const pagedDrafts = useMemo(() => drafts.slice((draftPage - 1) * PAGE_SIZE, draftPage * PAGE_SIZE), [drafts, draftPage]);
  const formatPlainAmount = (value: number) => formatRate(value);
  const formatRateAmount = (value: number) => formatRate(value);
  const formatPlainNumber = (value: number) => formatDisplayNumber(value, { maxFractionDigits: 6 });
  const formatFinalAmount = (value: number) => formatWholeMoney(value);
  const getPaymentAgentMeta = (order: Order) => getOrderPaymentAgentDisplay(order, paymentAgents);
  const getLineCtns = (line: Order["lines"][number]) => Number(line.totalCtns) || 0;
  const getLinePcsPerCtn = (line: Order["lines"][number]) => Number(line.pcsPerCtn) || 0;
  const getLineTotalPcs = (line: Order["lines"][number]) => lineTotalPcs(line);
  const getLineRate = (line: Order["lines"][number]) => Number(line.rmbPerPcs) || 0;
  const getLineAmount = (line: Order["lines"][number]) => lineTotalRmb(line);
  const getOrderTotalCtns = (order: Order) => (order.lines || []).reduce((sum, line) => sum + getLineCtns(line), 0);
  function getOrderTotalAmount(order: Order) {
    return orderTotal(order);
  }
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
  const isLineMatchedByQuery = (order: Order, line: Order["lines"][number]) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return false;
    const searchable = buildOrderLineSearchText(line, order, customers);
    return matchesSearchQuery(searchable, normalizedQuery);
  };
  const isOrderExpanded = (row: FlatHistoryRow) =>
    Boolean(expandedOrderIds[row.order.id]) ||
    (query.trim().length > 0 && row.extraLines.some((line) => isLineMatchedByQuery(row.order, line)));
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
    listOptions?: string[];
  }) => {
    const outsideEdit = getOutsideEditValue(order);
    const editing = isOutsideFieldEditing(order, field, line);
    if (editing) {
      const normalizedValue = outsideEdit.value.trim().toLowerCase();
      const customerOptions = field === "customer"
        ? listOptions.filter((option) => option && option.toLowerCase().includes(normalizedValue)).slice(0, 4)
        : [];
      const suggestionOptions = field === "wechat"
        ? getTopPrefixSuggestions(listOptions, outsideEdit.value, 4)
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
      if (field === "wechat") {
        return (
          <OutsideSuggestionEditor
            value={outsideEdit.value}
            inputClassName={inputClassName}
            placeholder={placeholder}
            saving={outsideEdit.saving}
            suspendCancel={outsideEditConfirm?.orderId === order.id}
            options={suggestionOptions}
            emptyLabel="No matching WeChat ID"
            onChange={(nextValue) => setOutsideEditValue(order.id, { value: nextValue })}
            onEnter={() => requestOutsideFieldSave(order, field, line)}
            onEscape={() => cancelOutsideField(order.id)}
            onCancel={() => cancelOutsideField(order.id)}
            onSelect={(option) => {
              setOutsideEditValue(order.id, { value: option });
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
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
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
        <div className="relative z-30" ref={pickerRef}>
          <Button size="sm" onClick={() => setPickerOpen((v) => !v)}><List size={14} /><span className="text-fg-muted">Order</span><span className="font-semibold">{(editingOrder?.number || draft.number || history[0]?.order.number || history[0]?.order.orderNumber || "-")}</span><ChevronDown size={13} /></Button>
          {pickerOpen && <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-bg-card p-1.5 shadow-card max-h-[320px] overflow-y-auto">{pickerOrders.slice(0,30).map((o) => <button key={o.id} onClick={() => { setPickerOpen(false); startEdit(o); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-bg-subtle transition-colors"><div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{o.number || o.orderNumber || "Draft"}</span><span className="text-[11px] text-fg-subtle">{formatDate(o.date)}</span></div><div className="mt-0.5 text-[11.5px] text-fg-muted">{o.lines.length} lines | {formatFinalAmount(orderTotal(o))}</div></button>)}</div>}
        </div>
        <div className="relative z-30">
          <Button size="sm" variant="secondary" onClick={() => { setFilterOpen((prev) => !prev); }}><Filter size={14} />Filter</Button>
          {filterOpen ? <div className="absolute left-0 top-full z-40 mt-2 w-[320px] rounded-xl border border-border bg-bg-card p-3 shadow-card space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-subtle">Status<select className="field-input-sm mt-1 h-8 w-full text-[12px]" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as OrdersFilterState["status"] }))}><option value="all">All</option><option value="draft">Draft</option><option value="saved">Saved</option><option value="packed">Loaded</option><option value="received">Received</option><option value="delayed">Delayed</option><option value="cancelled">Cancelled</option></select></label>
              <label className="text-[11px] text-fg-subtle">Loading Date<select className="field-input-sm mt-1 h-8 w-full text-[12px]" value={filters.loadingDate} onChange={(e) => setFilters((prev) => ({ ...prev, loadingDate: e.target.value as OrdersFilterState["loadingDate"] }))}><option value="all">All</option><option value="set">Set</option><option value="unset">Not set</option></select></label>
              <label className="text-[11px] text-fg-subtle">Payment Agent<select className="field-input-sm mt-1 h-8 w-full text-[12px]" value={filters.paymentAgent} onChange={(e) => setFilters((prev) => ({ ...prev, paymentAgent: e.target.value as OrdersFilterState["paymentAgent"] }))}><option value="all">All</option><option value="set">Set</option><option value="unset">Not set</option></select></label>
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
        <Button size="sm" variant={mode === "drafts" ? "secondary" : "primary"} onClick={startAdd}>Add Order</Button>
        <Button size="sm" variant={mode === "drafts" ? "primary" : "secondary"} onClick={() => setMode((current) => current === "drafts" ? "history" : "drafts")}>Draft ({drafts.length})</Button>
        <Button size="sm" variant={mode === "payment-check" ? "primary" : "secondary"} onClick={() => setMode((current) => current === "payment-check" ? "history" : "payment-check")}>Cross Verify Payment Agent</Button>
        <button aria-label="Toggle theme" onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
      {ordersDataSource === "mock" ? <div className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-[12px] font-medium text-amber-900">{ordersSourceSelection.hasFirebaseConfig ? "Mock mode is enabled; order and customer data is local and will not persist to Firebase." : "Firebase is not configured; app is running in mock mode and data will not persist."}</div> : null}
      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {orderHeaderTabs.length ? <section className="card p-2.5"><div className="flex flex-wrap items-center gap-2">{orderHeaderTabs.map((tabLabel) => { const category = tabLabel; const isActive = mode === "history" && effectiveOrderCategory === category; const canDeleteCategory = emptySeriesCategories.has(category); return <div key={tabLabel} className={cn("flex items-center gap-1 rounded-full border pr-2 transition-colors", isActive ? "border-brand bg-brand text-brand-fg" : "border-border bg-bg-card text-fg hover:bg-bg-subtle")}><button type="button" onClick={() => { setMode("history"); setSelectedOrderCategory(category); }} className="rounded-full px-3 py-1.5 text-[12px] font-medium">{tabLabel}</button>{canDeleteCategory ? <button type="button" onClick={() => requestDeleteSeriesCategory(category)} className={cn("grid h-6 w-6 place-items-center rounded-full transition-colors", isActive ? "hover:bg-white/15" : "hover:bg-bg-subtle")} aria-label={`Delete ${category} category`} title={`Delete ${category} category`}><Trash2 size={12} /></button> : null}</div>; })}</div></section> : null}
        {mode === "drafts" && <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Draft Orders</h3><div className="text-[12px] text-fg-subtle">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</div></div>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
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

        {mode === "payment-check" && <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h3 className="font-semibold">Temporary Payment Cross Check</h3>
              <div className="text-[12px] text-fg-subtle">One row per order with agent payment detail, image name, and settlement status.</div>
            </div>
            <div className="text-[12px] text-fg-subtle">{paymentAuditRows.length} order{paymentAuditRows.length === 1 ? "" : "s"}</div>
          </div>
          <div className="grid gap-4 border-b border-border bg-bg-subtle/30 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
              <table className="w-full text-[13px]">
                <thead className="bg-bg-card/95 text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-4 py-2">Metric</th>
                    <th className="px-4 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/80">
                    <td className="px-4 py-3 font-medium">Total Orders</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{paymentAuditRows.length}</td>
                  </tr>
                  <tr className="border-t border-border/80">
                    <td className="px-4 py-3 font-medium text-emerald-700">Paid Orders</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{paymentAuditRows.filter((row) => row.isPaid).length}</td>
                  </tr>
                  <tr className="border-t border-border/80">
                    <td className="px-4 py-3 font-medium text-rose-700">Not Paid</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">{paymentAuditRows.filter((row) => !row.isPaid).length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
              <table className="w-full text-[13px]">
                <thead className="bg-bg-card/95 text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-4 py-2">Payment Agent</th>
                    <th className="px-4 py-2 text-right">Orders</th>
                    <th className="px-4 py-2 text-right">Total Paid</th>
                  </tr>
                </thead>
              </table>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-[13px]">
                  <tbody>
                    {paymentAuditSummary.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-fg-subtle">No payment agent totals yet.</td></tr> : paymentAuditSummary.map((summary) => (
                      <tr key={summary.name} className="border-t border-border/80">
                        <td className="px-4 py-3 font-medium">{summary.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{summary.orderCount}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(summary.totalPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-[13px]">
              <thead className="bg-bg-card/95 text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Image Name</th>
                  <th className="px-4 py-2">Payment Agent</th>
                  <th className="px-4 py-2">Order Amount</th>
                  <th className="px-4 py-2">Paid Amount</th>
                  <th className="px-4 py-2">Remaining</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentAuditRows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No orders available for payment verification.</td></tr> : paymentAuditRows.map(({ id, order, photoUrl, photoName, paymentAgentName, paidAmount, remainingPayable, isPaid, orderAmount }) => (
                  <tr key={id} className="border-t border-border/80 align-top hover:bg-bg-subtle/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{order.number || order.orderNumber || "Draft"}</div>
                      <div className="mt-1 text-[11px] text-fg-subtle">{formatDate(order.date || order.createdAt || order.updatedAt || "")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {photoUrl ? <button type="button" className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle" onClick={() => setPreviewImage({ src: photoUrl, alt: photoName })}><img src={photoUrl} alt={photoName} className="h-full w-full object-cover" loading="lazy" decoding="async" /></button> : <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-bg-subtle text-[10px] text-fg-subtle">No</div>}
                        <div className="min-w-0">
                          <div className="truncate font-medium">{photoName}</div>
                          <div className="text-[11px] text-fg-subtle">{order.lines.length} line{order.lines.length === 1 ? "" : "s"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{paymentAgentName || "Not Paid"}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatAmount(orderAmount)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatAmount(paidAmount)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatAmount(remainingPayable)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", isPaid ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")}>{isPaid ? "Paid" : "Not Paid"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>}

        <section className="card overflow-visible">
          {/* <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h3 className="font-semibold">Order History</h3><div className="text-[12px] text-fg-subtle">Showing 1 to {pagedHistory.length} of {history.length} rows</div></div> */}
          <div className="overflow-x-auto overflow-y-visible">
            <div className="w-full min-w-0 px-0.5 py-1">
              <div className="sticky top-0 z-30 grid items-center border-b border-border bg-bg-card/95 text-[12.5px] font-semibold uppercase tracking-[0.01em] text-fg-muted shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur" style={{ gridTemplateColumns: historyGridTemplate }}>
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
                  const paymentSplits = getOrderPaymentAgentSplits(order);
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
                  const paymentStatus = getOrderPaymentStatusBreakdown(order);
                  const hasGroupedBreakdown = paymentStatus.paymentBreakdown.length > 0;
                  const paidAmount = Math.max(0, hasGroupedBreakdown ? paymentStatus.paidAmount : (Number.isFinite(Number(order.paidAmount)) ? Number(order.paidAmount) : 0));
                  const remainingPayable = Math.max(0, hasGroupedBreakdown ? Math.max(0, amount - paidAmount) : (Number.isFinite(Number(order.dueAmount)) ? Number(order.dueAmount) : Math.max(0, amount - paidAmount)));
                  const isFullySettled = remainingPayable <= 0;
                  const paymentAgentSummary = paymentStatus.paymentAgentSummary || paymentName;
                  const paymentBreakdown = paymentStatus.paymentBreakdown;
                  const marka = selectedLine?.marka?.trim() || "-";
                  const customerName = getCardCustomerValue(selectedLine);
                  const hasMultipleLines = orderLines.length > 1;
                  const customerMissing = isMissingCustomerDisplay(customerName);
                  const hasLoadingDateHighlight = Boolean(order.loadingDate?.trim());

                  return <div key={row.key} className={cn("rounded-lg border border-border/70 bg-bg-card", hasLoadingDateHighlight && "border-emerald-300/45 bg-emerald-100/70 dark:border-emerald-400/50 dark:bg-emerald-500/14")}>
                    <div className={rowClass} style={{ gridTemplateColumns: historyGridTemplate }}>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        <div
                          className="min-w-0"
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setOrderContextMenu({ order, x: event.clientX, y: event.clientY });
                          }}
                        >
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
                              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
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
                              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
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
                        {formatPlainNumber(ctns)}
                      </div>
                      <div className="px-0.5 py-1.5 text-center text-[14.5px] font-semibold tabular-nums">
                        {formatPlainNumber(pcsPerCtn)}
                      </div>
                      <div className="px-0.5 py-1.5 text-center text-[14.5px] font-semibold tabular-nums">{formatPlainNumber(totalPcs)}</div>
                      <div className="px-0.5 py-1.5 text-center text-[15px] font-semibold tabular-nums">
                        {formatRateAmount(rate)}
                      </div>
                      <div className="px-0.5 py-1.5 tabular-nums">
                        <div className="flex flex-col items-center justify-center gap-0.5 text-center">
                          {shippingAmount > 0 || isOutsideFieldEditing(order, "shipping") ? (
                            <div className="text-[16px] font-semibold leading-none text-emerald-700">
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
                          <PaymentStatusAmount
                            amount={amount}
                            isFullySettled={isFullySettled}
                            paidAmount={paidAmount}
                            remainingPayable={remainingPayable}
                            paymentAgentSummary={paymentAgentSummary}
                            paymentBreakdown={paymentBreakdown}
                          />
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
                        listOptions: customerSuggestions,
                      }) : customerName}</div></div>
                      <div className="min-w-0 pl-1 pr-2 py-1.5 text-center">
                        <div className="min-w-0 [&_button]:max-w-full [&_button]:text-[13.5px] [&_button]:leading-tight">
                          {canEditOperationalFields ? <LoadingDateControl compact debugOrderId={order.id} value={rowValue.loadingDate} onChange={(next) => { setRowEdit(order, { loadingDate: next }, "date_selected"); }} /> : <span className="text-[15px] text-fg-muted">{order.loadingDate ? formatDate(order.loadingDate) : "Set date"}</span>}
                        </div>
                        {canEditOperationalFields && rowDirty ? <button type="button" title="Save row changes" aria-label="Save row changes" className="mt-1 inline-flex text-[10.5px] font-semibold text-brand transition-colors hover:underline disabled:opacity-60" disabled={rowValue.saving} onClick={() => { void saveRowEdit(order); }}>{rowValue.saving ? "Saving..." : "Save"}</button> : null}
                      </div>
                      <div className="min-w-0 px-1 py-1.5 text-center">
                        <div className={cn("block w-full px-1 py-1 text-center text-[14.5px] font-semibold leading-tight", paymentMeta.isMissing && "text-[var(--danger)]")}>
                          {paymentName}
                        </div>
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
        </section>
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
        <div className="relative mx-auto flex h-[92vh] w-full max-w-[1520px] flex-col overflow-x-hidden overflow-y-auto rounded-[24px] border border-border bg-bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-border/70 px-4 py-4 pr-5">
            <div className="grid items-end gap-3 xl:grid-cols-[minmax(0,2.45fr)_132px_minmax(0,1.05fr)_minmax(0,0.72fr)_max-content]">
              <section className="min-w-0">
                <PaymentAgentHeaderPicker
                  splits={getEditablePaymentAgentSplits(draft)}
                  events={getEditablePaymentAgentEvents(draft)}
                  paymentAgents={composerPaymentAgents}
                  availableCreditByAgentId={composerAvailableCreditByAgentId}
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
              <section className="min-w-0 relative z-50">
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-muted"><span className="font-medium tracking-[0.01em]">WeChat ID</span><div className="relative z-50"><Input className="h-10 rounded-xl px-3 text-[13px]" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={draft.wechatId} onFocus={() => setHeaderWechatOpen(true)} onBlur={() => window.setTimeout(() => setHeaderWechatOpen(false), 120)} onChange={(e)=>{const next=e.target.value; setHeaderWechatOpen(true); setDraft((d)=>({...d,wechatId:next}));}} />{headerWechatOpen && headerWechatSuggestions.length>0 ? <div className="absolute left-0 top-full z-[90] mt-1.5 max-h-44 w-full overflow-auto rounded-xl border border-border bg-bg-card shadow-[0_18px_48px_rgba(15,23,42,0.22)]">{headerWechatSuggestions.map((w)=><button key={w} type="button" className="block w-full px-3 py-2 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); setHeaderWechatOpen(false); setDraft((d)=>({...d,wechatId:w}));}}>{w}</button>)}</div> : null}</div></label>
              </section>
              <section className="min-w-0">
                <div className="flex h-full items-end justify-end">
                  {mode === "add" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mr-2 h-10 rounded-xl px-3"
                      onClick={pasteCopiedOrderIntoDraft}
                      disabled={!copiedOrderPayload || copiedOrderPayload.lines.length === 0}
                    >
                      <Copy size={14} />
                      Paste
                    </Button>
                  ) : null}
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
          <div className="bg-bg-subtle/20">
            <OrderForm showOrderInfo={false} draft={draft} setDraft={(u) => setDraft((d) => u(d))} paymentAgents={paymentAgents} customers={customers} onUploadingChange={onUploadingChange} onRemoveLine={handleRemoveLine} wechatSuggestions={wechatSuggestions.filter((w) => draft.wechatId.trim() ? w.toLowerCase().includes(draft.wechatId.trim().toLowerCase()) : false)} customerSuggestions={customerSuggestions} onPreviewImage={(src) => setPreviewImage({ src, alt: "Order line photo preview" })} onCustomerValidityChange={(lineId, issue) => setPopupCustomerIssues((prev) => ({ ...prev, [lineId]: issue }))} defaultMarka={mode === "add" ? currentDraftDefaultMarka : ""} />
          </div>
          <OrderFooter lineTotal={lineTotal} shippingPrice={getOrderShippingAmount(draft)} total={total} onCancel={requestExitComposer} showCancel={false} onSaveDraft={() => onSave("draft")} onSaveOrder={() => onSave("saved")} onViewDetails={() => setViewOrder(draft)} saveOrderLabel={orderSaveState === "saving" ? "Saving Order..." : (editingOrderId ? "Save Changes" : "Save Order")} saveDraftLabel={orderSaveState === "saving" ? "Saving Draft..." : "Save as Draft"} disableSaveDraft={orderSaveState !== "idle"} disableSaveOrder={orderSaveState !== "idle"} paymentAgents={composerPaymentAgents} availableCreditByAgentId={composerAvailableCreditByAgentId} paymentAgentSplits={getEditablePaymentAgentSplits(draft)} paymentAgentEvents={getEditablePaymentAgentEvents(draft)} onPaymentAgentEventsChange={setDraftPaymentAgentEvents} onPaymentAgentEventManualAmountEdit={markDraftPaymentEventAsManual} onShippingPriceChange={(value) => setDraft((d) => ({ ...d, shippingPrice: value }))} />
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
      <ConfirmDialog
        open={Boolean(pendingDeleteSeriesCategory)}
        title="Delete order series category?"
        description={pendingDeleteSeriesCategory ? `Delete the ${pendingDeleteSeriesCategory} order number category? This option only appears because the category has no orders.` : ""}
        confirmLabel="Delete Category"
        danger
        busy={deleteSeriesBusy}
        onCancel={() => { if (!deleteSeriesBusy) setPendingDeleteSeriesCategory(null); }}
        onConfirm={() => { void confirmDeleteSeriesCategory(); }}
      />
      <LoadingOverlay
        open={orderSaveState === "saving"}
        title={orderSaveState === "saving" ? "Saving order" : "Loading"}
        message={orderSaveState === "saving" ? "Saving your order now..." : "Fetching the latest data..."}
      />
      {orderContextMenu ? createPortal(
        <div
          className="fixed z-[120] min-w-[140px] overflow-hidden rounded-xl border border-border bg-bg-card p-1 shadow-card"
          style={{ top: orderContextMenu.y, left: orderContextMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-bg-subtle"
            onClick={() => copyOrderForPaste(orderContextMenu.order)}
          >
            <Copy size={14} />
            Copy Order
          </button>
        </div>,
        document.body,
      ) : null}
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrder(null)} paymentAgents={composerPaymentAgents} paymentAgentSplits={viewOrder ? getEditablePaymentAgentSplits(viewOrder) : []} paymentAgentEvents={viewOrder ? getEditablePaymentAgentEvents(viewOrder) : []} onPaymentAgentEventsChange={viewOrder ? handleViewOrderPaymentAgentEventsChange : undefined} onPaymentAgentEventManualAmountEdit={viewOrder && isOrderModalOpen && viewOrder.id === draft.id ? markDraftPaymentEventAsManual : undefined} />
    </div>
  );
}


