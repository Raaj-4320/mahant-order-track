export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createCustomerIdFromName(name: string): string {
  const normalized = normalizeCustomerName(name)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `customer-${normalized || "unknown"}`;
}
