# Phase 3I — Clean Order Workspace + History + Safe Edit/Delete sync

- `/orders` now opens in create mode with a clean new draft (no preloaded demo active order).
- Saved order history is shown below the form (first 10 rows, edit/delete actions).
- Save Order in create mode stores order, syncs products, and resets form to a new clean draft.
- Edit mode loads a saved order and shows confirmation before saving changes.
- Deleting orders confirms and archives generated products for order lines.
- Deleting lines while editing is tracked and archived on save.
- Validation blocks saving empty/invalid orders.
- Draft save remains local and does not sync products.
- No full Orders Firebase migration in this phase.
