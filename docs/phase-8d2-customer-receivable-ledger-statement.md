# Phase 8D.2 — Customer Receivable Ledger + Statement

## Model
- Added `CustomerLedgerEntry` with `order_receivable` and `order_receivable_reversal` core types.
- Deterministic receivable id: `customer-receivable-{orderId}-{lineId}`.

## Idempotency
- For saved order apply: reverse existing active receivables for that order, then apply current saved lines.
- Re-saving unchanged order does not double count because previous active entries are reversed before re-apply.

## Behavior
- Draft save/autosave does not write customer receivable ledger.
- Save Order writes receivable entries for customer lines only.
- Archive order reverses active customer receivables and blocks archive on reversal failure.

## Statement UI
- Customers page now supports Statement modal with:
  - Summary cards: Total Receivable, Total Received, Current Receivable, Store Credit
  - Oldest-first rows
  - Columns: Date, Type, Reference, Description, Debit, Credit, Balance

## Dev reset
- Added `customerLedger` collection cleanup in Delete Everything flow.

## Limitations
- Customer payment posting flow is not implemented in this phase.

## Test checklist
- draft exclusion
- saved-order receivable apply
- re-save idempotency
- edit amount/customer/line removal reversal behavior
- archive reversal behavior
- statement oldest-first rendering
