"use client";

import { PageShell } from "@/components/PageShell";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { isDashboardOrder } from "@/services/selectors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Download, Eye, Search, SquarePen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logPageAccess } from "@/lib/logger";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { useRouter } from "next/navigation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";

type DashboardLineRow = {
  orderId: string;
  orderNumber: string;
  imageUrl: string;
  productName: string;
  customer: string;
  totalCtns: number;
  pcsPerCtn: number;
  totalPcs: number;
  amount: number;
};

type DashboardLoadingGroup = {
  loadingDate: string;
  label: string;
  ordersCount: number;
  totalAmount: number;
  rows: DashboardLineRow[];
};

const LOADING_DATE_EMPTY_LABEL = "No Loading Date";

export default function DashboardPage() {
  const { orders } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading } = useOrders();
  const { data: customers } = useCustomers();
  const ordersSource = ordersDataSource();
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const [query, setQuery] = useState("");
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const router = useRouter();

  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter(isDashboardOrder);
  }, [isFirebaseOrdersMode, remoteOrders, orders]);

  useEffect(() => {
    logPageAccess("Dashboard", { component: "app/dashboard/page.tsx", source: ordersSource });
  }, [ordersSource]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sourceOrders;
    return sourceOrders.filter((order) => {
      const haystack = [
        order.number || order.orderNumber || "",
        order.wechatId || "",
        order.loadingDate || "",
        order.lines.map((line) => line.marka || "").join(" "),
        order.lines.map((line) => line.details || line.productSnapshot?.name || "").join(" "),
        order.lines.map((line) => getLineCustomerDisplay(line, customers)).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [customers, query, sourceOrders]);

  const loadingGroups = useMemo<DashboardLoadingGroup[]>(() => {
    const groups = new Map<string, DashboardLoadingGroup>();

    filteredOrders.forEach((order) => {
      const key = order.loadingDate || LOADING_DATE_EMPTY_LABEL;
      const current = groups.get(key) || {
        loadingDate: order.loadingDate || "",
        label: order.loadingDate ? formatDate(order.loadingDate) : LOADING_DATE_EMPTY_LABEL,
        ordersCount: 0,
        totalAmount: 0,
        rows: [],
      };

      current.ordersCount += 1;

      order.lines.forEach((line) => {
        current.rows.push({
          orderId: order.id,
          orderNumber: order.number || order.orderNumber || "-",
          imageUrl: line.productPhotoUrl || line.photoUrl || "",
          productName: [line.productSnapshot?.name, line.marka].filter(Boolean).join(" / ") || line.details || "-",
          customer: getLineCustomerDisplay(line, customers) || "-",
          totalCtns: Number(line.totalCtns) || 0,
          pcsPerCtn: Number(line.pcsPerCtn) || 0,
          totalPcs: lineTotalPcs(line),
          amount: lineTotalRmb(line),
        });
      });

      current.totalAmount = current.rows.reduce((sum, row) => sum + row.amount, 0);
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((left, right) => {
      if (!left.loadingDate) return 1;
      if (!right.loadingDate) return -1;
      return right.loadingDate.localeCompare(left.loadingDate);
    });
  }, [customers, filteredOrders]);

  const viewOrder = sourceOrders.find((order) => order.id === viewOrderId) ?? null;

  const exportGroup = (group: DashboardLoadingGroup) => {
    const header = ["Loading Date", "Order ID", "Order Number", "Product", "Customer", "CTN", "PCS/CTN", "TOTAL PCS", "Amount"];
    const csvRows = group.rows.map((row) => [
      group.label,
      row.orderId,
      row.orderNumber,
      row.productName,
      row.customer,
      String(row.totalCtns),
      String(row.pcsPerCtn),
      String(row.totalPcs),
      formatAmount(row.amount),
    ]);
    const csv = [header, ...csvRows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `loading-date-${(group.loadingDate || "no-date").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        {isFirebaseOrdersMode && ordersLoading ? <div className="card p-4 text-sm text-fg-subtle">Loading dashboard orders from Firestore...</div> : null}

        <div className="card flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-[260px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loading date groups, order no., marka, product, customer..."
              leadingIcon={<Search size={14} />}
            />
          </div>
          <div className="text-[12px] text-fg-subtle">{loadingGroups.length} loading date group{loadingGroups.length === 1 ? "" : "s"}</div>
        </div>

        <div className="space-y-4">
          {loadingGroups.map((group) => (
            <section key={group.loadingDate || LOADING_DATE_EMPTY_LABEL} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="text-[18px] font-semibold text-fg">{group.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-fg-subtle">
                    <span>{group.ordersCount} orders</span>
                    <span>Total Amount: {formatAmount(group.totalAmount)}</span>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => exportGroup(group)}>
                  <Download size={14} />
                  Export
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-[12px]">
                  <thead className="bg-bg-card/95 text-[10px] uppercase tracking-[0.04em] text-fg-subtle">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left">Order ID</th>
                      <th className="px-3 py-2 text-left">Product Image</th>
                      <th className="px-3 py-2 text-left">Product Name / Marka</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-center">Qty / CTN / PCS</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, index) => (
                      <tr key={`${row.orderId}-${index}`} className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-bg-subtle/30">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-fg">{row.orderNumber}</div>
                          <div className="text-[11px] text-fg-subtle">{row.orderId}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-bg-subtle">
                            {row.imageUrl ? (
                              <img
                                src={getCloudinaryOptimizedUrl(row.imageUrl, { width: 160, height: 160, crop: "fit" })}
                                alt={row.productName}
                                className="h-full w-full object-contain"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="text-[11px] text-fg-subtle">No image</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-fg">{row.productName}</td>
                        <td className="px-3 py-2.5 text-fg-subtle">{row.customer}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-fg">
                          {row.totalCtns} / {row.pcsPerCtn} / {row.totalPcs}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-fg">{formatAmount(row.amount)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" title="View details" onClick={() => setViewOrderId(row.orderId)}>
                              <Eye size={13} />
                            </Button>
                            <Button size="sm" variant="secondary" title="Open in Orders" onClick={() => router.push(`/orders?edit=${row.orderId}`)}>
                              <SquarePen size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {loadingGroups.length === 0 ? <div className="card px-4 py-8 text-center text-fg-subtle">No dashboard rows match this search.</div> : null}
        </div>
      </div>
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrderId(null)} />
    </PageShell>
  );
}
