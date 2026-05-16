# Phase 8D.3 — Customer Payment Posting + Identity Hardening

- Added customer identity helpers: normalized matching and stable id generation for order-line customer creation.
- Added customer payment posting flow with receivable-first logic:
  - receivableReduced = min(currentReceivable, amount)
  - creditCreated = max(0, amount - receivableReduced)
  - currentReceivable decreases first; extra goes to store credit.
- Added `customer_payment` ledger entries with credit amount and computed receivable/credit breakdown fields.
- Customers page now has Receive Payment modal and statement reflects payment rows.
- Payment reversal action is deferred in this phase (no unsafe mutation actions exposed).

## Legacy duplicate handling
- Normalized-name matching chooses existing deterministic match and avoids creating new duplicates for new writes.
- Historical duplicate merge/migration is deferred.

## Tests
- identity normalization across variant casing/spacing
- partial/over/advance payment scenarios
- statement oldest-first and debit/credit balance correctness
