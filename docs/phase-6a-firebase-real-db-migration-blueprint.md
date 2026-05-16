# Phase 6A — Firebase real database migration blueprint

## Scope
Phase 6A is audit + architecture design only. No runtime migration is implemented in this phase.

## Current runtime data source audit
| Module | Current source of truth | Persistence type | Persists refresh? | Persists deploy? | C/E/D support now | Risks |
|---|---|---|---|---|---|---|
| Orders | `useStore` (`orders` state) seeded from `initialOrders` | React context + static seed | No | No | Yes in UI state | Lost on refresh; demo data treated as runtime truth |
| Draft Orders | Same as Orders (`status: draft`) | React context + static seed | No | No | Create/update in UI | Draft lifecycle not durable |
| Products | `productsService` (mock or Firebase by env) | Firestore when enabled, else mock module state | Firebase: yes / mock: no | Firebase: yes / mock: no | CRUD available | Mixed mode can confuse operators |
| Generated Products | `syncOrderLinesToProducts` via products service | Same as products source | Same as above | Same as above | Upsert/archive generated records | If orders are local but products in Firebase, cross-source inconsistency |
| Payment Agents | `paymentAgentsMockService` through hook | mock module state | No | No | Add/update + recalc | Financial balances reset on refresh |
| Payment Agent Ledger / payments | `paymentAgentsMockService` ledger array | mock module state | No | No | Record payments, list ledger | No durable audit trail |
| Customers | `customersMockService` seed list | static seed/mock read service | Effective yes in same build; not user-write durable | Not user-write durable | Read-only UI | Not real DB-backed; add/edit placeholders |
| Suppliers / WeChat groups | Derived selectors from orders + supplier seed | derived selector + context orders | No (depends on orders) | No | Derived only | Inherits non-durable orders |
| Dashboard | Derived from orders/customers/suppliers/paymentAgents | derived selector + mixed sources | Partially | Partially | Read-only | Mixed-source metrics drift |
| Settings / Business ID | env vars (`NEXT_PUBLIC_FIREBASE_BUSINESS_ID`) | env configuration | Yes | Yes | N/A | No Firestore settings doc for counters/flags yet |
| Delete Everything/reset | Not implemented for real DB | none | N/A | N/A | N/A | Cannot safely clear Firestore business data |

## Proposed Firestore schema (tenant root)
Root: `businesses/{businessId}` where `businessId = mahant`.

