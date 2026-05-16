# Phase 6C.2 — Orders history + drafts firestore wiring

## Source selection rule
- `NEXT_PUBLIC_ORDERS_DATA_SOURCE=firebase`:
  - `/orders` history reads from `useOrders().data` (active only, archived filtered out)
  - Complete Draft reads from `useOrders().draftOrders`
  - Save Draft/Save Order order-document writes go through `useOrders().upsertOrder`
  - Delete action archives via `useOrders().archiveOrder`
- `NEXT_PUBLIC_ORDERS_DATA_SOURCE=mock`:
  - Existing local/store behavior remains.

## Firebase mode behavior
- Order History now shows Firestore orders only.
- Empty history state: "No orders yet. Click Add Order to create one."
- Complete Draft lists Firestore drafts, includes autosave metadata.
- Save as Draft updates same Firestore draft id (no duplicate docs).
- Save Order updates same Firestore doc to `status=saved`.
- Delete action archives order (`status=archived`) instead of hard delete.

## Mock mode behavior
- Existing Save Draft/Save Order/history/delete behavior remains local.

## Deferred 6C.3 side effects
- Durable payment-agent order settlement ledger entries remain deferred.
- Durable archive/reversal coupling for generated products on firebase order archive remains deferred.
- Suppliers/Dashboard firebase-derived rewiring remains deferred.

## Test checklist
- Firebase mode shows Firestore-only order history/drafts.
- Autosaved draft appears in Complete Draft after refresh.
- Save Draft persists as draft in same doc id.
- Save Order transitions same doc to saved.
- Archive removes from active history.
- Mock mode behavior unchanged.
