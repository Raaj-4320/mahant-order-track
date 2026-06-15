"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, HandCoins, Plus, Search, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TablePagination } from "@/components/table/TablePagination";
import { Select } from "@/components/ui/Select";
import { PaymentAgentLedgerModal } from "@/components/payment-agents/PaymentAgentLedgerModal";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { useStore } from "@/lib/store";
import { formatAmount } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import { logDataFlow, logPageAccess, logUI } from "@/lib/logger";
import type { PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { openStatementPdfPrint } from "@/services/statementPdf";
import { orderLifecycleService } from "@/services/orderLifecycleService";
import { buildPaymentAgentAccountingSummary } from "@/services/settlement/paymentAgentAccounting";

const ALL_LEDGER_ROWS_KEY = "__all__";
type LedgerViewRow = {
  id: string;
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export default function PaymentAgentsPage() {
  const PAGE_SIZE = 100;
  const { data: agents, isLoading: isPaymentAgentsLoading, upsertPaymentAgent, deletePaymentAgent, recordPaymentToAgent, listPaymentAgentLedger, reload: reloadPaymentAgents } = usePaymentAgents();
  const { orders, pushToast } = useStore();
  const { data: firebaseOrders } = useOrders();
  const ordersSource = ordersDataSource();
  const sourceOrders = ordersSource === "firebase" ? firebaseOrders : orders;

  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [open, setOpen] = useState(false);
  const [ledgerAgent, setLedgerAgent] = useState<string | null>(null);
  const [payAgentId, setPayAgentId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [ledgerRows, setLedgerRows] = useState<Record<string, PaymentAgentLedgerEntry[]>>({});
  const [ledgerErrors, setLedgerErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ id: "", name: "", agentCode: "", phone: "", wechatId: "", country: "", openingCredit: "", notes: "", status: "active" as PaymentAgent["status"] });
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteCtx, setDeleteCtx] = useState<null | {
    agentId: string;
    agentName: string;
    status: string;
    currentDue: number;
    currentCredit: number;
    orderHistoryCount: number;
    ledgerHistoryCount: number;
    riskDetected: boolean;
  }>(null);

  useEffect(() => {
    logPageAccess("Payment Agents", { component: "app/payment-agents/page.tsx", source: process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? "mock" });
  }, []);

  useEffect(() => {
    if (ledgerRows[ALL_LEDGER_ROWS_KEY]) return;
    listPaymentAgentLedger()
      .then((loaded) => setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded })))
      .catch(() => {});
  }, [ledgerRows, listPaymentAgentLedger]);

  const rows = useMemo(() => {
    const allLedger = ledgerRows[ALL_LEDGER_ROWS_KEY] || [];
    return agents.map((agent) => {
      const summary = buildPaymentAgentAccountingSummary(agent, sourceOrders, allLedger);
      const searchText = [
        agent.name,
        agent.wechatId || "",
        agent.phone || "",
        agent.country || "",
        agent.notes || "",
        formatAmount(summary.totalAdvanced),
        formatAmount(summary.totalUsed),
        formatAmount(summary.duePending),
        formatAmount(summary.creditLeft),
        formatAmount(summary.paymentsMade),
        summary.matchedOrders.map((order) => order.number || order.orderNumber || "").join(" "),
        summary.matchedOrders.flatMap((order) => order.lines.map((line) => line.customerSnapshot?.name || line.customerName || "")).join(" "),
        summary.matchedEntries.map((entry) => entry.note || "").join(" "),
        summary.matchedEntries.map((entry) => entry.paymentMethod || "").join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return {
        ...summary,
        searchText,
      };
    });
  }, [agents, ledgerRows, sourceOrders]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter((row) => row.searchText.includes(query));
  }, [rows, q]);
  const filteredAndSorted = useMemo(() => {
    return [...filtered].sort((left, right) => {
      if (sortBy === "orders") return right.totalOrders - left.totalOrders;
      if (sortBy === "credit") return right.totalAdvanced - left.totalAdvanced;
      if (sortBy === "used") return right.totalUsed - left.totalUsed;
      if (sortBy === "due") return right.duePending - left.duePending;
      if (sortBy === "balance") return right.creditLeft - left.creditLeft;
      if (sortBy === "payments") return right.paymentsMade - left.paymentsMade;
      return left.agent.name.localeCompare(right.agent.name);
    });
  }, [filtered, sortBy]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filteredAndSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filteredAndSorted, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [q, sortBy]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const exportVisible = () => {
    const header = ["Agent", "WeChat ID", "Phone", "Total Orders", "Total Advanced", "Total Used", "Due / Pending", "Credit Left", "Payments Made"];
    const csvRows = filteredAndSorted.map((row) => [
      row.agent.name,
      row.agent.wechatId || "Not Set",
      row.agent.phone || "Not Set",
      String(row.totalOrders),
      formatAmount(row.totalAdvanced),
      formatAmount(row.totalUsed),
      formatAmount(row.duePending),
      formatAmount(row.creditLeft),
      formatAmount(row.paymentsMade),
    ]);
    const csv = [header, ...csvRows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "payment-agents-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const paymentAgentsFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (paymentAgentsFlowLoggedRef.current || isPaymentAgentsLoading) return;
    paymentAgentsFlowLoggedRef.current = true;
    logDataFlow("Payment Agents", {
      functionsCalled: ["usePaymentAgents.reload", "usePaymentAgents.listPaymentAgentLedger"],
      dbPaths: ["businesses/{businessId}/paymentAgents", "businesses/{businessId}/paymentAgentLedger"],
      result: { count: rows.length, reachedComponent: true, renderedRows: filtered.length },
      sampleAgents: filtered.slice(0, 5).map((row) => ({
        id: row.agent.id,
        name: row.agent.name,
        totalOrders: row.totalOrders,
        paymentsMade: row.paymentsMade,
        duePending: row.duePending,
      })),
    });
  }, [filtered, isPaymentAgentsLoading, rows]);

  const buildLedgerTable = (agent: PaymentAgent) => {
    const summary = buildPaymentAgentAccountingSummary(agent, sourceOrders, ledgerRows[ALL_LEDGER_ROWS_KEY] || []);
    return [...summary.matchedEntries]
      .sort((a, b) => (a.paymentDate || a.createdAt || "").localeCompare(b.paymentDate || b.createdAt || ""))
      .map<LedgerViewRow>((entry) => ({
        id: entry.id,
        date: entry.paymentDate || entry.createdAt || "",
        type: entry.type === "agent_payment" ? "Payment Made" : entry.type === "order_settlement_reversal" ? "Settlement Reversal" : "Order Settlement",
        reference: entry.sourceOrderNumber || entry.sourceOrderId || "—",
        description: entry.type === "agent_payment" ? `${entry.paymentMethod || "—"} · ${entry.note || "—"}` : entry.note || "—",
        debit: entry.type === "agent_payment" ? 0 : Number(entry.amount || 0),
        credit: entry.type === "agent_payment" ? Number(entry.amount || 0) : 0,
        balance: 0,
      }));
  };

  const exportLedgerStatement = () => {
    const active = ledgerAgent ? rows.find((row) => row.agent.id === ledgerAgent) ?? null : null;
    if (!active) return;
    const ledgerTable = buildLedgerTable(active.agent);
    const printableRows = ledgerTable
      .map(
        (row) =>
          `<tr><td>${row.date ? formatIndianDate(row.date) : "—"}</td><td>${row.type}</td><td>${row.reference}</td><td>${row.description}</td><td class="n">${row.debit ? formatAmount(row.debit) : "—"}</td><td class="n">${row.credit ? formatAmount(row.credit) : "—"}</td><td class="n">${formatAmount(row.balance)}</td></tr>`,
      )
      .join("");
    openStatementPdfPrint(
      "Payment Agent Statement",
      `payment-agent-statement-${(active.agent.name || active.agent.id).replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}`,
      `<div><strong>${active.agent.name}</strong></div><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${printableRows}</tbody></table></div>`,
    );
  };

  const submitPayment = async () => {
    if (!payAgentId) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return pushToast({ tone: "danger", text: "Payment amount must be greater than 0." });
    await recordPaymentToAgent(payAgentId, { amount, paymentDate: payDate, paymentMethod: payMethod.trim() || undefined, note: payNote.trim() || undefined });
    const loaded = await listPaymentAgentLedger();
    setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded }));
    pushToast({ tone: "success", text: "Payment recorded." });
    setPayAgentId(null);
    setPayAmount("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod("");
    setPayNote("");
  };

  const toggleLedger = async (agentId: string) => {
    setLedgerAgent(agentId);
    if (!ledgerRows[ALL_LEDGER_ROWS_KEY]) {
      try {
        const loaded = await listPaymentAgentLedger();
        setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded }));
        setLedgerErrors((prev) => {
          const next = { ...prev };
          delete next[ALL_LEDGER_ROWS_KEY];
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load payment-agent ledger.";
        setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: [] }));
        setLedgerErrors((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: message }));
        pushToast({ tone: "danger", text: "Could not load payment-agent ledger." });
      }
    }
  };

  const activeLedgerSummary = ledgerAgent ? rows.find((row) => row.agent.id === ledgerAgent) ?? null : null;
  const activeLedgerRows = ledgerRows[ALL_LEDGER_ROWS_KEY] || [];
  const activeLedgerError = ledgerErrors[ALL_LEDGER_ROWS_KEY] || null;

  const handleLedgerPayment = async (agentId: string, input: { paymentDate: string; amount: number; paymentMethod?: string; note?: string }) => {
    await recordPaymentToAgent(agentId, input);
    const loaded = await listPaymentAgentLedger();
    setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded }));
    pushToast({ tone: "success", text: "Payment recorded." });
  };

  const save = async () => {
    if (!form.name.trim()) return pushToast({ tone: "danger", text: "Payment Agent Name is required." });
    const opening = Math.max(0, Number(form.openingCredit) || 0);
    const now = new Date().toISOString();
    const existing = rows.find((x) => x.agent.id === form.id)?.agent ?? null;
    const agent: PaymentAgent = {
      id: form.id || `pa-${Date.now()}`,
      initials: form.name.trim().slice(0, 2).toUpperCase(),
      name: form.name.trim(),
      agentCode: form.agentCode.trim() || existing?.agentCode || `AG-${Math.floor(Math.random() * 900 + 100)}`,
      phone: form.phone.trim() || undefined,
      wechatId: form.wechatId.trim() || undefined,
      country: form.country.trim() || undefined,
      status: form.status,
      openingCreditBalance: opening,
      creditBalance: existing?.creditBalance ?? opening,
      notes: form.notes.trim() || undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      totalOrdersPaid: existing?.totalOrdersPaid ?? 0,
      totalPaidAmount: existing?.totalPaidAmount ?? 0,
      totalOrderAmount: existing?.totalOrderAmount ?? 0,
      currentDuePayable: existing?.currentDuePayable ?? 0,
    };
    await upsertPaymentAgent(agent);
    setOpen(false);
    setForm({ id: "", name: "", agentCode: "", phone: "", wechatId: "", country: "", openingCredit: "", notes: "", status: "active" });
    pushToast({ tone: "success", text: form.id ? "Payment Agent updated." : "Payment Agent added." });
  };

  const startEdit = (agent: PaymentAgent) => {
    setForm({
      id: agent.id,
      name: agent.name,
      agentCode: agent.agentCode || "",
      phone: agent.phone || "",
      wechatId: agent.wechatId || "",
      country: agent.country || "",
      openingCredit: String(agent.openingCreditBalance ?? 0),
      notes: agent.notes || "",
      status: agent.status,
    });
    setOpen(true);
  };

  const removePaymentAgent = async (agent: PaymentAgent, currentDue: number, currentCredit: number, totalOrders: number) => {
    const agentId = agent.id;
    const normalizedName = agent.name.trim().toLowerCase();
    const linkedSavedOrdersCount = sourceOrders
      .filter((o) => o.status === "saved")
      .filter((o) => o.paymentAgentId === agentId || o.paymentBy === agentId || (o.paymentBy || "").trim().toLowerCase() === normalizedName)
      .length;
    let ledgerHistoryCount = 0;
    try {
      ledgerHistoryCount = (await listPaymentAgentLedger(agentId)).length;
    } catch {}
    const riskDetected = currentDue > 0 || currentCredit > 0 || totalOrders > 0 || linkedSavedOrdersCount > 0 || ledgerHistoryCount > 0;
    logUI("payment_agent_delete_modal_opened", { agentId, riskDetected });
    setDeleteTyped("");
    setDeleteCtx({
      agentId,
      agentName: agent.name || agentId,
      status: agent.status,
      currentDue,
      currentCredit,
      orderHistoryCount: Math.max(totalOrders, linkedSavedOrdersCount),
      ledgerHistoryCount,
      riskDetected,
    });
    setDeleteModalOpen(true);
  };

  const confirmDeletePaymentAgent = async () => {
    if (!deleteCtx) return;
    if (deleteCtx.riskDetected && deleteTyped !== "DELETE AGENT") return;
    try {
      const agent = agents.find((row) => row.id === deleteCtx.agentId) || null;
      if (agent?.lifecycle?.createdByOrder) {
        await orderLifecycleService.safeDeletePaymentAgent(deleteCtx.agentId, "payment-agents-page");
        pushToast({ tone: "success", text: "Payment agent moved to Recycle Bin." });
      } else {
        await deletePaymentAgent(deleteCtx.agentId);
        pushToast({ tone: "success", text: deleteCtx.riskDetected ? "Payment agent deleted. Historical orders and ledger entries were kept." : `Payment agent ${deleteCtx.agentName} deleted.` });
      }
      await reloadPaymentAgents();
    } catch (e) {
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not delete payment agent." });
    }
    setDeleteModalOpen(false);
    setDeleteCtx(null);
    setDeleteTyped("");
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <main className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <section className="card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-[280px] max-w-xl flex-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent, WeChat, customer, order no., payments, notes, due, balance..." leadingIcon={<Search size={14} />} />
            </div>
            <div className="w-[240px]">
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={[
                  { value: "name", label: "Sort: Agent Name" },
                  { value: "orders", label: "Sort: Total Orders High to Low" },
                  { value: "credit", label: "Sort: Total Advanced High to Low" },
                  { value: "used", label: "Sort: Used High to Low" },
                  { value: "due", label: "Sort: Due / Pending High to Low" },
                  { value: "balance", label: "Sort: Credit Left High to Low" },
                  { value: "payments", label: "Sort: Payments Made High to Low" },
                ]}
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                setForm({ id: "", name: "", agentCode: "", phone: "", wechatId: "", country: "", openingCredit: "", notes: "", status: "active" });
                setOpen(true);
              }}
            >
              <Plus size={14} />
              Add Payment Agent
            </Button>
            <Button size="sm" variant="secondary" onClick={exportVisible}>
              <Download size={14} />
              Export
            </Button>
          </section>

          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <div className="w-full min-w-0 px-0.5 py-1">
                <table className="w-full min-w-[1160px] text-[13px]">
                  <thead className="bg-white">
                    <tr className="border-b border-border text-[11px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-left">Agent</th>
                      <th className="px-2 py-2 text-center">Orders</th>
                      <th className="px-2 py-2 text-right">Total Advanced</th>
                      <th className="px-2 py-2 text-right">Used</th>
                      <th className="px-2 py-2 text-right">Due / Pending</th>
                      <th className="px-2 py-2 text-right">Credit Left</th>
                      <th className="px-2 py-2 text-right">Payments Made</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.agent.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-fg">{row.agent.name}</div>
                          <div className="mt-0.5 text-[12px] text-fg-subtle">{row.agent.wechatId?.trim() || row.agent.phone?.trim() || "No WeChat ID"}</div>
                        </td>
                        <td className="px-2 py-2.5 text-center font-semibold">{row.totalOrders}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-sky-700">{formatAmount(row.totalAdvanced)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatAmount(row.totalUsed)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-rose-600">{formatAmount(row.duePending)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatAmount(row.creditLeft)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-sky-700">{formatAmount(row.paymentsMade)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              title="Add Payment"
                              aria-label="Add Payment"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                              onClick={() => setPayAgentId(row.agent.id)}
                            >
                              <HandCoins size={15} />
                            </button>
                            <button
                              type="button"
                              title="View Ledger"
                              aria-label="View Ledger"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                              onClick={() => {
                                void toggleLedger(row.agent.id);
                              }}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              title="Edit Payment Agent"
                              aria-label="Edit Payment Agent"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                              onClick={() => startEdit(row.agent)}
                            >
                              <SquarePen size={15} />
                            </button>
                            <button
                              type="button"
                              title="Delete Payment Agent"
                              aria-label="Delete Payment Agent"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                              onClick={() => removePaymentAgent(row.agent, row.duePending, row.creditLeft, row.totalOrders)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {isPaymentAgentsLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">
                          Loading payment agents...
                        </td>
                      </tr>
                    ) : null}
                    {!isPaymentAgentsLoading && pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">
                          No payment agents found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePagination total={filteredAndSorted.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="payment agents" />
          </section>

          {payAgentId ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card w-full max-w-xl space-y-3 p-4">
              <div className="text-lg font-semibold">Pay Agent</div>
              <Input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Payment Amount" />
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="Payment Method" />
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Notes (optional)" />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPayAgentId(null)}>Cancel</Button>
                <Button variant="primary" onClick={() => void submitPayment()}>Save Payment</Button>
              </div>
            </div>
          </div>
        ) : null}

          {open ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card w-full max-w-2xl space-y-3 p-4">
              <div className="text-lg font-semibold">{form.id ? "Edit Payment Agent" : "Add Payment Agent"}</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Payment Agent Name" />
                <Input value={form.agentCode} onChange={(e) => setForm((s) => ({ ...s, agentCode: e.target.value }))} placeholder="Agent Code (optional)" />
                <Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone" />
                <Input value={form.wechatId} onChange={(e) => setForm((s) => ({ ...s, wechatId: e.target.value }))} placeholder="WeChat ID" />
                <Input value={form.country} onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))} placeholder="Country" />
                <Input type="number" min={0} value={form.openingCredit} onChange={(e) => setForm((s) => ({ ...s, openingCredit: e.target.value }))} placeholder="Opening Credit Balance" />
                <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Notes" />
                <Input value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as PaymentAgent["status"] }))} placeholder="Status" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => void save()}>{form.id ? "Save Changes" : "Save Agent"}</Button>
              </div>
            </div>
          </div>
        ) : null}

          <PaymentAgentLedgerModal
            open={Boolean(activeLedgerSummary)}
            summary={activeLedgerSummary}
            entries={activeLedgerRows}
            orders={sourceOrders}
            error={activeLedgerError}
            onClose={() => setLedgerAgent(null)}
            onExport={exportLedgerStatement}
            onAddPayment={(input) => (activeLedgerSummary ? handleLedgerPayment(activeLedgerSummary.agent.id, input) : Promise.resolve())}
          />

          {deleteModalOpen && deleteCtx ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card w-full max-w-2xl space-y-3 p-4">
              <div className="text-lg font-semibold">{deleteCtx.riskDetected ? "Delete payment agent with payable/credit/history records?" : "Delete Payment Agent?"}</div>
              {deleteCtx.riskDetected ? (
                <div className="space-y-1 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm">
                  <div><span className="text-fg-subtle">Agent:</span> {deleteCtx.agentName}</div>
                  <div><span className="text-fg-subtle">Current Due:</span> {formatAmount(deleteCtx.currentDue)}</div>
                  <div><span className="text-fg-subtle">Current Credit:</span> {formatAmount(deleteCtx.currentCredit)}</div>
                  <div><span className="text-fg-subtle">Order history count:</span> {deleteCtx.orderHistoryCount}</div>
                  <div><span className="text-fg-subtle">Ledger history count:</span> {deleteCtx.ledgerHistoryCount}</div>
                  <div className="pt-2 text-[12px] text-fg-subtle">Deleting this payment agent will remove the agent record only. Existing orders and ledger entries will remain for audit history.</div>
                </div>
              ) : (
                <div className="text-sm text-fg-subtle">This will permanently delete the payment agent record.</div>
              )}
              {deleteCtx.riskDetected ? (
                <div>
                  <div className="mb-1 text-xs text-fg-subtle">Type DELETE AGENT to continue</div>
                  <Input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="DELETE AGENT" />
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (deleteCtx.riskDetected) logUI("payment_agent_delete_force_cancelled", { agentId: deleteCtx.agentId, typedValuePresent: Boolean(deleteTyped) });
                    logUI("payment_agent_delete_modal_cancelled", { agentId: deleteCtx.agentId, riskDetected: deleteCtx.riskDetected });
                    setDeleteModalOpen(false);
                    setDeleteCtx(null);
                    setDeleteTyped("");
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" disabled={deleteCtx.riskDetected && deleteTyped !== "DELETE AGENT"} onClick={() => void confirmDeletePaymentAgent()}>
                  Delete Payment Agent
                </Button>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
