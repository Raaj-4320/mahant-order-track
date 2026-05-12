# Firebase Setup (Phase 3A Foundation)

## Required Firebase products
- Firestore (required)
- Auth (optional/future)
- Storage (optional/future for product/order photos)

## Required environment variables
Copy `.env.example` to `.env.local` and fill values:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)

## Local run
1. `cp .env.example .env.local`
2. Fill Firebase client values.
3. `npm run dev`

## Architecture reminder
- This is a frontend-only, no-custom-backend architecture.
- UI modules must continue using service boundaries.
- Do not directly sprinkle Firebase SDK calls inside pages.

## Firestore collection paths
- `businesses/{businessId}`
- `businesses/{businessId}/products/{productId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/suppliers/{supplierId}`
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/orders/{orderId}`

## Snapshot strategy
- Orders should preserve immutable snapshots:
  - `paymentAgentSnapshot`
  - line-level `product/customer/supplier` snapshots
- This protects historical order truth if master records change.

## Security warning (frontend-only)
- Never rely on hidden UI for data protection.
- Firestore Security Rules must enforce tenant/business boundaries.

## Why services are not replaced yet
- Phase 3A establishes foundation only.
- Existing modules remain on mock services/store for safety.

## Phase 3A scope
- SDK install (attempted; environment may restrict registry access)
- client/env scaffolding
- path helpers
- mapping scaffolds
- docs
- no module migration yet


## Phase 3B environment note
- On **May 12, 2026**, `npm install firebase` in the Codex execution environment failed with `E403 Forbidden` from `https://registry.npmjs.org/firebase`.
- Until SDK install succeeds in the execution environment, Products Firebase service migration should not be applied there.
