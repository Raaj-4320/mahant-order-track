"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import { getCustomersService } from "@/services/customersService";
import { logDB, logError } from "@/lib/logger";

export function useCustomers() {
  const service = useMemo(() => getCustomersService(), []);
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      logDB("list_customers_start", {});
      const rows = await service.listCustomers();
      setData(rows);
      logDB("list_customers_success", { count: rows.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load customers";
      setError(message);
      logError("list_customers_failure", { error: message });
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload]);
  const recordPaymentToCustomer = useCallback(async (customerId: string, input: { amount: number; paymentDate?: string; note?: string }) => {
    if (!service.recordPaymentToCustomer) throw new Error("Customer payment flow is not enabled for this data source.");
    const updated = await service.recordPaymentToCustomer(customerId, input);
    setData((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    return updated;
  }, [service]);
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, recordPaymentToCustomer };
}
