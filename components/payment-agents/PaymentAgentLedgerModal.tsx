"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatAmount } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import type { Order, PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { CalendarDays, Download, Plus, Wallet, X } from "lucide-react";
import { cn } from "@/lib/cn";

type AgentSummary = {
  agent: PaymentAgent;
  totalOrders: number;
  totalOrderAmount: number;
  totalPaidAmount: number;
  currentDuePayable: number;
  currentCredit: number;
};

type LeftRow = {
  id: string;
  date: string;
  orderNumber: string;
  customer: string;
  type: string;
  amount: number;
  tone: "positive" | "negative" | "neutral";
  notes: string;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
};

type Props = {
  open: boolean;
  summary: AgentSummary | null;
  entries: PaymentAgentLedgerEntry[];
  orders: Order[];
  error?: string | null;
  onClose: () => void;
  onExport?: () => void;
  onAddPayment: (input: { paymentDate: string; amount: number; paymentMethod?: string; note?: string }) => Promise<void>;
};

const toneClasses: Record<LeftRow["tone"], string> = {
  positive: "text-emerald-700",
  negative: "text-rose-600",
  neutral: "text-slate-700",
};

const normalize = (value?: string | null) => (value || "").trim().toLowerCase();

const formatDateLabel = (value?: string) => {
  if (!value) return "—";
  return formatIndianDate(value);
};

const getOrderCustomerSummary = (order?: Order | null) => {
  if (!order) return "—";
  const names = Array.from(
    new Set(
      (order.lines || [])
        .map((line) => line.customerSnapshot?.name?.trim() || line.customerName?.trim() || "")
        .filter(Boolean),
    ),
  );
  return names.length > 0 ? names.join(", ") : "—";
};

const getOrderSettlementSnapshot = (order?: Order | null) => {
  if (!order) return null;
  const settlement = (order as any).paymentAgentSettlementSnapshot;
  return settlement && typeof settlement === "object" ? settlement : null;
};

const isOrderMatchedToAgent = (order: Order, agent: PaymentAgent) => {
  const agentName = normalize(agent.name);
  const references = [
    order.paymentAgentId,
    order.paymentAgentSnapshot?.id,
    order.paymentBy,
    order.paymentAgentSnapshot?.name,
    (order as any).paymentByName,
    (order as any).paymentAgentName,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim());

  return references.includes(agent.id) || references.some((value) => normalize(value) === agentName);
};

const buildLeftRows = (entries: PaymentAgentLedgerEntry[], orders: Order[]) => {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const orderByNumber = new Map(orders.map((order) => [order.number || order.orderNumber, order]));

  const ledgerRows = entries
    .filter((entry) => entry.type === "order_settlement" || entry.type === "order_settlement_reversal")
    .map<LeftRow>((entry) => {
      const linkedOrder = orderById.get(entry.sourceOrderId || "") || orderByNumber.get(entry.sourceOrderNumber || "") || null;
      const isReversal = entry.type === "order_settlement_reversal";
      const reversedFlag = !isReversal && (entry.active === false || entry.isReversed === true);
      const paidNow = Number(entry.paidNow || 0);
      const creditUsed = Number(entry.creditUsed || 0);
      const remainingPayable = Number(entry.remainingPayable || 0);

      return {
        id: entry.id,
        date: entry.paymentDate || entry.createdAt || "",
        orderNumber: entry.sourceOrderNumber || linkedOrder?.number || linkedOrder?.orderNumber || "—",
        customer: getOrderCustomerSummary(linkedOrder),
        type: isReversal ? "Settlement Reversal" : reversedFlag ? "Order Settlement (Reversed)" : "Order Settlement",
        amount: Number(entry.amount || 0),
        tone: isReversal || reversedFlag ? "negative" : "neutral",
        notes: isReversal
          ? `Reversal of ${entry.sourceOrderNumber || entry.sourceOrderId || "order"}`
          : `${reversedFlag ? "Reversed entry · " : ""}Credit used ${formatAmount(creditUsed)} · Paid ${formatAmount(paidNow)} · Due ${formatAmount(remainingPayable)}`,
      };
    });

  const derivedRows = orders.flatMap<LeftRow>((order) => {
    const settlement = getOrderSettlementSnapshot(order);
    if (!settlement) return [];

    const rows: LeftRow[] = [];
    const date = order.loadingDate || order.updatedAt || order.date || "";
    const orderNumber = order.number || order.orderNumber || "—";
    const customer = getOrderCustomerSummary(order);
    const creditUsed = Number(settlement.creditUsed || 0);
    const remainingPayable = Number(settlement.remainingPayable || 0);

    if (creditUsed > 0) {
      rows.push({
        id: `credit-used-${order.id}`,
        date,
        orderNumber,
        customer,
        type: "Credit Used",
        amount: creditUsed,
        tone: "negative",
        notes: `Applied credit to order ${orderNumber}`,
      });
    }

    if (remainingPayable > 0) {
      rows.push({
        id: `due-pending-${order.id}`,
        date,
        orderNumber,
        customer,
        type: "Due / Pending",
        amount: remainingPayable,
        tone: "negative",
        notes: `Pending amount for order ${orderNumber}`,
      });
    }

    return rows;
  });

  return [...ledgerRows, ...derivedRows].sort((left, right) => (right.date || "").localeCompare(left.date || ""));
};

