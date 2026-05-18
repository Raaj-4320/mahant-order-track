"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { Order } from "@/lib/types";
import { getDashboardIncludedStatuses, getDashboardRows, getDashboardStats, isDashboardOrder } from "@/services/selectors";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CalendarDays, ClipboardList, Download, Eye, Filter, Package, Search, SquarePen, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow } from "@/lib/logger";
import { runDevReset } from "@/services/devResetService";
import { isAuthRequiredModeEnabled, isDevResetEnabled } from "@/lib/runtimeConfig";
import { useRouter } from "next/navigation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";

export default function DashboardPage() {
  const { orders, upsertOrder, pushToast } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading, upsertOrder: upsertRemoteOrder, reload: reloadRemoteOrders } = useOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: paymentAgents, isLoading: paymentAgentsLoading } = usePaymentAgents();
  const ordersSource = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock";
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter(isDashboardOrder);
  }, [isFirebaseOrdersMode, remoteOrders, orders]);
  const stats = getDashboardStats(sourceOrders);
  const rows = getDashboardRows(sourceOrders, suppliers, customers, paymentAgents);
  const [query, setQuery] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<null | { orders: number; products: number; paymentAgents: number; paymentAgentLedger: number; customerLedger: number; customers: number; settings?: number }>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const { canManageMaintenance } = useBusinessAccess();
  const router = useRouter();
  const filtered = useMemo(() => rows.filter((r) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const haystack = [
      r.orderNumber,
      r.customerSummary,
      r.supplierSummary,
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
  const viewOrder = sourceOrders.find((o) => o.id === viewOrderId) ?? null;
  const canConfirmReset = confirmText === "DELETE EVERYTHING";
  const canSeeDevReset = isDevResetEnabled() && (!isAuthRequiredModeEnabled() || canManageMaintenance);
  const formatPlainAmount = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  useEffect(() => { logPageAccess("Dashboard", { component: "app/dashboard/page.tsx", source: ordersSource }); }, []);
  const dashboardFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (dashboardFlowLoggedRef.current) return;
    if (ordersLoading || customersLoading || suppliersLoading || paymentAgentsLoading) return;
    dashboardFlowLoggedRef.current = true;
    const allOrders = isFirebaseOrdersMode ? remoteOrders : orders;
    const excludedDrafts = allOrders.filter((o) => o.status === "draft").length;
    const excludedArchived = allOrders.filter((o) => o.status === "archived").length;
    logDataFlow("Dashboard", { functionsCalled:["useOrders.reload","useCustomers.reload","useSuppliers.reload","usePaymentAgents.reload"], dbPaths:["businesses/{businessId}/orders"], result:{reachedComponent:true,recentOrdersCount:filtered.length}, counts:{totalOrdersLoaded:allOrders.length,dashboardEligibleOrders:sourceOrders.length,excludedDrafts,excludedArchived,totalOrders:stats.totalOrders,totalOrderAmount:stats.totalOrderAmount,pendingPayments:stats.pendingPayments,delayedShipments:stats.delayedShipments,statusesIncluded:getDashboardIncludedStatuses()}, visibleActionsSummary:["View Details","Open Order Edit from Orders page"] });
  }, [ordersLoading, customersLoading, suppliersLoading, paymentAgentsLoading, filtered.length, stats.totalOrders, stats.totalOrderAmount, stats.pendingPayments, stats.delayedShipments, isFirebaseOrdersMode, remoteOrders, orders, sourceOrders.length]);
  const businessId = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

  const updateOrderField = async (order: Order, patch: Partial<Order>) => {
    const updated = { ...order, ...patch, updatedAt: new Date().toISOString() };
    if (isFirebaseOrdersMode) {
      await upsertRemoteOrder(updated);
      await reloadRemoteOrders();
      return;
    }
    upsertOrder(updated);
  };

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Orders" value={stats.totalOrders.toString()} icon={<ClipboardList size={16} />} />
          <StatCard label="Total Order Amount" value={formatPlainAmount(stats.totalOrderAmount)} icon={<TrendingUp size={16} />} />
          <StatCard label="Orders Loading Today" value={stats.ordersLoadingToday.toString()} icon={<CalendarDays size={16} />} />
          <StatCard label="Pending Payments" value={stats.pendingPayments.toString()} icon={<Package size={16} />} />
          <StatCard label="Delayed Shipments" value={stats.delayedShipments.toString()} icon={<Filter size={16} />} />
        </div>
        {isFirebaseOrdersMode && ordersLoading ? <div className="card p-4 text-sm text-fg-subtle">Loading dashboard orders from Firestore…</div> : null}

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[260px] flex-1"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by order no., customer, supplier..." leadingIcon={<Search size={14} />} /></div>
          <Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase."><Filter size={14} />Filter</Button>
          <button disabled className="btn btn-secondary py-1.5 px-3 text-[13px] rounded-lg opacity-60"><CalendarDays size={14} />01 May 2025 - 31 May 2025</button>
          <Button size="sm" variant="secondary" disabled title="Export is not enabled in this phase."><Download size={14} />Export</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Order Number</th><th>Total Unique Items</th><th>Order Total</th><th>Paid By</th><th>Loading Date</th><th>Status</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border/80 hover:bg-bg-subtle/40 transition-colors">
                    <td className="px-4 py-3"><div className="font-semibold">{r.orderNumber}</div><div className="text-[11.5px] text-fg-subtle truncate max-w-[240px]">{r.paidBy || "Deleted payment agent"}</div></td>
                    <td><span className="rounded-full bg-bg-subtle px-2 py-1 text-[11.5px]">{r.totalUniqueItems} {r.totalUniqueItems === 1 ? "Item" : "Items"}</span></td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatPlainAmount(r.orderTotal)}</td>
                    <td><div className="text-[12.5px]">{r.paidBy || "Deleted payment agent"}</div></td>
                    <td>
                      <input
                        type="date"
                        className="input h-8 text-[12px] rounded-full px-3"
                        value={r.loadingDate ?? ""}
                        onChange={(e) => {
                          const target = sourceOrders.find((o) => o.id === r.id);
                          if (!target) return;
                          void updateOrderField(target, { loadingDate: e.target.value || undefined });
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="input h-8 text-[12px] rounded-full px-3"
                        value={r.status}
                        onChange={(e) => {
                          const target = sourceOrders.find((o) => o.id === r.id);
                          if (!target) return;
                          void updateOrderField(target, { status: e.target.value as Order["status"] });
                        }}
                      >
                        <option value="saved">saved</option>
                        <option value="loading">loading</option>
                        <option value="shipped">shipped</option>
                        <option value="received">received</option>
                        <option value="completed">completed</option>
                        <option value="cancelled">cancelled</option>
                        <option value="delayed">delayed</option>
                      </select>
                    </td>
                    <td className="px-4"><div className="flex justify-end gap-1.5"><Button size="sm" variant="secondary" title="View details" onClick={() => setViewOrderId(r.id)}><Eye size={13} /></Button><Button size="sm" variant="secondary" title="Open in Orders" onClick={() => router.push(`/orders?edit=${r.id}`)}><SquarePen size={13} /></Button></div></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No matching orders found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination total={filtered.length} />
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
