# Phase 6C.1 — Orders Firebase service + draft autosave foundation

- Added Orders Firestore service under `businesses/{businessId}/orders/{orderId}`.
- Added orders facade (`NEXT_PUBLIC_ORDERS_DATA_SOURCE=mock|firebase`) and `useOrders` hook.
- Added debounced `useDraftAutosave` for durable unfinished drafts in firebase mode.

## Implemented now
- `ordersFirebaseService`: list/get/upsert/archive/listDraft/autosaveDraft.
- Order Firestore mappers: `orderFromFirestore`, `orderToFirestore`.
- `/orders` minimal autosave integration in add/edit mode.
- Draft panel can consume firebase draft list when orders data source is firebase.

## Cross-device unfinished draft behavior
- In firebase mode, non-empty draft edits autosave after debounce.
- Autosave writes `status: draft` and `draftAutosavedAt`.
- Autosave preserves same draft id (no new doc per keystroke).

## Intentionally still mixed (until 6C.2/6C.3)
- Final Save Order / Delete / full history flow still primarily local store based.
- Product sync and payment-agent settlement side effects are unchanged in this phase.
- This phase only establishes durable draft persistence foundation.

## Env
- `NEXT_PUBLIC_ORDERS_DATA_SOURCE=mock|firebase`
- `NEXT_PUBLIC_FIREBASE_BUSINESS_ID`
- standard Firebase client env vars.

## Risks
- Temporary mixed-source behavior while full orders migration is pending.
- Duplicate visibility possible between local and firebase drafts depending on mode and workflow sequence.
