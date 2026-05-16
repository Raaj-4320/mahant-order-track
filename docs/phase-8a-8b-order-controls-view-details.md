# Phase 8A + 8B — Order controls and view details

## Scope completed
- Fixed Loading Date end-to-end in order form, history display, and Firestore mapping.
- Fixed Order Status updates from history with persistence through orders service.
- Removed connected-later popup usage from Orders and Dashboard core actions.
- Added reusable `OrderLinesDetailModal` for order line details and summary totals.
- Added explicit View action in Order History.
- Added `View Order Details` action beside save controls in active form.
- Connected Dashboard row `View Details` to real modal.
- Continued runtime currency label cleanup in touched order/dashboard surfaces (`Rate / PCS`, symbol-free amounts).

## Deferred (explicitly not in this phase)
- Customer auto-create.
- Customer ledger redesign.
- Payment-agent settlement formula changes.

## Test checklist
- Build and lint run.
- Search verification for loading date/status/view wiring.
- Search verification for placeholder popup removal in touched files.
- Search verification for currency wording cleanup in touched files.
