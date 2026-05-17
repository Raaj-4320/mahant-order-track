"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import { getCustomersService } from "@/services/customersService";

export function useCustomers() {
  const service = useMemo(() => getCustomersService(), []);
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const rows = await service.listCustomers();
      setData(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load customers";
      setError(message);
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload]);
  const recordPaymentToCustomer = useCallback(async (customerId: string, input: { amount: number; paymentDate?: string; note?: string }) => {
    if (!service.recordPaymentToCustomer) throw new Error("Customer payment flow is not enabled for this data source.");
    const updated = await service.recordPaymentToCustomer(customerId, input);
    setData((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    return updated;
  }, [service]);
  const archiveCustomer = useCallback(async (customerId: string) => {
    if (!service.archiveCustomer) throw new Error("Customer archive flow is not enabled for this data source.");
    await service.archiveCustomer(customerId);
    await reload();
  }, [service, reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, recordPaymentToCustomer, archiveCustomer };
}
