"use client";

import { PageShell } from "@/components/PageShell";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { isDashboardOrder } from "@/services/selectors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { logPageAccess } from "@/lib/logger";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import Link from "next/link";

type DashboardPdfRow = {
  imageUrl: string;
  marka: string;
  ctns: number;
  pcsPerCtn: number;
  totalPcs: number;
  customer: string;
};

type DashboardOrderRow = {
  orderId: string;
  orderNumber: string;
  imageUrl: string;
  marka: string;
  customer: string;
  paymentAgent: string;
  totalCtns: number;
  amount: number;
};

type DashboardLoadingGroup = {
  loadingDate: string;
  label: string;
  customerNames: string[];
  orderNumbers: string[];
  orderLinks: Array<{ orderId: string; orderNumber: string }>;
  paymentAgents: string[];
  ordersCount: number;
  totalCtns: number;
  totalCustomers: number;
  totalAmount: number;
  orders: DashboardOrderRow[];
  pdfRows: DashboardPdfRow[];
};

const LOADING_DATE_EMPTY_LABEL = "Not Set";
const DASHBOARD_LOADING_NOTES_KEY = "dashboard:loading-date-notes";
const DASHBOARD_UPPERCASE_LABEL = "text-[12.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle";
const DASHBOARD_DIVIDER_CELL = "border-l border-border px-2";
const DASHBOARD_METRIC_VALUE = "text-[16px] font-semibold tabular-nums leading-none text-fg";
const DASHBOARD_SWITCH_BUTTON = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg";
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const normalizeSearchText = (...parts: Array<string | number | undefined | null>) =>
  parts
    .flatMap((part) => String(part ?? "").split(/\s+/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
const buildDateSearchTokens = (dateValue?: string) => {
  if (!dateValue) return [] as string[];
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return [dateValue];
  return [dateValue, `${day}/${month}/${year}`, `${day}${month}${year}`, `${day}${month}${year.slice(-2)}`, `${year}${month}${day}`];
};
const splitDisplayItems = (value?: string) =>
  Array.from(new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean)));
const estimateCarouselWidth = (value: string, min: number, max: number) =>
  clampNumber((value.trim().length || 1) * 8 + 54, min, max);
const openDashboardPdfPreview = (title: string, fileName: string, html: string) => {
  const markup = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(fileName)}.pdf</title><style>@page{size:A4 portrait;margin:10mm}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif}body{padding:12px 14px;font-size:12px;line-height:1.4}h1{margin:0 0 8px;font-size:22px;line-height:1.2}.summary{margin:0 0 14px;font-size:22px;line-height:1.2}.summary strong{color:#111}.details-table{width:100%;border-collapse:collapse;table-layout:fixed}.details-table th,.details-table td{border:1px solid #d1d5db;padding:7px 8px;vertical-align:middle;text-align:left;font-size:12px;line-height:1.35;white-space:normal;word-break:normal;overflow-wrap:normal}.details-table th{background:#f3f4f6;color:#374151;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.num{text-align:center;font-variant-numeric:tabular-nums}.thumb{width:58px;height:58px;margin:0 auto;border:1px solid #d1d5db;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}.thumb img{display:block;width:100%;height:100%;object-fit:contain}.empty-image{font-size:10px;color:#94a3b8}.customer{min-width:150px;white-space:normal;word-break:normal;overflow-wrap:normal}tr{page-break-inside:avoid}</style></head><body><h1>${escapeHtml(title)}</h1>${html}</body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(markup);
  doc.close();
  const printFrame = iframe.contentWindow;
  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };
  printFrame.onafterprint = cleanup;
  window.setTimeout(() => {
    printFrame.focus();
    printFrame.print();
  }, 150);
};

