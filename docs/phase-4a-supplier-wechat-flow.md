# Phase 4A — Supplier/WeChat Flow from Saved Orders

- Supplier data in panel is derived from saved orders, not pre-created supplier masters.
- WeChat ID in order header acts as supplier contact/group key.
- Order line supplier can be typed directly (`supplierName`).
- Suppliers page now provides two derived views:
  - WeChat IDs grouping
  - Unique Suppliers grouping
- Source of truth for these views: `lib/store.tsx` orders state.

## Autocomplete
- WeChat input suggests existing IDs from order history (limited list).
- Supplier line input suggests names from saved orders and mock suppliers.
- Unknown values are allowed and persist on save.

## Not implemented in this phase
- No Firebase migration for orders/suppliers.
- No supplier finance/ledger logic.
- No backend API writes.

## Test checklist
- Save orders with same WeChat and different suppliers -> WeChat group expands with all entries.
- Save orders with same supplier under different WeChat IDs -> unique supplier totals aggregate correctly.
- Product generation and archive flows remain unchanged.
