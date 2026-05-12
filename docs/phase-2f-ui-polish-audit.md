# Phase 2F UI Polish + Consistency Audit

## Audit scope
- Dashboard, Suppliers, Payment Agents, Customers, Products, and Order Booking UI consistency.
- Shared table primitives (`StatusBadge`, `ActionIcons`, `TablePagination`).
- Placeholder controls, search/filter behavior, and empty/error handling tone.

## Polish changes made
- Standardized placeholder behavior on rich pages to show a consistent info toast:
  - "This action will be connected in a later phase."
- Upgraded shared action and pagination components with accessible labels/titles and optional placeholder callbacks.
- Kept table header/row density, card shells, and KPI rhythm aligned with existing visual system.

## Placeholder behavior decision
- Placeholders remain non-destructive and non-persistent.
- Add/Export/More Filters/row actions/pagination controls now consistently communicate deferred functionality via toasts.

## Search/filter behavior summary
- Real filters retained:
  - Dashboard search
  - Suppliers search + status
  - Payment Agents search + status
  - Customers search + status
  - Products search + category + status
- Placeholder filters retained where data support is not yet modeled broadly:
  - Country / location dropdowns
  - date-range and advanced filters

## Loading/error/empty states
- No harsh full-page loaders introduced.
- Existing inline empty-state rows retained.
- Inline subtle error text remains where hooks expose errors.

## Intentionally unchanged
- `/orders` data flow and behavior were preserved.
- No Firebase wiring.
- No backend/API routes.
- No destructive workflows.

## Risks / warnings
- Placeholder controls still outnumber real controls in some filter bars.
- Async hook initial render may briefly show low metrics.
- `/orders` remains on synchronous lookup imports by design until later migration.

## Verification checklist
- [x] All major pages render
- [x] Sidebar route highlighting and payment-agents navigation work
- [x] Real search/status/category filters still work
- [x] Placeholder controls communicate deferred behavior consistently
- [x] `npm run build` passes
- [ ] `npm run lint` blocked by interactive Next.js setup prompt
