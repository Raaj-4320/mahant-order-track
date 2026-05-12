"use client";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { productsMockService } from "@/services/mock/productsMockService";

export function useProducts() {
  const [data, setData] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    try { setData(await productsMockService.listProducts()); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load products"); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload };
}
