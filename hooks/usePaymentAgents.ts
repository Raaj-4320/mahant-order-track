"use client";
import { useCallback, useEffect, useState } from "react";
import type { Order, PaymentAgent } from "@/lib/types";
import { paymentAgentsMockService } from "@/services/mock/paymentAgentsMockService";

export function usePaymentAgents() {
  const [data, setData] = useState<PaymentAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setIsLoading(true); setError(null); try { setData(await paymentAgentsMockService.listPaymentAgents()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load payment agents"); } finally { setIsLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  const upsertPaymentAgent = useCallback(async (agent: PaymentAgent) => { await paymentAgentsMockService.upsertPaymentAgent(agent); await reload(); }, [reload]);
  const recalculateFromOrders = useCallback(async (orders: Order[]) => { await paymentAgentsMockService.recalculatePaymentAgentsFromOrders(orders); await reload(); }, [reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertPaymentAgent, recalculateFromOrders };
}
