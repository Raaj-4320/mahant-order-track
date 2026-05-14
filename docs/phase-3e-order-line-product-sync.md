# Phase 3E — Order Line → Product Catalog Sync

## Why
Products are primarily generated from saved order lines in real business flow.

## What changed
- Added `services/productCatalogSync.ts` with:
  - `createProductIdFromOrderLine(order, line)`
  - `productFromOrderLine(order, line, index)`
  - `syncOrderLinesToProducts(order)`
- `/orders` now runs product sync only on **Save Order**.
- Save as Draft behavior remains unchanged.

## ID strategy
- Deterministic ID: `order-line-{order.id}-{line.id}`.
- Re-saving same order line updates same product record.
- Limitation: same logical product across different orders currently creates separate records.

## Mapping summary
- Name from line details/marka fallback.
- Price from `rmbPerPcs`.
- Stock from `lineTotalPcs`.
- Source metadata added (`source`, `sourceOrderId`, `sourceOrderNumber`, `sourceLineId`).

## Image handling
- HTTP/Cloudinary product photos are copied to Product.photo.
- Data URLs are kept in mock mode; skipped in Firebase mode to avoid large base64 writes.

## Not implemented
- No Orders Firebase migration.
- No delete.
- No realtime listeners.
- No Cloudinary upload forced in `/orders`.
