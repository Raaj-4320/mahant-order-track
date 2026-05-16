# Phase 8C — Accounting ledger format + runtime currency sweep

## Implemented
- Payment Agent ledger view converted to accounting-style table.
- Ledger rows sorted oldest-to-newest by `paymentDate || createdAt`.
- Added summary cards for Opening Credit, Current Credit, Total Order, Total Paid, Current Due.
- Added Debit/Credit/Balance columns with explicit interpretation:
  - Debit = payable increase (order settlement)
  - Credit = payment/credit available
  - Balance = running net position (`balance += credit - debit`)
- Added opening credit row first when opening credit is positive.
- Replaced touched runtime uses of symbol-based formatter with neutral `formatAmount`.
- Kept compatibility alias: `formatCNY = formatAmount`.

## Customer/transaction note
- No real customer statement ledger exists in current app runtime; no new customer-ledger business logic added.
- Only neutral amount formatting cleanup applied to existing customers list surface.

## Deferred
- Customer auto-create (Phase 8D).
- New customer ledger business logic.

## Test checklist
- Build/lint run.
- Search checks for currency symbols/terms in touched runtime surfaces.
- Search checks for ledger accounting columns and settlement entry types.
