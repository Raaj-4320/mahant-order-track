"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatAmount } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import type { Customer, Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { CalendarDays, Download, Plus, Trash2, Wallet, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TablePagination } from "@/components/table/TablePagination";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";
import { getPaymentAgentDirectOrderFacts } from "@/services/paymentAgentDirectFinanceSync";

type AgentSummary = {
  agent: PaymentAgent;
};

type Props = {
  open: boolean;
  summary: AgentSummary | null;
  entries: PaymentAgentLedgerEntry[];
  orders: Order[];
  customers: Customer[];
  error?: string | null;
  onClose: () => void;
  onExport?: () => void;
  onAddPayment: (input: { paymentDate: string; amount: number; paymentMethod?: string; note?: string }) => Promise<void>;
  onDeletePayment: (entryId: string) => Promise<void>;
};

type CreditUsageRow = {
  id: string;
  date: string;
  orderNumber: string;
  customer: string;
  amount: number;
  runningCreditLeft: number;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  canDelete: boolean;
  createdSortAt?: string;
};

type OrderRow = {
  id: string;
  date: string;
  orderNumber: string;
  customer: string;
  lineLabel: string;
  amount: number;
  showOrderNumber: boolean;
};

const formatDateLabel = (value?: string) => {
  if (!value) return "-";
  return formatIndianDate(value);
};

const clampMoney = (value: number | undefined | null) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const sortableTime = (value?: string) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const entryTime = (entry: PaymentAgentLedgerEntry) => entry.paymentDate || entry.updatedAt || entry.createdAt || "";
const getOrderCustomerSummary = (order: Order, customers: Customer[]) =>
  Array.from(new Set((order.lines || []).map((line) => getLineCustomerDisplay(line, customers)).filter(Boolean))).join(", ") || "-";

