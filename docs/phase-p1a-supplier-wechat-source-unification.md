# Phase P1-A — Supplier / WeChat Source Unification

## Decision
Suppliers and WeChat views are derived from saved orders only.

- WeChat ID source: order header (`order.wechatId`)
- Supplier source: order line supplier name (`line.supplierName` / snapshot fallback)
- Scope: saved orders only (`status === "saved"`)
- Excluded: draft and archived orders

## Data source behavior
- Firebase mode: supplier UI groups are derived from Firebase orders (`useOrders().data`) and do not depend on mock supplier collections.
- Mock mode: still usable for local/dev; derived groups are still built from mock-mode saved orders.

## No supplier DB collection in this phase
No separate supplier collection is introduced or required in this phase. Supplier/WeChat analytics are selector-derived.

## Selector outputs
`getWechatSupplierGroups(savedOrders)` and `getUniqueSupplierGroups(savedOrders)` now include:
- order ids/order numbers
- order counts
- line counts
- total CTNs / PCS / amount
- customer names
- latest order/loading dates

## Remaining risk
- Name normalization for suppliers is string-based and may still split semantically identical supplier names with different spellings/spacing beyond current normalization.
