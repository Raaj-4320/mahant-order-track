"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { formatAmount } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import type { Customer, Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { CalendarDays, Download, Plus, Trash2, Wallet, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TablePagination } from "@/components/table/TablePagination";
import { buildPaymentAgentAccountingSummary, buildPaymentAgentOrderRows, buildPaymentAgentPaymentRows, buildPaymentAgentTransactionRows } from "@/services/settlement/paymentAgentAccounting";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

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

const formatDateLabel = (value?: string) => {
  if (!value) return "—";
  return formatIndianDate(value);
};

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

  const accounting = useMemo(
    () => (summary ? buildPaymentAgentAccountingSummary(summary.agent, orders, entries, customers) : null),
    [summary, orders, entries, customers],
  );
  const directFinance = useMemo(
    () => (summary ? getPaymentAgentDirectFinance(summary.agent) : null),
    [summary],
  );
  const transactionRows = useMemo(() => (accounting ? buildPaymentAgentTransactionRows(accounting) : []), [accounting]);
  const paymentRows = useMemo(() => (accounting ? buildPaymentAgentPaymentRows(accounting) : []), [accounting]);
  const orderRows = useMemo(() => (accounting ? buildPaymentAgentOrderRows(accounting) : []), [accounting]);
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
  const groupedPagedOrderRows = useMemo(
    () =>
      pagedOrderRows.map((row, index) => ({
        ...row,
        showOrderNumber: index === 0 || pagedOrderRows[index - 1]?.orderNumber !== row.orderNumber,
      })),
    [pagedOrderRows],
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

  if (!open || !summary || !accounting || !directFinance) return null;

  const deletePayment = async (entryId: string) => {
    setDeletingPaymentId(entryId);
    setActionError(null);
    try {
      await onDeletePayment(entryId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete payment.");
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
    { label: "Advance Payments", value: formatAmount(directFinance.paymentsMade), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <Wallet size={16} /> },
    { label: "Credit Used", value: formatAmount(directFinance.totalUsed), tone: "text-slate-700 bg-slate-50 border-slate-200", icon: <Download size={16} /> },
    { label: "Credit Left", value: formatAmount(directFinance.creditLeft), tone: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: <Wallet size={16} /> },
    { label: "Due / Pending", value: formatAmount(directFinance.duePending), tone: "text-rose-700 bg-rose-50 border-rose-100", icon: <CalendarDays size={16} /> },
    { label: "Total Orders", value: directFinance.totalOrders.toLocaleString(), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <CalendarDays size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4">
      <div className="mx-auto my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
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

        <div className="overflow-y-auto overflow-x-hidden px-5 py-3">
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
            <section className="min-w-0 min-h-[170px] self-start rounded-2xl border border-border bg-white">
              <div className="border-b border-border px-4 py-3">
                <div className="text-[16px] font-semibold leading-tight text-fg">Credit Activity</div>
              </div>
              {transactionRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">
                  {error ? "Ledger transactions could not be loaded right now." : "No order transactions available for this payment agent."}
                </div>
              ) : (
                <div className="max-h-[44vh] overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[760px] text-[12px]">
                    <thead className="bg-white">
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Order No</th>
                        <th className="px-3 py-2 text-left">Customer</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Credit Left</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTransactionRows.map((row) => (
                        <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                          <td className="px-3 py-2.5 leading-tight">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2.5 font-semibold leading-tight">{row.orderNumber}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.customer}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.type}</td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold leading-tight tabular-nums", row.type === "Pending Order Amount" ? "text-rose-600" : row.type === "Credit Returned" ? "text-emerald-700" : "text-slate-900")}>{formatAmount(row.amount)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums text-emerald-700">{formatAmount(row.runningCreditLeft)}</td>
                          <td className="px-3 py-2.5 leading-tight text-fg-subtle">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination total={transactionRows.length} currentPage={transactionsPage} pageSize={PAGE_SIZE} onPageChange={setTransactionsPage} label="transactions" />
            </section>

            <section className="min-w-0 min-h-[170px] self-start rounded-2xl border border-border bg-white">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="text-[16px] font-semibold leading-tight text-fg">Advance Payments</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">Money paid or advanced to this payment agent.</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setAddPaymentOpen(true)}>
                  <Plus size={14} />
                  Add Payment
                </Button>
              </div>
              {paymentRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">No payments recorded yet.</div>
              ) : (
                <div className="max-h-[44vh] overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[680px] text-[12px]">
                    <thead className="bg-white">
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Method</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                        <th className="px-3 py-2 text-right">Credit Left</th>
                        <th className="sticky right-0 z-10 bg-white px-3 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPaymentRows.map((row) => (
                        <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums">{formatAmount(row.amount)}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.method}</td>
                          <td className="max-w-[180px] truncate px-3 py-2.5 leading-tight text-fg-subtle" title={row.notes}>{row.notes}</td>
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums text-emerald-700">{formatAmount(row.runningCreditLeft)}</td>
                          <td className="sticky right-0 z-10 bg-white px-3 py-2.5 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]">
                            <Button
                              size="sm"
                              variant="danger"
                              className="min-w-[86px] justify-center"
                              disabled={deletingPaymentId === row.id}
                              onClick={() => {
                                if (!window.confirm("Delete this payment transaction and reverse its effect?")) return;
                                void deletePayment(row.id);
                              }}
                            >
                              <Trash2 size={13} />
                              {deletingPaymentId === row.id ? "Deleting..." : "Delete"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination total={paymentRows.length} currentPage={paymentsPage} pageSize={PAGE_SIZE} onPageChange={setPaymentsPage} label="payments" />
            </section>
          </div>

          <section className="mt-3 min-w-0 min-h-[170px] self-start rounded-2xl border border-border bg-white">
            <div className="border-b border-border px-4 py-3">
              <div className="text-[16px] font-semibold leading-tight text-fg">Orders</div>
            </div>
            {orderRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">No orders linked to this payment agent.</div>
            ) : (
              <div className="max-h-[34vh] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[1260px] text-[12px]">
                  <thead className="bg-white">
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-center">Photo</th>
                      <th className="px-3 py-2 text-left">Order No</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Marka</th>
                      <th className="px-3 py-2 text-left">Details</th>
                      <th className="px-3 py-2 text-right">CTN</th>
                      <th className="px-3 py-2 text-right">PCS/CTN</th>
                      <th className="px-3 py-2 text-right">Total PCS</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Loading Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPagedOrderRows.map((row) => (
                      <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-2.5">
                          <div className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">
                            {row.productImage ? (
                              <img
                                src={getCloudinaryOptimizedUrl(row.productImage, { width: 96, height: 96, crop: "fit" })}
                                alt="product"
                                className="h-full w-full object-contain"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="text-[10px] text-fg-subtle">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{row.showOrderNumber ? row.orderNumber : ""}</td>
                        <td className="px-3 py-2.5">{row.customer}</td>
                        <td className="px-3 py-2.5">{row.marka}</td>
                        <td className="px-3 py-2.5">{row.details}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{row.totalCtns.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{row.pcsPerCtn.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{row.totalPcs.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(row.rate)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatAmount(row.amount)}</td>
                        <td className="px-3 py-2.5">{row.loadingDate ? formatDateLabel(row.loadingDate) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination total={orderRows.length} currentPage={ordersPage} pageSize={PAGE_SIZE} onPageChange={setOrdersPage} label="order rows" />
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
