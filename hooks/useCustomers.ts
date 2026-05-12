"use client";
import { useCallback, useEffect, useState } from "react";
import type { Customer } from "@/lib/types";
import { customersMockService } from "@/services/mock/customersMockService";

export function useCustomers() {
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setIsLoading(true); setError(null); try { setData(await customersMockService.listCustomers()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load customers"); } finally { setIsLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload };
}
