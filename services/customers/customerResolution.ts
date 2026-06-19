import type { Customer, OrderLine } from "@/lib/types";
import { createCustomerIdFromName, normalizeCustomerName } from "@/services/customers/customerIdentity";
import { logCustomer } from "@/lib/logger";
import { measurePerfAsync, measurePerfSync } from "@/lib/perfDebug";

export const CUSTOMER_NOT_LINKED = "Not Set";
export const CUSTOMER_DELETED = "Deleted Customer";
export const CUSTOMER_INVALID = "Invalid Customer Reference";

export function getResolvedLineCustomerName(line: Pick<OrderLine, "customerId" | "customerName" | "customerSnapshot">): string {
  if (!line.customerId?.trim()) return "";
  return line.customerName?.trim() || line.customerSnapshot?.name?.trim() || "";
}

export function getLineCustomerDisplay(
  line: Pick<OrderLine, "customerId" | "customerName" | "customerSnapshot">,
  customers: Customer[] = [],
): string {
  const customerId = line.customerId?.trim() || "";
  if (!customerId) return CUSTOMER_NOT_LINKED;

  const linkedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  if (linkedCustomer) {
    return linkedCustomer.displayName?.trim() || linkedCustomer.name?.trim() || getResolvedLineCustomerName(line) || CUSTOMER_INVALID;
  }

  if (customers.length > 0) {
    const hasSnapshotMetadata = Boolean(line.customerSnapshot?.id?.trim() || line.customerSnapshot?.name?.trim() || line.customerName?.trim());
    return hasSnapshotMetadata ? CUSTOMER_DELETED : CUSTOMER_INVALID;
  }

  return getResolvedLineCustomerName(line) || CUSTOMER_INVALID;
}

export function findCustomerByTypedName(customers: Customer[], typedName: string): Customer | null {
  return measurePerfSync("resolve", "customers.findCustomerByTypedName", { customersCount: customers.length }, () => {
    const normalized = normalizeCustomerName(typedName);
    if (!normalized) return null;
    const sorted = [...customers].sort((a, b) => a.id.localeCompare(b.id));
    return sorted.find((c) => normalizeCustomerName(c.name || c.displayName || "") === normalized) ?? null;
  });
}

export function applyTypedCustomerToLine(line: OrderLine, typedName: string, customers: Customer[]): Partial<OrderLine> {
  const customerName = typedName;
  const matched = findCustomerByTypedName(customers, typedName);
  if (!matched) return { customerName, customerId: "", customerSnapshot: undefined };
  return { customerName: matched.name, customerId: matched.id, customerSnapshot: { id: matched.id, name: matched.name, code: matched.customerCode } };
}

export async function resolveCustomersForOrderLines(lines: OrderLine[], customers: Customer[], nowIso: string): Promise<OrderLine[]> {
return measurePerfAsync("resolve", "customers.resolveCustomersForOrderLines", { lineCount: lines.length, customersCount: customers.length }, async () => {
logCustomer("resolve_order_customers_start", { lineCount: lines.length, knownCustomers: customers.length });
  const existing = new Map<string, Customer>();
  [...customers]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((c) => {
      const key = normalizeCustomerName(c.name || c.displayName || "");
      if (key && !existing.has(key)) existing.set(key, c);
    });

  const resolved: OrderLine[] = [];
  for (const [index, line] of lines.entries()) {
    const typed = (line.customerName || line.customerSnapshot?.name || "").trim();
    if (!typed) {
      logCustomer("ensure_customer_skipped", { lineId: line.id, reason: "blank_name" });
      resolved.push({ ...line, customerId: "", customerName: "", customerSnapshot: undefined });
      continue;
    }
    const normalized = normalizeCustomerName(typed);
    const hit = existing.get(normalized);
    if (hit) {
      logCustomer("ensure_customer_existing_found", { lineId: line.id, customerId: hit.id, normalized });
      resolved.push({ ...line, customerId: hit.id, customerName: hit.name, customerSnapshot: { id: hit.id, name: hit.name, code: hit.customerCode } });
      continue;
    }
    logCustomer("ensure_customer_blocked", { lineId: line.id, reason: "unmatched_name_requires_explicit_selection", typed, normalized, nowIso, generatedIdPreview: createCustomerIdFromName(typed) });
    throw new Error(`Line ${index + 1}: Choose a valid customer.`);
  }
logCustomer("resolve_order_customers_success", { resolvedCount: resolved.length });
  return resolved;
});
}