### Collections
- `businesses/{businessId}/orders/{orderId}`
- `businesses/{businessId}/products/{productId}`
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/paymentAgentLedger/{entryId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/settings/{docId}`

### Orders document
- `id`, `number`, `orderNumber`, `date`, `wechatId`
- `status`: `draft | saved | cancelled | archived`
- `paymentBy`, `paymentAgentId`, `paidToPaymentAgentNow`
- `paymentAgentSettlementSnapshot`
- `lines[]`
- denormalized totals: `orderTotal`, `totalUniqueItems` (optional but recommended)
- timestamps: `createdAt`, `updatedAt`, `savedAt`
- metadata: `source`, `createdBy`, `updatedBy` (optional but recommended)

### Order line object
- `id`, `supplierId?`, `supplierName?`
- `productId?`, `generatedProductId?`
- `productPhotoUrl?`, `photoUrl?`, `picDim?`
- `marka`, `details`, `totalCtns`, `pcsPerCtn`, `rmbPerPcs`
- `customerId?`, `customerName?`
- optional lifecycle flags: `archived`, `deletedAt`
- optional timestamps: `createdAt`, `updatedAt`

### PaymentAgent document
- `id`, `agentCode`, `name`, `phone`, `wechatId`, `country`, `status`
- `openingCreditBalance`, `creditBalance`
- `totalOrderAmount`, `totalPaidAmount`, `currentDuePayable`
- `notes`, `createdAt`, `updatedAt`

### PaymentAgentLedger entry
- `id`, `agentId`
- `type`: `opening_credit | order_settlement | order_settlement_reversal | agent_payment | agent_payment_reversal`
- `sourceOrderId?`, `sourceOrderNumber?`
- `amount`, `creditUsed`, `payableAfterCredit`, `paidNow`, `remainingPayable`, `newCreditCreated`
- `dueReduced`, `creditCreated`, `resultingCreditBalance`
- `note?`, `createdAt`, `paymentDate?`, `reversalOfId?`

### Products
- Keep current product schema + source metadata (`manual`/`order-line`) and source references.

### Customers
- Keep basic customer profile fields only in this phase; customer ledger deferred.

### Settings docs
- `settings/orderNumberSeries`:
  - `prefix`, `year`, `startNumber`, `nextNumber`
- `settings/businessProfile`
- `settings/featureFlags`

### Supplier/WeChat storage decision
Initial approach: **derive from orders** only. Do not add a dedicated suppliers collection for this flow unless query/load performance requires materialized aggregates later.

## Migration architecture plan
Introduce service/hook boundaries first, then migrate module usage.

### New files
- `services/firebase/ordersFirebaseService.ts`
- `services/ordersService.ts`
- `hooks/useOrders.ts`
- `services/firebase/paymentAgentsFirebaseService.ts`
- `services/paymentAgentsService.ts`
- `services/firebase/paymentAgentLedgerFirebaseService.ts`
- `services/paymentAgentLedgerService.ts`
- `services/firebase/customersFirebaseService.ts`
- `services/customersService.ts`
- `services/firebase/devResetFirebaseService.ts`

### Existing updates
- Keep `services/productsService.ts` strategy, add any missing archive/delete semantics if needed.
- `services/productCatalogSync.ts` continues using service boundary (no page-level Firebase calls).
- Rewire suppliers/dashboard selectors to consume orders from `useOrders` once migrated.

### Rules
- Page components must not import Firebase SDK directly.
- Hooks/services remain the only data access boundary.
- Mock services remain fallback during staged migration.

## Recommended migration phases
- **6B:** Payment Agents + Ledger Firebase service
- **6C:** Orders + Draft Orders Firebase service
- **6D:** Rewire Suppliers/Dashboard to Firebase-backed hooks
- **6E:** Real DB Delete Everything (dev-only gated)
- **6F:** Clean-slate runtime defaults (no demo auto-data)
- **6G:** Firestore security rules hardening

## Ledger/order correctness strategy
A) Save new order: validate → write saved order → sync products → ledger settlement entry → refresh payment-agent summary.  
B) Save draft: write draft only, no product sync, no ledger mutation.  
C) Complete draft: update same order id to saved → sync products → apply settlement.  
D) Edit saved order: append reversal entry for previous settlement → archive removed generated products → sync current lines → append new settlement entry → recompute summary.  
E) Delete order: recommend safe archive status first; append settlement reversal; archive generated products; recompute summary.  
F) Pay Agent: append `agent_payment` entry; due-first then credit surplus logic; recompute summary.

Preferred accounting model: append-only ledger entries + deterministic summary recomputation from ledger/order facts.

## Delete Everything blueprint (real Firestore)
Dev-only utility design (not implemented in 6A):
- Gate: `NEXT_PUBLIC_ENABLE_DEV_RESET=true` and dev-mode visibility.
- Require typed confirmation: `DELETE EVERYTHING`.
- Show explicit scoped target path: `businesses/mahant/*`.
- Delete collections under business only:
  - orders, products, paymentAgents, paymentAgentLedger, customers, optional settings docs.
- No Admin SDK; frontend batched + paginated deletes only.
- Explicit warning: Firestore rules must permit scoped delete for authorized admin/developer.

## Clean-slate / no-demo-data plan
Future env controls:
- `NEXT_PUBLIC_USE_DEMO_DATA=false`
- `NEXT_PUBLIC_ENABLE_DEV_SEED=false`

Planned behavior:
- Mock services default to empty in prod/test unless explicit seed flag enabled.
- `initialOrders` must not auto-bootstrap runtime once orders migration is complete.
- Firebase-backed services become default for migrated modules.

## Firestore rules/security plan
- Require Firebase Auth.
- Enforce business membership for read/write under `businesses/{businessId}`.
- Restrict delete/reset operations to admin/dev-reset role.
- Keep tenant isolation strict; no cross-business access.
- Add payload validation for key financial writes (orders, ledger, agent summary).
- Cloudinary unsigned preset security must be tightened in Cloudinary console (folder/size/type limits).

## Risks
- Mixed-source period (orders local + products Firebase) can cause reporting drift.
- Settlement reversals require strict idempotency to avoid double-application.
- Dev reset tool can be dangerous without strict path scoping and confirmation UX.

## Test strategy for migration phases
- Build + lint checks each phase.
- Data durability checks across refresh and redeploy.
- Financial invariants: order settlement + payment entries + summary recomputation.
- Regression checks for product generation/archive and draft exclusion rules.
