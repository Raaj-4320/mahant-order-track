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
  const upsertOrder = useCallback(async (order: Order) => {
    const saved = await service.upsertOrder(order);
    await reload();
    const reloaded = await service.getOrderById(order.id);
    if (reloaded) {
      console.log("[ORDER_DATE_STATUS_TRACE] orders_reloaded_after_save", {
        orderId: order.id,
        loadedLoadingDate: reloaded.loadingDate,
        loadedStatus: reloaded.status,
      });
    }
    return saved;
  }, [service, reload]);
  const autosaveDraft = useCallback(async (order: Order) => { const saved = await (service.autosaveDraft ? service.autosaveDraft(order) : service.upsertOrder({ ...order, status: "draft" })); setData((p) => p.some((x) => x.id === saved.id) ? p.map((x) => x.id === saved.id ? saved : x) : [saved, ...p]); return saved; }, [service]);
  const archiveOrder = useCallback(async (id: string) => { await service.archiveOrder(id); await reload(); }, [service, reload]);
  const peekNextOrderNumber = useCallback(async () => {
    if (!service.peekNextOrderNumber) throw new Error("Order number preview is not enabled for this data source.");
    return service.peekNextOrderNumber();
  }, [service]);
  const allocateNextOrderNumber = useCallback(async () => {
    if (!service.allocateNextOrderNumber) throw new Error("Order number allocator is not enabled for this data source.");
    return service.allocateNextOrderNumber();
  }, [service]);
  const draftOrders = useMemo(() => data.filter((o) => o.status === "draft"), [data]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, getOrderById, upsertOrder, autosaveDraft, archiveOrder, draftOrders, peekNextOrderNumber, allocateNextOrderNumber };
}
