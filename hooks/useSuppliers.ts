"use client";
import { useCallback, useEffect, useState } from "react";
import type { Supplier } from "@/lib/types";
import { suppliersMockService } from "@/services/mock/suppliersMockService";

export function useSuppliers() {
  const [data, setData] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setIsLoading(true); setError(null); try { setData(await suppliersMockService.listSuppliers()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load suppliers"); } finally { setIsLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload };
}
