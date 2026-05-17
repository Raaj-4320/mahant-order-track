# Phase P0-C — Production Safety Gates

## Goal
Hide or gate dangerous/maintenance tools from normal UI without changing business logic.

## Gates added
- Added runtime helpers:
  - `isDevResetEnabled()` from `NEXT_PUBLIC_ENABLE_DEV_RESET`
  - `isMaintenanceToolsEnabled()` from `NEXT_PUBLIC_ENABLE_MAINTENANCE`
- Added `isAuthRequiredModeEnabled()` from `NEXT_PUBLIC_REQUIRE_AUTH` to support role-based gating in auth-required mode.
- Added `useBusinessAccess()` hook to derive signed-in member role and `canManageMaintenance` (`owner`/`admin`).

## UI gating behavior
### Dashboard — Delete Everything
Visible only when:
1. `NEXT_PUBLIC_ENABLE_DEV_RESET === "true"`, and
2. if auth-required mode is enabled (`NEXT_PUBLIC_REQUIRE_AUTH === "true"`), current member role is `owner` or `admin`.

### Customers — Recalculate Customer Totals
Visible only when Firebase customer mode is active **and** one of:
- `NEXT_PUBLIC_ENABLE_MAINTENANCE === "true"`, or
- current member role is `owner`/`admin`.

## Internal-only maintenance APIs
- `customerLedgerService.repairCustomerLedgerFromSavedOrders` remains internal service API only.
- No normal UI button added for repair actions.

## Notes
- Receive Payment, Statement, Orders, Products, Suppliers, and Payment Agents flows remain unchanged.
- No hard-delete behavior changed (Delete Everything remains dev-gated and existing Firestore rules still apply).
