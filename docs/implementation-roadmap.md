# Implementation Roadmap (Static -> Firebase)

## Phase 0 — Discovery & Blueprint (Current)

- **Goal**: Understand current codebase, data shape, UI rules, and risks.
- **Likely files**: `docs/system-discovery.md`, `docs/ui-design-blueprint.md`, `docs/firebase-blueprint.md`, `docs/implementation-roadmap.md`.
- **Expected output**: Approved blueprint baseline.
- **Acceptance criteria**:
  - Repo map documented.
  - Order booking behavior documented end-to-end.
  - Firebase architecture proposed but not implemented.
- **Regression risk**: None (documentation-only).

## Phase 1A — UI-to-DB Data Model Alignment (No Firebase)

- **Goal**: Align domain schema to richer planned screens while preserving current `/orders` behavior.
- **Likely files**:
  - `types/domain.ts`
  - `lib/types.ts`
  - `lib/data.ts`
  - `docs/data-model-alignment.md`
- **Expected output**:
  - Central domain types with Supplier/Customer/Product/PaymentAgent/Order/OrderLine richness.
  - Backward-compatible order fields (`number` + `orderNumber`, `paymentBy` + `paymentAgentId`).
  - Existing UI behavior unchanged.
- **Acceptance criteria**:
  - `/orders` behavior unchanged visually/functionally.
  - Build/lint pass.
  - No Firebase code yet.
- **Regression risks**:
  - Drift between old and new mock data shape.
  - Accidental behavior changes in totals/edit flow.

## Phase 1B — Mock Service Layer (No Firebase)

- **Goal**: Decouple UI imports from raw static arrays using Promise-based service contracts.
- **Likely files**:
  - `services/contracts.ts`
  - `services/mock/*` (or `services/*Service.ts` mock-backed)
  - minimal page/store wiring updates.
- **Expected output**:
  - `list/get/upsert` contracts for suppliers/customers/products/paymentAgents/orders.
  - UI behavior unchanged with mock-backed async interface.
- **Acceptance criteria**:
  - Existing pages still render and save/update local data.
  - `/orders` flow remains stable.
- **Regression risks**:
  - accidental async state bugs during migration from sync arrays.

## Phase 1C — Safe Service/Hook Consumption Migration

- **Goal**: Migrate existing pages to consume hooks/services/selectors while preserving existing UI behavior.
- **Likely files**:
  - `app/dashboard/page.tsx`
  - `app/customers/page.tsx`
  - `app/suppliers/page.tsx`
  - `app/products/page.tsx`
  - `docs/phase-1c-service-consumption.md`
- **Expected output**:
  - Non-order pages consume hook/service boundary instead of direct static arrays where safe.
  - Derived calculations are centralized via selectors.
  - `/orders` behavior is preserved unchanged.
- **Acceptance criteria**:
  - No visible regressions in current pages.
  - `lib/store.tsx` remains single mutable order source.
  - Build passes.
- **Regression risks**:
  - Brief hook-loading states altering counts during initial render.
  - Over-aggressive migration of `/orders` creating lookup/default-line race conditions.

## Phase 2 — Build Missing Pages on Mock Services

- **Goal**: Complete Dashboard/Customers/Suppliers/Products with production-like UX while still static.
- **Likely files**:
  - `app/dashboard/page.tsx`
  - `app/customers/page.tsx`
  - `app/suppliers/page.tsx`
  - `app/products/page.tsx`
  - new reusable components for table/forms/filters/empty states.
- **Expected output**:
  - Full module UIs with CRUD-ready interaction patterns.
  - Search/filter/sort + loading/empty/error placeholders.
- **Acceptance criteria**:
  - Visual consistency with Order Booking blueprint.
  - All modules navigable and functionally coherent.
- **Regression risks**:
  - Introducing a second visual language.
  - Inconsistent data calculations across pages.

### Phase 2A–2C delivery (completed in this pass)
- Rich Dashboard page (KPI + filter/action bar + tabular orders view)
- Rich Suppliers page (KPI + filter/action bar + tabular suppliers view)
- Rich Payment Agents page (new route + KPI + filter/action bar + tabular agents view)
- All powered by existing hook/service/selectors boundaries (no Firebase, no backend)

### Phase 2D–2E delivery (completed in this pass)
- Rich Customers page (KPI + search/filter/action bar + tabular customer view)
- Rich Products page (KPI + search/filter/action bar + tabular product view)
- Reused shared table components and preserved existing mock-service/selectors data flow

### Phase 2F delivery (completed in this pass)
- Shared UI polish and consistency audit across all major frontend modules
- Consistent placeholder communication via toast for deferred actions
- Small accessibility polish for shared table action/pagination controls

## Phase 3 — Firebase Setup (Foundation)

