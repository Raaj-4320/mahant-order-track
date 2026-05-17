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
    console.log("[CUSTOMER_DELETE_TRACE] reload_start", JSON.stringify({ source: "useCustomers.reload" }, null, 2));
    setIsLoading(true); setError(null);
    try {
      const rows = await service.listCustomers();
      setData(rows);
      console.log("[CUSTOMER_DELETE_TRACE] reload_success", JSON.stringify({ source: "useCustomers.reload", countAfterReload: rows.length }, null, 2));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load customers";
      setError(message);
      console.log("[CUSTOMER_DELETE_TRACE] reload_failed", JSON.stringify({ source: "useCustomers.reload", error: message }, null, 2));
    } finally { setIsLoading(false); }
  }, [service]);
  useEffect(() => { reload(); }, [reload]);
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
  return { data, isLoading, error, isEmpty: !isLoading && data.length === 0, reload, recordPaymentToCustomer, deleteCustomer };
}
