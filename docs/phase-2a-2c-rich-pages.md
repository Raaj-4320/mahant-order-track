# Phase 2A–2C Rich Pages (Mock Services Only)

## Pages updated
- Dashboard (`/dashboard`)
- Suppliers (`/suppliers`)
- Payment Agents (`/payment-agents`, new)

## Data sources
- Runtime orders: `lib/store.tsx`
- Master entities: hooks backed by mock services (`useSuppliers`, `useCustomers`, `usePaymentAgents`)
- Formatting: `formatCNY`, `formatDate` from `lib/data.ts`

## Selectors used
- `getDashboardStats`
- `getDashboardRows`
- `getSupplierStats`
- `getPaymentAgentStats`

## Real interactions
- Live table search on each page
- Status filter on Suppliers and Payment Agents
- Sidebar navigation to Payment Agents route

## Placeholder interactions
- Filter / More Filters buttons
- Date range control
- Export buttons
- Add Supplier / Add Payment Agent buttons
- Row action icons (view/edit/more)
- Pagination controls (visual only)

## Intentionally not implemented
- Firebase integration
- API routes/backend persistence
- destructive delete flows
- real export/date-range/filter engines
- CRUD dialogs

## Known risks
- Placeholder controls can imply behavior not yet implemented
- Hook async first render may briefly show low counts before data resolves
- `/orders` still uses direct synchronous lookups by design for stability

## Verification checklist
- [x] `/dashboard` renders
- [x] `/suppliers` renders
- [x] `/payment-agents` renders
- [x] sidebar navigation includes Payment Agents
- [x] `/orders` untouched by rich-page migration
- [x] build passes
- [ ] lint blocked by interactive Next.js setup prompt
