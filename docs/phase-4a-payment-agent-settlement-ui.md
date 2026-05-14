# Phase 4A — Payment Agent Settlement UI (Preview Only)

- Payment agents/brokers are financial parties we pay.
- Suppliers remain source/contact entities only (no finance ledger role).

## Calculation formula
Using `calculatePaymentAgentSettlement({ orderTotal, existingCredit, paidNow })`:
- `creditUsed = min(existingCredit, orderTotal)`
- `payableAfterCredit = max(orderTotal - creditUsed, 0)`
- `remainingPayable = max(payableAfterCredit - paidNow, 0)`
- `newCreditCreated = max(paidNow - payableAfterCredit, 0)`
- `resultingCreditBalance = existingCredit - creditUsed + newCreditCreated`

Status:
- unpaid / partial / paid / credit

## Fields added
- `PaymentAgent.creditBalance?` (+ optional related credit metadata)
- `Order.paidToPaymentAgentNow?`

## UI behavior
- Settlement preview appears in Orders footer near totals/save actions.
- If no payment agent selected: shows muted instruction message.
- Paid Now input is non-negative, normalized to 0 when empty.
- Summary shows credit used, payable, remaining payable, new credit, resulting credit, and status badge.
- Products/order-line sync behavior unchanged.

## Example
Existing credit 20,000; order total 40,000; paid now 50,000:
- credit used 20,000
- payable after credit 20,000
- new credit created 30,000
- resulting credit balance 30,000

## Preview-only scope
Not implemented in this phase:
- no ledger persistence
- no payment agent balance mutation
- no edit/delete ledger reversals
- no customer settlement logic

## Next phase
Phase 4B: persist ledger effects on Save Order and handle reversals safely.

## Test checklist
- Select payment agent with 0 credit -> payable equals order total.
- Select payment agent with credit -> credit reduces payable.
- paidNow < payable -> remaining payable shown.
- paidNow = payable -> paid status.
- paidNow > payable -> credit status + new credit shown.
- Save Draft and Save Order still work; product sync unchanged.
