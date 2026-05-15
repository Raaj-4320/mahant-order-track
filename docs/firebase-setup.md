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


## Cloudinary unsigned upload (Phase 3C foundation)
- Frontend-only uploads use unsigned preset with public env vars only.
- Required envs:
  - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
  - `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- Do **not** expose `CLOUDINARY_API_SECRET` in frontend.
- Do not add backend signing route in this architecture phase.

## Products write testing notes (Phase 3D)
- In Firebase mode (`NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase`), Products Add/Edit writes to Firestore under `businesses/{businessId}/products/{productId}`.
- Cloudinary image uploads store returned image URL in `product.photo`.
- Unsigned Cloudinary preset must be restricted in Cloudinary dashboard (folder/type/size constraints).


## Payment Agents data source switch (Phase 6B)
- `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE=mock|firebase` (default mock).
- Firestore paths:
  - `businesses/{businessId}/paymentAgents/{agentId}`
  - `businesses/{businessId}/paymentAgentLedger/{entryId}`
- In firebase mode, Pay Agent writes durable ledger entries and updates payment-agent summaries.
- Orders remain local until Phase 6C; avoid treating local order recalc as durable finance history.


## Orders data source switch (Phase 6C.1)
- `NEXT_PUBLIC_ORDERS_DATA_SOURCE=mock|firebase` (default mock).
- Firebase mode enables durable draft autosave under `businesses/{businessId}/orders/{orderId}`.
- Full order save/edit/delete migration continues in 6C.2/6C.3.
