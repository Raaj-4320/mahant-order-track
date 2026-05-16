# Phase 8D.4 — Fix Order UI Placement + Customer Auto-Create Reliability

## Scope
- Removed Loading Date input from active Add/Edit form header.
- Kept Loading Date editable from saved order history rows and persisted via normal upsert.
- Kept status change controls only in saved history rows.
- Added Customer column in Order Details modal line table.
- Fixed customer typed-input persistence using `line.customerName`.
- Fixed Save Order customer auto-create resolution to use `customerName` and write back resolved `customerId + customerName`.
- Preserved draft exclusion: no customer create and no receivable apply from draft saves.

## Save sequence
1. Validate order for save.
2. Resolve/ensure customers from each line `customerName`.
3. Save order with resolved `customerId/customerName`.
4. Sync generated products.
5. Apply payment-agent settlement.
6. Apply customer receivable entries.

## Notes
- Suggestions remain clean in Firebase mode: from real customers + existing order line customer names, no fixture customer list in order line input.
- Existing loadingDate on old drafts remains preserved in order object but is not shown in Add/Edit header.

## Test checklist
- Add/Edit form does not render Loading Date control.
- Saved order history row allows Loading Date edits and persists after refresh.
- Add/Edit form does not render status selector.
- Saved order history row status selector persists.
- Order Details modal shows Customer column.
- Typing unknown customer sets `customerName` in line draft.
- Save as Draft does not create customer.
- Save Order creates/links customer and Customers page reflects row.
- Saved order receivable entries are applied with resolved `customerId`.
