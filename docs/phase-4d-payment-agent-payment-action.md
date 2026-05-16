# Phase 4D — Payment Agent payment action + settlement stabilization

- After Save Order, Orders draft now resets Payment By to empty placeholder.
- Product sync save toast clarified for generated product sync failure cases.
- Added real `+ Payment` action in Payment Agents page with modal.
- Payment applies to due first, then excess to credit.
- Added `agent_payment` ledger entries in mock payment-agent service.
- Recalculation includes standalone payment ledger effects so order-save recalculation does not wipe payment effects.

Deferred:
- Full customer ledger.
- Firebase payment-agent persistence.
