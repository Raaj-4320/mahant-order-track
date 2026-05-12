# TradeFlow

A functional Order Booking UI built with Next.js 14 (App Router), TypeScript, and Tailwind CSS. All data is in-memory dummy data; no backend required.

## Getting started

```bash
cd tradeflow
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/orders`.

## What's inside

- **Sidebar nav** — Dashboard, Order Booking, Customers, Suppliers, Products. Each tab transitions with a smooth fade/slide animation.
- **Order Booking** (`/orders`)
  - Top toolbar: search, Filter / Sort dropdowns, List / Grid / Calendar view toggle, Add Order.
  - Form card: Payment By, Date, Order Number, WeChat ID — all editable.
  - Order Lines: live editable table. Pick supplier/product/customer, edit CTNs / pcs / RMB and watch Total PCS, Total RMB, and the order total recalculate live.
  - Add New Line, delete a line, Cancel (revert), Save as Draft, Save Order — all wired up and toast on save.
  - Right rail: Orders list with selection. Click any order to load it into the form.
- **Dark mode** — toggle in top-right.
- **Dummy data** lives in `lib/data.ts`.

## Structure

```
app/
  layout.tsx           ← shell + providers
  page.tsx             ← redirects to /orders
  orders/page.tsx      ← Order Booking
  dashboard|customers|suppliers|products/page.tsx
components/
  Sidebar.tsx · TopBar.tsx · PageShell.tsx · ThemeProvider.tsx · StatCard.tsx
  ui/         ← Button, Input, Select, Toasts
  orders/     ← OrderToolbar, OrderForm, OrderLineRow, OrdersSidebar
lib/
  types.ts · data.ts · store.tsx · cn.ts
```
