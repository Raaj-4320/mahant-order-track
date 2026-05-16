# Phase 6D — Suppliers + Dashboard Firestore Orders Rewire

## Source selection rule
- When `NEXT_PUBLIC_ORDERS_DATA_SOURCE=firebase`, Suppliers and Dashboard derive order-backed views from `useOrders().data`.
- When in mock mode, Suppliers and Dashboard keep local/store-backed behavior.

## Suppliers / WeChat derivation
- Suppliers page now selects source orders by mode.
- In firebase mode it uses Firestore orders from `useOrders()`.
- Supplier/WeChat rollups are derived from **saved** orders only.
- Archived and draft orders are excluded from supplier totals.

## Unique Suppliers derivation
- Unique supplier totals aggregate line amounts across saved orders only.
- Same supplier appearing across different WeChat IDs is aggregated by normalized supplier name.

## Dashboard behavior
- Dashboard now selects orders by mode and uses `useOrders().data` in firebase mode.
- Active order stream excludes archived orders before selector evaluation.
- Dashboard stats and table rows use saved orders only.
- Payment agents/customers/suppliers hooks remain unchanged and compatible.

## Status handling
- Saved: included in Suppliers + Dashboard totals.
- Draft: excluded from finalized totals.
- Archived: excluded from active totals.

## Deferred
- Customer ledger
- Backend/API routes
- Firebase Admin/Cloud Functions
- Dedicated supplier collection

## Manual test checklist
1. Save firebase orders with WeChat + supplier lines, verify Suppliers tabs show persisted rows after refresh.
2. Save multiple orders under same WeChat, verify grouped WeChat detail includes all suppliers.
3. Use same supplier under multiple WeChat IDs, verify Unique Suppliers aggregates totals.
4. Create draft orders, verify Suppliers/Dashboard totals do not include drafts.
5. Archive saved order, verify Suppliers/Dashboard totals exclude it.
6. Verify mock mode still reads local/store orders.
