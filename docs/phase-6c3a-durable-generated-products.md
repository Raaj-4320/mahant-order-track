# Phase 6C.3A — Durable generated products from firestore saved orders

## Implemented
- Preserved generated product identity: `order-line-{order.id}-{line.id}`.
- `syncOrderLinesToProducts(order)` now syncs **only** when `order.status === "saved"`.
- Sync now skips completely blank/non-meaningful lines.
- Removed-line archive remains id-based and now best-effort safe per-line.
- In firebase orders mode, order archive/delete now attempts generated-product archive for all order lines before archiving order doc.

## Identity and metadata
Generated products continue to carry:
- `source: "order-line"`
- `generatedFromOrderLines: true`
- `sourceOrderId`, `sourceOrderNumber`, `sourceLineId`
- pricing/qty/photo/supplier metadata from order line

## Save Order behavior
- Saved order sync uses same saved order id and line ids.
- Draft save path does not invoke product sync.

## Edit removed-line behavior
- On Save Changes, removed line ids are archived via `archiveProductsForRemovedOrderLines(orderId, removedLineIds)` after save succeeds.

## Full order archive behavior
- In firebase mode, archive flow performs best-effort generated-product archive for all lines, then archives order doc (`status=archived`).
- No hard deletes.

## Firebase Products archive behavior
- Uses `archiveProduct(id)` through products service facade; manual products remain untouched by source guard in products service.

## Mock mode
- Existing behavior preserved with mock product service archiving generated products to inactive.

## Deferred
- Durable payment-agent order settlement ledger/reversal remains Phase 6C.3B/6C.3C.
- Suppliers/Dashboard rewiring remains deferred.

## Manual checklist
- Draft does not create products.
- Save Order creates `order-line-{orderId}-{lineId}` product.
- Edit + remove line archives only removed line product.
- Archive order archives all generated products for that order.
- Manual products remain unaffected.
