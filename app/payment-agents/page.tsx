"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useOrders } from "@/hooks/useOrders";
import { useStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import { openStatementPdfPrint } from "@/services/statementPdf";
import { getPaymentAgentFinanceSummary } from "@/services/paymentAgentSelectors";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Download, Filter, Plus, Search, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow, logUI } from "@/lib/logger";
import type { PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { ordersDataSource } from "@/lib/runtimeConfig";

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
  const { data: agents, isLoading: isPaymentAgentsLoading, upsertPaymentAgent, deletePaymentAgent, recordPaymentToAgent, listPaymentAgentLedger } = usePaymentAgents();
  const { orders, pushToast } = useStore();
  const { data: firebaseOrders } = useOrders();
  const ordersSource = ordersDataSource();
  const sourceOrders = ordersSource === "firebase" ? firebaseOrders : orders;
  const rows = getPaymentAgentFinanceSummary(agents, sourceOrders);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [ledgerAgent, setLedgerAgent] = useState<string | null>(null);
  const [payAgentId, setPayAgentId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [ledgerRows, setLedgerRows] = useState<Record<string, PaymentAgentLedgerEntry[]>>({});
  const [form, setForm] = useState({ id: "", name: "", agentCode: "", phone: "", wechatId: "", country: "", openingCredit: "", notes: "", status: "active" as PaymentAgent["status"] });
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

  const scopeRows = useMemo(() => rows.filter((r) => status === "all" || r.agent.status === status), [rows, status]);
  const filtered = useMemo(() => scopeRows.filter((r) => [r.agent.name, r.agent.agentCode, r.agent.wechatId || "", r.agent.phone || ""].join(" ").toLowerCase().includes(q.toLowerCase().trim())), [scopeRows, q]);
  const hiddenInactiveCount = rows.filter((r) => r.agent.status !== "active").length;
  const kpiScopeLabel = status === "all" ? "All status" : status === "active" ? "Active only" : "Inactive only";
  const scopeTitle = status === "all" ? "Total Agents" : status === "active" ? "Active Agents" : "Inactive Agents";
  const scopedTotals = useMemo(() => ({
    totalAgents: scopeRows.length,
    totalOrderAmount: scopeRows.reduce((s, r) => s + r.totalOrderAmount, 0),
    totalPaid: scopeRows.reduce((s, r) => s + r.totalPaidAmount, 0),
    currentDue: scopeRows.reduce((s, r) => s + r.currentDuePayable, 0),
    currentCredit: scopeRows.reduce((s, r) => s + r.currentCredit, 0),
  }), [scopeRows]);
  useEffect(() => { logPageAccess("Payment Agents", { component: "app/payment-agents/page.tsx", source: process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? "mock" }); }, []);
  const paymentAgentsFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (paymentAgentsFlowLoggedRef.current) return;
    if (isPaymentAgentsLoading) return;
    paymentAgentsFlowLoggedRef.current = true;
    logDataFlow("Payment Agents", { functionsCalled:["usePaymentAgents.reload"], dbPaths:["businesses/{businessId}/paymentAgents"], result:{count:rows.length,reachedComponent:true,renderedRows:filtered.length}, totals:{currentDue:rows.reduce((s,r)=>s+r.currentDuePayable,0),currentCredit:rows.reduce((s,r)=>s+r.currentCredit,0),totalPaid:rows.reduce((s,r)=>s+r.totalPaidAmount,0)}, sampleAgents:filtered.slice(0,5).map((r)=>({id:r.agent.id,name:r.agent.name,status:r.agent.status,currentDue:r.currentDuePayable,currentCredit:r.currentCredit})) });
  }, [isPaymentAgentsLoading, rows.length, filtered.length]);

  const buildLedgerTable = (agentId: string, openingCredit: number) => {
    const source = [...(ledgerRows[agentId] || [])].sort((a, b) => {
      const aTs = a.paymentDate || a.createdAt || "";
      const bTs = b.paymentDate || b.createdAt || "";
      return aTs.localeCompare(bTs);
    });
    const result: LedgerViewRow[] = [];
    let runningBalance = 0;

    if (openingCredit > 0) {
      runningBalance += openingCredit;
      result.push({ id: `opening-${agentId}`, date: "—", type: "Opening Credit", reference: "Opening", description: "Opening credit balance", debit: 0, credit: openingCredit, balance: runningBalance });
    }

    for (const entry of source) {
      let debit = 0;
      let credit = 0;
      let type = "Entry";
      let description = entry.note || "—";
      if (entry.type === "order_settlement") {
        type = "Order Settlement";
        debit = Number(entry.amount || 0);
        credit = Number(entry.creditUsed || 0) + Number(entry.paidNow || 0);
        description = `Order ${entry.sourceOrderNumber || entry.sourceOrderId || "—"} · Credit used ${formatAmount(entry.creditUsed || 0)} · Paid ${formatAmount(entry.paidNow || 0)} · Remaining due ${formatAmount(entry.remainingPayable || 0)}`;
      } else if (entry.type === "order_settlement_reversal") {
        type = "Reversal";
        debit = -(Number(entry.amount || 0));
        credit = -(Number(entry.creditUsed || 0) + Number(entry.paidNow || 0));
        description = `Reversal of order ${entry.sourceOrderNumber || entry.sourceOrderId || "—"}`;
      } else if (entry.type === "agent_payment") {
        type = "Agent Payment";
        credit = Number(entry.amount || 0);
        description = `Payment to agent · Due reduced ${formatAmount(entry.dueReduced || 0)} · Credit created ${formatAmount(entry.creditCreated || 0)}`;
      }
      runningBalance += credit - debit;
      result.push({
        id: entry.id,
        date: entry.paymentDate || entry.createdAt || "",
        type,
        reference: entry.sourceOrderNumber || entry.sourceOrderId || entry.id,
        description,
        debit,
        credit,
        balance: runningBalance,
      });
    }
    return result;
  };

  const submitPayment = async () => {
    if (!payAgentId) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return pushToast({ tone: "danger", text: "Payment amount must be greater than 0." });
    await recordPaymentToAgent(payAgentId, { amount, paymentDate: payDate, note: payNote });
    pushToast({ tone: "success", text: "Payment recorded." });
    setPayAgentId(null); setPayAmount(""); setPayNote("");
  };

  const toggleLedger = async (agentId: string) => {
    const next = ledgerAgent === agentId ? null : agentId;
    setLedgerAgent(next);
    if (next) {
      const loaded = await listPaymentAgentLedger(next);
      setLedgerRows((p) => ({ ...p, [next]: loaded }));
    }
  };

  const save = async () => {
    if (!form.name.trim()) return pushToast({ tone: "danger", text: "Payment Agent Name is required." });
    const opening = Math.max(0, Number(form.openingCredit) || 0);
    const now = new Date().toISOString();
    const existing = form.id ? rows.find((x) => x.agent.id === form.id)?.agent : null;
    const agent: PaymentAgent = { id: form.id || `pa-${Date.now()}`, initials: form.name.trim().slice(0, 2).toUpperCase(), name: form.name.trim(), agentCode: form.agentCode.trim() || existing?.agentCode || `AG-${Math.floor(Math.random() * 900 + 100)}`, phone: form.phone.trim() || undefined, wechatId: form.wechatId.trim() || undefined, country: form.country.trim() || undefined, status: form.status, openingCreditBalance: opening, creditBalance: existing?.creditBalance ?? opening, notes: form.notes.trim() || undefined, createdAt: existing?.createdAt || now, updatedAt: now, totalOrdersPaid: existing?.totalOrdersPaid ?? 0, totalPaidAmount: existing?.totalPaidAmount ?? 0, totalOrderAmount: existing?.totalOrderAmount ?? 0, currentDuePayable: existing?.currentDuePayable ?? 0 };
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
    try { ledgerHistoryCount = (await listPaymentAgentLedger(agentId)).length; } catch {}
    const riskDetected = currentDue > 0 || currentCredit > 0 || totalOrders > 0 || linkedSavedOrdersCount > 0 || ledgerHistoryCount > 0;
    if (riskDetected) {
      const riskPayload = { agentId, agentName: agent.name, currentDue, currentCredit, totalOrders, linkedSavedOrdersCount, ledgerHistoryCount };
      logUI("payment_agent_delete_blocked", { ...riskPayload, reason: "risk_detected_requires_force_confirmation" });
      logUI("payment_agent_delete_risk_detected", riskPayload);
      logUI("payment_agent_delete_force_confirm_opened", riskPayload);
      logUI("payment_agent_delete_modal_opened", { agentId, riskDetected: true });
      setDeleteTyped("");
      setDeleteCtx({
        agentId,
        agentName: agent.name || agentId,
        status: agent.status,
        currentDue,
        currentCredit,
        orderHistoryCount: Math.max(totalOrders, linkedSavedOrdersCount),
        ledgerHistoryCount,
        riskDetected: true,
      });
      setDeleteModalOpen(true);
      return;
    } else {
      logUI("payment_agent_delete_modal_opened", { agentId, riskDetected: false });
      setDeleteTyped("");
      setDeleteCtx({
        agentId,
        agentName: agent.name || agentId,
        status: agent.status,
        currentDue,
        currentCredit,
        orderHistoryCount: Math.max(totalOrders, linkedSavedOrdersCount),
        ledgerHistoryCount,
        riskDetected: false,
      });
      setDeleteModalOpen(true);
      return;
    }
  };

  const confirmDeletePaymentAgent = async () => {
    if (!deleteCtx) return;
    if (deleteCtx.riskDetected && deleteTyped !== "DELETE AGENT") return;
    if (deleteCtx.riskDetected) logUI("payment_agent_delete_force_confirmed", { agentId: deleteCtx.agentId });
    logUI("payment_agent_delete_started", { agentId: deleteCtx.agentId, status: deleteCtx.status });
    try {
      await deletePaymentAgent(deleteCtx.agentId);
      logUI("payment_agent_delete_success", { agentId: deleteCtx.agentId });
      pushToast({ tone: "success", text: deleteCtx.riskDetected ? "Payment agent deleted. Historical orders and ledger entries were kept." : `Payment agent ${deleteCtx.agentName} deleted.` });
    } catch (e) {
      logUI("payment_agent_delete_failed", { agentId: deleteCtx.agentId, error: e instanceof Error ? e.message : String(e) });
      pushToast({ tone: "danger", text: e instanceof Error ? e.message : "Could not delete payment agent." });
    }
    setDeleteModalOpen(false);
    setDeleteCtx(null);
    setDeleteTyped("");
  };

  return <PageShell title="Payment Agents"><div className="space-y-4 p-6">
    <div className="flex items-center justify-between"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1"><StatCard label={`${scopeTitle} (${kpiScopeLabel})`} value={scopedTotals.totalAgents.toString()} icon={<Wallet size={16} />} /><StatCard label={`Current Credit (${kpiScopeLabel})`} value={formatAmount(scopedTotals.currentCredit)} /><StatCard label={`Total Order Amount (${kpiScopeLabel})`} value={formatAmount(scopedTotals.totalOrderAmount)} /><StatCard label={`Total Paid (${kpiScopeLabel})`} value={formatAmount(scopedTotals.totalPaid)} /><StatCard label={`Current Due (${kpiScopeLabel})`} value={formatAmount(scopedTotals.currentDue)} /></div><Button onClick={() => { setForm({ id: "", name: "", agentCode: "", phone: "", wechatId: "", country: "", openingCredit: "", notes: "", status: "active" }); setOpen(true); }} variant="primary" className="ml-3"><Plus size={14} />Add Payment Agent</Button></div>
    {status === "active" && hiddenInactiveCount > 0 ? <div className="text-[12px] text-fg-subtle">Showing active payment-agent KPIs only. {hiddenInactiveCount} inactive agent{hiddenInactiveCount === 1 ? "" : "s"} excluded from KPI totals.</div> : null}
    <div className="card p-3 flex flex-wrap gap-2 items-center"><div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by agent name, code, wechat id, phone..." leadingIcon={<Search size={14} />} /></div><div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div><Button size="sm" variant="secondary" disabled title="Filtering is not enabled in this phase."><Filter size={14} />More</Button><Button size="sm" variant="secondary" disabled title="Export is not enabled in this phase."><Download size={14} />Export</Button></div>

    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-[13px]"><thead className="bg-bg-subtle"><tr><th className="px-4 py-2 text-left">Agent</th><th>Opening Credit</th><th>Current Credit</th><th>Total Order</th><th>Total Paid</th><th>Current Due</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead><tbody>{filtered.map((r) => { const ledgerTable = buildLedgerTable(r.agent.id, r.agent.openingCreditBalance ?? 0); return <><tr key={r.agent.id} className="border-t border-border"><td className="px-4 py-3"><div className="font-semibold">{r.agent.name}</div><div className="text-[11.5px] text-fg-subtle">{r.agent.agentCode}</div></td><td>{formatAmount(r.agent.openingCreditBalance ?? 0)}</td><td>{formatAmount(r.currentCredit)}</td><td>{formatAmount(r.totalOrderAmount)}</td><td>{formatAmount(r.totalPaidAmount)}</td><td>{formatAmount(r.currentDuePayable)}</td><td><StatusBadge status={r.agent.status} /></td><td className="px-4 text-right flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setPayAgentId(r.agent.id)}>+ Payment</Button><Button size="sm" variant="secondary" onClick={() => toggleLedger(r.agent.id)}>View Ledger</Button><Button size="sm" variant="secondary" onClick={() => startEdit(r.agent)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => removePaymentAgent(r.agent, r.currentDuePayable, r.currentCredit, r.totalOrders)} title="Delete payment agent if due/credit are zero and no order/ledger history exists.">Delete</Button></td></tr>
      {ledgerAgent === r.agent.id && <tr><td colSpan={8} className="px-4 py-3 bg-bg-subtle space-y-3"><div className="flex items-center justify-between"><div className="text-sm font-semibold">Payment Agent Statement</div><Button size="sm" variant="secondary" onClick={() => { const printableRows = ledgerTable.map((row) => `<tr><td>${row.date ? formatIndianDate(row.date) : "—"}</td><td>${row.type}</td><td>${row.reference}</td><td>${row.description}</td><td class="n">${row.debit ? formatAmount(row.debit) : "—"}</td><td class="n">${row.credit ? formatAmount(row.credit) : "—"}</td><td class="n">${formatAmount(row.balance)}</td></tr>`).join(""); openStatementPdfPrint("Payment Agent Statement", `payment-agent-statement-${(r.agent.name || r.agent.id).replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}`, `<div><strong>${r.agent.name}</strong> ${r.agent.agentCode ? `(${r.agent.agentCode})` : ""}</div><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${printableRows}</tbody></table></div>`); }}>Download Statement PDF</Button></div><div className="grid grid-cols-2 gap-2 md:grid-cols-5"><div className="rounded border border-border p-2"><div className="text-[10px] text-fg-subtle uppercase">Opening Credit</div><div className="text-lg font-semibold tabular-nums">{formatAmount(r.agent.openingCreditBalance ?? 0)}</div></div><div className="rounded border border-border p-2"><div className="text-[10px] text-fg-subtle uppercase">Current Credit</div><div className="text-lg font-semibold tabular-nums">{formatAmount(r.currentCredit)}</div></div><div className="rounded border border-border p-2"><div className="text-[10px] text-fg-subtle uppercase">Total Order</div><div className="text-lg font-semibold tabular-nums">{formatAmount(r.totalOrderAmount)}</div></div><div className="rounded border border-border p-2"><div className="text-[10px] text-fg-subtle uppercase">Total Paid</div><div className="text-lg font-semibold tabular-nums">{formatAmount(r.totalPaidAmount)}</div></div><div className="rounded border border-border p-2"><div className="text-[10px] text-fg-subtle uppercase">Current Due</div><div className="text-xl font-bold text-[var(--danger)] tabular-nums">{formatAmount(r.currentDuePayable)}</div></div></div>
      <div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[980px] text-[12px]"><thead className="bg-bg-card"><tr className="text-left uppercase text-[11px] text-fg-subtle"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Debit</th><th className="px-2 py-2 text-right">Credit</th><th className="px-2 py-2 text-right">Balance</th></tr></thead><tbody>{ledgerTable.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-2 py-2">{row.date ? formatIndianDate(row.date) : "—"}</td><td className="px-2 py-2">{row.type}</td><td className="px-2 py-2">{row.reference}</td><td className="px-2 py-2">{row.description}</td><td className="px-2 py-2 text-right tabular-nums">{row.debit ? formatAmount(row.debit) : "—"}</td><td className="px-2 py-2 text-right tabular-nums">{row.credit ? formatAmount(row.credit) : "—"}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{formatAmount(row.balance)}</td></tr>)}</tbody></table></div></td></tr>}</>; })}</tbody></table></div><TablePagination total={filtered.length} /></div>

    {payAgentId && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-xl p-4 space-y-3"><div className="text-lg font-semibold">Pay Agent</div><Input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Payment Amount" /><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /><Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Notes (optional)" /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPayAgentId(null)}>Cancel</Button><Button variant="primary" onClick={submitPayment}>Save Payment</Button></div></div></div>}
    {open && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-2xl p-4 space-y-3"><div className="text-lg font-semibold">{form.id ? "Edit Payment Agent" : "Add Payment Agent"}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2"><Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Payment Agent Name" /><Input value={form.agentCode} onChange={(e) => setForm((s) => ({ ...s, agentCode: e.target.value }))} placeholder="Agent Code (optional)" /><Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone" /><Input value={form.wechatId} onChange={(e) => setForm((s) => ({ ...s, wechatId: e.target.value }))} placeholder="WeChat ID" /><Input value={form.country} onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))} placeholder="Country" /><Input type="number" min={0} value={form.openingCredit} onChange={(e) => setForm((s) => ({ ...s, openingCredit: e.target.value }))} placeholder="Opening Credit Balance" /><Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Notes" /><Select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as PaymentAgent["status"] }))} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>{form.id ? "Save Changes" : "Save Agent"}</Button></div></div></div>}
    {deleteModalOpen && deleteCtx ? <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-2xl p-4 space-y-3"><div className="text-lg font-semibold">{deleteCtx.riskDetected ? "Delete payment agent with payable/credit/history records?" : "Delete Payment Agent?"}</div>{deleteCtx.riskDetected ? <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm space-y-1"><div><span className="text-fg-subtle">Agent:</span> {deleteCtx.agentName}</div><div><span className="text-fg-subtle">Current Due:</span> {formatAmount(deleteCtx.currentDue)}</div><div><span className="text-fg-subtle">Current Credit:</span> {formatAmount(deleteCtx.currentCredit)}</div><div><span className="text-fg-subtle">Order history count:</span> {deleteCtx.orderHistoryCount}</div><div><span className="text-fg-subtle">Ledger history count:</span> {deleteCtx.ledgerHistoryCount}</div><div className="pt-2 text-[12px] text-fg-subtle">Deleting this payment agent will remove the agent record only. Existing orders and ledger entries will remain for audit history.</div></div> : <div className="text-sm text-fg-subtle">This will permanently delete the payment agent record.</div>}{deleteCtx.riskDetected ? <div><div className="text-xs text-fg-subtle mb-1">Type DELETE AGENT to continue</div><Input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="DELETE AGENT" /></div> : null}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { if (deleteCtx.riskDetected) logUI("payment_agent_delete_force_cancelled", { agentId: deleteCtx.agentId, typedValuePresent: Boolean(deleteTyped) }); logUI("payment_agent_delete_modal_cancelled", { agentId: deleteCtx.agentId, riskDetected: deleteCtx.riskDetected }); setDeleteModalOpen(false); setDeleteCtx(null); setDeleteTyped(""); }}>Cancel</Button><Button variant="primary" disabled={deleteCtx.riskDetected && deleteTyped !== "DELETE AGENT"} onClick={confirmDeletePaymentAgent}>Delete Payment Agent</Button></div></div></div> : null}
  </div></PageShell>;
}
