# Phase 6C.3B — Durable Payment Agent Order-Settlement Ledger

## Why this phase exists
Repeated save/edit/archive operations on saved orders can double-count payment-agent money movement if settlement effects are not idempotent. This phase makes order settlement posting durable and reversible in Firebase ledger storage.

## Idempotency strategy
- Settlement entry ID: `order-settlement-{order.id}` (deterministic active entry).
- Reversal entry ID: generated Firestore doc ID (append-only history).
- Active settlement discovery: query ledger by `sourceOrderId + type=order_settlement + active=true`.
- Hash guard: `settlementHash` generated from settlement snapshot + paymentAgentId.

Behavior:
1. If active settlement exists and hash is unchanged => no-op.
2. If active settlement exists and hash changed => reverse old effect, mark old inactive/reversed, append reversal entry, apply new entry.
3. If no active settlement => apply new entry.

## Save/Edit/Archive behavior
- Save saved-order in firebase mode: after order upsert and product sync, call `applyOrderSettlement(order)`.
- Edit saved-order: same flow, idempotent apply handles reverse/reapply when snapshot changed.
- Archive saved-order: call `reverseOrderSettlement(order)` first; if reversal fails, do not archive order.
- Draft/autosave/save-draft: no settlement posting.

## Financial formulas
Apply settlement:
- `creditBalance = creditBalance - creditUsed + newCreditCreated`
- `totalOrderAmount += orderTotal`
- `totalPaidAmount += paidNow`
- `currentDuePayable += remainingPayable`

Reverse settlement:
- `creditBalance = creditBalance + creditUsed - newCreditCreated`
- `totalOrderAmount -= orderTotal`
- `totalPaidAmount -= paidNow`
- `currentDuePayable -= remainingPayable`

## Firestore paths
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/paymentAgentLedger/{entryId}`
- `businesses/{businessId}/orders/{orderId}`

## Deferred / not in scope
- Customer ledger
- Backend/API route orchestration
- Admin SDK / Cloud Functions
- Supplier/Wechat changes

## Manual verification checklist
- New save posts one settlement entry.
- Resave unchanged order does not alter totals and does not add financial effect.
- Edit changed settlement creates reversal + new settlement.
- Archive saved order reverses active settlement.
- Draft/autosave has no settlement ledger entry.
- Standalone `agent_payment` entries remain and continue to affect totals.