export function PaymentAgentLedgerModal({ open, summary, entries, orders, customers, error, onClose, onExport, onAddPayment, onDeletePayment }: Props) {
  const PAGE_SIZE = 100;
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentMethod: "",
    note: "",
  });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const directFinance = useMemo(
    () => (summary ? getPaymentAgentDirectFinance(summary.agent) : null),
    [summary],
  );
  const directOrderFacts = useMemo(
    () => (summary ? getPaymentAgentDirectOrderFacts(summary.agent, orders) : []),
    [summary, orders],
  );
  const transactionRows = useMemo<CreditUsageRow[]>(() => {
    if (!summary) return [];

    const usageRows = directOrderFacts
      .filter((fact) => fact.usedAmount > 0)
      .map((fact) => ({
        id: `${fact.order.id}:${fact.split.id}`,
        date:
          fact.split.settlementSnapshot?.updatedAt
          || fact.split.settlementSnapshot?.createdAt
          || fact.split.updatedAt
          || fact.split.createdAt
          || fact.order.updatedAt
          || fact.order.createdAt
          || fact.order.date
          || "",
        orderNumber: fact.order.number || fact.order.orderNumber || "-",
        customer: getOrderCustomerSummary(fact.order, customers),
        amount: clampMoney(fact.usedAmount),
        runningCreditLeft: 0,
      }));

    const datedEvents = [
      ...(clampMoney(summary.agent.openingCreditBalance) > 0
        ? [{
            id: `opening-${summary.agent.id}`,
            date: summary.agent.createdAt || summary.agent.updatedAt || "",
            delta: clampMoney(summary.agent.openingCreditBalance),
            usageRowId: "",
          }]
        : []),
      ...entries
        .filter((entry) => entry.agentId === summary.agent.id && entry.type === "agent_payment" && entry.active !== false && entry.isReversed !== true)
        .map((entry) => ({
          id: `payment-${entry.id}`,
          date: entryTime(entry),
          delta: clampMoney(entry.amount),
          usageRowId: "",
        })),
      ...usageRows.map((row) => ({
        id: `usage-${row.id}`,
        date: row.date,
        delta: -row.amount,
        usageRowId: row.id,
      })),
    ].sort((left, right) => sortableTime(left.date) - sortableTime(right.date) || left.id.localeCompare(right.id));

    let runningCredit = 0;
    const runningByUsageId = new Map<string, number>();
    datedEvents.forEach((event) => {
      runningCredit = Math.max(0, runningCredit + event.delta);
      if (event.usageRowId) {
        runningByUsageId.set(event.usageRowId, runningCredit);
      }
    });

    return usageRows
      .map((row) => ({
        ...row,
        runningCreditLeft: runningByUsageId.get(row.id) ?? directFinance?.creditLeft ?? 0,
      }))
      .sort((left, right) => sortableTime(right.date) - sortableTime(left.date) || right.id.localeCompare(left.id));
  }, [customers, directFinance?.creditLeft, directOrderFacts, entries, summary]);
  const paymentRows = useMemo<PaymentRow[]>(() => {
    if (!summary) return [];
    const rows: PaymentRow[] = [];
    const openingAmount = clampMoney(summary.agent.openingCreditBalance);
    if (openingAmount > 0) {
      rows.push({
        id: `opening-${summary.agent.id}`,
        date: summary.agent.createdAt || summary.agent.updatedAt || "",
        amount: openingAmount,
        method: "Opening Balance",
        notes: "Opening advance balance",
        canDelete: false,
        createdSortAt: summary.agent.createdAt || summary.agent.updatedAt || "",
      });
    }
    entries
      .filter((entry) => entry.agentId === summary.agent.id && entry.type === "agent_payment" && entry.active !== false && entry.isReversed !== true)
      .forEach((entry) => {
        rows.push({
          id: entry.id,
          date: entry.paymentDate || entry.createdAt || "",
          amount: clampMoney(entry.amount),
          method: entry.paymentMethod?.trim() || "Manual Payment",
          notes: entry.note?.trim() || "-",
          canDelete: true,
          createdSortAt: entry.createdAt || entry.updatedAt || entry.paymentDate || "",
        });
      });
    return rows.sort((left, right) => sortableTime(right.createdSortAt) - sortableTime(left.createdSortAt) || sortableTime(right.date) - sortableTime(left.date) || right.id.localeCompare(left.id));
  }, [entries, summary]);
  const orderRows = useMemo<OrderRow[]>(() => {
    return directOrderFacts
      .flatMap((fact) => {
        const orderNumber = fact.order.number || fact.order.orderNumber || "-";
        const orderDate = fact.order.date || fact.order.createdAt || fact.order.updatedAt || "";
        const customer = getOrderCustomerSummary(fact.order, customers);
        const lineCount = Math.max(1, fact.order.lines?.length || 0);
        const perLineAmount = lineCount > 0 ? clampMoney(fact.orderPortionAmount) / lineCount : clampMoney(fact.orderPortionAmount);

        return (fact.order.lines?.length ? fact.order.lines : [null]).map((line, index) => ({
          id: `${fact.order.id}-${line?.id || index}`,
          date: orderDate,
          orderNumber,
          customer,
          lineLabel:
            line
              ? [line.marka, line.detail1 || line.details, line.detail2, line.detail3].filter(Boolean).join(" · ") || `Line ${index + 1}`
              : `Line ${index + 1}`,
          amount: perLineAmount,
          showOrderNumber: index === 0,
        }));
      })
      .sort((left, right) => {
        const dateDiff = sortableTime(right.date) - sortableTime(left.date);
        if (dateDiff !== 0) return dateDiff;
        const orderDiff = right.orderNumber.localeCompare(left.orderNumber, undefined, { numeric: true, sensitivity: "base" });
        if (orderDiff !== 0) return orderDiff;
        return left.id.localeCompare(right.id);
      });
  }, [customers, directOrderFacts]);
  const pagedTransactionRows = useMemo(
    () => transactionRows.slice((transactionsPage - 1) * PAGE_SIZE, transactionsPage * PAGE_SIZE),
    [transactionRows, transactionsPage],
  );
  const pagedPaymentRows = useMemo(
    () => paymentRows.slice((paymentsPage - 1) * PAGE_SIZE, paymentsPage * PAGE_SIZE),
    [paymentRows, paymentsPage],
  );
  const pagedOrderRows = useMemo(
    () => orderRows.slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE),
    [orderRows, ordersPage],
  );

  useEffect(() => {
    if (!open) return;
    setTransactionsPage(1);
    setPaymentsPage(1);
    setOrdersPage(1);
  }, [open, summary?.agent.id]);

  useEffect(() => {
    setTransactionsPage((page) => Math.min(page, Math.max(1, Math.ceil(transactionRows.length / PAGE_SIZE))));
  }, [transactionRows.length]);

  useEffect(() => {
    setPaymentsPage((page) => Math.min(page, Math.max(1, Math.ceil(paymentRows.length / PAGE_SIZE))));
  }, [paymentRows.length]);

  useEffect(() => {
    setOrdersPage((page) => Math.min(page, Math.max(1, Math.ceil(orderRows.length / PAGE_SIZE))));
  }, [orderRows.length]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [open]);

  if (!open || !summary || !directFinance) return null;

  const deletePayment = async (entryId: string) => {
    setDeletingPaymentId(entryId);
    setActionError(null);
    try {
      await onDeletePayment(entryId);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not delete payment.");
    } finally {
      setDeletingPaymentId((current) => (current === entryId ? null : current));
    }
  };

  const submitPayment = async () => {
    const amount = Number(paymentForm.amount);
    if (!(amount > 0)) return;
    setPaymentBusy(true);
    setActionError(null);
    try {
      await onAddPayment({
        paymentDate: paymentForm.paymentDate,
        amount,
        paymentMethod: paymentForm.paymentMethod.trim() || undefined,
        note: paymentForm.note.trim() || undefined,
      });
      setAddPaymentOpen(false);
      setPaymentForm({
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: "",
        paymentMethod: "",
        note: "",
      });
    } finally {
      setPaymentBusy(false);
    }
  };

  const kpis = [
    { label: "Advance Payments", value: formatAmount(directFinance.totalAdvanced), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <Wallet size={16} /> },
    { label: "Net Credit Used", value: formatAmount(directFinance.totalUsed), tone: "text-fg bg-bg-subtle border-border", icon: <Download size={16} /> },
    { label: "Available Credit", value: formatAmount(directFinance.creditLeft), tone: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: <Wallet size={16} /> },
    { label: "Due / Pending", value: formatAmount(directFinance.duePending), tone: "text-rose-700 bg-rose-50 border-rose-100", icon: <CalendarDays size={16} /> },
    { label: "Total Orders", value: directFinance.totalOrders.toLocaleString(), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <CalendarDays size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/45 p-4">
      <div className="mx-auto my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="text-[24px] font-bold text-fg">{summary.agent.name}</div>
            <div className="mt-0.5 text-[12px] leading-tight text-fg-subtle">
              {summary.agent.agentCode ? `${summary.agent.agentCode} · ` : ""}
              {summary.agent.wechatId || summary.agent.phone || "Payment agent ledger"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onExport ? (
              <Button size="sm" variant="secondary" onClick={onExport}>
                <Download size={14} />
                Export / Print
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onClose} aria-label="Close ledger">
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className={cn("rounded-xl border px-3 py-2.5", kpi.tone)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.1em]">{kpi.label}</div>
                  <div>{kpi.icon}</div>
                </div>
                <div className="mt-2 text-[22px] font-extrabold leading-none">{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-start">
            <section className="min-w-0 min-h-[170px] self-start overflow-hidden rounded-2xl border border-border bg-bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="text-[16px] font-semibold leading-tight text-fg">Credit Activity</div>
              </div>
              {transactionRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">
                  {error ? "Ledger transactions could not be loaded right now." : "No order credit usage found for this payment agent."}
                </div>
              ) : (
                <div className="max-h-[44vh] overflow-y-auto overflow-x-hidden">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Order No</th>
                        <th className="px-3 py-2 text-left">Customer</th>
                        <th className="px-3 py-2 text-right">Credit Used</th>
                        <th className="px-3 py-2 text-right">Available Credit After Entry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTransactionRows.map((row) => (
                        <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                          <td className="px-3 py-2.5 leading-tight">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2.5 font-semibold leading-tight">{row.orderNumber}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.customer}</td>
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums text-fg">{formatAmount(row.amount)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums text-emerald-700">{formatAmount(row.runningCreditLeft)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination total={transactionRows.length} currentPage={transactionsPage} pageSize={PAGE_SIZE} onPageChange={setTransactionsPage} label="credit uses" />
            </section>

            <section className="min-w-0 min-h-[170px] self-start overflow-hidden rounded-2xl border border-border bg-bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="text-[16px] font-semibold leading-tight text-fg">Advance Payments</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">Opening balance and manual payments added for this payment agent.</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setAddPaymentOpen(true)}>
                  <Plus size={14} />
                  Add Payment
                </Button>
              </div>
              {paymentRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">No payments recorded yet.</div>
              ) : (
                <div className="max-h-[44vh] overflow-y-auto overflow-x-hidden">
                  <div className="grid grid-cols-[84px_86px_138px_minmax(0,1fr)_74px] border-b border-border bg-bg-subtle text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                    <div className="px-2 py-2 text-left">Date</div>
                    <div className="px-2 py-2 text-right">Amount</div>
                    <div className="px-2 py-2 text-left">Method</div>
                    <div className="min-w-0 px-2 py-2 text-left">Notes</div>
                    <div className="px-2 py-2 text-right">Action</div>
                  </div>
                  {pagedPaymentRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[84px_86px_138px_minmax(0,1fr)_74px] border-b border-border text-[12px] transition-colors last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <div className="px-2 py-2.5 leading-tight text-fg-subtle">{formatDateLabel(row.date)}</div>
                      <div className="px-2 py-2.5 text-right font-semibold leading-tight tabular-nums">{formatAmount(row.amount)}</div>
                      <div className="truncate px-2 py-2.5 leading-tight" title={row.method}>{row.method}</div>
                      <div className="min-w-0 truncate px-2 py-2.5 leading-tight text-fg-subtle" title={row.notes}>{row.notes}</div>
                      <div className="px-2 py-2.5 text-right">
                        {row.canDelete ? (
                          <button
                            type="button"
                            className="inline-flex items-center justify-end gap-1 whitespace-nowrap text-[12px] font-medium text-[var(--danger)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={deletingPaymentId === row.id}
                            onClick={() => {
                              if (!window.confirm("Delete this payment transaction and reverse its effect?")) return;
                              void deletePayment(row.id);
                            }}
                          >
                            <Trash2 size={13} />
                            {deletingPaymentId === row.id ? "..." : "Delete"}
                          </button>
                        ) : (
                          <span className="text-[12px] font-medium text-fg-subtle">-</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <TablePagination total={paymentRows.length} currentPage={paymentsPage} pageSize={PAGE_SIZE} onPageChange={setPaymentsPage} label="payments" />
            </section>
          </div>

          <section className="mt-3 min-w-0 min-h-[170px] self-start overflow-hidden rounded-2xl border border-border bg-bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="text-[16px] font-semibold leading-tight text-fg">Orders</div>
            </div>
            {orderRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">No orders linked to this payment agent.</div>
            ) : (
              <div className="max-h-[34vh] overflow-y-auto overflow-x-hidden">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Order No</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Line</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOrderRows.map((row) => (
                      <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-2.5">{formatDateLabel(row.date)}</td>
                        <td className="px-3 py-2.5 font-semibold">{row.showOrderNumber ? row.orderNumber : ""}</td>
                        <td className="px-3 py-2.5">{row.customer}</td>
                        <td className="px-3 py-2.5 text-fg-subtle">{row.lineLabel}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatAmount(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination total={orderRows.length} currentPage={ordersPage} pageSize={PAGE_SIZE} onPageChange={setOrdersPage} label="orders" />
          </section>
          {error ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{error}</div> : null}
          {actionError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{actionError}</div> : null}
        </div>
      </div>

      {addPaymentOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/25 p-4">
          <div className="card w-full max-w-md space-y-3 p-4">
            <div className="text-[18px] font-semibold">Add Payment</div>
            <Input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))} />
            <Input type="number" min={0} value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" />
            <Input value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))} placeholder="Payment Method" />
            <Input value={paymentForm.note} onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Notes" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={paymentBusy || !(Number(paymentForm.amount) > 0)} onClick={() => void submitPayment()}>
                {paymentBusy ? "Saving..." : "Save Payment"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
