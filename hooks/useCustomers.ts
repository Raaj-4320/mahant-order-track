"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import { measurePerfAsync } from "@/lib/perfDebug";
import { getCustomersService } from "@/services/customersService";

export function useCustomers() {
  const service = useMemo(() => getCustomersService(), []);
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const rows = await measurePerfAsync("reload", "useCustomers.reload", undefined, () => service.listCustomers());
      setData(rows);
      return rows;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load customers";
      setError(message);
      return null;
} finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload]);
  const upsertCustomer = useCallback(async (customer: Customer) => {
    if (!service.upsertCustomer) throw new Error("Customer create/update flow is not enabled for this data source.");
    const saved = await service.upsertCustomer(customer);
    setData((prev) => (prev.some((entry) => entry.id === saved.id) ? prev.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...prev]));
    return saved;
  }, [service]);
  const recordPaymentToCustomer = useCallback(async (customerId: string, input: { amount: number; paymentDate?: string; note?: string }) => {
    if (!service.recordPaymentToCustomer) throw new Error("Customer payment flow is not enabled for this data source.");
    const updated = await service.recordPaymentToCustomer(customerId, input);
    setData((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    return updated;
  }, [service]);
  const deleteCustomer = useCallback(async (customerId: string) => {
    if (!service.deleteCustomer) throw new Error("Customer delete flow is not enabled for this data source.");
    await service.deleteCustomer(customerId);
    await reload();
  }, [service, reload]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, upsertCustomer, recordPaymentToCustomer, deleteCustomer };
}

