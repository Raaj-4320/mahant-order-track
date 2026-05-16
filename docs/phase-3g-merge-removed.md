# Phase 3G rollback — catalog merge removed

## Why removed
Cross-order merge by supplier+marka+details does not match business reality and may combine separate order-line products.

## New identity rule
- One order line = one generated product record.
- Product ID: `order-line-{order.id}-{line.id}`.
- Re-saving the same line updates the same product (idempotent).
- Different orders/lines remain separate even with same supplier/marka/details.

## Compatibility
- Existing old merged records are not deleted automatically.
- Existing metadata fields (e.g. `catalogKey`) are still read for compatibility.
- New sync writes no new merge-based IDs.

## Manual cleanup
If needed, previously merged `catalog-*` records can be cleaned up manually later.
