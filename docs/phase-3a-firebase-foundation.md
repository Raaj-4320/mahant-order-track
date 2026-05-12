# Phase 3A: Firebase Setup Foundation (No Data Migration)

## Scope completed
- Added `.env.example` with required public Firebase client variables.
- Added `lib/firebase/client.ts` config reader utilities with safe null behavior when env vars are missing.
- Added `lib/firebase/firestore.ts` Firestore path helpers for future service implementations.

## Intentionally not implemented
- No page/module switched to Firebase reads/writes.
- No backend/API routes.
- No Firebase Admin SDK.
- No Cloud Functions.
- No destructive writes.

## Environment behavior
- App remains buildable without Firebase env vars.
- Firebase config function returns `null` when env vars are missing.

## Note about dependency installation
- `npm install firebase` was attempted, but registry access is blocked in this environment (`403 Forbidden`).
- Package installation must be completed in an environment with npm registry access.