- **Goal**: Add Firebase infrastructure without replacing all data at once.
- **Likely files**:
  - `lib/firebase/client.ts`
  - `lib/firebase/firestore.ts`
  - `.env.example`
  - `docs/firebase-setup.md`
  - security rules draft docs.
- **Expected output**:
  - Firebase client initialized.
  - Firestore access helpers and typed mapping patterns.
- **Acceptance criteria**:
  - App builds with/without Firebase envs where appropriate.
  - No direct Firebase calls inside page components.
- **Regression risks**:
  - Env misconfiguration.
  - Tight coupling of SDK code into UI.

### Phase 3A foundation notes (this pass)
- Added `.env.example` Firebase client env keys.
- Added `lib/firebase/client.ts` safe config reader utilities.
- Added `lib/firebase/firestore.ts` path helpers.
- Kept app behavior unchanged and did not migrate modules to Firebase.
- Firebase npm package installation is pending due registry restriction in this execution environment.

### Phase 3B (next)
- Implement Firebase-backed Products service only.
- Add safe data-source switch/feature flag (mock vs firebase).
- Keep all other modules on mock services.
- No full app migration and no `/orders` data-source changes in this phase.

### Phase 3C (next)
- Add Cloudinary unsigned-upload foundation (client-only helper layer).
- Keep Product UI CRUD changes out of scope in this phase.
- Keep `/orders` upload behavior unchanged until explicit migration phase.
- No backend/API routes and no Cloudinary secret exposure.


### Phase 3D delivery (completed in this pass)
- Added Products Add/Edit modal flow.
- Added Product upsert support in contract + mock + Firebase service + hook.
- Added Cloudinary unsigned image upload usage in Products form save flow.
- Kept `/orders` and other modules unchanged.


### Phase 3E delivery (completed in this pass)
- Added Order Save -> Product catalog sync bridge from order lines.
- Products now receive generated records from order activity.
- `/orders` remains on in-memory store (no full Orders Firebase migration).


### Phase 3F delivery (completed in this pass)
- `/orders` line image uploads now store Cloudinary URLs instead of data URLs for new uploads.
- Saved-order line -> product sync now receives URL images for generated products.
- Orders remain not fully Firebase-migrated.


### Phase 3G delivery (completed in this pass)
- Added safe catalog merge key strategy for order-line generated products.
- Reduced duplicate products across orders by deterministic catalog ID mapping.
- Preserved fallback and idempotent repeated-save behavior.



### Phase 3G merge removal note
- Phase 3G cross-order catalog merge strategy was intentionally removed/disabled.
- Product identity now uses order-line-level records: `order-line-{order.id}-{line.id}`.
- Existing old merged records are retained for manual cleanup later.

### Phase 3H delivery (completed in this pass)
- Added tiny Products row source label (`Generated` / `Manual`) for source visibility.
- New manual products are tagged as manual source.
- No migration architecture changes in this phase.


### Phase 3I delivery (completed in this pass)
- Added clean new-order workspace default (no demo preloaded active order).
- Added order history section below form with edit/delete actions.
- Added save-reset behavior and safe product archive sync effects for edit/delete.
- No full Orders Firebase migration yet.


### Phase 3I.1 stabilization (completed in this pass)
- Completed edit-mode line delete tracking with original vs new line distinction.
- Ensured archive happens on save for removed saved lines only.
- Removed dead/non-functional orders toolbar view control wiring.


### Phase 3I.2 hardening (completed in this pass)
- Moved edit-line confirmation to pre-remove path with cancel-safe behavior.
- Added Save Changes footer cue in edit mode.
- Preserved archive-on-save behavior for removed persisted lines only.

### Phase 3I basic order-line fixes (completed in this pass)
- New order lines now initialize as blank values (no demo prefill).
- Products view now defaults to Active status so archived generated products are hidden by default.

## Phase 4 — Incremental Module Connection to Firestore

### Phase 4A settlement preview (completed in this pass)
- Added Payment Agent settlement preview UI in `/orders` footer area.
- Added pure settlement calculation helper (credit-use/payable/new-credit/status).
- Preview-only: no ledger persistence and no payment-agent balance mutation yet.

### Phase 4A supplier/wechat flow (completed in this pass)
- Added WeChat autocomplete in Orders header from saved order history.
- Added supplier line typed-name autocomplete with `supplierName` support.
- Reworked Suppliers page into WeChat and Unique Supplier derived views from saved orders.
- No supplier finance behavior and no Firebase supplier persistence added.

### Phase 4B payment-agent master/settlement UI (completed in this pass)
- Added Payment Agent creation modal with opening credit.
- Added payment-agent summary and read-only ledger preview on Payment Agents page.
- Orders save stores settlement snapshot preview; no full ledger persistence yet.

