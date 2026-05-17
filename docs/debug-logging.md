# Debug Logging Guide

## Logging model
Logs are page-access based. Each tab logs once on mount:
- `[PAGE] <Page> accessed`
- `[FLOW] <Page> data flow`

## Flow structure
Each flow log includes:
- functions called (hook/service names)
- db paths used
- result counts and `reachedComponent` flag
- small samples (first 5)

## Save logs
Order save logs are minimal by default:
- `[FLOW] order_save_started`
- `[FLOW] order_save_completed`
Detailed payload/error traces are logged only on failures via `[ERROR]`.

## Safety
Sanitization/redaction in `lib/logger.ts` remains active for secret keys and base64/data URLs.


## Customer ledger repair note
The historical repair routine (`repairCustomerLedgerFromSavedOrders`) remains available internally in services for maintenance/recovery. It is no longer exposed in the normal Customers page UI.
Customer ledger entries remain the source of truth, while customer documents store cached summary totals.
