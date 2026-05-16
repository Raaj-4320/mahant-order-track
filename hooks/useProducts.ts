"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { getProductsService } from "@/services/productsService";
import { logDB, logError } from "@/lib/logger";

export function useProducts() {
  const service = useMemo(() => getProductsService(), []);
  const [data, setData] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    logDB("list_products_start", {});
    try { const rows = await service.listProducts(); setData(rows); logDB("list_products_success", { count: rows.length }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load products"); logError("list_products_failure", { error: e instanceof Error ? e.message : String(e) }); }
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