### Stabilization note
- Fixed `/orders` Payment By dropdown to use hook/service-backed payment agents source (same as `/payment-agents`) instead of static data import.

### Phase 4C payment-agent balance application (completed in this pass)
- Applied payment-agent balance/totals recalculation from saved order settlement snapshots.
- Added edit/delete-safe recalculation path after order save/delete flows.
- Customer ledger remains out of scope.

### Phase 4D stabilization (completed in this pass)
- Reset Orders Payment By to placeholder after successful save.
- Added Payment Agents `+ Payment` action with due-first then credit behavior.
- Preserved standalone payment effects during order-triggered recalculation.

### Phase 5A audit (completed in this pass)
- Completed runtime data-source and demo-seed audit for Orders/Products/Agents/Customers/Suppliers/Dashboard.
- Documented target `/orders` workflow blueprint (history-first default + Add Order + Complete Draft modes).
- Documented draft-validation blueprint, dev-only Delete Everything blueprint, and persistence gap analysis.
- Proposed execution sequence for Phase 5B–5F.

### Phase 5B orders UI restructure (completed in this pass)
### Phase 5C draft workflow hardening (completed in this pass)
- Added centralized order save validation with header + per-line issue reporting.
- Disabled Save Order when invalid and added missing-fields checklist UI near footer.
- Hardened Save as Draft (allows incomplete data but blocks completely empty drafts).
- Ensured draft saves do not trigger product sync or payment-agent recalculation impact.
- Expanded Complete Draft panel metadata and continue/complete flow for conversion to saved orders.

- Added explicit `/orders` mode state: history/add/drafts/edit.
- Default view now shows toolbar + history only; form/footer hidden until Add Order/Edit.
- Added Complete Draft panel shell with draft list/empty state.

Connection order:
1. Products
2. Customers
3. Suppliers
4. Orders
5. Dashboard

- **Goal**: Reduce risk by enabling one module at a time.
- **Likely files**:
  - `services/*Service.ts`
  - `hooks/use*.ts`
  - module pages for data source switch.
- **Expected output**:
  - Hybrid app where completed modules use Firestore data.
- **Acceptance criteria**:
  - Feature parity maintained per migrated module.
  - Clear fallback/error states for network failure.
- **Regression risks**:
  - Order booking data schema mismatch during migration.
  - Inconsistent IDs between mock and firestore documents.

## Phase 5 — Production Hardening

- **Goal**: Stability, correctness, and deploy readiness.
- **Likely files**:
  - validation utilities
  - security rules/tests
  - seed/migration scripts docs
  - QA checklists.
- **Expected output**:
  - Robust validation and permission model.
  - Verified user flows under load/error/offline conditions.
- **Acceptance criteria**:
  - lint/build pass
  - UAT sign-off
  - documented rollback plan
- **Regression risks**:
  - Rules too strict/too permissive.
  - Derived counters (totals, outstanding) drifting without transactional safeguards.

---

## What Not to Touch Yet

- Do not redesign Order Booking UX.
- Do not remove mock/static datasets before service abstraction is in place.
- Do not add a custom backend/API layer.
- Do not embed Firebase SDK calls directly in page components.

## Test Checklist (Per Phase)

- `npm run lint`
- `npm run build`
- Manual navigation across all routes.
- Manual save/edit/cancel checks for Order Booking.
- Calculation verification for line totals and order totals.
- Responsive sanity check (mobile/tablet/desktop widths).


### Phase 6A Firebase real DB migration blueprint (completed in this pass)
- Completed module-by-module runtime source-of-truth and durability audit.
- Defined target Firestore tenant schema under `businesses/{businessId}` for orders, products, payment agents, ledger, customers, and settings.
- Documented service/hook migration architecture and phased rollout plan (6B–6G).
- Added ledger correctness plan for save draft/save order/edit/delete/payment flows.
- Added dev-only real DB reset blueprint and clean-slate/no-demo-data transition plan.


### Phase 6B payment agents + ledger Firebase migration (completed in this pass)
- Added payment-agents data source facade with env switch (`NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE`).
- Added Firestore payment agents service and ledger service under `services/firebase/*`.
- Added durable standalone `Pay Agent` transaction flow (ledger entry + agent summary update).
- Rewired `usePaymentAgents` to facade while preserving mock fallback.
- Preserved Phase 6C boundary: no Orders Firestore migration in this phase.


### Phase 6C.1 orders firebase service + draft autosave foundation (completed in this pass)
- Added Orders firebase service + facade + useOrders hook.
- Added debounced durable draft autosave foundation for cross-device unfinished order continuity.
- Kept final order save/edit/delete migration for Phase 6C.2/6C.3 to reduce risk.
