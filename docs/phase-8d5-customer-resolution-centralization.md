# Phase 8D.5 — Centralize Customer Name Resolution + Duplicate Prevention Tests

## What changed
- Added shared customer resolution helper at `services/customers/customerResolution.ts`.
- Centralized line-typing behavior (`applyTypedCustomerToLine`) and save-time resolution (`resolveCustomersForOrderLines`).
- Save-time resolution performs normalized-name deterministic match first, then creates customer only when missing.
- Draft save/autosave still do not invoke customer creation.

## Duplicate prevention behavior
- Normalization is case/whitespace-insensitive via `normalizeCustomerName`.
- Existing customers are sorted by id and first deterministic match is reused.
- Creating a new customer uses stable id generation from normalized name (`createCustomerIdFromName`).

## Touch points
- `OrderLineRow` now uses `applyTypedCustomerToLine`.
- `OrdersPage` save path now uses `resolveCustomersForOrderLines`.

## Validation checklist
- Typing a known customer binds `customerId` + `customerName`.
- Typing unknown customer keeps only `customerName` until Save Order.
- Save as Draft does not create customer.
- Save Order resolves/creates once and reuses normalized duplicates.
