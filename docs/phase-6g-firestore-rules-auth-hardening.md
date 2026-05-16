# Phase 6G — Firestore Rules/Auth Hardening

## Current risk
With real business data now stored in Firestore, permissive or temporary development rules can expose cross-tenant reads/writes and unrestricted deletes.

## Target security model
Data is tenant-scoped under:
- `businesses/{businessId}`
- `businesses/{businessId}/members/{uid}`
- `businesses/{businessId}/orders/{orderId}`
- `businesses/{businessId}/products/{productId}`
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/paymentAgentLedger/{entryId}`
- `businesses/{businessId}/customers/{customerId}`
- `businesses/{businessId}/settings/{docId}`

Membership model:
- User must be authenticated.
- User must have active member doc in `businesses/{businessId}/members/{uid}`.
- Roles: `owner | admin | staff | viewer`.

## Permission matrix
- Business doc: read active members; create by signed-in ownerUid=self; update/delete owner/admin.
- Members: read active member (or own member doc); create/update/delete owner/admin.
- Orders/products/paymentAgents/paymentAgentLedger/customers:
  - read active members
  - create/update owner/admin/staff
  - delete owner/admin only
- Settings:
  - read active members
  - write/delete owner/admin only

## Delete Everything protection
Dev reset is still env-gated (`NEXT_PUBLIC_ENABLE_DEV_RESET=true`) but rules must additionally restrict deletes to owner/admin members.

## Setup steps (before deploying strict rules)
1. Enable Firebase Auth sign-in provider(s).
2. Create business doc (`businesses/{businessId}`) with `ownerUid`.
3. Create owner member doc at `businesses/{businessId}/members/{ownerUid}` with role `owner`, `active=true`.
4. Add admin/staff/viewer member docs as needed.
5. Then deploy rules.

## Important deployment warning
If rules are deployed before member documents and auth are ready, app reads/writes will be blocked.

## Custom claims note
Custom claims can be layered later (e.g., `request.auth.token.role`) but are not required in this phase and no Admin SDK/Cloud Functions are introduced.

## Manual verification checklist
- Unauthenticated read denied.
- Active member read allowed.
- Viewer write denied.
- Staff create/update allowed.
- Staff delete denied.
- Owner/admin delete allowed.
- Settings write/delete owner/admin only.
- Dev reset delete works only for owner/admin.
