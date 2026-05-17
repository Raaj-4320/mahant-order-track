# Phase P1-B — UI Action Truthfulness Pass

## No-fake-action policy
- Visible actions must be functional.
- If functionality is deferred, controls are disabled with explicit titles.
- Placeholder toasts/popups for core actions are removed from Dashboard, Orders, Customers, Products, Payment Agents, Suppliers.

## Action audit table
| Page | Action | Status | Notes |
|---|---|---|---|
| Dashboard | Search | WORKING | Filters rendered rows client-side. |
| Dashboard | Filter / Date range / Export | DISABLED HONESTLY | Disabled buttons with explicit deferred titles. |
| Dashboard | View Details | WORKING | Opens Order Lines detail modal. |
| Dashboard | Open in Orders | WORKING | Navigates to Orders workspace for editing. |
| Orders | Add Order / Complete Draft | WORKING | Opens add flow + draft completion flow. |
| Orders | Save Draft / Save Order | WORKING | Persist with existing side effects and validation. |
| Orders | View / Edit / Delete(archive) | WORKING | Existing save/edit/archive behavior preserved. |
| Orders | Toolbar Filter / Sort | DISABLED HONESTLY | Disabled with explicit titles. |
| Customers | Receive Payment / Statement | WORKING | Real ledger-backed actions. |
| Customers | Recalculate Customer Totals | WORKING (maintenance) | Kept in Firebase mode only. |
| Customers | Add Customer | DISABLED HONESTLY | Disabled + clear label about order-derived creation. |
| Customers | Location / More Filters / Export | DISABLED HONESTLY | Disabled deferred controls. |
| Products | Add Product / Edit | WORKING | Real modal + save path. |
| Products | More Filters / Export | DISABLED HONESTLY | Disabled deferred controls. |
| Products | Fake icon action set (view/edit/more) | HIDDEN | Removed generic placeholder action icons from rows. |
| Payment Agents | Add Agent / +Payment / View Ledger | WORKING | Existing functional actions retained. |
| Payment Agents | More / Export | DISABLED HONESTLY | Disabled deferred controls. |
| Suppliers | View Details | WORKING | Existing detail expander retained. |

## Actions removed, disabled, or wired
- Removed fake placeholder action buttons from Customers row actions.
- Removed fake generic icon action buttons from Products row actions.
- Converted Customers and Products deferred toolbar actions to explicit disabled states with clear reason titles.
- Converted Add Customer CTA to explicit disabled state with derived-data explanation.
- Converted generic pagination click handlers from placeholder behavior to disabled-unless-wired behavior.
- Dashboard secondary action relabeled from `Edit Order` to `Open in Orders` for truthful intent.

## Browser popup status
- `confirm(...)` remains in Orders for destructive or high-impact confirmations only (edit-save impact, line removal impact, order archive impact).
- No placeholder/fake alert/confirm usage was introduced.
