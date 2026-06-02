"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, PaymentAgent } from "@/lib/types";
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
      const next = await service.listPaymentAgents();
      setData(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load payment agents";
      setError(message);
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload, service]);
  const upsertPaymentAgent = useCallback(async (agent: PaymentAgent) => { await service.upsertPaymentAgent(agent); await reload(); }, [reload, service]);
  const deletePaymentAgent = useCallback(async (agentId: string) => { if (!service.deletePaymentAgent) throw new Error("Payment agent delete flow is not enabled for this data source."); await service.deletePaymentAgent(agentId); await reload(); }, [reload, service]);
  const recalculateFromOrders = useCallback(async (orders: Order[]) => {
    const savedOrders = orders.filter((o) => o.status === "saved");
    const selection = paymentAgentsDataSourceSelection();
    if (selection.source !== "firebase") await service.recalculatePaymentAgentsFromOrders(savedOrders);
    await reload();
  }, [reload, service]);
  const recordPaymentToAgent = useCallback(async (agentId: string, payment: { amount: number; paymentDate: string; note?: string }) => { await service.recordPaymentToAgent(agentId, payment); await reload(); }, [reload, service]);
  const listPaymentAgentLedger = useCallback(async (agentId: string) => service.listPaymentAgentLedger(agentId), [service]);
  const applyOrderSettlement = useCallback(async (order: Order) => { if (service.applyOrderSettlement) await service.applyOrderSettlement(order); await reload(); }, [reload, service]);
  const reverseOrderSettlement = useCallback(async (order: Order) => { if (service.reverseOrderSettlement) await service.reverseOrderSettlement(order); await reload(); }, [reload, service]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertPaymentAgent, deletePaymentAgent, recalculateFromOrders, recordPaymentToAgent, listPaymentAgentLedger, applyOrderSettlement, reverseOrderSettlement };
}
