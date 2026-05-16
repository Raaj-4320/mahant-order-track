# Phase 6E — Real DB Delete Everything Tool

## Purpose
Provide a development-only reset tool to clear Firestore test data under the current business scope so test cycles can restart cleanly.

## Environment gate
- Controlled by `NEXT_PUBLIC_ENABLE_DEV_RESET=true`.
- If disabled/missing, the Delete Everything tool is not shown.
- Tool also requires Firebase client config to be present.

## Delete scope
Scoped strictly to `businesses/{businessId}` where `businessId` comes from `NEXT_PUBLIC_FIREBASE_BUSINESS_ID` (default `mahant`).

Deleted by default:
- `orders`
- `products`
- `paymentAgents`
- `paymentAgentLedger`
- `customers`

Optional (unchecked by default):
- `settings`

## Confirmation UX
- Developer Tools panel appears on Dashboard only when gate is enabled.
- User must type exact phrase: `DELETE EVERYTHING`.
- Action remains disabled until phrase matches exactly.
- UI shows scoped warning and collection list before delete.

## Implementation notes
- Uses Firebase **client SDK only** (`writeBatch` + paginated loop) with batch size 400.
- No Firebase Admin SDK.
- No backend/API routes.
- No recursive project-wide deletion.
- No Cloudinary deletion.

## Firestore rules warning
This frontend reset only works if Firestore rules allow delete operations for current user/session. In production, restrict this capability to admin/dev users via rules and auth claims.

## Limitations
- Only known collections are deleted.
- No subcollection recursion beyond targeted top-level business collections.
- Cloudinary image files are not deleted in this phase.

## Test checklist
1. Gate off: tool hidden.
2. Gate on: tool visible, confirm disabled until exact phrase.
3. Delete run returns counts and completion message.
4. Settings remain unless "Also delete settings" is checked.
5. Post-refresh app shows empty Orders/Products/Payment Agents data.
