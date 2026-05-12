"use client";

import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useStore } from "@/lib/store";
import { formatCNY } from "@/lib/data";
import { getPaymentAgentStats } from "@/services/selectors";
import { ActionIcons } from "@/components/table/ActionIcons";
import { StatusBadge } from "@/components/table/StatusBadge";
import { TablePagination } from "@/components/table/TablePagination";
import { Download, Filter, Plus, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

export default function PaymentAgentsPage() {
  const { data: agents } = usePaymentAgents();
  const { orders, pushToast } = useStore();
  const statsRows = getPaymentAgentStats(agents, orders).map((x) => ({ ...x.agent, totalOrdersPaid: x.totalOrdersPaid, totalPaidAmount: x.totalPaidAmount }));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => statsRows.filter((a) => [a.name, a.agentCode, a.wechatId, a.phone].join(" ").toLowerCase().includes(q.toLowerCase().trim()) && (status === "all" || a.status === status)), [statsRows, q, status]);
  const active = statsRows.filter((a) => a.status === "active").length;
  const placeholder = () => pushToast({ tone: "info", text: "This action will be connected in a later phase." });

  return (
    <PageShell title="Payment Agents">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1">
            <StatCard label="Total Agents" value={statsRows.length.toString()} icon={<Wallet size={16} />} />
            <StatCard label="Active Agents" value={active.toString()} />
            <StatCard label="Inactive Agents" value={(statsRows.length - active).toString()} />
            <StatCard label="Total Paid Amount" value={formatCNY(statsRows.reduce((s, a) => s + a.totalPaidAmount, 0))} />
            <StatCard label="Total Orders Paid" value={statsRows.reduce((s, a) => s + a.totalOrdersPaid, 0).toString()} />
          </div>
          <Button onClick={placeholder} variant="primary" className="ml-3"><Plus size={14} />Add Payment Agent</Button>
        </div>

        <div className="card p-3 flex flex-wrap gap-2 items-center">
          <div className="min-w-[280px] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by agent name, code, wechat id, phone..." leadingIcon={<Search size={14} />} /></div>
          <div className="w-[160px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>
          <div className="w-[160px]"><Select value="all" onChange={placeholder} options={[{ value: "all", label: "All Countries" }]} /></div>
          <Button onClick={placeholder} size="sm" variant="secondary"><Filter size={14} />More Filters</Button>
          <Button onClick={placeholder} size="sm" variant="secondary"><Download size={14} />Export</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-bg-subtle"><tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><th className="px-4 py-2">Agent</th><th>Contact & WeChat</th><th>Country</th><th>Total Orders Paid</th><th>Total Paid Amount</th><th>Status</th><th className="text-right px-4">Actions</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-subtle text-[12px] font-semibold">{a.initials}</div><div><div className="font-semibold">{a.name}</div><div className="text-[11.5px] text-fg-subtle">{a.agentCode}</div></div></div></td>
                    <td><div>{a.phone}</div><div className="text-[11.5px] text-fg-subtle">{a.wechatId}</div></td>
                    <td>{a.country}</td>
                    <td>{a.totalOrdersPaid}</td>
                    <td className="font-semibold text-[var(--success)] tabular-nums">{formatCNY(a.totalPaidAmount)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="px-4"><ActionIcons onPlaceholder={placeholder} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">No payment agents found.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination onPlaceholder={placeholder} total={filtered.length} />
        </div>
      </div>
    </PageShell>
  );
}
