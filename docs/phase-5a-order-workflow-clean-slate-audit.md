# Phase 5A — Order Workflow + Clean Slate Audit

## 1) Runtime data source audit

| Module | Current source | Seeded from `lib/data.ts` | Derived? | Persistence today |
|---|---|---:|---:|---|
| Orders | `lib/store.tsx` state (`useState(initialOrders)`) | Yes (`initialOrders`) | No | In-memory only (lost on refresh/restart) |
| Products | `productsService` -> mock or Firebase | Mock: yes (`seedProducts`) | Partially (generated from orders) | Mock: in-memory only; Firebase mode: durable |
| Payment Agents | `usePaymentAgents` -> `paymentAgentsMockService` | Yes | Recalculated summaries from orders + payments | In-memory only |
| Customers | `useCustomers` -> `customersMockService` | Yes | No | In-memory/static (no writes) |
| Suppliers | `useSuppliers` mock for base list + `/suppliers` derived selectors from orders | Yes | Yes (WeChat/supplier groups derived from orders) | Derived view depends on in-memory orders |
| Dashboard | Store orders + hooks (customers/suppliers/payment agents) via selectors | Yes | Yes | Reflects mixed in-memory state |
| Payment Agent ledger entries | `paymentAgentsMockService` module variable | No initial seed | Yes (from order settlements and Pay Agent) | In-memory only |
| Supplier/WeChat groups | `services/supplierSelectors.ts` from orders | Indirect via orders/supplier lookup | Yes | In-memory (orders-backed) |
| Draft orders | `orders` with status `draft` | Initial seeds include draft examples | Yes | In-memory only |

### Durability summary
- **Durable across refresh/restart/Vercel today:** only Firebase-backed Products path (when enabled/configured).
- **Not durable:** Orders, Payment Agents, Customers/Suppliers mock state, ledger state.

## 2) Demo/preloaded data audit

Sources identified:
- `lib/data.ts`: `initialOrders`, `products`, `customers`, `suppliers`, `paymentAgents`.
- `lib/store.tsx`: orders initialized from `initialOrders` directly.
- mock services initialize module state from seeded arrays.
- order-line customer/supplier dropdowns are seeded from static lists.

Classification:
- **A (must remove from runtime now for clean-slate):** `initialOrders` auto-bootstrap in `lib/store.tsx`.
- **B (can remain as fixture but disabled by default):** seeded `products/customers/suppliers/paymentAgents` in mock services.
- **C (needed fallback until persistence migration):** mock services themselves (with optional empty seed mode).
- **D (replace by empty defaults):** default selected parties in new-order forms; keep placeholders only.

## 3) Current `/orders` UI audit
- Default today shows form + summary + save actions plus history.
- New/cancel resets draft state in place.
- Save Draft allowed for incomplete flows; Save Order performs validation + product sync + payment-agent recalculation.
- Edit mode loads order into same form region.
- Settlement summary is always visible in footer region.

## 4) Target `/orders` UI blueprint

### Default view
- Toolbar row:
  - search
  - filter
  - sort
  - view controls
  - **Add Order**
  - **Complete Draft**
- Order History list below.
- No form/lines/footer save actions visible by default.

### Add Order active view
- Show Order Details + Order Lines + settlement + save footer.
- Order History moves below and secondary.
- On Save Order success: hide form and return to default toolbar/history state.

### Complete Draft active view
- Dedicated draft panel/list.
- Open draft item -> editable details + lines.
- Save Order moves draft into history (status saved).

## 5) Draft workflow blueprint

### Recommended required fields for Save Order
Header:
- Payment Agent (required)
- Date (required)
- Order Number (required)
- WeChat ID (recommended required because supplier grouping depends on it)
- At least one meaningful line (required)

Line:
- `details` or `marka` or image (at least one required)
- `totalCtns > 0`, `pcsPerCtn > 0`, `rmbPerPcs > 0`
- supplier name optional in this phase (warn-only)
- customer optional for now

Rules:
- Save Order blocked/disabled when required fields missing.
- Save as Draft always allowed.
- Missing-field checklist displayed inline above footer.
- Draft save must **not** generate products.

## 6) Delete Everything blueprint (dev-only)
- Gate visibility by: `process.env.NODE_ENV === "development"` **or** `NEXT_PUBLIC_ENABLE_DEV_RESET=true`.
- Require typed confirmation phrase: `DELETE EVERYTHING`.
- Clear targets (currently feasible):
  - store orders state
  - mock products state
  - mock payment-agents state + ledger state
  - mock customers/suppliers state (if made mutable) or clear overlays
- Firebase products handling in 5A: **do not mass-delete from frontend** by default; show explicit message that Firebase data is not reset by this tool yet.

## 7) Persistence gap analysis
- Current non-Firebase modules are session/memory only, not durable.
- To satisfy “keep data after reopen until Delete Everything”:
  - **Option A (recommended short-term):** localStorage persistence adapter for orders/paymentAgents/products mock state with versioned schema + reset key.
  - **Option B (long-term):** Firebase migration modules in sequence (Orders + PaymentAgents + Ledger) with proper auth/rules.

## 8) Recommended phase plan (5B–5F)
- **5B:** `/orders` UI restructure (default history-only + Add Order/Complete Draft modes).
- **5C:** Draft workflow hardening (required-field matrix + missing checklist + no-product-sync on draft save).
- **5D:** Clean-slate runtime mode (disable seed auto-bootstrap; placeholders only).
- **5E:** Dev-only Delete Everything tool with safe confirmation + scope messaging.
- **5F:** Persistence layer decision and implementation (localStorage bridge first, then Firebase migration track).

## 9) Risks
- Reusing current single-page orders component for multi-mode workflow may create state bleed unless mode/state machine is explicit.
- Seed disablement without migration path can make some pages appear empty; UX empty states must be added.
- Payment-agent recalculation and standalone payment entries must stay commutative under draft/edit/delete transitions.

## 10) Test strategy (for implementation phases)
- Unit tests for validation matrix and settlement/recalc helpers.
- Integration checks: add order -> save -> product generation visibility.
- Draft conversion tests.
- Dev reset tests with and without Firebase products flag.
