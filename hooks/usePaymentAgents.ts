"use client";
import { useCallback, useEffect, useState } from "react";
import type { Order, PaymentAgent } from "@/lib/types";
import { getPaymentAgentsService } from "@/services/paymentAgentsService";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";

const PAYMENT_AGENTS_SOURCE = process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? "mock";

export function usePaymentAgents() {
  const service = getPaymentAgentsService();
  const [data, setData] = useState<PaymentAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const selection = ordersDataSourceSelection();
    console.log("[PAYMENT_AGENT_FLOW_TRACE] hook_load_start", {
      businessId: selection.businessId,
      source: selection.source,
    });
    setIsLoading(true);
    setError(null);
    try {
      const next = await service.listPaymentAgents();
      setData(next);
      console.log("[PAYMENT_AGENT_FLOW_TRACE] hook_load_success", {
        businessId: selection.businessId,
        source: selection.source,
        count: next.length,
        sample: next.slice(0, 3).map((agent) => agent.name),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load payment agents";
      setError(message);
      console.error("[PAYMENT_AGENT_FLOW_TRACE] service_list_failed", {
        businessId: selection.businessId,
        source: selection.source,
        errorMessage: message,
      });
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload, service]);
  const upsertPaymentAgent = useCallback(async (agent: PaymentAgent) => { await service.upsertPaymentAgent(agent); await reload(); }, [reload, service]);
  const deletePaymentAgent = useCallback(async (agentId: string) => { if (!service.deletePaymentAgent) throw new Error("Payment agent delete flow is not enabled for this data source."); await service.deletePaymentAgent(agentId); await reload(); }, [reload, service]);
  const recalculateFromOrders = useCallback(async (orders: Order[]) => { const savedOrders = orders.filter((o) => o.status === "saved"); if (PAYMENT_AGENTS_SOURCE !== "firebase") await service.recalculatePaymentAgentsFromOrders(savedOrders); await reload(); }, [reload, service]);
  const recordPaymentToAgent = useCallback(async (agentId: string, payment: { amount: number; paymentDate: string; note?: string }) => { await service.recordPaymentToAgent(agentId, payment); await reload(); }, [reload, service]);
  const listPaymentAgentLedger = useCallback(async (agentId: string) => service.listPaymentAgentLedger(agentId), [service]);
  const applyOrderSettlement = useCallback(async (order: Order) => { if (service.applyOrderSettlement) await service.applyOrderSettlement(order); await reload(); }, [reload, service]);
  const reverseOrderSettlement = useCallback(async (order: Order) => { if (service.reverseOrderSettlement) await service.reverseOrderSettlement(order); await reload(); }, [reload, service]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertPaymentAgent, deletePaymentAgent, recalculateFromOrders, recordPaymentToAgent, listPaymentAgentLedger, applyOrderSettlement, reverseOrderSettlement };
}
