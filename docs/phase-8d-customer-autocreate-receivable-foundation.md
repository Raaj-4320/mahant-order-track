# Phase 8D — Customer dropdown cleanup + auto-create from saved orders

## Completed
- Replaced order-line customer picker dependency on fixture data with typed customer-name input + suggestions from real loaded customer rows and saved order history.
- Added Customers service resolver with Firebase + mock fallback and Firebase customers service.
- In save-order flow (saved only), typed unknown customer names are auto-created as real customer records.
- Draft save/autosave flow does not create customers.
- After saved-order write, customer totals are recalculated from saved orders and upserted (total orders, total spent, outstanding amount baseline).

## Notes
- No backend route, Firebase Admin SDK, or Cloud Functions were added.
- No payment-agent settlement formula changes.
- Mock fallback remains available.
