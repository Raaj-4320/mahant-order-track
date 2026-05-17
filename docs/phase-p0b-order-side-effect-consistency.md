# Phase P0-B — Order Side-Effect Consistency (Audit + Minimal Hardening)

## Flow map (current)

### Save Order (create/complete draft/edit)
1. Resolve/create order-line customers.
2. Ensure final order number and write order.
3. Archive generated products for removed lines (edit only).
4. Sync generated products from current lines.
5. Apply payment-agent settlement (Firebase mode).
6. Apply customer receivable ledger.
7. Reload derived UI datasets.

### Save Draft
1. Persist draft order with status=draft.
2. No final side effects run (no customer ledger/product sync/payment settlement).

### Archive/Delete
1. Reverse payment-agent settlement (critical).
2. Reverse customer receivable ledger (critical).
3. Archive generated products (non-critical warning path).
4. Archive order doc.

## Critical vs non-critical
- Critical (block archive): settlement reversal, customer receivable reversal.
- Non-critical (warn only): generated product archive failure, product sync failure during save, settlement/apply receivable apply failures during save.

## Minimal hardening added
- Introduced `OrderSideEffectResult` orchestration object in Orders page handlers.
- Unified save/archive logging with explicit step start/completion/failure events.
- Unified final toasts based on result object.
- Preserved existing formulas and service contracts.

## Retry/idempotency notes
- Payment-agent settlement apply has internal reversal/reapply guard by settlement hash in Firebase service.
- Customer receivable apply reverses prior active receivables for same order before applying, reducing double-apply risk.
- Generated products use deterministic IDs: `order-line-{order.id}-{line.id}`; repeated sync updates same generated product.
- Remaining risk: cross-service multi-step flow is still not atomic globally; partial updates can still happen if network/runtime fails between steps.

## Remaining risks
- Save flow still allows partial completion of non-critical side effects.
- No centralized durable retry queue yet (future phase).
