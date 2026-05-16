# Phase 4B — Payment Agent master + settlement UI

- Added Payment Agent modal with opening credit input.
- Opening credit initializes current credit balance for new agent records.
- Added payment-agent finance summary table and read-only ledger preview from order history.
- Settlement formula remains pure helper driven.
- Orders save stores settlement snapshot preview on order; no global credit mutation yet.

## Preview-only
- No full ledger persistence.
- Pay Agent action remains placeholder toast.
- No Orders Firebase migration.
- No customer ledger changes.

## Test checklist
- Add agent with/without opening credit.
- Confirm `/orders` settlement uses selected agent credit.
- Confirm save still works and product sync unaffected.
