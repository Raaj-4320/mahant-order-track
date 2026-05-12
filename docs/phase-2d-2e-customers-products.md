# Phase 2D–2E Rich Customers & Products Pages

## Updated pages
- `app/customers/page.tsx`
- `app/products/page.tsx`

## Data sources used
- Runtime orders from `lib/store.tsx`
- Master entities via hooks: `useCustomers`, `useProducts`, `useSuppliers`
- Selectors from `services/selectors.ts`
- Formatters from `lib/data.ts`

## Selectors used
- `getCustomerStats`
- `getProductStats`

## Real interactions
- Live search on Customers and Products tables
- Status filter on Customers and Products
- Category filter on Products

## Placeholder interactions
- Add Customer / Add Product buttons
- More Filters buttons
- Export buttons
- Visual-only pagination controls
- Row action icons (view/edit/more)
- Location dropdown placeholder on Customers

## Intentionally not implemented
- Firebase integration
- API/backend persistence
- destructive actions
- real export/download
- advanced filtering
- real pagination backend logic

## Known risks
- Hook async first render can briefly show low/zero metrics before load completes
- Placeholder controls may imply behavior not yet implemented
- `/orders` remains on synchronous direct lookup imports intentionally

## Verification checklist
- [x] `/customers` rich page renders
- [x] `/products` rich page renders
- [x] `/dashboard` still renders
- [x] `/suppliers` still renders
- [x] `/payment-agents` still renders
- [x] `/orders` unchanged in behavior
- [x] `npm run build` passes
- [ ] `npm run lint` blocked by interactive Next.js setup prompt
