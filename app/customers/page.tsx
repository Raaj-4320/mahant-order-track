"use client";

import { PageShell } from "@/components/PageShell";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { formatAmount } from "@/lib/data";
import { isAnyFirebaseModeEnabled, isMaintenanceToolsEnabled } from "@/lib/runtimeConfig";
import { useStore } from "@/lib/store";
import type { CustomerLedgerEntry } from "@/lib/types";
import { customerLedgerService } from "@/services/customerLedgerService";
import { getCustomerCurrentReceivable, getCustomerStoreCredit, getCustomerTotalOrders, getCustomerTotalReceived, getCustomerTotalReceivable } from "@/services/customers/customerFinance";
import { Download, Filter, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow, logUI } from "@/lib/logger";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";

const typeLabel = (type: CustomerLedgerEntry["type"]) => {
  if (type === "order_receivable") return "Order Receivable";
  if (type === "order_receivable_reversal") return "Receivable Reversal";
  if (type === "customer_payment") return "Customer Payment";
  return "Payment Reversal";
};

export default function CustomersPage() {
  const { orders: localOrders, pushToast } = useStore();
  const { canManageMaintenance } = useBusinessAccess();
  const { data: customers, isLoading, error, recordPaymentToCustomer, deleteCustomer, reload } = useCustomers();
  const { data: firebaseOrders } = useOrders();
  const base = customers;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [viewCustomerId, setViewCustomerId] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [payCustomerId, setPayCustomerId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteCtx, setDeleteCtx] = useState<null | {
    customerId: string;
    customerName: string;
    status: string;
    currentReceivable: number;
    storeCredit: number;
    orderHistoryCount: number;
    ledgerHistoryCount: number;
    riskDetected: boolean;
  }>(null);

  useEffect(() => { logPageAccess("Customers", { component: "app/customers/page.tsx", source: process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock" }); }, []);

  const scopeBase = useMemo(() => base.filter((c) => status === "all" || c.status === status), [base, status]);
  const filtered = useMemo(
    () => scopeBase.filter((c) => [c.name, c.phone, c.wechatId, c.city].join(" ").toLowerCase().includes(q.toLowerCase().trim())),
    [scopeBase, q]
  );

  const customersFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (customersFlowLoggedRef.current) return;
    if (isLoading) return;
    customersFlowLoggedRef.current = true;
    logDataFlow("Customers", {
      functionsCalled: ["useCustomers.reload", "customersService.listCustomers"],
      dbPaths: ["businesses/{businessId}/customers"],
      result: { count: base.length, renderedRows: filtered.length, reachedComponent: true },
      totals: {
        totalReceivable: base.reduce((s, c) => s + getCustomerTotalReceivable(c), 0),
        currentReceivable: base.reduce((s, c) => s + getCustomerCurrentReceivable(c), 0),
        totalReceived: base.reduce((s, c) => s + getCustomerTotalReceived(c), 0),
        storeCredit: base.reduce((s, c) => s + getCustomerStoreCredit(c), 0),
      },
      sampleCustomers: base.slice(0, 5).map((c) => ({ id: c.id, name: c.displayName || c.name, totalOrders: getCustomerTotalOrders(c), totalReceivable: getCustomerTotalReceivable(c), currentReceivable: getCustomerCurrentReceivable(c), totalReceived: getCustomerTotalReceived(c), storeCredit: getCustomerStoreCredit(c) })),
      staleCustomers: base.filter((c) => getCustomerTotalOrders(c) > 0 && getCustomerTotalReceivable(c) === 0).length,
      customersWithOrdersButZeroReceivable: base.filter((c) => getCustomerTotalOrders(c) > 0 && getCustomerTotalReceivable(c) === 0).length,
      visibleActionsSummary: ["Recalculate Customer Totals (firebase only)", "Receive Payment", "Statement"],
    });
  }, [isLoading, base, filtered.length]);

  const hiddenInactiveCount = base.filter((c) => c.status !== "active").length;
  const kpiScopeLabel = status === "all" ? "All status" : status === "active" ? "Active only" : "Inactive only";
  const scopeTitle = status === "all" ? "Total Customers" : status === "active" ? "Active Customers" : "Inactive Customers";
  const totals = useMemo(() => ({
    totalCustomers: scopeBase.length,
    totalOrders: scopeBase.reduce((s, c) => s + getCustomerTotalOrders(c), 0),
    totalReceivable: scopeBase.reduce((s, c) => s + getCustomerTotalReceivable(c), 0),
    currentReceivable: scopeBase.reduce((s, c) => s + getCustomerCurrentReceivable(c), 0),
    storeCredit: scopeBase.reduce((s, c) => s + getCustomerStoreCredit(c), 0),
  }), [scopeBase]);
  const firebaseMode = isAnyFirebaseModeEnabled();
  const canSeeMaintenanceTools = isMaintenanceToolsEnabled() || canManageMaintenance;
  const viewCustomer = base.find((c) => c.id === viewCustomerId) ?? null;
  const payCustomer = base.find((c) => c.id === payCustomerId) ?? null;

  useEffect(() => {
    if (!payCustomer) return;
    const helperReceivable = getCustomerCurrentReceivable(payCustomer);
    if ((payCustomer.currentReceivable ?? payCustomer.outstandingAmount ?? 0) !== helperReceivable) {
      logUI("customer_summary_maybe_stale", { customerId: payCustomer.id, helperReceivable, rawCurrentReceivable: payCustomer.currentReceivable, rawOutstandingAmount: payCustomer.outstandingAmount });
    }
    logUI("customer_receive_payment_modal_open", {
      customerId: payCustomer.id,
      currentReceivable: getCustomerCurrentReceivable(payCustomer),
      rawCurrentReceivable: payCustomer.currentReceivable,
      rawOutstandingAmount: payCustomer.outstandingAmount,
      totalReceived: getCustomerTotalReceived(payCustomer),
      storeCreditBalance: getCustomerStoreCredit(payCustomer),
    });
  }, [payCustomer]);

  const openStatement = async (customerId: string) => {
    setViewCustomerId(customerId);
    setLedgerError(null);
    try {
      setLedgerRows(await customerLedgerService.listCustomerLedgerEntries(customerId));
    } catch (e) {
      setLedgerRows([]);
      setLedgerError(e instanceof Error ? e.message : "Failed to load statement.");
    }
  };

  const submitPayment = async () => {
    if (!payCustomerId) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return pushToast({ tone: "danger", text: "Payment amount must be greater than 0." });
    try {
      await recordPaymentToCustomer(payCustomerId, { amount, paymentDate: payDate, note: payNote || undefined });
      await reload();
      if (viewCustomerId === payCustomerId) await openStatement(payCustomerId);
      setPayCustomerId(null);
      setPayAmount("");
      setPayNote("");
      setPayDate(new Date().toISOString().slice(0, 10));
      pushToast({ tone: "success", text: "Customer payment recorded." });
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not record payment." });
    }
  };
  const removeCustomer = async (customerId: string) => {
    const customer = base.find((c) => c.id === customerId);
    if (!customer) return;
    const totalOrders = getCustomerTotalOrders(customer);
    const totalReceivable = getCustomerTotalReceivable(customer);
    const totalReceived = getCustomerTotalReceived(customer);
    const currentReceivable = getCustomerCurrentReceivable(customer);
    const storeCredit = getCustomerStoreCredit(customer);
    const safeCustomerSummary = {
      id: customer.id,
      displayName: customer.displayName,
      name: customer.name,
      status: customer.status,
      customerCode: customer.customerCode,
      phone: customer.phone ? "***" : undefined,
      wechatId: customer.wechatId ? "***" : undefined,
      email: customer.email ? "***" : undefined,
      country: customer.country,
      city: customer.city,
      totals: { totalOrders, totalReceivable, totalReceived, currentReceivable, storeCredit },
    };
    console.log("[CUSTOMER_DELETE_TRACE] click", JSON.stringify({
      customerId,
      customerName: customer.displayName || customer.name,
      status: customer.status,
      customerSummary: safeCustomerSummary,
      helperValues: { totalOrders, totalReceivable, totalReceived, currentReceivable, storeCredit },
    }, null, 2));
    console.log("[CUSTOMER_DELETE_TRACE] safety_check_start", JSON.stringify({
      customerId,
      checks: ["receivable_balance", "store_credit_balance", "saved_order_history", "ledger_history"],
    }, null, 2));
    console.log("[CUSTOMER_DELETE_TRACE] balance_check_result", JSON.stringify({
      customerId,
      currentReceivable,
      storeCredit,
      blocksDueToReceivable: currentReceivable > 0,
      blocksDueToStoreCredit: storeCredit > 0,
    }, null, 2));
    const sourceOrders = process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE === "firebase" ? firebaseOrders : localOrders;
    const customerName = (customer.displayName || customer.name || "").trim().toLowerCase();
    const matchedSavedOrders = sourceOrders
      .filter((o) => o.status === "saved")
      .filter((o) => o.lines.some((l) => l.customerId === customerId || ((l.customerName || "").trim().toLowerCase() === customerName)));
    const orderHistoryCount = matchedSavedOrders.length;
    const orderMatchDetails = matchedSavedOrders.slice(0, 20).map((o) => ({
      orderNumber: o.orderNumber,
      matchedBy: o.lines.some((l) => l.customerId === customerId) ? "customerId" : "customerName",
    }));
    console.log("[CUSTOMER_DELETE_TRACE] order_history_check_result", JSON.stringify({
      customerId,
      customerName,
      matchedOrdersCount: orderHistoryCount,
      matchedOrderNumbers: orderMatchDetails.map((x) => x.orderNumber),
      matchMethod: ["customerId", "customerName", "normalized_name"],
      matchDetails: orderMatchDetails,
    }, null, 2));
    let ledgerHistoryCount = 0;
    let ledgerSample: Array<{ id: string; type: string; amount: number }> = [];
    console.log("[CUSTOMER_DELETE_TRACE] ledger_history_check_start", JSON.stringify({ customerId }, null, 2));
    try {
      const ledgerRows = await customerLedgerService.listCustomerLedgerEntries(customerId);
      ledgerHistoryCount = ledgerRows.length;
      ledgerSample = ledgerRows.slice(0, 10).map((entry) => ({ id: entry.id, type: entry.type, amount: Number(entry.amount || 0) }));
    } catch (e) {
      console.log("[CUSTOMER_DELETE_TRACE] ledger_history_check_result", JSON.stringify({
        customerId,
        ledgerCount: -1,
        error: e instanceof Error ? e.message : String(e),
        sampleLedgerEntries: [],
        blocksDueToLedger: false,
      }, null, 2));
    }
    console.log("[CUSTOMER_DELETE_TRACE] ledger_history_check_result", JSON.stringify({
      customerId,
      ledgerCount: ledgerHistoryCount,
      sampleLedgerEntries: ledgerSample,
      blocksDueToLedger: ledgerHistoryCount > 0,
    }, null, 2));
    const riskDetected = currentReceivable > 0 || storeCredit > 0 || totalOrders > 0 || orderHistoryCount > 0 || ledgerHistoryCount > 0;
    if (riskDetected) {
      const riskPayload = { customerId, currentReceivable, storeCredit, totalOrders, orderHistoryCount, ledgerHistoryCount };
      logUI("customer_delete_blocked", { ...riskPayload, reason: "risk_detected_requires_force_confirmation" });
      logUI("customer_delete_risk_detected", riskPayload);
      logUI("customer_delete_force_confirm_opened", riskPayload);
      logUI("customer_delete_modal_opened", { customerId, riskDetected: true });
      setDeleteTyped("");
      setDeleteCtx({
        customerId,
        customerName: customer.displayName || customer.name || customerId,
        status: customer.status,
        currentReceivable,
        storeCredit,
        orderHistoryCount: Math.max(totalOrders, orderHistoryCount),
        ledgerHistoryCount,
        riskDetected: true,
      });
      setDeleteModalOpen(true);
      return;
    } else {
      logUI("customer_delete_modal_opened", { customerId, riskDetected: false });
      setDeleteTyped("");
      setDeleteCtx({
        customerId,
        customerName: customer.displayName || customer.name || customerId,
        status: customer.status,
        currentReceivable,
        storeCredit,
        orderHistoryCount: Math.max(totalOrders, orderHistoryCount),
        ledgerHistoryCount,
        riskDetected: false,
      });
      setDeleteModalOpen(true);
      return;
    }
  };

  const confirmDeleteCustomer = async () => {
    if (!deleteCtx) return;
    if (deleteCtx.riskDetected && deleteTyped !== "DELETE CUSTOMER") return;
    if (deleteCtx.riskDetected) logUI("customer_delete_force_confirmed", { customerId: deleteCtx.customerId });
    logUI("customer_delete_started", JSON.parse(JSON.stringify({ customerId: deleteCtx.customerId, status: deleteCtx.status }, null, 2)));
    try {
      console.log("[CUSTOMER_DELETE_TRACE] service_delete_start", JSON.stringify({ customerId: deleteCtx.customerId, source: process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? (process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock") }, null, 2));
      await deleteCustomer(deleteCtx.customerId);
      logUI("customer_delete_success", JSON.parse(JSON.stringify({ customerId: deleteCtx.customerId }, null, 2)));
      pushToast({ tone: "success", text: deleteCtx.riskDetected ? "Customer deleted. Historical orders and ledger entries were kept." : `Customer ${deleteCtx.customerName} deleted.` });
    } catch (e) {
      logUI("customer_delete_failed", JSON.parse(JSON.stringify({ customerId: deleteCtx.customerId, error: e instanceof Error ? e.message : String(e) }, null, 2)));
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not delete customer." });
    }
    setDeleteModalOpen(false);
    setDeleteCtx(null);
    setDeleteTyped("");
  };

  const statementRows = [...ledgerRows].sort((a, b) => (a.paymentDate || a.createdAt || "").localeCompare(b.paymentDate || b.createdAt || ""));

  let running = 0;

  return (
    <PageShell title="Customers">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1">
            <StatCard label={`${scopeTitle} (${kpiScopeLabel})`} value={totals.totalCustomers.toString()} icon={<Users size={16} />} />
            <StatCard label={`Total Orders (${kpiScopeLabel})`} value={totals.totalOrders.toString()} />
            <StatCard label={`Total Receivable (${kpiScopeLabel})`} value={formatAmount(totals.totalReceivable)} />
            <StatCard label={`Current Receivable (${kpiScopeLabel})`} value={formatAmount(totals.currentReceivable)} />
            <StatCard label={`Store Credit (${kpiScopeLabel})`} value={formatAmount(totals.storeCredit)} />
          </div>
          <div className="ml-3 flex gap-2">
            {firebaseMode && canSeeMaintenanceTools ? <Button onClick={async () => { try { await customerLedgerService.recalculateAllCustomersFromLedger(); await reload(); pushToast({ tone: "success", text: "Customer totals recalculated from ledger." }); } catch (e) { pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not recalculate customer totals." }); } }} variant="secondary"><Plus size={14} />Recalculate Customer Totals</Button> : null}
                        <Button disabled title="Manual customer creation is not enabled. Customers are created from saved orders." variant="primary"><Plus size={14} />Add Customer</Button>
          </div>
        </div>
        {status === "active" && hiddenInactiveCount > 0 ? <div className="text-[12px] text-fg-subtle">{hiddenInactiveCount} inactive customers are hidden by the Active filter.</div> : null}

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by customer name, phone, wechat id, city..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <div className="w-[160px]"><Select value="all" disabled options={[{ value: "all", label: "All Locations" }]} /></div>
          <Button disabled title="Additional filtering is not enabled in this phase." size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button disabled title="Export is not enabled in this phase." size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>
        {error && <div className="text-[12px] text-fg-subtle">{error}</div>}
        
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[13px]"><thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Customer</th><th>Contact</th><th>Location</th><th>Total Orders</th><th>Total Receivable</th><th>Total Received</th><th>Current Receivable</th><th>Store Credit</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>{filtered.map((c) => <tr key={c.id} className="border-t border-border"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[12px] font-semibold">{c.displayName.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div><div><div className="font-semibold">{c.displayName}</div><div className="text-[11.5px] text-fg-subtle">{c.customerCode}</div></div></div></td><td><div>{c.phone || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.wechatId || c.email || "—"}</div></td><td><div>{c.country || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.city || "—"}</div></td><td>{getCustomerTotalOrders(c)}</td><td className="font-semibold text-[var(--success)] tabular-nums">{formatAmount(getCustomerTotalReceivable(c))}</td><td className="tabular-nums">{formatAmount(getCustomerTotalReceived(c))}</td><td className="tabular-nums">{formatAmount(getCustomerCurrentReceivable(c))}</td><td className="tabular-nums">{formatAmount(getCustomerStoreCredit(c))}</td><td><StatusBadge status={c.status} /></td><td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setPayCustomerId(c.id)}>Receive Payment</Button><Button size="sm" variant="secondary" onClick={() => openStatement(c.id)}>Statement</Button><Button size="sm" variant="secondary" onClick={() => removeCustomer(c.id)} title="Delete customer if balances are zero and no order/ledger history exists.">Delete</Button></div></td></tr>)}{isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-fg-subtle">Loading customers…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-fg-subtle">{base.length > 0 ? "No customers match filter." : (firebaseMode ? "No customers yet. Customer records will appear here when added." : "No customers found.")}</td></tr>}</tbody></table>
          </div>
          <TablePagination total={filtered.length} />
        </div>

        {viewCustomer ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-6xl p-4 space-y-3"><div className="flex justify-between items-center"><div className="text-lg font-semibold">{viewCustomer.displayName} Statement</div><Button size="sm" variant="secondary" onClick={() => setViewCustomerId(null)}>Close</Button></div>{ledgerError ? <div className="text-sm text-red-400">{ledgerError}</div> : null}<div className="grid grid-cols-2 md:grid-cols-4 gap-2"><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Total Receivable</div><div className="text-xl font-semibold">{formatAmount(getCustomerTotalReceivable(viewCustomer))}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Total Received</div><div className="text-xl font-semibold">{formatAmount(getCustomerTotalReceived(viewCustomer))}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Current Receivable</div><div className="text-xl font-bold">{formatAmount(getCustomerCurrentReceivable(viewCustomer))}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Store Credit</div><div className="text-xl font-semibold">{formatAmount(getCustomerStoreCredit(viewCustomer))}</div></div></div><div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[980px] text-[12px]"><thead className="bg-bg-subtle"><tr className="text-left uppercase text-fg-subtle"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Debit</th><th className="px-2 py-2 text-right">Credit</th><th className="px-2 py-2 text-right">Balance</th></tr></thead><tbody>{statementRows.map((r) => { const debit = r.debit ?? (r.type === "order_receivable" ? r.amount : 0); const credit = r.credit ?? (r.type === "order_receivable_reversal" || r.type === "customer_payment" || r.type === "customer_payment_reversal" ? r.amount : 0); running += debit - credit; return <tr key={r.id} className="border-t border-border"><td className="px-2 py-2">{new Date((r.paymentDate || r.createdAt)).toLocaleDateString()}</td><td className="px-2 py-2">{typeLabel(r.type)}</td><td className="px-2 py-2">{r.sourceOrderNumber || r.sourceOrderId || "—"}</td><td className="px-2 py-2">{r.note || "—"}</td><td className="px-2 py-2 text-right">{debit ? formatAmount(debit) : "—"}</td><td className="px-2 py-2 text-right">{credit ? formatAmount(credit) : "—"}</td><td className="px-2 py-2 text-right font-semibold">{formatAmount(running)}</td></tr>; })}{statementRows.length === 0 ? <tr><td colSpan={7} className="px-2 py-6 text-center text-fg-subtle">No statement entries.</td></tr> : null}</tbody></table></div></div></div> : null}

        {payCustomerId ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Receive Payment</div>{payCustomer ? <div className="rounded border border-border p-2 text-sm"><div><span className="text-fg-subtle">Customer:</span> {payCustomer.displayName}</div><div><span className="text-fg-subtle">Current Receivable:</span> {formatAmount(getCustomerCurrentReceivable(payCustomer))}</div><div><span className="text-fg-subtle">Store Credit:</span> {formatAmount(getCustomerStoreCredit(payCustomer))}</div></div> : null}<Input type="number" min={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Payment Amount" /><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /><Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Note (optional)" /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPayCustomerId(null)}>Cancel</Button><Button variant="primary" onClick={submitPayment}>Save Payment</Button></div></div></div> : null}
        {deleteModalOpen && deleteCtx ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-2xl p-4 space-y-3"><div className="text-lg font-semibold">{deleteCtx.riskDetected ? "Delete customer with financial/history records?" : "Delete Customer?"}</div>{deleteCtx.riskDetected ? <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm space-y-1"><div><span className="text-fg-subtle">Customer:</span> {deleteCtx.customerName}</div><div><span className="text-fg-subtle">Current Receivable:</span> {formatAmount(deleteCtx.currentReceivable)}</div><div><span className="text-fg-subtle">Store Credit:</span> {formatAmount(deleteCtx.storeCredit)}</div><div><span className="text-fg-subtle">Order history count:</span> {deleteCtx.orderHistoryCount}</div><div><span className="text-fg-subtle">Ledger history count:</span> {deleteCtx.ledgerHistoryCount}</div><div className="pt-2 text-[12px] text-fg-subtle">Deleting this customer will remove the customer record only. Existing orders and ledger entries will remain for audit history.</div></div> : <div className="text-sm text-fg-subtle">This will permanently delete the customer record.</div>}{deleteCtx.riskDetected ? <div><div className="text-xs text-fg-subtle mb-1">Type DELETE CUSTOMER to continue</div><Input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="DELETE CUSTOMER" /></div> : null}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { if (deleteCtx.riskDetected) logUI("customer_delete_force_cancelled", { customerId: deleteCtx.customerId, typedValuePresent: Boolean(deleteTyped) }); logUI("customer_delete_modal_cancelled", { customerId: deleteCtx.customerId, riskDetected: deleteCtx.riskDetected }); setDeleteModalOpen(false); setDeleteCtx(null); setDeleteTyped(""); }}>Cancel</Button><Button variant="primary" disabled={deleteCtx.riskDetected && deleteTyped !== "DELETE CUSTOMER"} onClick={confirmDeleteCustomer}>Delete Customer</Button></div></div></div> : null}
      </div>
    </PageShell>
  );
}
