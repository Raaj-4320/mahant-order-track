# Debug Logging Guide

## Enable logs
Set:

```bash
NEXT_PUBLIC_ENABLE_DEBUG_LOGS=true
```

## Log prefixes
- `[SYSTEM]`
- `[ROUTE]`
- `[UI]`
- `[DB]`
- `[ORDER]`
- `[CUSTOMER]`
- `[PRODUCT]`
- `[PAYMENT_AGENT]`
- `[LEDGER]`
- `[ERROR]`

## Redaction rules
`lib/logger.ts` sanitizes log payloads by:
- redacting keys containing: `password`, `token`, `apiKey`, `secret`, `privateKey`, `uploadPreset`, `credential`
- replacing `data:*` URLs with `data-url-present`
- truncating long strings

## Expected sequence for customer-save visibility bug
1. `[ORDER] save_order_clicked`
2. `[CUSTOMER] resolve_order_customers_start`
3. `[CUSTOMER] ensure_customer_create_start` or `[CUSTOMER] ensure_customer_existing_found`
4. `[DB] upsert_customer_success`
5. `[LEDGER] apply_customer_receivables_success`
6. `[DB] list_customers_success` with `count > 0`

## Firestore paths to verify in logs
- `businesses/{businessId}/orders`
- `businesses/{businessId}/customers`
- `businesses/{businessId}/customerLedger`
- `businesses/{businessId}/products`
- `businesses/{businessId}/paymentAgents`
- `businesses/{businessId}/paymentAgentLedger`
