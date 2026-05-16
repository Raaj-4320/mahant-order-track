# Phase 3B: Products Firebase Service (Safe, gated rollout)

Date: 2026-05-12

## Scope
- Added **Products-only** Firebase service wiring behind a data-source switch.
- Kept all other modules on mock services.
- Did not migrate `/orders` and did not change order runtime behavior.

## Data-source switch
- `NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase` enables Firebase attempt for Products.
- Default behavior remains mock-backed when flag is unset or not `firebase`.
- If Firebase config is missing, Products falls back to mock mode.

## Codex environment blocker note
- Some Codex environments may still fail `npm install firebase` with npm registry `403 Forbidden`.
- In those environments, Firebase SDK install/build verification can be blocked.
- Local verification is required where SDK installation succeeds.

## Outcome
- Firebase service implementation is added only for Products and loaded lazily.
- Project remains safely mock-backed by default.
- Phase 3B verification in Codex depends on environment package availability.

## What to verify locally
1. `npm install firebase`
2. `npm run build`
3. `NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase` with valid Firebase env config.
4. Confirm `/products` reads from Firestore; `/orders` remains unchanged.
