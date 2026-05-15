"use client";
import { useCallback, useEffect, useState } from "react";
import type { Order, PaymentAgent } from "@/lib/types";
import { getPaymentAgentsService } from "@/services/paymentAgentsService";

const PAYMENT_AGENTS_SOURCE = process.env.NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE ?? "mock";

export function usePaymentAgents() {
  const service = getPaymentAgentsService();
  const [data, setData] = useState<PaymentAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setIsLoading(true); setError(null); try { setData(await service.listPaymentAgents()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load payment agents"); } finally { setIsLoading(false); } }, [service]);
  useEffect(() => { reload(); }, [reload, service]);
  const upsertPaymentAgent = useCallback(async (agent: PaymentAgent) => { await service.upsertPaymentAgent(agent); await reload(); }, [reload, service]);
  const recalculateFromOrders = useCallback(async (orders: Order[]) => { const savedOrders = orders.filter((o) => o.status === "saved"); if (PAYMENT_AGENTS_SOURCE !== "firebase") await service.recalculatePaymentAgentsFromOrders(savedOrders); await reload(); }, [reload, service]);
  const recordPaymentToAgent = useCallback(async (agentId: string, payment: { amount: number; paymentDate: string; note?: string }) => { await service.recordPaymentToAgent(agentId, payment); await reload(); }, [reload, service]);
  const listPaymentAgentLedger = useCallback(async (agentId: string) => service.listPaymentAgentLedger(agentId), [service]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertPaymentAgent, recalculateFromOrders, recordPaymentToAgent, listPaymentAgentLedger };
}
