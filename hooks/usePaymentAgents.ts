"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, PaymentAgent } from "@/lib/types";
import { measurePerfAsync } from "@/lib/perfDebug";
import { getPaymentAgentsService } from "@/services/paymentAgentsService";
import { paymentAgentsDataSourceSelection } from "@/lib/runtimeConfig";

export function usePaymentAgents() {
  const service = useMemo(() => getPaymentAgentsService(), []);
  const [data, setData] = useState<PaymentAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await measurePerfAsync("reload", "usePaymentAgents.reload", undefined, () => service.listPaymentAgents());
      setData(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load payment agents";
      setError(message);
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload, service]);
  const upsertPaymentAgent = useCallback(async (agent: PaymentAgent) => {
    const saved = await service.upsertPaymentAgent(agent);
    setData((prev) => (prev.some((entry) => entry.id === saved.id) ? prev.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...prev]));
    return saved;
  }, [service]);
  const deletePaymentAgent = useCallback(async (agentId: string) => {
    if (!service.deletePaymentAgent) throw new Error("Payment agent delete flow is not enabled for this data source.");
    await service.deletePaymentAgent(agentId);
    setData((prev) => prev.filter((entry) => entry.id !== agentId));
  }, [service]);
  const recalculateFromOrders = useCallback(async (orders: Order[]) => {
    const savedOrders = orders.filter((o) => o.status === "saved");
    const next = await service.recalculatePaymentAgentsFromOrders(savedOrders);
    if (Array.isArray(next)) setData(next);
    return next;
  }, [service]);
  const recordPaymentToAgent = useCallback(async (agentId: string, payment: { amount: number; paymentDate: string; note?: string; paymentMethod?: string }) => {
    const updated = await service.recordPaymentToAgent(agentId, payment);
    setData((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    return updated;
  }, [service]);
  const deletePaymentAgentLedgerEntry = useCallback(async (entryId: string) => {
    if (!service.deletePaymentAgentLedgerEntry) throw new Error("Ledger delete flow is not enabled for this data source.");
    const updated = await service.deletePaymentAgentLedgerEntry(entryId);
    setData((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    return updated;
  }, [service]);
  const listPaymentAgentLedger = useCallback(async (agentId?: string) => service.listPaymentAgentLedger(agentId), [service]);
  const applyOrderSettlement = useCallback(async (order: Order) => {
    if (service.applyOrderSettlement) await service.applyOrderSettlement(order);
  }, [service]);
  const reverseOrderSettlement = useCallback(async (order: Order) => {
    if (service.reverseOrderSettlement) await service.reverseOrderSettlement(order);
  }, [service]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertPaymentAgent, deletePaymentAgent, recalculateFromOrders, recordPaymentToAgent, deletePaymentAgentLedgerEntry, listPaymentAgentLedger, applyOrderSettlement, reverseOrderSettlement };
}
