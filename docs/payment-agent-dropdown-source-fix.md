# Payment Agent Dropdown Source Fix

## Root cause
`/payment-agents` used hook/service state while `/orders` Payment By dropdown used static `paymentAgents` from `lib/data.ts`.

## Files changed
- `app/orders/page.tsx`
- `components/orders/OrderForm.tsx`

## New data flow
- `/orders` now reads agents via `usePaymentAgents()`.
- Payment By options are passed into `OrderForm` via props.
- Settlement preview and history payment-agent labels now resolve from the same hook-backed list.

## Compatibility behavior
- Agent resolve supports `paymentAgentId` first and falls back to `paymentBy`, then name/code matches.
- Payment selection keeps `paymentBy` and `paymentAgentId` synchronized.

## Manual test checklist
- Add agent in `/payment-agents`.
- Confirm it appears in `/orders` Payment By dropdown.
- Select it and verify settlement preview credit value.
- Save draft/order flows remain functional.
