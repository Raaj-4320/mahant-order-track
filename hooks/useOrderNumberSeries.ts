"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, OrderNumberSeries } from "@/lib/types";
import { measurePerfAsync } from "@/lib/perfDebug";
import { getOrderNumberSeriesService } from "@/services/orderNumberSeriesService";

export function useOrderNumberSeries(orders: Order[]) {
  const service = useMemo(() => getOrderNumberSeriesService(), []);
  const [data, setData] = useState<OrderNumberSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await measurePerfAsync("reload", "useOrderNumberSeries.reload", { ordersCount: orders.length }, () => service.listOrderNumberSeries(orders)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order number series");
    } finally {
      setIsLoading(false);
    }
  }, [service, orders]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createSeries = useCallback(async (input: { label: string; startNumber: number }) => {
    const created = await service.createOrderNumberSeries(input, orders);
    await reload();
    return created;
  }, [service, orders, reload]);

  return { data, isLoading, error, reload, createSeries };
}
