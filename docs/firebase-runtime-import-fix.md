# Firebase runtime import fix (Products)

## Root cause
`firebase/firestore` was loaded through a dynamic `new Function(...import())` pattern, which caused browser-side module specifier resolution issues in `/products` runtime.

## Files changed
- `lib/firebase/client.ts`
- `services/firebase/productsFirebaseService.ts`

## Fix
- Switched to standard static ESM Firebase imports in Firebase-only modules.
- Added safe singleton getters in `lib/firebase/client.ts`.
- Products Firebase service now uses static Firestore imports and `getFirestoreDb()`.
- If Firebase config is missing, service throws a controlled message instead of causing module resolution errors.

## Unchanged
- `/orders` flow unchanged.
- Mock fallback remains default.
- No backend/API route, no Firebase Admin SDK.

## Test
1. `NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase`
2. Ensure `NEXT_PUBLIC_FIREBASE_*` env vars are set.
3. Open `/products` and Add/Edit save.
4. Verify no `Failed to resolve module specifier 'firebase/firestore'` error.
