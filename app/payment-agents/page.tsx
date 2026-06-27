"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, HandCoins, Plus, Search, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TablePagination } from "@/components/table/TablePagination";
import { Select } from "@/components/ui/Select";
import { PaymentAgentLedgerModal } from "@/components/payment-agents/PaymentAgentLedgerModal";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useStore } from "@/lib/store";
import { formatAmount } from "@/lib/data";
import { formatIndianDate } from "@/lib/dateFormat";
import { logDataFlow, logPageAccess, logUI } from "@/lib/logger";
import type { PaymentAgent, PaymentAgentLedgerEntry } from "@/lib/types";
import { lineTotalPcs, lineTotalRmb, orderTotal } from "@/lib/types";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { openStatementPdfPrint } from "@/services/statementPdf";
import { orderLifecycleService } from "@/services/orderLifecycleService";
import { buildPaymentAgentAccountingSummary } from "@/services/settlement/paymentAgentAccounting";
import { getLineCustomerDisplay } from "@/services/customers/customerResolution";
import { measurePerfSync } from "@/lib/perfDebug";
import { getOrderPaymentAgentLinkedAgentIds, getOrderPaymentAgentSplitSettlementEntryId, getOrderPaymentAgentSplits, hasRealPaymentAgentSplits, isVirtualLegacyPaymentAgentSplit } from "@/services/settlement/paymentAgentSplits";
import { calculatePaymentAgentLiveFinance, type PaymentAgentLiveFinance } from "@/services/paymentAgentDirectFinanceSync";

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

type PaymentAgentRepairFinding = {
  id: string;
  title: string;
  details: string;
  proposedFix: string;
};

type PaymentAgentRepairReport = {
  generatedAt: string;
  scannedAgents: number;
  scannedOrders: number;
  scannedLedgerRows: number;
  findings: PaymentAgentRepairFinding[];
};

