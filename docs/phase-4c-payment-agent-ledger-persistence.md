# Phase 4C — Payment Agent balance persistence from order settlements

## Bug fixed
Payment Agent current credit was not updating after saving orders with settlement snapshots.

## What changed
- Settlement snapshots now include `orderTotal` and `existingCredit` metadata.
- Added recalculation helper to derive payment agent balances from opening credit + saved order snapshots.
- Orders save/delete now trigger payment-agent recalculation using updated orders list.

## Recalculation strategy
For each agent:
- start from `openingCreditBalance` (fallback current credit)
- for each saved order settlement snapshot:
  - `credit = credit - creditUsed + newCreditCreated`
  - `totalOrderAmount += orderTotal`
  - `totalPaidAmount += paidNow`
  - `currentDuePayable += remainingPayable`

## Real vs deferred
Real now:
- credit/totals update from saved order snapshots.
Deferred:
- standalone Pay Agent ledger persistence.
- customer ledger.

## Test checklist
- opening credit usage case
- partial payment case
- overpayment credit case
- edit order recalc
- delete order recalc