const buildPaymentRows = (entries: PaymentAgentLedgerEntry[]) =>
  entries
    .filter((entry) => entry.type === "agent_payment")
    .map<PaymentRow>((entry) => ({
      id: entry.id,
      date: entry.paymentDate || entry.createdAt || "",
      amount: Number(entry.amount || 0),
      method: entry.paymentMethod?.trim() || "—",
      notes: entry.note?.trim() || "—",
    }))
    .sort((left, right) => (right.date || "").localeCompare(left.date || ""));

export function PaymentAgentLedgerModal({ open, summary, entries, orders, error, onClose, onExport, onAddPayment }: Props) {
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentMethod: "",
    note: "",
  });
  const [paymentBusy, setPaymentBusy] = useState(false);

  const matchedOrders = useMemo(() => {
    if (!summary) return [];
    return orders.filter((order) => order.status !== "archived" && isOrderMatchedToAgent(order, summary.agent));
  }, [orders, summary]);

  const matchedOrderIds = useMemo(() => new Set(matchedOrders.map((order) => order.id)), [matchedOrders]);
  const matchedOrderNumbers = useMemo(
    () => new Set(matchedOrders.map((order) => order.number || order.orderNumber).filter(Boolean)),
    [matchedOrders],
  );

  const matchedEntries = useMemo(() => {
    if (!summary) return [];
    const unique = new Map<string, PaymentAgentLedgerEntry>();
    entries.forEach((entry) => {
      const byAgentId = Boolean(entry.agentId && entry.agentId === summary.agent.id);
      const byOrderId = Boolean(entry.sourceOrderId && matchedOrderIds.has(entry.sourceOrderId));
      const byOrderNumber = Boolean(entry.sourceOrderNumber && matchedOrderNumbers.has(entry.sourceOrderNumber));
      if (byAgentId || byOrderId || byOrderNumber) unique.set(entry.id, entry);
    });
    return Array.from(unique.values()).sort((left, right) => {
      const leftDate = left.paymentDate || left.createdAt || "";
      const rightDate = right.paymentDate || right.createdAt || "";
      return rightDate.localeCompare(leftDate);
    });
  }, [entries, matchedOrderIds, matchedOrderNumbers, summary]);

  const leftRows = useMemo(() => buildLeftRows(matchedEntries, matchedOrders), [matchedEntries, matchedOrders]);
  const paymentRows = useMemo(() => buildPaymentRows(matchedEntries), [matchedEntries]);

  const totalCreditGiven = Number(summary?.agent.openingCreditBalance || 0);
  const totalUsedCredit = useMemo(() => {
    const fromEntries = matchedEntries.reduce((sum, entry) => sum + Number(entry.creditUsed || 0), 0);
    const ordersWithEntry = new Set(
      matchedEntries
        .filter((entry) => entry.type === "order_settlement" && entry.sourceOrderId)
        .map((entry) => entry.sourceOrderId as string),
    );
    const fromOrdersWithoutEntry = matchedOrders.reduce((sum, order) => {
      if (ordersWithEntry.has(order.id)) return sum;
      return sum + Number(getOrderSettlementSnapshot(order)?.creditUsed || 0);
    }, 0);
    return fromEntries + fromOrdersWithoutEntry;
  }, [matchedEntries, matchedOrders]);
  const totalPendingDue = useMemo(
    () => matchedOrders.reduce((sum, order) => sum + Number(getOrderSettlementSnapshot(order)?.remainingPayable || 0), 0),
    [matchedOrders],
  );
  const totalPaymentsMade = useMemo(
    () => paymentRows.reduce((sum, row) => sum + row.amount, 0),
    [paymentRows],
  );

  if (!open || !summary) return null;

  const submitPayment = async () => {
    const amount = Number(paymentForm.amount);
    if (!(amount > 0)) return;
    setPaymentBusy(true);
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
    { label: "Total Credit Given", value: formatAmount(totalCreditGiven), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <Wallet size={16} /> },
    { label: "Paid / Used Credit", value: formatAmount(totalUsedCredit), tone: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: <Download size={16} /> },
    { label: "Due / Pending", value: formatAmount(totalPendingDue), tone: "text-rose-700 bg-rose-50 border-rose-100", icon: <CalendarDays size={16} /> },
    { label: "Advance / Left Balance", value: formatAmount(summary.currentCredit), tone: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: <Wallet size={16} /> },
    { label: "Total Orders", value: matchedOrders.length.toLocaleString(), tone: "text-sky-700 bg-sky-50 border-sky-100", icon: <CalendarDays size={16} /> },
    { label: "Payments Made", value: formatAmount(totalPaymentsMade), tone: "text-slate-700 bg-slate-50 border-slate-200", icon: <Download size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4">
      <div className="mx-auto flex max-h-[85vh] w-[88vw] max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
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

        <div className="overflow-y-auto px-5 py-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
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

          <div className="mt-3 grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr] xl:items-start">
            <section className="min-h-[170px] self-start rounded-2xl border border-border bg-white">
              <div className="border-b border-border px-4 py-3">
                <div className="text-[16px] font-semibold leading-tight text-fg">Transactions</div>
              </div>
              {leftRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">
                  {error ? "Ledger transactions could not be loaded right now." : "No order transactions available for this payment agent."}
                </div>
              ) : (
                <div className="max-h-[44vh] overflow-auto">
                  <table className="w-full min-w-[760px] text-[12px]">
                    <thead className="bg-white">
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Order No</th>
                        <th className="px-3 py-2 text-left">Customer</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leftRows.map((row) => (
                        <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                          <td className="px-3 py-2.5 leading-tight">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2.5 font-semibold leading-tight">{row.orderNumber}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.customer}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.type}</td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold leading-tight tabular-nums", toneClasses[row.tone])}>{formatAmount(row.amount)}</td>
                          <td className="px-3 py-2.5 leading-tight text-fg-subtle">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="min-h-[170px] self-start rounded-2xl border border-border bg-white">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="text-[16px] font-semibold leading-tight text-fg">Payments Made</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">Money paid to this payment agent.</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setAddPaymentOpen(true)}>
                  <Plus size={14} />
                  Add Payment
                </Button>
              </div>
              {paymentRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-fg-subtle">No payments recorded yet.</div>
              ) : (
                <div className="max-h-[44vh] overflow-auto">
                  <table className="w-full min-w-[520px] text-[12px]">
                    <thead className="bg-white">
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Method</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((row) => (
                        <tr key={row.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                          <td className="px-3 py-2.5 leading-tight">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold leading-tight tabular-nums">{formatAmount(row.amount)}</td>
                          <td className="px-3 py-2.5 leading-tight">{row.method}</td>
                          <td className="px-3 py-2.5 leading-tight text-fg-subtle">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          {error ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{error}</div> : null}
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
