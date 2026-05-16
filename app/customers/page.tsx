"use client";

import { PageShell } from "@/components/PageShell";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCustomers } from "@/hooks/useCustomers";
import { formatAmount } from "@/lib/data";
import { isAnyFirebaseModeEnabled } from "@/lib/runtimeConfig";
import { useStore } from "@/lib/store";
import type { CustomerLedgerEntry } from "@/lib/types";
import { customerLedgerService } from "@/services/customerLedgerService";
import { getCustomerCurrentReceivable, getCustomerStoreCredit, getCustomerTotalOrders, getCustomerTotalReceived, getCustomerTotalReceivable } from "@/services/customers/customerFinance";
import { Download, Filter, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logRoute, logUI } from "@/lib/logger";

const typeLabel = (type: CustomerLedgerEntry["type"]) => {
  if (type === "order_receivable") return "Order Receivable";
  if (type === "order_receivable_reversal") return "Receivable Reversal";
  if (type === "customer_payment") return "Customer Payment";
  return "Payment Reversal";
};

export default function CustomersPage() {
  const { pushToast } = useStore();
  const { data: customers, isLoading, error, recordPaymentToCustomer, reload } = useCustomers();
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

  useEffect(() => { logRoute("page_rendered", { page: "Customers" }); }, []);

  const filtered = useMemo(
    () => base.filter((c) => [c.name, c.phone, c.wechatId, c.city].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || c.status === status)),
    [base, q, status]
  );

  useEffect(() => { logUI("customers_table_render", { total: base.length, filtered: filtered.length }); }, [base.length, filtered.length]);

  const active = base.filter((c) => c.status === "active").length;
  const totals = useMemo(() => ({
    totalOrders: base.reduce((s, c) => s + getCustomerTotalOrders(c), 0),
    totalReceivable: base.reduce((s, c) => s + getCustomerTotalReceivable(c), 0),
    currentReceivable: base.reduce((s, c) => s + getCustomerCurrentReceivable(c), 0),
  }), [base]);
  const firebaseMode = isAnyFirebaseModeEnabled();
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });
  const viewCustomer = base.find((c) => c.id === viewCustomerId) ?? null;
  useEffect(() => { if (filtered.length === 0) logUI("customers_empty_state_rendered", { firebaseMode }); }, [filtered.length, firebaseMode]);
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

  const statementRows = [...ledgerRows].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const totalReceivable = statementRows.filter((r) => r.type === "order_receivable").reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = statementRows.filter((r) => r.type === "customer_payment").reduce((s, r) => s + (r.amount || 0), 0);

  let running = 0;

  return (
    <PageShell title="Customers">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 flex-1">
            <StatCard label="Total Customers" value={base.length.toString()} icon={<Users size={16} />} />
            <StatCard label="Active Customers" value={active.toString()} />
            <StatCard label="Inactive Customers" value={(base.length - active).toString()} />
            <StatCard label="Total Orders" value={totals.totalOrders.toString()} />
            <StatCard label="Total Receivable" value={formatAmount(totals.totalReceivable)} />
            <StatCard label="Current Receivable" value={formatAmount(totals.currentReceivable)} />
          </div>
          <div className="ml-3 flex gap-2">
            {firebaseMode ? <Button onClick={async () => { try { await customerLedgerService.recalculateAllCustomersFromLedger(); await reload(); pushToast({ tone: "success", text: "Customer totals recalculated from ledger." }); } catch (e) { pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not recalculate customer totals." }); } }} variant="secondary"><Plus size={14} />Recalculate Customer Totals</Button> : null}
            <Button onClick={placeholder} variant="primary"><Plus size={14} />Add Customer</Button>
          </div>
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by customer name, phone, wechat id, city..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <div className="w-[160px]"><Select value="all" onChange={placeholder} options={[{ value: "all", label: "All Locations" }]} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>
        {error && <div className="text-[12px] text-fg-subtle">{error}</div>}
        
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[13px]"><thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Customer</th><th>Contact</th><th>Location</th><th>Total Orders</th><th>Total Spent</th><th>Outstanding</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>{filtered.map((c) => <tr key={c.id} className="border-t border-border"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[12px] font-semibold">{c.displayName.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div><div><div className="font-semibold">{c.displayName}</div><div className="text-[11.5px] text-fg-subtle">{c.customerCode}</div></div></div></td><td><div>{c.phone || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.wechatId || c.email || "—"}</div></td><td><div>{c.country || "—"}</div><div className="text-[11.5px] text-fg-subtle">{c.city || "—"}</div></td><td>{getCustomerTotalOrders(c)}</td><td className="font-semibold text-[var(--success)] tabular-nums">{formatAmount(getCustomerTotalReceivable(c))}</td><td className="tabular-nums">{formatAmount(getCustomerCurrentReceivable(c))}</td><td><StatusBadge status={c.status} /></td><td className="px-4"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setPayCustomerId(c.id)}>Receive Payment</Button><Button size="sm" variant="secondary" onClick={() => openStatement(c.id)}>Statement</Button><ActionIcons onPlaceholder={placeholder} /></div></td></tr>)}{isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">Loading customers…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">{firebaseMode ? "No customers yet. Customer records will appear here when added." : "No customers found."}</td></tr>}</tbody></table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>

        {viewCustomer ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-6xl p-4 space-y-3"><div className="flex justify-between items-center"><div className="text-lg font-semibold">{viewCustomer.displayName} Statement</div><Button size="sm" variant="secondary" onClick={() => setViewCustomerId(null)}>Close</Button></div>{ledgerError ? <div className="text-sm text-red-400">{ledgerError}</div> : null}<div className="grid grid-cols-2 md:grid-cols-4 gap-2"><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Total Receivable</div><div className="text-xl font-semibold">{formatAmount(totalReceivable)}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Total Received</div><div className="text-xl font-semibold">{formatAmount(totalReceived)}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Current Receivable</div><div className="text-xl font-bold">{formatAmount(getCustomerCurrentReceivable(viewCustomer))}</div></div><div className="rounded border border-border p-2"><div className="text-[11px] text-fg-subtle">Store Credit</div><div className="text-xl font-semibold">{formatAmount(getCustomerStoreCredit(viewCustomer))}</div></div></div><div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[980px] text-[12px]"><thead className="bg-bg-subtle"><tr className="text-left uppercase text-fg-subtle"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Debit</th><th className="px-2 py-2 text-right">Credit</th><th className="px-2 py-2 text-right">Balance</th></tr></thead><tbody>{statementRows.map((r) => { const debit = r.debit ?? (r.type === "order_receivable" ? r.amount : 0); const credit = r.credit ?? (r.type === "order_receivable_reversal" || r.type === "customer_payment" || r.type === "customer_payment_reversal" ? r.amount : 0); running += debit - credit; return <tr key={r.id} className="border-t border-border"><td className="px-2 py-2">{new Date((r.paymentDate || r.createdAt)).toLocaleDateString()}</td><td className="px-2 py-2">{typeLabel(r.type)}</td><td className="px-2 py-2">{r.sourceOrderNumber || r.sourceOrderId || "—"}</td><td className="px-2 py-2">{r.note || "—"}</td><td className="px-2 py-2 text-right">{debit ? formatAmount(debit) : "—"}</td><td className="px-2 py-2 text-right">{credit ? formatAmount(credit) : "—"}</td><td className="px-2 py-2 text-right font-semibold">{formatAmount(running)}</td></tr>; })}{statementRows.length === 0 ? <tr><td colSpan={7} className="px-2 py-6 text-center text-fg-subtle">No statement entries.</td></tr> : null}</tbody></table></div></div></div> : null}

        {payCustomerId ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-lg p-4 space-y-3"><div className="text-lg font-semibold">Receive Payment</div>{payCustomer ? <div className="rounded border border-border p-2 text-sm"><div><span className="text-fg-subtle">Customer:</span> {payCustomer.displayName}</div><div><span className="text-fg-subtle">Current Receivable:</span> {formatAmount(getCustomerCurrentReceivable(payCustomer))}</div><div><span className="text-fg-subtle">Store Credit:</span> {formatAmount(getCustomerStoreCredit(payCustomer))}</div></div> : null}<Input type="number" min={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Payment Amount" /><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /><Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Note (optional)" /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPayCustomerId(null)}>Cancel</Button><Button variant="primary" onClick={submitPayment}>Save Payment</Button></div></div></div> : null}
      </div>
    </PageShell>
  );
}
