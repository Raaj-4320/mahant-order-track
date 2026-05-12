# Phase 1A: UI-to-DB Data Model Alignment

## Why the old model was too thin
The original model was sufficient for the current Order Booking screen, but too minimal for richer Dashboard, Suppliers, Payment Agents, Customers, and Products modules. It lacked operational fields (codes, contact/location, statuses, financial rollups, loading/payment states, and snapshots).

## New aligned domain model summary
- Added canonical domain model at `types/domain.ts`.
- `lib/types.ts` now re-exports domain types and preserves calculation helpers.
- Compatibility fields are retained to avoid breaking `/orders`.

## Screen-to-data mapping
- **Dashboard**: order status, payment status, loading date, totals, paid/due amounts, supplier/customer summaries.
- **Suppliers**: supplier code, contact, location, status, order counters, amount counters.
- **Payment Agents**: agent code, initials, phone/wechat, paid counters.
- **Customers**: customer code, status, total spent, outstanding amount.
- **Products**: product code/SKU, category/unit, pricing, optional stock metadata.
- **Orders**: legacy and future fields (`number` + `orderNumber`, `paymentBy` + `paymentAgentId`).

## Firestore collection plan
- `businesses/{businessId}`
- `businesses/{businessId}/products/{productId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/suppliers/{supplierId}`
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/orders/{orderId}`

## Snapshot strategy
- Order lines should store `supplierSnapshot`, `productSnapshot`, `customerSnapshot`.
- Orders should store `paymentAgentSnapshot`.
- This preserves historical truth when master records are edited later.

## Derived counter strategy
- Counters such as `supplier.totalOrders`, `supplier.totalOrderAmount`, `customer.totalSpent`, `paymentAgent.totalPaidAmount`, and dashboard totals can be:
  1) computed client-side initially from orders, then
  2) denormalized later with careful transactional updates.

Because this is frontend-only Firebase (no backend), avoid complex denormalized writes until order flow stabilizes.

## Backward compatibility notes
- `Order.number` retained for current UI, with `orderNumber` added as canonical future field.
- `Order.paymentBy` retained for current UI, with `paymentAgentId` added for future alignment.
- Existing `lineTotalPcs`, `lineTotalRmb`, `orderTotal` helpers remain unchanged.

## Intentionally not implemented yet
- No Firebase SDK/config/service implementation.
- No backend/API routes.
- No redesign of existing pages.
- No broad refactor to async service layer (planned in Phase 1B).
