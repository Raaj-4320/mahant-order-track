"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { Order } from "@/lib/types";
import { getDashboardIncludedStatuses, getDashboardRows, getDashboardStats, isDashboardOrder } from "@/services/selectors";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CalendarDays, ClipboardList, Download, Eye, Filter, Package, Search, SquarePen, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logPageAccess } from "@/lib/logger";
import { runDevReset } from "@/services/devResetService";
import { isAuthRequiredModeEnabled, isDevResetEnabled, ordersDataSource } from "@/lib/runtimeConfig";
import { useRouter } from "next/navigation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";
import { OrderStatusControl } from "@/components/orders/OrderStatusControl";
import { LoadingDateControl } from "@/components/orders/LoadingDateControl";
import { isOrderEligibleForCreditSettlement } from "@/services/settlement/orderCreditEligibility";

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

export default function DashboardPage() {
  const PAGE_SIZE = 100;
  const { orders, upsertOrder, pushToast } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading, upsertOrder: upsertRemoteOrder } = useOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: paymentAgents, isLoading: paymentAgentsLoading, applyOrderSettlement, reverseOrderSettlement, recalculateFromOrders } = usePaymentAgents();
  const ordersSource = ordersDataSource();
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter(isDashboardOrder);
  }, [isFirebaseOrdersMode, remoteOrders, orders]);
  const stats = getDashboardStats(sourceOrders);
  const rows = getDashboardRows(sourceOrders, [], customers, paymentAgents);
  const [query, setQuery] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<null | { orders: number; products: number; paymentAgents: number; paymentAgentLedger: number; customerLedger: number; customers: number; settings?: number }>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const { canManageMaintenance } = useBusinessAccess();
  const router = useRouter();
  const filtered = useMemo(() => rows.filter((r) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const haystack = [
      r.orderNumber,
      r.customerSummary,
      r.paidBy,
      r.paymentAgentId,
      r.wechatId,
      r.status,
      r.loadingDate,
      r.orderDate,
      String(r.orderTotal ?? ""),
      String(r.totalUniqueItems ?? ""),
      String(r.totalCtns ?? ""),
      r.productsSummary,
      r.markaSummary,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  }), [rows, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);
  const viewOrder = sourceOrders.find((o) => o.id === viewOrderId) ?? null;
  const canConfirmReset = confirmText === "DELETE EVERYTHING";
  const canSeeDevReset = isDevResetEnabled() && (!isAuthRequiredModeEnabled() || canManageMaintenance);
  const formatPlainAmount = (value: number) => formatAmount(value);
  useEffect(() => { logPageAccess("Dashboard", { component: "app/dashboard/page.tsx", source: ordersSource }); }, []);
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  const businessId = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

  useEffect(() => {
    setRowEdits((prev) => {
      const next: Record<string, RowEditState> = {};
      sourceOrders.forEach((order) => {
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
  }, [sourceOrders]);

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
      if (trace === "date_selected") {
} else {
}
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
    const updated = { ...order, loadingDate: pending.loadingDate, status: pending.status, updatedAt: new Date().toISOString() };
    setRowEdits((prev) => ({ ...prev, [order.id]: { ...pending, saving: true } }));


try {
      if (isFirebaseOrdersMode) {
        await upsertRemoteOrder(updated);
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
pushToast({ tone: "danger", text: "Failed to save row changes." });
    }
  };

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Orders" value={stats.totalOrders.toString()} icon={<ClipboardList size={16} />} />
          <StatCard label="Total Amount" value={formatPlainAmount(stats.totalOrderAmount)} icon={<TrendingUp size={16} />} />
          <StatCard label="Orders Loading Today" value={stats.ordersLoadingToday.toString()} icon={<CalendarDays size={16} />} />
          <StatCard label="Pending Payments" value={stats.pendingPayments.toString()} icon={<Package size={16} />} />
          <StatCard label="Delayed Shipments" value={stats.delayedShipments.toString()} icon={<Filter size={16} />} />
        </div>
        {isFirebaseOrdersMode && ordersLoading ? <div className="card p-4 text-sm text-fg-subtle">Loading dashboard orders from Firestore…</div> : null}

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[260px] flex-1"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by order no., customer..." leadingIcon={<Search size={14} />} /></div>
          <Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase."><Filter size={14} />Filter</Button>
          <button disabled className="btn btn-secondary py-1.5 px-3 text-[13px] rounded-lg opacity-60"><CalendarDays size={14} />01 May 2025 - 31 May 2025</button>
          <Button size="sm" variant="secondary" disabled title="Export is not enabled in this phase."><Download size={14} />Export</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Order Number</th><th>Total Unique Items</th><th>Order Total</th><th>Paid By</th><th>Loading Date</th><th>Status</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.id} className="border-t border-border/80 hover:bg-bg-subtle/40 transition-colors">
                    {(() => {
                      const target = sourceOrders.find((o) => o.id === r.id);
                      if (!target) return null;
                      const rowValue = getRowValue(target);
                      const rowDirty = rowValue.loadingDate !== target.loadingDate || rowValue.status !== target.status;

return (
                        <>
                    <td className="px-4 py-3"><div className="font-semibold">{r.orderNumber}</div><div className="text-[11.5px] text-fg-subtle truncate max-w-[240px]">{r.paidBy}</div></td>
                    <td><span className="rounded-full bg-bg-subtle px-2 py-1 text-[11.5px]">{r.totalUniqueItems} {r.totalUniqueItems === 1 ? "Item" : "Items"}</span></td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatPlainAmount(r.orderTotal)}</td>
                    <td><div className="text-[12.5px]">{r.paidBy}</div></td>
                    <td>
                      <LoadingDateControl
                        debugOrderId={target.id}
                        value={rowValue.loadingDate}
                        onChange={(next) => {
                          setRowEdit(target, { loadingDate: next }, "date_selected");
                        }}
                      />
                    </td>
                    <td>
                      <OrderStatusControl
                        debugOrderId={target.id}
                        options={resolveStatusOptions(target, rowValue)}
                        value={rowValue.status}
                        onChange={(next) => {
                          setRowEdit(target, { status: next }, "status_selected");
                        }}
                      />
                    </td>
                    <td className="px-4"><div className="flex justify-end gap-1.5">{rowDirty ? <Button size="sm" variant="primary" title="Save row changes" disabled={rowValue.saving} onClick={() => { void saveRowEdit(target); }}>{rowValue.saving ? "Saving..." : "Save"}</Button> : null}<Button size="sm" variant="secondary" title="View details" onClick={() => setViewOrderId(r.id)}><Eye size={13} /></Button><Button size="sm" variant="secondary" title="Open in Orders" onClick={() => router.push(`/orders?edit=${r.id}`)}><SquarePen size={13} /></Button></div></td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
                {pagedRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No matching orders found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination total={filtered.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="orders" />
        </div>
        {canSeeDevReset ? <div className="card p-4 border border-red-500/40">
          <div className="text-sm font-semibold text-red-300 mb-2">Developer Tools</div>
          <div className="text-xs text-fg-subtle mb-3">Danger zone. This is for development/testing only.</div>
          <Button variant="secondary" className="border-red-400 text-red-300" onClick={() => { setShowReset(true); setResetResult(null); setResetError(null); }}>Delete Everything</Button>
          {showReset ? <div className="mt-4 rounded border border-red-500/40 p-3 space-y-3">
            <div className="text-xs text-fg-subtle">This deletes Firestore records under <span className="font-semibold">businesses/{businessId}</span> only. Requires Firestore rules allowing delete for signed-in owner/admin members.</div>
            <ul className="text-xs list-disc pl-5 text-fg-subtle">
              <li>orders</li><li>products</li><li>paymentAgents</li><li>paymentAgentLedger</li><li>customerLedger</li><li>customers</li>
            </ul>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={includeSettings} onChange={(e) => setIncludeSettings(e.target.checked)} /> Also delete settings</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "DELETE EVERYTHING" to confirm' />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowReset(false)}>Cancel</Button>
              <Button variant="primary" disabled={!canConfirmReset || resetBusy} onClick={async () => {
                setResetBusy(true); setResetError(null); setResetResult(null);
                try { const res = await runDevReset({ includeSettings }); setResetResult(res); }
                catch (e) { setResetError(e instanceof Error ? e.message : "Delete failed."); }
                finally { setResetBusy(false); }
              }}>{resetBusy ? "Deleting..." : "Confirm Delete Everything"}</Button>
            </div>
            {resetError ? <div className="text-xs text-red-300">{resetError}</div> : null}
            {resetResult ? <div className="text-xs text-fg-subtle space-y-1">
              <div>Delete complete. Refresh the app to see clean state.</div>
              <div>orders: {resetResult.orders}</div>
              <div>products: {resetResult.products}</div>
              <div>paymentAgents: {resetResult.paymentAgents}</div>
              <div>paymentAgentLedger: {resetResult.paymentAgentLedger}</div>
              <div>customerLedger: {resetResult.customerLedger}</div>
              <div>customers: {resetResult.customers}</div>
              {typeof resetResult.settings === "number" ? <div>settings: {resetResult.settings}</div> : null}
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload App</Button>
            </div> : null}
          </div> : null}
        </div> : null}
      </div>
      <OrderLinesDetailModal order={viewOrder} isOpen={!!viewOrder} onClose={() => setViewOrderId(null)} />
    </PageShell>
  );
}
