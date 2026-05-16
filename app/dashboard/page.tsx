"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { getDashboardRows, getDashboardStats } from "@/services/selectors";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CalendarDays, ClipboardList, Download, Filter, Package, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { isDevResetEnabled, runDevReset } from "@/services/devResetService";
import { useRouter } from "next/navigation";
import { OrderLinesDetailModal } from "@/components/orders/OrderLinesDetailModal";

export default function DashboardPage() {
  const { orders, pushToast } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading } = useOrders();
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: paymentAgents } = usePaymentAgents();
  const ordersSource = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock";
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter((o) => o.status !== "archived");
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
  const router = useRouter();
  const filtered = useMemo(() => rows.filter((r) => [r.orderNumber, r.customerSummary, r.supplierSummary].join(" ").toLowerCase().includes(query.toLowerCase().trim())), [rows, query]);
  const viewOrder = sourceOrders.find((o) => o.id === viewOrderId) ?? null;
  const canConfirmReset = confirmText === "DELETE EVERYTHING";
  const businessId = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

  return (
    <PageShell title="Dashboard">
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Orders" value={stats.totalOrders.toString()} icon={<ClipboardList size={16} />} />
          <StatCard label="Total Order Amount" value={formatAmount(stats.totalOrderAmount)} icon={<TrendingUp size={16} />} />
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
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Order Number</th><th>Total Unique Items</th><th>Order Total</th><th>Paid By</th><th>Loading Date</th><th>Status</th><th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="font-semibold">{r.orderNumber}</div><div className="text-[11.5px] text-fg-subtle truncate max-w-[240px]">{r.supplierSummary}</div></td>
                    <td><span className="rounded-full bg-bg-subtle px-2 py-1 text-[11.5px]">{r.totalUniqueItems} Items</span></td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatAmount(r.orderTotal)}</td>
                    <td><div>{r.paidBy}</div></td>
                    <td><span className="rounded-md border border-border px-2 py-1 text-[12px]">{r.loadingDate ? formatDate(r.loadingDate) : "—"}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setViewOrderId(r.id)}>View Details</Button><Button size="sm" variant="secondary" onClick={() => router.push(`/orders?edit=${r.id}`)}>Edit Order</Button></div></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No matching orders found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination total={filtered.length} />
        </div>
        {isDevResetEnabled() ? <div className="card p-4 border border-red-500/40">
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