type PaymentAgentRepairApplyResult = {
  repairedOrders: number;
  repairedSplits: number;
  repairedLedgerRows: number;
  recomputedAgents: number;
  logs: Array<{
    collection: "orders" | "paymentAgentLedger" | "paymentAgents";
    orderId?: string;
    orderNumber?: string;
    agentId?: string;
    agentName?: string;
    targetId?: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const formatPercent = (value: number) => {
  const safe = clampPercent(value);
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1);
};
const canonicalComparisonDebugEnabled = process.env.NODE_ENV !== "production";
const clampMoney = (value: number | undefined | null) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const clampCount = (value: number | undefined | null) => Math.max(0, Number(value) || 0);

export default function PaymentAgentsPage() {
  const PAGE_SIZE = 100;
  const testingRepairApplyEnabled = process.env.NEXT_PUBLIC_ENABLE_PAYMENT_AGENT_REPAIR_APPLY === "true";
  const { data: agents, isLoading: isPaymentAgentsLoading, upsertPaymentAgent, deletePaymentAgent, recordPaymentToAgent, deletePaymentAgentLedgerEntry, listPaymentAgentLedger, applyTestingPaymentAgentRepair, reload: reloadPaymentAgents } = usePaymentAgents();
  const { data: customers } = useCustomers();
  const { orders, pushToast } = useStore();
  const { data: firebaseOrders, reload: reloadOrders } = useOrders();
  const ordersSource = ordersDataSource();
  const sourceOrders = ordersSource === "firebase" ? firebaseOrders : orders;

  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("priority");
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
  const [viewTab, setViewTab] = useState<"agents" | "live-orders">("agents");
  const [repairReport, setRepairReport] = useState<PaymentAgentRepairReport | null>(null);
  const [repairReportOpen, setRepairReportOpen] = useState(false);
  const [repairReportBusy, setRepairReportBusy] = useState(false);
  const [repairReportError, setRepairReportError] = useState<string | null>(null);
  const [repairApplyBusy, setRepairApplyBusy] = useState(false);
  const [repairApplyResult, setRepairApplyResult] = useState<PaymentAgentRepairApplyResult | null>(null);
  const [pendingRepairRescan, setPendingRepairRescan] = useState(false);
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
  const paymentAgentComparisonLoggedRef = useRef<Set<string>>(new Set());

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
    return measurePerfSync("calc", "paymentAgentsPage.rows", { agentsCount: agents.length, ordersCount: sourceOrders.length, ledgerCount: (ledgerRows[ALL_LEDGER_ROWS_KEY] || []).length }, () => {
    const allLedger = ledgerRows[ALL_LEDGER_ROWS_KEY] || [];
    return agents.map((agent) => {
      const summary = buildPaymentAgentAccountingSummary(agent, sourceOrders, allLedger, customers);
      const liveFinance = calculatePaymentAgentLiveFinance(agent, sourceOrders, allLedger);
      const liveOrderRows = liveFinance.orderRows.map((row) => {
        const order = row.order;
        const firstLine = order.lines[0];
        return {
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          orderDate: row.orderDate,
          customer: order.lines.map((line) => getLineCustomerDisplay(line, customers)).filter(Boolean).join(", ") || "-",
          products: order.lines.map((line) => line.marka || "").filter(Boolean).join(", ") || "-",
          orderAmount: row.assigned,
          agentPaid: row.creditUsed,
          remaining: row.remaining,
          productImage: firstLine?.productPhotoUrl || firstLine?.photoUrl || "",
          marka: firstLine?.marka,
          details: [firstLine?.detail1, firstLine?.detail2, firstLine?.detail3].filter(Boolean).join(" / "),
          totalCtns: firstLine?.totalCtns,
          pcsPerCtn: firstLine?.pcsPerCtn,
          totalPcs: firstLine ? lineTotalPcs(firstLine) : 0,
          rate: firstLine?.rmbPerPcs,
          amount: firstLine ? lineTotalRmb(firstLine) : 0,
          loadingDate: order.loadingDate || "",
        };
      });
      const modalSummary = {
        ...summary,
        totalAdvanced: liveFinance.advance,
        totalUsed: liveFinance.creditUsed,
        creditLeft: liveFinance.available,
        duePending: liveFinance.pending,
        totalOrders: liveFinance.ordersCount,
        totalOrderAmount: liveFinance.assigned,
        orderRows: liveOrderRows,
      };
      const storedFinance = {
        totalOrders: clampCount(agent.totalOrdersPaid),
        totalAdvanced: clampMoney((agent.openingCreditBalance ?? 0) + (agent.totalPaidAmount ?? 0)),
        totalUsed: clampMoney(agent.totalUsedAmount),
        duePending: clampMoney(agent.currentDuePayable ?? agent.currentPayable),
        creditLeft: clampMoney(agent.creditBalance),
      };
      if (canonicalComparisonDebugEnabled) {
        const hasMismatch =
          storedFinance.totalOrders !== liveFinance.ordersCount
          || storedFinance.totalAdvanced !== liveFinance.advance
          || storedFinance.totalUsed !== liveFinance.creditUsed
          || storedFinance.duePending !== liveFinance.pending
          || storedFinance.creditLeft !== liveFinance.available;
        if (hasMismatch && !paymentAgentComparisonLoggedRef.current.has(agent.id)) {
          paymentAgentComparisonLoggedRef.current.add(agent.id);
          console.debug("[PaymentAgent Canonical Comparison]", {
            agentId: agent.id,
            agentName: agent.name,
            stored: storedFinance,
            live: {
              totalOrders: liveFinance.ordersCount,
              totalAdvanced: liveFinance.advance,
              totalUsed: liveFinance.creditUsed,
              duePending: liveFinance.pending,
              creditLeft: liveFinance.available,
            },
          });
        }
      }
      const searchText = [
        agent.name,
        agent.wechatId || "",
        agent.phone || "",
        agent.country || "",
        agent.notes || "",
        formatAmount(liveFinance.advance),
        formatAmount(liveFinance.creditUsed),
        formatAmount(liveFinance.pending),
        formatAmount(liveFinance.available),
        formatAmount(liveFinance.manualPayments),
        liveFinance.orderRows.map((row) => row.orderNumber).join(" "),
        liveFinance.orderRows.flatMap((row) => row.order.lines.map((line) => getLineCustomerDisplay(line, customers))).join(" "),
        summary.matchedEntries.map((entry) => entry.note || "").join(" "),
        summary.matchedEntries.map((entry) => entry.paymentMethod || "").join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return {
        ...modalSummary,
        canonicalSummary: modalSummary,
        liveFinance,
        totalOrders: liveFinance.ordersCount,
        totalAdvanced: liveFinance.advance,
        totalUsed: liveFinance.creditUsed,
        duePending: liveFinance.pending,
        creditLeft: liveFinance.available,
        paymentsMade: liveFinance.manualPayments,
        usagePercent: liveFinance.advance > 0 ? clampPercent((liveFinance.creditUsed / liveFinance.advance) * 100) : 0,
        availablePercent: liveFinance.advance > 0 ? clampPercent((liveFinance.available / liveFinance.advance) * 100) : 0,
        storedFinance,
        searchText,
      };
    });
    });
  }, [agents, ledgerRows, sourceOrders, customers]);
  const visibleRows = useMemo(
    () => rows.filter((row) => row.agent.status !== "inactive" && row.agent.lifecycle?.status !== "deleted"),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return visibleRows;
    return visibleRows.filter((row) => row.searchText.includes(query));
  }, [visibleRows, q]);
  const filteredAndSorted = useMemo(() => {
    return [...filtered].sort((left, right) => {
      if (sortBy === "priority") {
        const leftHasDue = left.duePending > 0 ? 1 : 0;
        const rightHasDue = right.duePending > 0 ? 1 : 0;
        if (rightHasDue !== leftHasDue) return rightHasDue - leftHasDue;
        if (right.duePending !== left.duePending) return right.duePending - left.duePending;
        if (right.creditLeft !== left.creditLeft) return right.creditLeft - left.creditLeft;
        return left.agent.name.localeCompare(right.agent.name);
      }
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

  const liveOrderRows = useMemo(() => {
    const query = q.toLowerCase().trim();
    return [...sourceOrders]
      .map((order) => {
        const linkedAgentIds = getOrderPaymentAgentLinkedAgentIds(order);
        const splits = getOrderPaymentAgentSplits(order);
        return {
          order,
          linkedAgentIds,
          splits,
          customer: order.lines.map((line) => getLineCustomerDisplay(line, customers)).filter(Boolean).join(", ") || "-",
          totalAmount: orderTotal(order),
          searchText: [
            order.number || order.orderNumber || "",
            order.status || "",
            order.wechatId || "",
            linkedAgentIds.join(" "),
            order.lines.map((line) => line.marka || "").join(" "),
            order.lines.map((line) => getLineCustomerDisplay(line, customers)).join(" "),
            JSON.stringify(splits),
          ].join(" ").toLowerCase(),
        };
      })
      .filter((row) => !query || row.searchText.includes(query))
      .sort((left, right) =>
        (right.order.date || right.order.createdAt || "").localeCompare(left.order.date || left.order.createdAt || "")
        || (right.order.number || right.order.orderNumber || "").localeCompare(left.order.number || left.order.orderNumber || "", undefined, { numeric: true, sensitivity: "base" }),
      );
  }, [customers, q, sourceOrders]);
  const liveOrdersTotalPages = Math.max(1, Math.ceil(liveOrderRows.length / PAGE_SIZE));
  const pagedLiveOrderRows = useMemo(
    () => liveOrderRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [liveOrderRows, currentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [q, sortBy, viewTab]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, viewTab === "agents" ? totalPages : liveOrdersTotalPages));
  }, [liveOrdersTotalPages, totalPages, viewTab]);

  const exportVisible = () => {
    const header = ["Agent", "WeChat ID", "Phone", "Total Orders", "Available Credit", "Advance Payments", "Net Credit Used", "Due / Pending"];
    const csvRows = filteredAndSorted.map((row) => [
      row.agent.name,
      row.agent.wechatId || "Not Set",
      row.agent.phone || "Not Set",
      String(row.totalOrders),
      formatAmount(row.creditLeft),
      formatAmount(row.totalAdvanced),
      formatAmount(row.totalUsed),
      formatAmount(row.duePending),
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
      result: { count: visibleRows.length, reachedComponent: true, renderedRows: filtered.length },
      sampleAgents: filtered.slice(0, 5).map((row) => ({
        id: row.agent.id,
        name: row.agent.name,
        totalOrders: row.totalOrders,
        paymentsMade: row.paymentsMade,
        duePending: row.duePending,
      })),
    });
  }, [filtered, isPaymentAgentsLoading, visibleRows]);

  const buildLedgerTable = (agent: PaymentAgent) => {
    const summary = buildPaymentAgentAccountingSummary(agent, sourceOrders, ledgerRows[ALL_LEDGER_ROWS_KEY] || [], customers);
    const transactionRows = summary.transactionRows.map<LedgerViewRow>((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      reference: row.orderNumber || "—",
      description: row.notes || "—",
      debit: row.type === "Credit Used For Order" || row.type === "Pending Order Amount" ? Number(row.amount || 0) : 0,
      credit: row.type === "Balance Adjustment" || row.type === "Credit Returned" ? Number(row.amount || 0) : 0,
      balance: Number(row.runningCreditLeft || 0),
    }));
    const paymentRows = summary.paymentRows.map<LedgerViewRow>((row) => ({
      id: row.id,
      date: row.date,
      type: row.method === "Opening Balance" ? "Opening Balance" : "Payment Made",
      reference: "—",
      description: row.notes || row.method || "—",
      debit: 0,
      credit: Number(row.amount || 0),
      balance: Number(row.runningCreditLeft || 0),
    }));
    return [...paymentRows, ...transactionRows]
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
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

  const refreshPaymentAgentFinanceView = async () => {
    await reloadPaymentAgents();
    const loaded = await listPaymentAgentLedger();
    setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded }));
  };

  const loadAllLedgerRows = async () => {
    if (ledgerRows[ALL_LEDGER_ROWS_KEY]) return ledgerRows[ALL_LEDGER_ROWS_KEY]!;
    const loaded = await listPaymentAgentLedger();
    setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: loaded }));
    return loaded;
  };

  const buildRepairReport = (allLedger: PaymentAgentLedgerEntry[]): PaymentAgentRepairReport => {
    const findings: PaymentAgentRepairFinding[] = [];
    const activeSettlementEntryIds = new Set(
      allLedger
        .filter((entry) => entry.type === "order_settlement" && entry.active !== false && entry.isReversed !== true)
        .map((entry) => entry.id),
    );
    const liveOrders = sourceOrders.filter((order) => {
      const status = (order.status || "").trim().toLowerCase();
      return status === "saved" || status === "";
    });

    liveOrders.forEach((order) => {
      const splits = getOrderPaymentAgentSplits(order);
      const events = (order.paymentAgentPaymentEvents ?? []).filter((event) => Number(event.amount) > 0);
      const eventTotalsByAgent = new Map<string, number>();
      const splitUsedByAgent = new Map<string, number>();

      events.forEach((event) => {
        const agentKey = (event.paymentAgentId || event.paymentBy || event.paymentAgentSnapshot?.id || event.paymentAgentName || "").trim().toLowerCase();
        if (!agentKey) return;
        eventTotalsByAgent.set(agentKey, (eventTotalsByAgent.get(agentKey) ?? 0) + (Number(event.amount) || 0));
      });

      splits.forEach((split) => {
        const agentKey = (split.paymentAgentId || split.paymentBy || split.paymentAgentSnapshot?.id || split.paymentAgentName || "").trim().toLowerCase();
        if (!agentKey) return;
        const splitUsed = Number(split.settlementSnapshot?.creditUsed ?? split.paidNow ?? split.settlementSnapshot?.paidNow ?? 0) || 0;
        splitUsedByAgent.set(agentKey, (splitUsedByAgent.get(agentKey) ?? 0) + splitUsed);
      });

      eventTotalsByAgent.forEach((eventsTotal, agentKey) => {
        const splitsTotal = splitUsedByAgent.get(agentKey) ?? 0;
        if (eventsTotal === splitsTotal) return;
        findings.push({
          id: `events-vs-splits:${order.id}:${agentKey}`,
          title: `Stale split total in ${order.number || order.orderNumber || order.id}`,
          details: `Grouped payment events total ${formatAmount(eventsTotal)} but saved split used total is ${formatAmount(splitsTotal)} for agent ${agentKey}.`,
          proposedFix: `Rebuild paymentAgentSplits from paymentAgentPaymentEvents so the saved split used total becomes ${formatAmount(eventsTotal)}.`,
        });
      });

      splits.forEach((split) => {
        const assignedAmount = Number(split.assignedAmount) || 0;
        const orderPortionTotal = Number(split.settlementSnapshot?.orderPortionTotal);
        const creditUsed = Number(split.settlementSnapshot?.creditUsed ?? split.paidNow ?? split.settlementSnapshot?.paidNow ?? 0) || 0;
        const remainingPayable = Number(split.settlementSnapshot?.remainingPayable);
        const expectedRemaining = Math.max(0, assignedAmount - creditUsed);
        const expectedLedgerId = getOrderPaymentAgentSplitSettlementEntryId(order.id, split.id, isVirtualLegacyPaymentAgentSplit(order, split));

        if (Number.isFinite(orderPortionTotal) && assignedAmount !== orderPortionTotal) {
          findings.push({
            id: `assigned-vs-order-portion:${order.id}:${split.id}`,
            title: `Assigned amount mismatch in ${order.number || order.orderNumber || order.id}`,
            details: `Split ${split.id} stores assignedAmount ${formatAmount(assignedAmount)} but settlementSnapshot.orderPortionTotal is ${formatAmount(orderPortionTotal)}.`,
            proposedFix: `Update either assignedAmount or settlementSnapshot.orderPortionTotal so both equal ${formatAmount(assignedAmount)}.`,
          });
        }

        if (Number.isFinite(remainingPayable) && remainingPayable !== expectedRemaining) {
          findings.push({
            id: `remaining-mismatch:${order.id}:${split.id}`,
            title: `Remaining payable mismatch in ${order.number || order.orderNumber || order.id}`,
            details: `Split ${split.id} stores remainingPayable ${formatAmount(remainingPayable)} but assignedAmount - creditUsed = ${formatAmount(expectedRemaining)}.`,
            proposedFix: `Update settlementSnapshot.remainingPayable to ${formatAmount(expectedRemaining)} for split ${split.id}.`,
          });
        }

        if (assignedAmount > 0 && hasRealPaymentAgentSplits(order) && !activeSettlementEntryIds.has(expectedLedgerId)) {
          findings.push({
            id: `missing-ledger:${order.id}:${split.id}`,
            title: `Missing settlement ledger row for ${order.number || order.orderNumber || order.id}`,
            details: `Saved split ${split.id} has assigned ${formatAmount(assignedAmount)} but active ledger entry ${expectedLedgerId} does not exist.`,
            proposedFix: `Rebuild paymentAgentLedger from paymentAgentSplits and create active order_settlement row ${expectedLedgerId}.`,
          });
        }
      });
    });

    agents.forEach((agent) => {
      const liveFinance: PaymentAgentLiveFinance = calculatePaymentAgentLiveFinance(agent, sourceOrders, allLedger);
      const cacheAdvance = clampMoney((agent.openingCreditBalance ?? 0) + (agent.totalPaidAmount ?? 0));
      const cacheUsed = clampMoney(agent.totalUsedAmount);
      const cacheDue = clampMoney(agent.currentDuePayable ?? agent.currentPayable);
      const cacheAvailable = clampMoney(agent.creditBalance);
      const cacheOrders = clampCount(agent.totalOrdersPaid);
      if (
        cacheAdvance === liveFinance.advance
        && cacheUsed === liveFinance.creditUsed
        && cacheDue === liveFinance.pending
        && cacheAvailable === liveFinance.available
        && cacheOrders === liveFinance.ordersCount
      ) {
        return;
      }
      findings.push({
        id: `cache-mismatch:${agent.id}`,
        title: `Payment-agent cache mismatch for ${agent.name}`,
        details: `Stored cache shows Orders ${cacheOrders}, Advance ${formatAmount(cacheAdvance)}, Used ${formatAmount(cacheUsed)}, Due ${formatAmount(cacheDue)}, Available ${formatAmount(cacheAvailable)} but live split finance is Orders ${liveFinance.ordersCount}, Advance ${formatAmount(liveFinance.advance)}, Used ${formatAmount(liveFinance.creditUsed)}, Due ${formatAmount(liveFinance.pending)}, Available ${formatAmount(liveFinance.available)}.`,
        proposedFix: `If approved later, refresh paymentAgents aggregate cache fields from orders.paymentAgentSplits and manual payment ledger rows.`,
      });
    });

    return {
      generatedAt: new Date().toISOString(),
      scannedAgents: agents.length,
      scannedOrders: liveOrders.length,
      scannedLedgerRows: allLedger.length,
      findings,
    };
  };

  const runRepairReportScan = async () => {
    setRepairReportBusy(true);
    setRepairReportError(null);
    try {
      const allLedger = await loadAllLedgerRows();
      setRepairReport(buildRepairReport(allLedger));
    } catch (error) {
      setRepairReport(null);
      setRepairReportError(error instanceof Error ? error.message : "Could not scan payment-agent data.");
    } finally {
      setRepairReportBusy(false);
    }
  };

  const openRepairReport = async () => {
    setRepairReportOpen(true);
    await runRepairReportScan();
  };

  const applyRepairReport = async () => {
    if (!testingRepairApplyEnabled || !applyTestingPaymentAgentRepair) {
      pushToast({ tone: "danger", text: "Testing repair apply is not enabled in this environment." });
      return;
    }
    if (!window.confirm("Apply testing Payment Agent repair now? This will update saved orders, payment-agent ledger rows, and cache fields in the current testing Firebase business.")) {
      return;
    }
    setRepairApplyBusy(true);
    setRepairReportError(null);
    try {
      const result = await applyTestingPaymentAgentRepair();
      setRepairApplyResult(result as PaymentAgentRepairApplyResult | null);
      await Promise.all([reloadPaymentAgents(), reloadOrders()]);
      const refreshedLedger = await listPaymentAgentLedger();
      setLedgerRows((prev) => ({ ...prev, [ALL_LEDGER_ROWS_KEY]: refreshedLedger }));
      setPendingRepairRescan(true);
      pushToast({
        tone: "success",
        text: result
          ? `Repair applied. Orders: ${result.repairedOrders}, splits: ${result.repairedSplits}, ledger rows: ${result.repairedLedgerRows}, agents: ${result.recomputedAgents}.`
          : "Repair applied.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply payment-agent repair.";
      setRepairReportError(message);
      pushToast({ tone: "danger", text: message });
    } finally {
      setRepairApplyBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingRepairRescan || repairApplyBusy || isPaymentAgentsLoading) return;
    setPendingRepairRescan(false);
    void runRepairReportScan();
  }, [isPaymentAgentsLoading, pendingRepairRescan, repairApplyBusy, sourceOrders]);

  const handleLedgerPayment = async (agentId: string, input: { paymentDate: string; amount: number; paymentMethod?: string; note?: string }) => {
    try {
      await recordPaymentToAgent(agentId, input);
      await refreshPaymentAgentFinanceView();
      pushToast({ tone: "success", text: "Payment recorded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record payment.";
      pushToast({ tone: "danger", text: message });
      throw error;
    }
  };

  const handleLedgerPaymentDelete = async (entryId: string) => {
    try {
      await deletePaymentAgentLedgerEntry(entryId);
      await refreshPaymentAgentFinanceView();
      pushToast({ tone: "success", text: "Payment deleted and reversed." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete payment.";
      pushToast({ tone: "danger", text: message });
      throw error;
    }
  };

  const save = async () => {
    if (!form.name.trim()) return pushToast({ tone: "danger", text: "Payment Agent Name is required." });
    const now = new Date().toISOString();
    const existing = rows.find((x) => x.agent.id === form.id)?.agent ?? null;
    const opening = existing ? Math.max(0, Number(existing.openingCreditBalance) || 0) : Math.max(0, Number(form.openingCredit) || 0);
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
      totalPayableAmount: existing?.totalPayableAmount ?? 0,
      currentDuePayable: existing?.currentDuePayable ?? 0,
      totalUsedAmount: existing?.totalUsedAmount ?? 0,
      currentPayable: existing?.currentPayable ?? existing?.currentDuePayable ?? 0,
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
      openingCredit: "",
      notes: agent.notes || "",
      status: agent.status,
    });
    setOpen(true);
  };

  const removePaymentAgent = async (agent: PaymentAgent, currentDue: number, currentCredit: number, totalOrders: number) => {
    const agentId = agent.id;
    const linkedSavedOrdersCount = sourceOrders
      .filter((o) => o.status === "saved")
      .filter((o) => getOrderPaymentAgentLinkedAgentIds(o).includes(agentId))
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
        await reloadPaymentAgents();
        pushToast({ tone: "success", text: "Payment agent moved to Recycle Bin." });
      } else {
        await deletePaymentAgent(deleteCtx.agentId);
        pushToast({ tone: "success", text: deleteCtx.riskDetected ? "Payment agent deleted. Historical orders and ledger entries were kept." : `Payment agent ${deleteCtx.agentName} deleted.` });
      }
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
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={viewTab === "agents" ? "Search agent, WeChat, customer, order no., payments, notes, due, balance..." : "Search order no., status, customer, WeChat, marka, split values..."}
                leadingIcon={<Search size={14} />}
              />
            </div>
            <div className="inline-flex rounded-lg border border-border bg-bg-subtle/40 p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${viewTab === "agents" ? "bg-bg-card text-fg shadow-sm" : "text-fg-subtle hover:text-fg"}`}
                onClick={() => setViewTab("agents")}
              >
                Payment Agents
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${viewTab === "live-orders" ? "bg-bg-card text-fg shadow-sm" : "text-fg-subtle hover:text-fg"}`}
                onClick={() => setViewTab("live-orders")}
              >
                Live Orders
              </button>
            </div>
            <div className="w-[240px]">
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={[
                  { value: "priority", label: "Sort: Due first, then credit left" },
                  { value: "name", label: "Sort: Agent Name" },
                  { value: "orders", label: "Sort: Total Orders High to Low" },
                  { value: "used", label: "Sort: Net Credit Used High to Low" },
                  { value: "due", label: "Sort: Due / Pending High to Low" },
                  { value: "balance", label: "Sort: Available Credit High to Low" },
                  { value: "payments", label: "Sort: Advance Payments High to Low" },
                ]}
              />
            </div>
            {viewTab === "agents" ? (
              <>
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
                <Button size="sm" variant="secondary" onClick={() => void openRepairReport()}>
                  Repair Payment Agent Data
                </Button>
              </>
            ) : null}
          </section>

          {viewTab === "agents" ? (
          <section className="card overflow-hidden">
            <div className="overflow-x-auto overflow-y-visible">
              <div className="w-full min-w-0 px-0.5 py-1">
                <table className="w-full min-w-[920px] text-[13px]">
                  <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
                    <tr className="border-b border-border text-[12px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-left">Agent</th>
                      <th className="px-2 py-2 text-center">Orders</th>
                      <th className="px-2 py-2 text-right">Available Credit</th>
                      <th className="px-2 py-2 text-right">Due / Pending</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => {
                      const healthBadge = row.totalAdvanced <= 0
                        ? { label: "No Advance", className: "border-border bg-bg-subtle/40 text-fg-subtle" }
                        : row.creditLeft / row.totalAdvanced >= 0.5
                          ? { label: "Healthy", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
                          : row.creditLeft / row.totalAdvanced >= 0.2
                            ? { label: "Medium", className: "border-amber-200 bg-amber-50 text-amber-700" }
                            : { label: "Low Credit", className: "border-rose-200 bg-rose-50 text-rose-700" };
                      return (
                      <tr key={row.agent.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-3">
                          <div className="text-[15px] font-semibold leading-tight text-fg">{row.agent.name}</div>
                          <div className="mt-0.5 text-[12px] text-fg-subtle">{row.agent.wechatId?.trim() || row.agent.phone?.trim() || "No WeChat ID"}</div>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                            <span>{`Used ${formatPercent(row.usagePercent)}% · Available ${formatPercent(row.availablePercent)}%`}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${healthBadge.className}`}>{healthBadge.label}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-bg-subtle">
                            <div className="h-full rounded-full bg-fg-subtle/35" style={{ width: `${row.usagePercent}%` }} />
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center text-[15px] font-semibold tabular-nums">{row.totalOrders}</td>
                        <td className="px-2 py-3 text-right text-[15px] font-semibold tabular-nums text-emerald-700">{formatAmount(row.creditLeft)}</td>
                        <td className={`px-2 py-3 text-right text-[15px] font-semibold tabular-nums ${row.duePending > 0 ? "text-rose-600" : "text-fg-subtle"}`}>{formatAmount(row.duePending)}</td>
                        <td className="px-3 py-3">
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
                    );
                    })}
                    {isPaymentAgentsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                          Loading payment agents...
                        </td>
                      </tr>
                    ) : null}
                    {!isPaymentAgentsLoading && pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
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
          ) : (
          <section className="card overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-[12px] text-fg-subtle">
              Temporary live DB audit view. This table reads directly from the current orders source and shows saved payment-agent split values.
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <div className="w-full min-w-0 px-0.5 py-1">
                <table className="w-full min-w-[1480px] text-[12px]">
                  <thead className="sticky top-0 z-30 bg-bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
                    <tr className="border-b border-border text-[11px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Order No</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">WeChat</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-right">Order Total</th>
                      <th className="px-3 py-2 text-left">Linked Agents</th>
                      <th className="px-3 py-2 text-left">Saved Splits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLiveOrderRows.map(({ order, customer, totalAmount, linkedAgentIds, splits }) => (
                      <tr key={order.id} className="border-b border-border align-top transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-3 whitespace-nowrap">{order.date ? formatIndianDate(order.date) : "-"}</td>
                        <td className="px-3 py-3 font-semibold">{order.number || order.orderNumber || "-"}</td>
                        <td className="px-3 py-3">{order.status || "-"}</td>
                        <td className="px-3 py-3">{order.wechatId || "-"}</td>
                        <td className="px-3 py-3">{customer}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatAmount(totalAmount)}</td>
                        <td className="px-3 py-3">{linkedAgentIds.length > 0 ? linkedAgentIds.join(", ") : "-"}</td>
                        <td className="px-3 py-3">
                          <div className="space-y-2">
                            {splits.length > 0 ? splits.map((split) => (
                              <div key={split.id} className="rounded-lg border border-border bg-bg-subtle/30 p-2">
                                <div className="font-medium text-fg">{split.paymentAgentName || split.paymentAgentSnapshot?.name || split.paymentBy || split.paymentAgentId || "Unlinked"}</div>
                                <div className="mt-1 text-[11px] text-fg-subtle">Split ID: {split.id}</div>
                                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                  <div>Agent ID: {split.paymentAgentId || split.paymentBy || "-"}</div>
                                  <div>Assigned: {formatAmount(Number(split.assignedAmount) || 0)}</div>
                                  <div>Paid Now: {formatAmount(Number(split.paidNow) || 0)}</div>
                                  <div>Credit Used: {formatAmount(Number(split.settlementSnapshot?.creditUsed) || 0)}</div>
                                  <div>Remaining: {formatAmount(Number(split.settlementSnapshot?.remainingPayable) || 0)}</div>
                                  <div>Resulting Credit: {formatAmount(Number(split.settlementSnapshot?.resultingCreditBalance) || 0)}</div>
                                </div>
                              </div>
                            )) : <div className="text-fg-subtle">No saved payment-agent splits</div>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pagedLiveOrderRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-fg-subtle">No live orders found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePagination total={liveOrderRows.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="live orders" />
          </section>
          )}

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
                {!form.id ? (
                  <Input type="number" min={0} value={form.openingCredit} onChange={(e) => setForm((s) => ({ ...s, openingCredit: e.target.value }))} placeholder="Opening Advance Balance" />
                ) : null}
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
            summary={activeLedgerSummary?.canonicalSummary ?? null}
            entries={activeLedgerRows}
            error={activeLedgerError}
            onClose={() => setLedgerAgent(null)}
            onExport={exportLedgerStatement}
            onAddPayment={(input) => (activeLedgerSummary ? handleLedgerPayment(activeLedgerSummary.agent.id, input) : Promise.resolve())}
            onDeletePayment={handleLedgerPaymentDelete}
          />

          {repairReportOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-lg font-semibold">Repair Payment Agent Data</div>
                  <div className="text-[12px] text-fg-subtle">{testingRepairApplyEnabled === true ? "Dry-run report with optional Apply." : "Dry-run only. No writes are applied."}</div>
                </div>
                <div className="flex items-center gap-2">
                  {testingRepairApplyEnabled === true ? (
                    <Button variant="primary" disabled={repairApplyBusy || repairReportBusy} onClick={() => void applyRepairReport()}>
                      {repairApplyBusy ? "Applying..." : "Apply Repair"}
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => setRepairReportOpen(false)}>Close</Button>
                </div>
              </div>
              <div className="overflow-y-auto px-4 py-3">
                {repairReportBusy ? (
                  <div className="py-8 text-center text-sm text-fg-subtle">Scanning orders, splits, ledger rows, and payment-agent cache fields...</div>
                ) : repairReportError ? (
                  <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{repairReportError}</div>
                ) : repairReport ? (
                  <div className="space-y-4">
                    {repairApplyResult ? (
                      <div className="space-y-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-3">
                        <div className="text-sm font-semibold text-emerald-800">Last Apply Result</div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                          <div className="text-sm text-emerald-900">Orders repaired: <span className="font-semibold">{repairApplyResult.repairedOrders}</span></div>
                          <div className="text-sm text-emerald-900">Splits repaired: <span className="font-semibold">{repairApplyResult.repairedSplits}</span></div>
                          <div className="text-sm text-emerald-900">Ledger rows repaired: <span className="font-semibold">{repairApplyResult.repairedLedgerRows}</span></div>
                          <div className="text-sm text-emerald-900">Agents recomputed: <span className="font-semibold">{repairApplyResult.recomputedAgents}</span></div>
                        </div>
                        <div className="space-y-2">
                          {repairApplyResult.logs.slice(0, 20).map((log, index) => (
                            <div key={`${log.collection}-${log.targetId || index}`} className="rounded border border-emerald-200 bg-white/70 px-3 py-2 text-[12px] text-emerald-950">
                              <div className="font-medium">{log.collection} · {log.orderNumber || log.agentName || log.targetId || "-"}</div>
                              <div className="mt-1">Target: {log.targetId || "-"}</div>
                              <div>Before: {JSON.stringify(log.before)}</div>
                              <div>After: {JSON.stringify(log.after)}</div>
                            </div>
                          ))}
                          {repairApplyResult.logs.length > 20 ? (
                            <div className="text-[12px] text-emerald-900">Showing first 20 of {repairApplyResult.logs.length} write logs.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div className="rounded border border-border bg-bg-subtle/30 px-3 py-2 text-sm">Agents Scanned: <span className="font-semibold">{repairReport.scannedAgents}</span></div>
                      <div className="rounded border border-border bg-bg-subtle/30 px-3 py-2 text-sm">Orders Scanned: <span className="font-semibold">{repairReport.scannedOrders}</span></div>
                      <div className="rounded border border-border bg-bg-subtle/30 px-3 py-2 text-sm">Ledger Rows Scanned: <span className="font-semibold">{repairReport.scannedLedgerRows}</span></div>
                      <div className="rounded border border-border bg-bg-subtle/30 px-3 py-2 text-sm">Findings: <span className="font-semibold">{repairReport.findings.length}</span></div>
                    </div>
                    <div className="text-[12px] text-fg-subtle">Generated: {formatIndianDate(repairReport.generatedAt.slice(0, 10))} {repairReport.generatedAt.slice(11, 19)}</div>
                    {repairReport.findings.length === 0 ? (
                      <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">No stale split totals, missing settlement rows, or aggregate cache mismatches were found in the current live scan.</div>
                    ) : (
                      <div className="space-y-3">
                        {repairReport.findings.map((finding) => (
                          <div key={finding.id} className="rounded border border-border bg-bg-subtle/20 px-3 py-3">
                            <div className="text-sm font-semibold text-fg">{finding.title}</div>
                            <div className="mt-1 text-sm text-fg-subtle">{finding.details}</div>
                            <div className="mt-2 text-[12px] text-fg"><span className="font-medium">Proposed fix:</span> {finding.proposedFix}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          ) : null}

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
