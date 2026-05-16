type LogArea = "SYSTEM" | "ROUTE" | "UI" | "DB" | "ORDER" | "CUSTOMER" | "PRODUCT" | "PAYMENT_AGENT" | "LEDGER" | "ERROR";

const SENSITIVE_KEY = /(password|token|apiKey|secret|privateKey|uploadPreset|credential)/i;

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "data-url-present";
    if (value.length > 240) return `${value.slice(0, 240)}…[truncated:${value.length}]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) out[k] = "[REDACTED]";
      else out[k] = sanitizeValue(v);
    }
    return out;
  }
  return value;
}

function baseLog(area: LogArea, event: string, data?: unknown) {
  const ts = new Date().toISOString();
  const prefix = `[${area}]`;
  const payload = data === undefined ? undefined : sanitizeValue(data);
  if (payload === undefined) {
    console.log(prefix, ts, event);
  } else {
    console.log(prefix, ts, event, payload);
  }
}

export const logSystem = (event: string, data?: unknown) => baseLog("SYSTEM", event, data);
export const logRoute = (event: string, data?: unknown) => baseLog("ROUTE", event, data);
export const logUI = (event: string, data?: unknown) => baseLog("UI", event, data);
export const logDB = (event: string, data?: unknown) => baseLog("DB", event, data);
export const logOrder = (event: string, data?: unknown) => baseLog("ORDER", event, data);
export const logCustomer = (event: string, data?: unknown) => baseLog("CUSTOMER", event, data);
export const logProduct = (event: string, data?: unknown) => baseLog("PRODUCT", event, data);
export const logPaymentAgent = (event: string, data?: unknown) => baseLog("PAYMENT_AGENT", event, data);
export const logLedger = (event: string, data?: unknown) => baseLog("LEDGER", event, data);
export const logError = (event: string, data?: unknown) => baseLog("ERROR", event, data);
