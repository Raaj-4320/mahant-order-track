# Phase P0-A — Order Number Series Hardening

## Scope
- Removed local UI-side `orders.length + 301` order-number generation.
- Added allocator-backed sequence for final saved orders only.
- Added Firestore counter path: `businesses/{businessId}/counters/orderNumbers`.
- Added transaction allocator with fallback scan of existing orders matching `YY-###`.

## Behavior
- Final saved order numbers use literal format `YY-<n>`.
- Sequence starts from `YY-301`.
- New/draft forms show blank + "Auto on Save".
- Saving drafts does not allocate order numbers.
- Completing draft allocates number on first save-as-order when needed.
- Existing saved orders with valid `YY-###` keep number on edit/status/loading updates.

## Allocation rules
1. Transaction reads counter document.
2. If counter exists and `nextNumber >= 301`, use it.
3. If counter missing/invalid, scan orders collection and find max valid suffix from `number`/`orderNumber` matching `YY-###`.
4. Set `nextNumber = max(maxExisting + 1, 301)`.
5. Persist `counter.nextNumber = nextNumber + 1` in transaction.
6. Return `YY-${nextNumber}`.

## Logging
- `[FLOW] order_number_allocate_start`
- `[FLOW] order_number_allocate_success { orderNumber }`
- `[ERROR] order_number_allocate_failure`


## Update: reserve-on-add behavior
- Add Order now allocates/reserves the next `YY-###` immediately and pre-fills the form.
- Save Draft preserves reserved number and does not allocate again.
- Save Order preserves reserved number; allocator runs only when missing/invalid/duplicate legacy data needs replacement.
- Cancel/discard may skip reserved numbers; reuse is intentionally out of scope for this phase.
