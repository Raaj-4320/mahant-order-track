"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useStore } from "@/lib/store";
import { formatCNY } from "@/lib/data";
import { getPaymentAgentFinanceSummary } from "@/services/paymentAgentSelectors";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Download, Filter, Plus, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import type { PaymentAgent } from "@/lib/types";

export default function PaymentAgentsPage() {
  const { data: agents, upsertPaymentAgent, recordPaymentToAgent, listPaymentAgentLedger } = usePaymentAgents();
  const { orders, pushToast } = useStore();
  const rows = getPaymentAgentFinanceSummary(agents, orders);
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [open,setOpen]=useState(false); const [ledgerAgent, setLedgerAgent] = useState<string | null>(null); const [payAgentId, setPayAgentId] = useState<string | null>(null); const [payAmount, setPayAmount] = useState(""); const [payDate, setPayDate] = useState(new Date().toISOString().slice(0,10)); const [payNote, setPayNote] = useState(""); const [ledgerRows, setLedgerRows] = useState<Record<string, any[]>>({});
  const [form,setForm]=useState({name:"",agentCode:"",phone:"",wechatId:"",country:"",openingCredit:"",notes:"",status:"active" as PaymentAgent["status"]});
  const filtered = useMemo(() => rows.filter((r) => [r.agent.name, r.agent.agentCode, r.agent.wechatId || "", r.agent.phone || ""].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || r.agent.status === status)), [rows, q, status]);
  const active = rows.filter((r) => r.agent.status === "active").length;
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });
  const formatLedgerRow = (e: any) => {
    const type = e.type || "entry";
    const ts = e.paymentDate || e.createdAt;
    if (type === "agent_payment") return `Payment · ${ts} · Amount ${formatCNY(e.amount)} · Due Reduced ${formatCNY(e.dueReduced ?? 0)} · Credit Created ${formatCNY(e.creditCreated ?? 0)} · ${e.note || "—"}`;
    if (type === "order_settlement" || type === "order_settlement_reversal") return `${type === "order_settlement" ? "Order Settlement" : "Settlement Reversal"} · ${ts} · Order ${e.sourceOrderNumber || e.sourceOrderId || "—"} · Amount ${formatCNY(e.amount)} · Credit Used ${formatCNY(e.creditUsed ?? 0)} · Paid Now ${formatCNY(e.paidNow ?? 0)} · Remaining ${formatCNY(e.remainingPayable ?? 0)} · New Credit ${formatCNY(e.newCreditCreated ?? 0)}${e.isReversed ? " · reversed" : ""}`;
    return `${type} · ${ts} · Amount ${formatCNY(e.amount)} · ${e.note || "—"}`;
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
      const rows = await listPaymentAgentLedger(next);
      setLedgerRows((p) => ({ ...p, [next]: rows }));
    }
  };
  const save = async () => {
    if (!form.name.trim()) return pushToast({tone:"danger",text:"Payment Agent Name is required."});
    const opening = Math.max(0, Number(form.openingCredit) || 0);
    const now = new Date().toISOString();
    const agent: PaymentAgent = { id: `pa-${Date.now()}`, initials: form.name.trim().slice(0,2).toUpperCase(), name: form.name.trim(), agentCode: form.agentCode.trim() || `AG-${Math.floor(Math.random()*900+100)}`, phone: form.phone.trim() || undefined, wechatId: form.wechatId.trim() || undefined, country: form.country.trim() || undefined, status: form.status, openingCreditBalance: opening, creditBalance: opening, notes: form.notes.trim() || undefined, createdAt: now, updatedAt: now, totalOrdersPaid: 0, totalPaidAmount: 0 };
    await upsertPaymentAgent(agent); setOpen(false); setForm({name:"",agentCode:"",phone:"",wechatId:"",country:"",openingCredit:"",notes:"",status:"active"}); pushToast({tone:"success",text:"Payment Agent added."});
  };

  return <PageShell title="Payment Agents"><div className="space-y-4 p-6">
    <div className="flex items-center justify-between"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1"><StatCard label="Total Agents" value={rows.length.toString()} icon={<Wallet size={16} />} /><StatCard label="Active Agents" value={active.toString()} /><StatCard label="Total Order Amount" value={formatCNY(rows.reduce((s,r)=>s+r.totalOrderAmount,0))} /><StatCard label="Total Paid" value={formatCNY(rows.reduce((s,r)=>s+r.totalPaidAmount,0))} /><StatCard label="Current Due" value={formatCNY(rows.reduce((s,r)=>s+r.currentDuePayable,0))} /></div><Button onClick={()=>setOpen(true)} variant="primary" className="ml-3"><Plus size={14} />Add Payment Agent</Button></div>
    <div className="card p-3 flex flex-wrap gap-2 items-center"><div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by agent name, code, wechat id, phone..." leadingIcon={<Search size={14} />} /></div><div className="w-[160px]"><Select value={status} onChange={(e)=>setStatus(e.target.value)} options={[{value:"all",label:"All Statuses"},{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]} /></div><Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More</Button><Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button></div>
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-[13px]"><thead className="bg-bg-subtle"><tr><th className="px-4 py-2 text-left">Agent</th><th>Opening Credit</th><th>Current Credit</th><th>Total Order</th><th>Total Paid</th><th>Current Due</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead><tbody>{filtered.map((r)=><><tr key={r.agent.id} className="border-t border-border"><td className="px-4 py-3"><div className="font-semibold">{r.agent.name}</div><div className="text-[11.5px] text-fg-subtle">{r.agent.agentCode}</div></td><td>{formatCNY(r.agent.openingCreditBalance ?? 0)}</td><td>{formatCNY(r.currentCredit)}</td><td>{formatCNY(r.totalOrderAmount)}</td><td>{formatCNY(r.totalPaidAmount)}</td><td>{formatCNY(r.currentDuePayable)}</td><td><StatusBadge status={r.agent.status} /></td><td className="px-4 text-right flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={()=>setPayAgentId(r.agent.id)}>+ Payment</Button><Button size="sm" variant="secondary" onClick={()=>toggleLedger(r.agent.id)}>View Ledger</Button></td></tr>{ledgerAgent===r.agent.id && <tr><td colSpan={8} className="px-4 py-2 bg-bg-subtle text-[12px]"><div>Opening Credit: {formatCNY(r.agent.openingCreditBalance ?? 0)} · Current Credit: {formatCNY(r.currentCredit)}</div>{r.orders.map((o)=><div key={o.id} className="text-fg-subtle">{o.number} · {o.date} · Order {formatCNY((o.lines||[]).reduce((s,l)=>s + (l.totalCtns*l.pcsPerCtn*l.rmbPerPcs),0))} · Credit Used {formatCNY(o.paymentAgentSettlementSnapshot?.creditUsed ?? 0)} · Paid Now {formatCNY(o.paymentAgentSettlementSnapshot?.paidNow ?? 0)} · Remaining {formatCNY(o.paymentAgentSettlementSnapshot?.remainingPayable ?? 0)}</div>)}{(ledgerRows[r.agent.id]||[]).map((e:any)=><div key={e.id} className="text-fg-subtle">{formatLedgerRow(e)}</div>)}</td></tr>}</>)}</tbody></table></div><TablePagination onPlaceholder={placeholder} total={filtered.length} /></div>
    {payAgentId && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-xl p-4 space-y-3"><div className="text-lg font-semibold">Pay Agent</div><Input type="number" min={0} value={payAmount} onChange={(e)=>setPayAmount(e.target.value)} placeholder="Payment Amount" /><Input type="date" value={payDate} onChange={(e)=>setPayDate(e.target.value)} /><Input value={payNote} onChange={(e)=>setPayNote(e.target.value)} placeholder="Notes (optional)" /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={()=>setPayAgentId(null)}>Cancel</Button><Button variant="primary" onClick={submitPayment}>Save Payment</Button></div></div></div>}
    {open && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="card w-full max-w-2xl p-4 space-y-3"><div className="text-lg font-semibold">Add Payment Agent</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2"><Input value={form.name} onChange={(e)=>setForm((s)=>({...s,name:e.target.value}))} placeholder="Payment Agent Name" /><Input value={form.agentCode} onChange={(e)=>setForm((s)=>({...s,agentCode:e.target.value}))} placeholder="Agent Code (optional)" /><Input value={form.phone} onChange={(e)=>setForm((s)=>({...s,phone:e.target.value}))} placeholder="Phone" /><Input value={form.wechatId} onChange={(e)=>setForm((s)=>({...s,wechatId:e.target.value}))} placeholder="WeChat ID" /><Input value={form.country} onChange={(e)=>setForm((s)=>({...s,country:e.target.value}))} placeholder="Country" /><Input type="number" min={0} value={form.openingCredit} onChange={(e)=>setForm((s)=>({...s,openingCredit:e.target.value}))} placeholder="Opening Credit Balance" /><Input value={form.notes} onChange={(e)=>setForm((s)=>({...s,notes:e.target.value}))} placeholder="Notes" /><Select value={form.status} onChange={(e)=>setForm((s)=>({...s,status:e.target.value as PaymentAgent["status"]}))} options={[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]} /></div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save Agent</Button></div></div></div>}
  </div></PageShell>;
}
