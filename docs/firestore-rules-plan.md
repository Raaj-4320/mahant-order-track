# Firestore Rules Plan (Draft Only)

## Tenant model
All business data is nested under:
- `businesses/{businessId}/...`

## Auth and membership model
- User must be authenticated (`request.auth != null`).
- User must be an active member in `businesses/{businessId}/members/{uid}`.
- Roles: `owner | admin | staff | viewer`.

## Collections protected
- businesses root doc
- members
- orders
- products
- paymentAgents
- paymentAgentLedger
- customers
- settings

## Role intent
- owner/admin:
  - full business administration
  - delete operations
  - settings management
- staff:
  - read + create/update business operational docs
  - no delete
- viewer:
  - read-only

## Delete Everything protection
Even when `NEXT_PUBLIC_ENABLE_DEV_RESET=true`, actual delete ability must be enforced by rules (owner/admin only).

## Frontend-only caution
- Rules must enforce tenant access and write constraints.
- Never rely on UI-only hiding.
- Derived counter writes need strict validation to avoid tampering.

## Deployment cautions
1. Prepare Auth and member docs first.
2. Deploy rules only after owner/admin membership exists.
3. Expect denied reads/writes if membership docs are missing.
4. Do not use permissive `allow read, write: if true` rules.

## Current status
- Rules draft created in `firestore.rules` (Phase 6G).
- Not auto-deployed by the app.
