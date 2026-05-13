# Phase 3G — Product catalog merge strategy

- Added deterministic catalog identity key from order line: `supplierId + normalized(marka) + normalized(details)`.
- Product ID now uses `catalog-{stableHash}` when catalog key is valid.
- Fallback remains `order-line-{order.id}-{line.id}` when key is not safe (missing supplier/weak marka-details).
- Exact normalized matching only (no fuzzy).
- Merge behavior preserves manual product edits and updates order-generated operational metadata.
- Added metadata fields: `sourceOrderIds`, `sourceLineIds`, `catalogKey`, `generatedFromOrderLines`, `lastSeenAt`, `lastLineTotalPcs`.
- Idempotent append behavior prevents duplicate source refs on repeated Save Order.
- Stock behavior: generated products use latest line total pcs (`lastLineTotalPcs`) and do not do cumulative inventory accounting.
