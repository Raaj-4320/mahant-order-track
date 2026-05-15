"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order } from "@/lib/types";
import { getOrdersService } from "@/services/ordersService";

export function useOrders() {
  const service = useMemo(() => getOrdersService(), []);
  const [data, setData] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setIsLoading(true); setError(null); try { setData(await service.listOrders()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load orders"); } finally { setIsLoading(false); } }, [service]);
  useEffect(() => { reload(); }, [reload]);
  const getOrderById = useCallback(async (id: string) => service.getOrderById(id), [service]);
  const upsertOrder = useCallback(async (order: Order) => { const saved = await service.upsertOrder(order); await reload(); return saved; }, [service, reload]);
  const autosaveDraft = useCallback(async (order: Order) => { const saved = await (service.autosaveDraft ? service.autosaveDraft(order) : service.upsertOrder({ ...order, status: "draft" })); setData((p) => p.some((x) => x.id === saved.id) ? p.map((x) => x.id === saved.id ? saved : x) : [saved, ...p]); return saved; }, [service]);
  const archiveOrder = useCallback(async (id: string) => { await service.archiveOrder(id); await reload(); }, [service, reload]);
  const draftOrders = useMemo(() => data.filter((o) => o.status === "draft"), [data]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, getOrderById, upsertOrder, autosaveDraft, archiveOrder, draftOrders };
}
