# Phase 3H — Product source label

- Added a small source label in `/products` rows near SKU.
- `Generated` shown when `generatedFromOrderLines === true` or `source === "order-line"`.
- `Manual` shown when `source === "manual"`.
- Unknown/legacy products with no source metadata show no label.
- Manual Add Product now sets `source: "manual"` and `generatedFromOrderLines: false` for new records.
- Existing products keep their existing source metadata on edit.

## Not changed
- No merge-logic change.
- No Orders migration change.
- No UI redesign.

## Verification checklist
- Add manual product -> see `Manual` label.
- Save order-generated product -> see `Generated` label.
- Legacy product with no source metadata still renders safely.
