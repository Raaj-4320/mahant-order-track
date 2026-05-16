"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { getProductsService } from "@/services/productsService";

export function useProducts() {
  const service = useMemo(() => getProductsService(), []);
  const [data, setData] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    try { setData(await service.listProducts()); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load products"); }
    finally { setIsLoading(false); }
  }, [service]);

  const upsertProduct = useCallback(async (product: Product) => {
    const saved = await service.upsertProduct(product);
    setData((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev]; next[idx] = saved; return next;
    });
    return saved;
  }, [service]);

  useEffect(() => { reload(); }, [reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertProduct };
}
