"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, OrderNumberSeries } from "@/lib/types";
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
      setData(await service.listOrderNumberSeries(orders));
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

  const syncSeriesFromOrder = useCallback(async (order: Order, nextOrders?: Order[]) => {
    const updated = await service.syncOrderNumberSeriesFromOrder(order, nextOrders ?? orders);
    await reload();
    return updated;
  }, [service, orders, reload]);

  return { data, isLoading, error, reload, createSeries, syncSeriesFromOrder };
}
