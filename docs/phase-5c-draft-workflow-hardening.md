# Phase 5C — Draft workflow hardening

## Validation rules
- Added `validateOrderForSave(order)` in `services/orderValidation.ts`.
- Save Order now requires: payment agent, date, order number, WeChat ID.
- Save Order requires at least one meaningful line.
- Each meaningful line requires supplier, product identity (marka/details/image), CTNs > 0, PCS/CTN > 0, RMB/PCS > 0.
- Blank lines are flagged with explicit per-line issues.

## Save Order behavior
- Save Order is now gated by validation.
- If invalid: no save-to-saved, no product sync, no payment-agent recalc.
- User gets guidance toast and checklist remains visible.
- If valid: existing save flow runs (upsert saved order, product sync, recalc, reset, history mode).

## Save as Draft behavior
- Save as Draft remains available for incomplete orders.
- Completely empty drafts are blocked with message.
- Draft save persists order as `status: draft`, resets form, returns to history mode.
- Draft save does not sync products or recalc payment agents.

## Complete Draft behavior
- Draft panel shows only `status === draft` orders.
- Each row includes order/date/payment-agent/WeChat/line count and missing item count.
- Continue/Complete opens draft in edit form using same order id.
- When completed and saved, draft transitions to `status: saved` and follows normal save flow.

## Exclusions for drafts
- Product sync only runs on Save Order (`saved`).
- Payment-agent recalculation now ignores drafts by filtering to saved orders.

## Missing-fields UI
- In add/edit mode, an inline checklist is shown above footer when order is invalid.
- Save Order button is disabled while invalid.
- Save as Draft remains enabled.

## Intentionally unchanged
- No Orders Firebase migration.
- No backend/API routes.
- No Firebase Admin SDK.
- No customer ledger.
- No Cloudinary behavior changes.
- No product identity rule changes.

## Test checklist
- Default history-first layout unchanged.
- Save Order disabled when required data missing.
- Draft save works for incomplete but non-empty order.
- Drafts appear in Complete Draft panel.
- Draft saves do not generate products or alter payment-agent balances.
- Completing draft and Save Order generates products and recalculates balances.
