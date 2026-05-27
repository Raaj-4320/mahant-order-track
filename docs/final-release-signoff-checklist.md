# Final Release Sign-off Checklist

## 1) Completed phases summary

- **P0-A — Order number sequence hardening**
  - Final order numbers use literal `YY-###`.
  - Drafts never consume final order numbers.
  - `peekNextOrderNumber()` used for non-consuming preview.
  - Final number allocated on Save Order only.

- **P0-B — Save/edit/archive side-effect consistency**
  - Save writes order first, then runs side-effects.
  - Product sync/payment-agent settlement/customer receivable apply tracked by explicit result flow.
  - Archive blocks on financial reversal failures.
  - Generated-product archive failure is warning-only.

- **P0-C — Production safety gates**
  - Dev reset hidden unless env/role gating allows.
  - Customer maintenance recalculation hidden unless maintenance/admin gate allows.
  - Repair customer-ledger function kept internal-only.

- **P1-A — Suppliers/WeChat source unification**
  - Suppliers/WeChat grouping derived from saved orders only.
  - Draft and archived orders excluded.

- **P1-B — UI action truthfulness**
  - Fake placeholder actions removed or disabled honestly.
  - Core actions are real and functional.

- **P1-C — Customers final QA**
  - Customer accounting values shown via helper-based calculations.
  - Statement chronology oldest-first by `paymentDate || createdAt`.
  - Customer payments reduce receivable first; overpayment creates store credit.

- **P1-D — Payment Agents final QA**
  - Add, pay, view ledger, edit, archive actions are real.
  - Ledger view uses accounting-style table with debit/credit/balance.

- **P1-E — Dashboard final QA**
  - Saved orders only for dashboard totals/rows.
  - Draft and archived excluded.
  - Loading date and status updates persist.

- **P2-A — UI/table/label polish**
  - Currency wording normalized toward neutral labels/amount formatting.
  - Deferred controls remain honestly disabled.

- **P2-B — Final production readiness audit**
  - Audit-only verification of build/safety/source-of-truth integrity.
  - No feature additions in audit pass.

---

## 2) Manual browser QA checklist

Mark each item as pass/fail during final sign-off:

### Orders core flow
- [ ] Add Order shows next `YY-###` preview without consuming final number.
- [ ] Save Draft saves draft without final order number.
- [ ] Complete Draft opens selected draft and preserves expected preview behavior.
- [ ] Save Order allocates and persists final `YY-###`.
- [ ] Edit Order updates existing order without breaking numbering.
- [ ] Archive Order performs reversal path and blocks on critical financial reversal failure.

### Customers
- [ ] Receive Payment reduces current receivable when under/at due.
- [ ] Overpayment creates store credit.
- [ ] Customer statement shows oldest-first rows and correct running balance.

### Payment Agents
- [ ] Pay Agent records payment and updates due/credit correctly.
- [ ] Payment Agent ledger opens and shows accounting columns (Date/Type/Reference/Description/Debit/Credit/Balance).

### Suppliers / WeChat
- [ ] Grouping renders from saved orders only.
- [ ] Draft/archived orders do not appear in grouped totals.

### Dashboard
- [ ] Status updates persist from dashboard row controls.
- [ ] Loading date updates persist from dashboard row controls.

### Product generation
- [ ] Saved order lines generate/update products as expected.
- [ ] Order archive/edit removed-line paths affect generated products per defined behavior.

### Production safety gates
- [ ] Delete Everything hidden when dev reset gate disabled.
- [ ] Maintenance customer recalculation hidden unless maintenance/admin gate allows.

---

## 3) Environment checklist

Confirm release environment values before production rollout:

- [ ] Firebase client env values are present and valid (project/app/keys/domain/business id).
- [ ] `NEXT_PUBLIC_ORDERS_DATA_SOURCE=firebase`
- [ ] `NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase`
- [ ] `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE=firebase`
- [ ] `NEXT_PUBLIC_ENABLE_DEV_RESET=false`
- [ ] `NEXT_PUBLIC_ENABLE_MAINTENANCE=false` (enable only for controlled admin/dev use)
- [ ] Auth flags configured consistently if auth-required mode is enabled.

---

## 4) Known risks / operational notes

- `npm run lint` is currently blocked in this environment by interactive first-time ESLint setup.
- No backend worker/queue exists for background retries.
- Cross-domain side effects are hardened but not fully atomic across all domains.
- Dev/maintenance tools must remain gated by env + role as designed.

---

## 5) Final sign-off table

| Area | Pass/Fail | Notes | Sign-off initials/date |
|---|---|---|---|
| Orders flow |  |  |  |
| Order numbering (`YY-###`) |  |  |  |
| Product generation side-effects |  |  |  |
| Customer ledger/payment flow |  |  |  |
| Payment agent settlement/ledger flow |  |  |  |
| Suppliers/WeChat derived grouping |  |  |  |
| Dashboard totals + row updates |  |  |  |
| Safety gates (dev reset/maintenance tools) |  |  |  |
| UI action truthfulness/disabled controls |  |  |  |
| Environment configuration |  |  |  |
| Build verification |  |  |  |
| Final release decision |  |  |  |
