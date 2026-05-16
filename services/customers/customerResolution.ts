import type { Customer, OrderLine } from "@/lib/types";
import { createCustomerIdFromName, normalizeCustomerName } from "@/services/customers/customerIdentity";
import { getCustomersService } from "@/services/customersService";

export function findCustomerByTypedName(customers: Customer[], typedName: string): Customer | null {
  const normalized = normalizeCustomerName(typedName);
  if (!normalized) return null;
  const sorted = [...customers].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.find((c) => normalizeCustomerName(c.name || c.displayName || "") === normalized) ?? null;
}

export function applyTypedCustomerToLine(line: OrderLine, typedName: string, customers: Customer[]): Partial<OrderLine> {
  const customerName = typedName;
  const matched = findCustomerByTypedName(customers, typedName);
  if (!matched) return { customerName, customerId: "", customerSnapshot: undefined };
  return { customerName: matched.name, customerId: matched.id, customerSnapshot: { id: matched.id, name: matched.name, code: matched.customerCode } };
}

export async function resolveCustomersForOrderLines(lines: OrderLine[], customers: Customer[], nowIso: string): Promise<OrderLine[]> {
  const customersService = getCustomersService();
  const existing = new Map<string, Customer>();
  [...customers]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((c) => {
      const key = normalizeCustomerName(c.name || c.displayName || "");
      if (key && !existing.has(key)) existing.set(key, c);
    });

  const resolved: OrderLine[] = [];
  for (const line of lines) {
    const typed = (line.customerName || line.customerSnapshot?.name || "").trim();
    if (!typed) {
      resolved.push({ ...line, customerId: "" });
      continue;
    }
    const normalized = normalizeCustomerName(typed);
    const hit = existing.get(normalized);
    if (hit) {
      resolved.push({ ...line, customerId: hit.id, customerName: hit.name, customerSnapshot: { id: hit.id, name: hit.name, code: hit.customerCode } });
      continue;
    }
    const created = await customersService.upsertCustomer?.({
      id: createCustomerIdFromName(typed),
      customerCode: `CUS-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: typed,
      displayName: typed,
      normalizedName: normalized,
      source: "order-line",
      status: "active",
      totalOrders: 0,
      totalSpent: 0,
      outstandingAmount: 0,
      totalReceived: 0,
      storeCreditBalance: 0,
      totalReceivableGenerated: 0,
      currentReceivable: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as Customer);
    if (created) {
      existing.set(normalized, created);
      resolved.push({ ...line, customerId: created.id, customerName: created.name, customerSnapshot: { id: created.id, name: created.name, code: created.customerCode } });
      continue;
    }
    resolved.push(line);
  }
  return resolved;
}