export default function DashboardPage() {
  const { orders } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading } = useOrders();
  const { data: customers } = useCustomers();
  const { data: paymentAgents } = usePaymentAgents();
  const ordersSource = ordersDataSource();
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const [query, setQuery] = useState("");
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [summaryIndexes, setSummaryIndexes] = useState<Record<string, number>>({});
  const [detailIndexes, setDetailIndexes] = useState<Record<string, number>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(DASHBOARD_LOADING_NOTES_KEY);
      return stored ? JSON.parse(stored) as Record<string, string> : {};
    } catch {
      return {};
    }
  });
  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter(isDashboardOrder);
  }, [isFirebaseOrdersMode, remoteOrders, orders]);

  useEffect(() => {
    logPageAccess("Dashboard", { component: "app/dashboard/page.tsx", source: ordersSource });
  }, [ordersSource]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_LOADING_NOTES_KEY, JSON.stringify(groupNotes));
  }, [groupNotes]);

  const cycleIndex = (
    setter: Dispatch<SetStateAction<Record<string, number>>>,
    key: string,
    total: number,
    delta: number,
  ) => {
    if (total <= 1) return;
    setter((prev) => {
      const nextIndex = ((prev[key] ?? 0) + delta + total) % total;
      return { ...prev, [key]: nextIndex };
    });
  };

  const filteredOrders = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return sourceOrders;
    return sourceOrders.filter((order) => {
      const paymentLabel = getOrderPaymentAgentDisplay(order, paymentAgents).value;
      const searchable = normalizeSearchText(
        order.id,
        order.number || order.orderNumber || "",
        order.wechatId || "",
        order.date || "",
        order.loadingDate || "",
        ...buildDateSearchTokens(order.date || ""),
        ...buildDateSearchTokens(order.loadingDate || ""),
        paymentLabel,
        order.status,
        order.paymentStatus,
        order.lines.reduce((sum, line) => sum + (Number(line.totalCtns) || 0), 0),
        order.lines.reduce((sum, line) => sum + lineTotalRmb(line), 0),
        ...(order.lines || []).flatMap((line) => [
          line.productSnapshot?.name || "",
          line.marka || "",
          line.detail1 || "",
          line.detail2 || "",
          line.detail3 || "",
          line.details || "",
          getLineCustomerDisplay(line, customers),
          lineTotalPcs(line),
          line.rmbPerPcs || 0,
          lineTotalRmb(line),
        ]),
      );
      if (searchable.includes(normalizedQuery)) return true;
      return normalizedQuery.split(" ").every((word) => searchable.includes(word));
    });
  }, [customers, paymentAgents, query, sourceOrders]);

  const loadingGroups = useMemo<DashboardLoadingGroup[]>(() => {
    const groups = new Map<string, DashboardLoadingGroup>();

    filteredOrders.forEach((order) => {
      const key = order.loadingDate || LOADING_DATE_EMPTY_LABEL;
      const current = groups.get(key) || {
        loadingDate: order.loadingDate || "",
        label: order.loadingDate ? formatDate(order.loadingDate) : LOADING_DATE_EMPTY_LABEL,
        customerNames: [],
        orderNumbers: [],
        orderLinks: [],
        paymentAgents: [],
        ordersCount: 0,
        totalCtns: 0,
        totalCustomers: 0,
        totalAmount: 0,
        orders: [],
        pdfRows: [],
      };

      const orderNumber = order.number || order.orderNumber || "-";
      const paymentAgent = getOrderPaymentAgentDisplay(order, paymentAgents).value;
      const customerNames = Array.from(new Set(order.lines.map((line) => getLineCustomerDisplay(line, customers) || "-")));
      const orderTotalCtns = order.lines.reduce((sum, line) => sum + (Number(line.totalCtns) || 0), 0);
      const orderAmount = order.lines.reduce((sum, line) => sum + lineTotalRmb(line), 0);

      current.ordersCount += 1;
      current.orderNumbers.push(orderNumber);
      current.orderLinks.push({ orderId: order.id, orderNumber });
      if (paymentAgent && !current.paymentAgents.includes(paymentAgent)) current.paymentAgents.push(paymentAgent);
      customerNames.forEach((customerName) => {
        if (customerName && !current.customerNames.includes(customerName)) current.customerNames.push(customerName);
      });
      current.totalCtns += orderTotalCtns;
      current.totalAmount += orderAmount;
      current.orders.push({
        orderId: order.id,
        orderNumber,
        imageUrl: order.lines.find((line) => (line.productPhotoUrl || line.photoUrl || "").trim())?.productPhotoUrl
          || order.lines.find((line) => (line.productPhotoUrl || line.photoUrl || "").trim())?.photoUrl
          || "",
        marka: Array.from(new Set(order.lines.map((line) => line.marka || line.productSnapshot?.name || "-"))).join(", "),
        customer: customerNames.join(", "),
        paymentAgent,
        totalCtns: orderTotalCtns,
        amount: orderAmount,
      });

      order.lines.forEach((line) => {
        current.pdfRows.push({
          imageUrl: line.productPhotoUrl || line.photoUrl || "",
          marka: line.marka || line.productSnapshot?.name || "-",
          ctns: Number(line.totalCtns) || 0,
          pcsPerCtn: Number(line.pcsPerCtn) || 0,
          totalPcs: lineTotalPcs(line),
          customer: getLineCustomerDisplay(line, customers) || "-",
        });
      });

      groups.set(key, current);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        totalCustomers: group.customerNames.length,
      }))
      .sort((left, right) => {
        if (!left.loadingDate) return 1;
        if (!right.loadingDate) return -1;
        return right.loadingDate.localeCompare(left.loadingDate);
      });
  }, [customers, filteredOrders, paymentAgents]);

  const viewOrder = sourceOrders.find((order) => order.id === viewOrderId) ?? null;

  const exportGroup = (group: DashboardLoadingGroup) => {
    const rowsMarkup = group.pdfRows
      .map((row) => `
        <tr>
          <td><div class="thumb">${row.imageUrl ? `<img src="${escapeHtml(getCloudinaryOptimizedUrl(row.imageUrl, { width: 160, height: 160, crop: "fit" }))}" alt="${escapeHtml(row.marka)}" />` : `<span class="empty-image">No image</span>`}</div></td>
          <td>${escapeHtml(row.marka)}</td>
          <td class="num">${row.ctns}</td>
          <td class="num">${row.pcsPerCtn}</td>
          <td class="num">${row.totalPcs}</td>
          <td class="customer">${escapeHtml(row.customer)}</td>
        </tr>
      `)
      .join("");

    openDashboardPdfPreview(
      `Loading Date ${group.label}`,
      `loading-date-${(group.loadingDate || "no-date").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}`,
      `
        <p class="summary"><strong>Order Numbers:</strong> ${escapeHtml(group.orderNumbers.join(", "))}</p>
        <table class="details-table">
          <colgroup>
            <col style="width:90px" />
            <col style="width:26%" />
            <col style="width:70px" />
            <col style="width:80px" />
            <col style="width:95px" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Image</th>
              <th>Marka</th>
              <th class="num">CTNS</th>
              <th class="num">PCS/CTN</th>
              <th class="num">Total PCS</th>
              <th class="customer">Customer Name</th>
            </tr>
          </thead>
          <tbody>${rowsMarkup}</tbody>
        </table>
      `,
    );
  };

  const summaryGridLayout = useMemo(() => {
    const visibleOrderWidth = loadingGroups.reduce((maxWidth, group) => {
      const groupKey = group.loadingDate || LOADING_DATE_EMPTY_LABEL;
      const activeIndex = Math.min(summaryIndexes[`${groupKey}:orders`] ?? 0, Math.max(group.orderLinks.length - 1, 0));
      const value = group.orderLinks[activeIndex]?.orderNumber || "-";
      return Math.max(maxWidth, estimateCarouselWidth(value, 135, 190));
    }, 135);

    const visibleCustomerWidth = loadingGroups.reduce((maxWidth, group) => {
      const groupKey = group.loadingDate || LOADING_DATE_EMPTY_LABEL;
      const activeIndex = Math.min(summaryIndexes[`${groupKey}:customers`] ?? 0, Math.max(group.customerNames.length - 1, 0));
      const value = group.customerNames[activeIndex] || "-";
      return Math.max(maxWidth, estimateCarouselWidth(value, 90, 170));
    }, 90);

    const visiblePaymentAgentWidth = loadingGroups.reduce((maxWidth, group) => {
      const groupKey = group.loadingDate || LOADING_DATE_EMPTY_LABEL;
      const activeIndex = Math.min(summaryIndexes[`${groupKey}:agents`] ?? 0, Math.max(group.paymentAgents.length - 1, 0));
      const value = group.paymentAgents[activeIndex] || "-";
      return Math.max(maxWidth, estimateCarouselWidth(value, 130, 190));
    }, 130);

    const columns = [
      32,
      150,
      190,
      visibleOrderWidth,
      74,
      110,
      visibleCustomerWidth,
      78,
      visiblePaymentAgentWidth,
      170,
    ];

    return {
      minWidth: `${columns.reduce((sum, width) => sum + width, 0)}px`,
      template: columns.map((width) => `${width}px`).join(" "),
    };
  }, [loadingGroups, summaryIndexes]);

  const renderSwitcher = ({
    items,
    activeIndex,
    onPrevious,
    onNext,
    className = "text-[14px] leading-tight text-fg-subtle",
    stopPropagation = false,
    renderItem,
  }: {
    items: string[];
    activeIndex: number;
    onPrevious: () => void;
    onNext: () => void;
    className?: string;
    stopPropagation?: boolean;
    renderItem?: (item: string) => JSX.Element;
  }) => {
    const safeItems = items.length ? items : ["-"];
    const currentIndex = Math.min(activeIndex, safeItems.length - 1);
    const currentItem = safeItems[currentIndex] || "-";
    const handleClick = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
      if (stopPropagation) event.stopPropagation();
      action();
    };

    return (
      <div className="min-w-0 overflow-hidden">
        <div className={`inline-flex max-w-full items-center gap-2 overflow-hidden ${className}`}>
        {safeItems.length > 1 ? (
          <button type="button" className={DASHBOARD_SWITCH_BUTTON} onClick={(event) => handleClick(event, onPrevious)} aria-label="Show previous item">
            <ChevronLeft size={12} />
          </button>
        ) : null}
        <div className="min-w-0 truncate px-1" title={safeItems.join(", ")}>
          {renderItem ? renderItem(currentItem) : currentItem}
        </div>
        {safeItems.length > 1 ? (
          <button type="button" className={DASHBOARD_SWITCH_BUTTON} onClick={(event) => handleClick(event, onNext)} aria-label="Show next item">
            <ChevronRight size={12} />
          </button>
        ) : null}
        </div>
      </div>
    );
  };

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        {isFirebaseOrdersMode && ordersLoading ? <div className="card p-4 text-sm text-fg-subtle">Loading dashboard orders from Firestore...</div> : null}

        <div className="card grid grid-cols-[minmax(280px,1fr)_auto] items-center gap-4 p-4 max-[720px]:grid-cols-1">
          <div className="min-w-0">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loading date groups, order no., marka, product, customer..."
              leadingIcon={<Search size={14} />}
            />
          </div>
          <div className="justify-self-end whitespace-nowrap pr-1 text-[12px] text-fg-subtle max-[720px]:justify-self-start">
            {loadingGroups.length} loading date group{loadingGroups.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="space-y-4">
          {loadingGroups.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="space-y-3" style={{ minWidth: summaryGridLayout.minWidth }}>
                <div className="card overflow-hidden border-b border-border bg-bg-card/70">
                  <div className="px-3.5 py-2">
                    <div
                      className={`${DASHBOARD_UPPERCASE_LABEL} grid min-h-[35px] items-center gap-x-0`}
                      style={{ gridTemplateColumns: summaryGridLayout.template }}
                    >
                      <div />
                      <div className="px-2">Loading Date</div>
                      <div className="px-2">Notes</div>
                      <div className="min-w-0 px-2">Marka</div>
                      <div className={DASHBOARD_DIVIDER_CELL}>CTNS</div>
                      <div className={DASHBOARD_DIVIDER_CELL}>Amount</div>
                      <div className={DASHBOARD_DIVIDER_CELL}>Customers</div>
                      <div className={DASHBOARD_DIVIDER_CELL}>Orders</div>
                      <div className={DASHBOARD_DIVIDER_CELL}>Payment Agents</div>
                      <div className="border-l border-border px-2 text-right">Actions</div>
                    </div>
                  </div>
                </div>

                {loadingGroups.map((group) => (
                  <section key={group.loadingDate || LOADING_DATE_EMPTY_LABEL} className="card overflow-hidden rounded-[24px]">
                    <div className="px-3.5 py-2">
                      {(() => {
                        const groupKey = group.loadingDate || LOADING_DATE_EMPTY_LABEL;
                        const orderIndex = Math.min(summaryIndexes[`${groupKey}:orders`] ?? 0, Math.max(group.orderLinks.length - 1, 0));
                        const customerIndex = Math.min(summaryIndexes[`${groupKey}:customers`] ?? 0, Math.max(group.customerNames.length - 1, 0));
                        const paymentAgentIndex = Math.min(summaryIndexes[`${groupKey}:agents`] ?? 0, Math.max(group.paymentAgents.length - 1, 0));

                        return (
                      <div
                        className="grid min-h-[60px] items-center gap-x-0 gap-y-1"
                        style={{ gridTemplateColumns: summaryGridLayout.template }}
                        onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                      >
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
                          aria-label={expandedGroups[groupKey] ? "Collapse loading date group" : "Expand loading date group"}
                        >
                          <ChevronDown
                            size={16}
                            className={`transition-transform ${expandedGroups[groupKey] ? "rotate-180" : ""}`}
                          />
                        </button>
                      <div className="min-w-0 px-2">
                          <div className="truncate text-[18px] font-semibold leading-tight text-fg" title={group.label}>{group.label}</div>
                        </div>
                        <div className="min-w-0 px-2" onClick={(event) => event.stopPropagation()}>
                          <Input
                            value={groupNotes[group.loadingDate || LOADING_DATE_EMPTY_LABEL] || ""}
                            onChange={(event) =>
                              setGroupNotes((prev) => ({
                                ...prev,
                                [group.loadingDate || LOADING_DATE_EMPTY_LABEL]: event.target.value,
                              }))
                            }
                            placeholder="Add loading-date notes"
                            className="h-8 w-full rounded-lg border border-border bg-bg-card px-2.5 text-[13px]"
                          />
                        </div>
                        <div className="min-w-0 overflow-hidden px-2">
                          {renderSwitcher({
                            items: group.orderLinks.map((item) => item.orderNumber),
                            activeIndex: orderIndex,
                            onPrevious: () => cycleIndex(setSummaryIndexes, `${groupKey}:orders`, group.orderLinks.length, -1),
                            onNext: () => cycleIndex(setSummaryIndexes, `${groupKey}:orders`, group.orderLinks.length, 1),
                            className: "text-[15px] leading-tight text-fg-subtle",
                            stopPropagation: true,
                            renderItem: (item) => (
                              <Link
                                href={`/orders?edit=${group.orderLinks[orderIndex]?.orderId || ""}`}
                                className="text-brand hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {item}
                              </Link>
                            ),
                          })}
                        </div>
                        <div className={`${DASHBOARD_DIVIDER_CELL} flex min-h-[40px] items-center`}>
                          <div className={DASHBOARD_METRIC_VALUE}>{group.totalCtns}</div>
                        </div>
                        <div className={`${DASHBOARD_DIVIDER_CELL} flex min-h-[40px] items-center`}>
                          <div className={DASHBOARD_METRIC_VALUE}>{formatAmount(group.totalAmount)}</div>
                        </div>
                        <div className={`min-w-0 ${DASHBOARD_DIVIDER_CELL} flex min-h-[40px] items-center overflow-hidden`}>
                          {renderSwitcher({
                            items: group.customerNames,
                            activeIndex: customerIndex,
                            onPrevious: () => cycleIndex(setSummaryIndexes, `${groupKey}:customers`, group.customerNames.length, -1),
                            onNext: () => cycleIndex(setSummaryIndexes, `${groupKey}:customers`, group.customerNames.length, 1),
                            stopPropagation: true,
                          })}
                        </div>
                        <div className={`${DASHBOARD_DIVIDER_CELL} flex min-h-[40px] items-center`}>
                          <div className={DASHBOARD_METRIC_VALUE}>{group.ordersCount}</div>
                        </div>
                        <div className={`min-w-0 ${DASHBOARD_DIVIDER_CELL} flex min-h-[40px] items-center overflow-hidden`}>
                          {renderSwitcher({
                            items: group.paymentAgents,
                            activeIndex: paymentAgentIndex,
                            onPrevious: () => cycleIndex(setSummaryIndexes, `${groupKey}:agents`, group.paymentAgents.length, -1),
                            onNext: () => cycleIndex(setSummaryIndexes, `${groupKey}:agents`, group.paymentAgents.length, 1),
                            stopPropagation: true,
                          })}
                        </div>
                        <div className="flex min-h-[40px] items-center justify-end border-l border-border px-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              exportGroup(group);
                            }}
                          >
                            <Download size={14} />
                            Export PDF
                          </Button>
                        </div>
                      </div>
                        );
                      })()}
                    </div>

                    {expandedGroups[group.loadingDate || LOADING_DATE_EMPTY_LABEL] ? (
                      <div className="border-t border-border">
                        <table className="w-full text-[14px]">
                          <thead className="bg-bg-card/95 text-[12.5px] uppercase tracking-[0.04em] text-fg-subtle">
                            <tr className="border-b border-border">
                              <th className="px-3 py-2 text-left">Order ID</th>
                              <th className="px-3 py-2 text-left">Product Image</th>
                              <th className="px-3 py-2 text-left">Marka</th>
                              <th className="px-3 py-2 text-left">Customer</th>
                              <th className="px-3 py-2 text-left">Payment Agent(s)</th>
                              <th className="px-3 py-2 text-center">CTNS</th>
                              <th className="px-3 py-2 text-right">Total Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.orders.map((orderRow) => (
                              (() => {
                                const markaItems = splitDisplayItems(orderRow.marka);
                                const customerItems = splitDisplayItems(orderRow.customer);
                                const paymentAgentItems = splitDisplayItems(orderRow.paymentAgent);
                                const markaKey = `${orderRow.orderId}:marka`;
                                const customerKey = `${orderRow.orderId}:customer`;
                                const paymentAgentKey = `${orderRow.orderId}:payment-agent`;
                                const markaIndex = Math.min(detailIndexes[markaKey] ?? 0, Math.max(markaItems.length - 1, 0));
                                const customerIndex = Math.min(detailIndexes[customerKey] ?? 0, Math.max(customerItems.length - 1, 0));
                                const paymentAgentIndex = Math.min(detailIndexes[paymentAgentKey] ?? 0, Math.max(paymentAgentItems.length - 1, 0));

                                return (
                                  <tr key={orderRow.orderId} className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-bg-subtle/30">
                                    <td className="px-3 py-2.5">
                                      <div className="text-[16px] font-semibold text-fg">{orderRow.orderNumber}</div>
                                      <div className="text-[12.5px] text-fg-subtle">{orderRow.orderId}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-subtle">
                                        {orderRow.imageUrl ? (
                                          <img
                                            src={getCloudinaryOptimizedUrl(orderRow.imageUrl, { width: 160, height: 160, crop: "fit" })}
                                            alt={orderRow.marka}
                                            className="h-full w-full object-contain"
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        ) : (
                                          <span className="text-[11px] text-fg-subtle">No image</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {renderSwitcher({
                                        items: markaItems,
                                        activeIndex: markaIndex,
                                        onPrevious: () => cycleIndex(setDetailIndexes, markaKey, markaItems.length, -1),
                                        onNext: () => cycleIndex(setDetailIndexes, markaKey, markaItems.length, 1),
                                        className: "text-[16px] font-medium leading-tight text-fg",
                                      })}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {renderSwitcher({
                                        items: customerItems,
                                        activeIndex: customerIndex,
                                        onPrevious: () => cycleIndex(setDetailIndexes, customerKey, customerItems.length, -1),
                                        onNext: () => cycleIndex(setDetailIndexes, customerKey, customerItems.length, 1),
                                        className: "text-[15px] leading-tight text-fg-subtle",
                                      })}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {renderSwitcher({
                                        items: paymentAgentItems,
                                        activeIndex: paymentAgentIndex,
                                        onPrevious: () => cycleIndex(setDetailIndexes, paymentAgentKey, paymentAgentItems.length, -1),
                                        onNext: () => cycleIndex(setDetailIndexes, paymentAgentKey, paymentAgentItems.length, 1),
                                        className: "text-[15px] leading-tight text-fg-subtle",
                                      })}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-[14px] tabular-nums text-fg">{orderRow.totalCtns}</td>
                                    <td className="px-3 py-2.5 text-right text-[15px] font-semibold tabular-nums text-fg">{formatAmount(orderRow.amount)}</td>
                                  </tr>
                                );
                              })()
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          ) : null}
          {loadingGroups.length === 0 ? <div className="card px-4 py-8 text-center text-fg-subtle">No dashboard rows match this search.</div> : null}
        </div>
      </div>
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrderId(null)} />
    </PageShell>
  );
}
