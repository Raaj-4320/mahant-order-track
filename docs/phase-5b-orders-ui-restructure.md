# Phase 5B — Orders UI restructure

## Mode state
- Added `OrdersMode = history | add | drafts | edit`.
- Default mode is `history`.
- Add Order => `add`, Complete Draft => `drafts`, Edit => `edit`.
- Cancel/Save return to `history`.

## Default history view
- Toolbar shows: search, Filter, Sort, View placeholders, Add Order, Complete Draft.
- Form/footer hidden by default.

## Add Order behavior
- Initializes clean draft and displays Order Details/Lines + footer.
- Save Draft/Save Order keeps existing logic; successful save returns to history mode.

## Edit behavior
- Edit from history loads order draft and enters `edit` mode.
- Save Changes keeps existing sync/archive/recalc behavior and returns to history mode.

## Complete Draft shell
- Shows draft panel above history.
- Lists current `status === draft` orders with Edit/Complete action.
- Shows empty state when none.

## Intentionally unchanged
- No calculation changes.
- No product sync logic changes.
- No payment-agent ledger logic changes.
- No supplier/wechat flow changes.
- No Orders Firebase migration.

## Test checklist
- Default opens history-only.
- Add Order shows form/footer, Cancel hides it.
- Save Order/Saved Draft return to history mode.
- Edit order enters edit mode and returns after save.
- Complete Draft shows draft panel/empty state.
