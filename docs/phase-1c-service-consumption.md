# Phase 1C: Safe Service/Hook Consumption Migration

## What changed
- Migrated non-order pages toward hook/service consumption while preserving current UI behavior.
- Introduced selector usage in pages that previously computed derived stats inline.
- Kept `/orders` direct lookup imports intentionally for safety.

## Pages migrated
- `app/dashboard/page.tsx`
  - uses `useCustomers`, `useSuppliers`
  - uses selectors: `getDashboardStats`, `getDashboardRows`
- `app/customers/page.tsx`
  - uses `useCustomers`
  - uses selector: `getCustomerStats`
- `app/suppliers/page.tsx`
  - uses `useSuppliers`
  - uses selector: `getSupplierStats`
- `app/products/page.tsx`
  - uses `useProducts`

## Direct `lib/data.ts` imports still remaining
- `/orders` page and order components still import static lookup lists and formatters.
- Reason: `/orders` is business-critical and currently depends on synchronous lookup availability for select options, default line creation, and filter behavior. Avoided introducing flicker/race-risk in this phase.
- `lib/store.tsx` still imports `initialOrders` as runtime seed.

## Store/order handling
- `lib/store.tsx` remains the single mutable runtime source for orders.
- No second live mutable order source was introduced.
- Mock orders service exists for boundary readiness, but not wired as competing runtime state.

## Selector usage
- Dashboard, Customers, and Suppliers pages now delegate derived calculations to `services/selectors.ts` helpers.
- This centralizes math and prepares easy swap to Firebase-backed reads later.

## Why this helps Phase 2 and Firebase
- Pages now depend less on direct static arrays and more on reusable read boundaries (hooks/services).
- Derived metrics are no longer duplicated inline in multiple page files.
- Later Firebase migration can replace service implementations without redesigning pages.

## Verification checklist
- [x] Dashboard renders
- [x] Customers renders
- [x] Suppliers renders
- [x] Products renders
- [x] Orders route preserved (no risky data-source rewrite in this phase)
- [x] `npm run build` passes
- [ ] `npm run lint` blocked by interactive Next.js setup prompt
