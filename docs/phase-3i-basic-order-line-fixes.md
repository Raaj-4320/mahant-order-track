# Phase 3I — Basic Order Line Fixes

## What was fixed
- New order line defaults are now blank/clean (no demo supplier, customer, product, marka, details, dimensions, or pricing).
- Added explicit `Select Supplier` / `Select Customer` placeholder options so blank lines render safely.
- Persisted-line deletion in edit mode continues to track `removedLineIds`, and save still archives generated products with ID format `order-line-{order.id}-{line.id}`.
- Products page now defaults to `Active` status filter so archived/inactive generated products are hidden from default view.

## Active/inactive visibility behavior
- Archived generated products are set to `inactive` (not hard-deleted).
- Default Products view now shows active products only.
- Inactive items are visible by selecting `Inactive` or `All Statuses` in the status filter.

## Intentionally not changed
- No Orders Firebase migration.
- No backend/API routes.
- No product identity rule changes.
- No Cloudinary upload behavior changes.
- No manual Products Add/Edit behavior changes.
- No mock fallback removal.

## Test checklist
- `/orders` opens with a clean blank line.
- `Add New Line` creates another clean blank line.
- Saving blank-only order is blocked.
- Saving meaningful line still syncs generated product.
- Deleting persisted line in edit mode then saving archives linked generated product.
- `/products` default active view hides archived generated products.
