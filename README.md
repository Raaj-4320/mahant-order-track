# TradeFlow

A functional order booking UI built with Next.js 14 (App Router), TypeScript, and Tailwind CSS.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/orders`.

## What's inside

- **Sidebar nav** — Dashboard, Orders, Customers, Suppliers, Products, and Payment Agents.
- **Order Booking** (`/orders`)
  - Top toolbar: search, filter/sort controls, view toggles, and Add Order.
  - Form card fields: payment method, date, order number, and WeChat ID.
  - Order lines table with editable CTNs / PCS / RMB values and live totals.
  - Draft/save flows with toast feedback.
- **Additional management pages**
  - `/customers`
  - `/suppliers`
  - `/products`
  - `/payment-agents`
- **Dark mode** — toggle in the top-right.

## Project structure

```text
app/
  layout.tsx
  page.tsx
  orders/page.tsx
  dashboard/page.tsx
  customers/page.tsx
  suppliers/page.tsx
  products/page.tsx
  payment-agents/page.tsx
lib/
  data.ts
  store.tsx
  firebase/
```
