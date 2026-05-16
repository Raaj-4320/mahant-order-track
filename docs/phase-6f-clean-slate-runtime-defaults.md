# Phase 6F — Clean-Slate Runtime Defaults

## Purpose
Ensure Firebase mode renders only real Firestore-backed runtime data and never presents fixture/demo records as live data.

## New env flags
- `NEXT_PUBLIC_USE_DEMO_DATA=false`
- `NEXT_PUBLIC_ENABLE_DEV_SEED=false`

## Runtime behavior
### Firebase mode
- Products/Payment Agents/Orders use Firebase services as configured by data-source env flags.
- Empty Firestore collections remain empty in UI (no fixture auto-population).
- Customers view does not present mock fixture records as real when Firebase modes are enabled.

### Mock mode + demo disabled
- Mock runtime starts clean (empty arrays) for orders/products/payment agents/customers/suppliers.
- Manual in-session add/upsert flows continue to work.

### Mock mode + demo enabled
- Mock services initialize from `lib/data.ts` fixtures for local demo/testing.

## Pages and services updated
- Added central env helpers in `lib/runtimeConfig.ts`.
- Updated store and mock services to respect `NEXT_PUBLIC_USE_DEMO_DATA`.
- Updated Orders suggestions/search to avoid static fixture lookups.
- Updated Customers page empty-state copy for Firebase-mode clean slate.

## Intentionally not removed
- Fixture files remain in repo for demo/testing.
- Mock fallback remains available.
- No schema or business-logic changes.

## Test checklist
1. Firebase mode + empty DB: all lists/totals should be empty/zero, no demo data shown.
2. Firebase mode + real records: only created Firestore records appear after refresh.
3. Mock mode + demo disabled: starts empty; manual additions work.
4. Mock mode + demo enabled: fixtures appear.
