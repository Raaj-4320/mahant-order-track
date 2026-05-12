# System Discovery: TradeFlow (Current Frontend Audit)

## 1) Repository Map

```txt
app/
  layout.tsx                 # Root app shell + providers + sidebar + toasts
  page.tsx                   # Redirects / -> /orders
  globals.css                # Design tokens + component utility classes
  orders/page.tsx            # Main Order Booking page (primary functional module)
  dashboard/page.tsx         # Basic dashboard derived from static/store data
  customers/page.tsx         # Basic customer value summary list
  suppliers/page.tsx         # Basic supplier value summary cards
  products/page.tsx          # Basic product cards

components/
  Sidebar.tsx                # Left navigation (desktop-only)
  TopBar.tsx                 # Page header used by non-order pages
  PageShell.tsx              # Layout wrapper for Dashboard/Customers/Suppliers/Products
  StatCard.tsx               # KPI card pattern
  ThemeProvider.tsx          # Light/dark mode state and localStorage persistence

  orders/
    OrderToolbar.tsx         # Search, order picker, filter/sort menus, view toggle, add order
    OrderForm.tsx            # Header fields + editable lines table + add line
    OrderLineRow.tsx         # Per-line editable inputs and totals
    OrderFooter.tsx          # Sticky totals + save actions
    OrdersSidebar.tsx        # Order list side rail (currently not mounted)
    PhotoUpload.tsx          # Image upload/paste/drag component (data URL)

  ui/
    Button.tsx               # Button variants/sizing
    Input.tsx                # Input wrapper + icon support + Field helper
    Select.tsx               # Select wrapper + chevron
    Toasts.tsx               # Global toast renderer

lib/
  types.ts                   # Domain types + total calculation helpers
  data.ts                    # Static/mock data + formatters
  store.tsx                  # In-memory global store (orders, selected order, toasts)
  cn.ts                      # clsx + tailwind-merge helper
```

## 2) Framework & Core Architecture

- **Framework**: Next.js `14.2.15`.
- **React**: `18.3.1`.
- **TypeScript**: Enabled throughout app/components/lib.
- **Router**: **App Router** (`app/` directory + `layout.tsx` + route segment pages).
- **Styling**: Tailwind CSS + custom CSS variables + custom utility classes in `globals.css`.
- **State Model**:
  - Global in-memory React context store in `lib/store.tsx`.
  - Local page-level state for query/view/draft edit lifecycle.
- **Data Source**: Static arrays in `lib/data.ts` (no backend/API/Firebase yet).

## 3) Entry Points & Navigation

- `app/layout.tsx`
  - Wraps app with `ThemeProvider`, `StoreProvider`, and global `<Toasts />`.
  - Adds desktop sidebar shell (`<Sidebar />`) and right content region.
- `app/page.tsx`
  - Hard redirect to `/orders`.
- Sidebar routes:
  - `/dashboard`
  - `/orders` (Order Booking)
  - `/customers`
  - `/suppliers`
  - `/products`

## 4) Current Module Status

### Order Booking (`/orders`) — **Most complete module**
- Fully interactive static workflow.
- Supports:
  - Order search
  - Order selection
  - Order create draft
  - Header field editing
  - Line add/edit/remove
  - Realtime line and order total calculations
  - Save as draft/save order with toasts
  - List/Grid/Calendar visual modes
- Uses in-memory store and static entity lookup data.

### Dashboard (`/dashboard`) — **Partial placeholder/summary**
- Computes aggregate stats from in-memory orders.
- Displays recent orders table.
- No filters/charts/drill-down yet.

### Customers (`/customers`) — **Partial placeholder**
- Shows customer rows and computed value from matching order lines.
- Read-only, no CRUD/search/forms.

### Suppliers (`/suppliers`) — **Partial placeholder**
- Supplier cards with line count and computed lifetime value.
- Read-only, no CRUD/search/forms.

### Products (`/products`) — **Partial placeholder**
- Product cards from mock products.
- Read-only, no inventory/price/search/edit features.

## 5) Component/Pattern Map

- **Layout**: `Sidebar`, `PageShell`, `TopBar`.
- **Cards**: `.card` class + `StatCard`.
- **Tables/rows**:
  - Native table in Dashboard.
  - Grid-based editable pseudo-table in Order Booking lines.
- **Forms**:
  - `Field` labels, `Input`, `Select`, compact variants for dense tables.
- **Buttons**: `Button` with `primary`, `secondary`, `ghost`, `danger` styles.
- **Menus/dropdowns**: custom absolute-position panels (filter/sort/order picker).
- **Toasts**: context-managed queue rendered by `components/ui/Toasts.tsx`.
- **Empty states**:
  - Order lines empty message.
  - Calendar no-orders message.
- **Loading states**: no async loading skeletons yet (all data synchronous/static).

## 6) Static/Mock Data Map

Source: `lib/data.ts`

- `suppliers[]`: `{ id, name }`
- `customers[]`: `{ id, name }`
- `products[]`: `{ id, name, marka, photo, defaultDim? }`
- `paymentAgents[]`: `{ id, name }`
- `initialOrders[]`: `Order[]` with line items embedded.
- formatters:
  - `formatCNY(number)`
  - `formatDate(isoDate)`

Data consumption:
- Store bootstraps orders from `initialOrders`.
- UI maps IDs to names by array lookup at render time.
- Order line defaults are synthesized from first `products/suppliers/customers` entries.

## 7) Utility/Helper Map

- `lib/types.ts`
  - Types: `Supplier`, `Customer`, `Product`, `OrderLine`, `Order`, status union.
  - Calculations:
    - `lineTotalPcs(line)`
    - `lineTotalRmb(line)`
    - `orderTotal(order)`
- `lib/data.ts`
  - Formatters + mock datasets.
- `lib/cn.ts`
  - Class merge helper for conditional style composition.

## 8) Deep Order Booking Flow (Source-of-Truth UX)

### High-level flow
1. User lands on `/orders` (default app landing route).
2. Toolbar displays search, order picker, filter/sort menus, view mode, add order.
3. Active order is selected from store (`selectedOrderId`) and copied into local `draft`.
4. In **List** view user edits header fields and order lines.
5. Totals update live from line calculations.
6. User actions:
   - **Cancel** -> resets draft back to currently selected stored order.
   - **Save as Draft** -> upsert order with `status: draft` + toast.
   - **Save Order** -> upsert order with `status: saved` + success toast with amount.
7. In **Grid**/**Calendar** views user can inspect order summaries (and select in Grid).

### Detailed state model
In `app/orders/page.tsx`:
- `query`: search input text.
- `view`: `list | grid | calendar`.
- `filtered`: memoized order list by order number/supplier/customer text match.
- `current`: selected stored order by `selectedOrderId` fallback to first order.
- `draft`: mutable working copy of current order.
- `total`: memoized `orderTotal(draft)`.

In `lib/store.tsx`:
- `orders`: all orders in memory.
- `selectedOrderId`: active order pointer.
- `toasts`: transient notification queue.

### Toolbar actions (`OrderToolbar.tsx`)
- Search: filters orders in parent component.
- Order picker dropdown: select any existing order.
- Filter menu: visual-only options; currently closes menu without applying filters.
- Sort menu: visual-only options; currently closes menu without sorting.
- View toggle: list/grid/calendar mode switch.
- Add Order:
  - Generates pseudo-random order number (`25-XXX`) and random id.
  - Initializes empty draft order with date=today and default payment agent.
  - Inserts via `upsertOrder` and selects it.
  - Shows success toast.
- Theme toggle + notification icon included in toolbar.

### Form actions (`OrderForm.tsx`)
Header fields:
- `paymentBy` select.
- `date` input type=date.
- `number` editable order number.
- `wechatId` text field.

Order lines section:
- Renders each line with `OrderLineRow`.
- `updateLine(id, patch)` applies partial updates.
- `removeLine(id)` deletes line.
- `addLine()` appends `newLine()` default line seeded from first product/customer/supplier.
- Empty line state shown when no lines.

### Line logic (`OrderLineRow.tsx`)
Per line controls:
- supplier select
- product photo upload (data URL)
- dimension/weight photo upload (data URL)
- marka input
- details input
- CTNs numeric input
- pcs/ctn numeric input
- RMB/pcs numeric input
- customer select
- remove button

Derived values:
- `Total PCS = totalCtns * pcsPerCtn`
- `Line Total RMB = Total PCS * rmbPerPcs`
- Order total = sum(line totals)

### Save/cancel behavior
- **Cancel**: replaces draft with currently selected persisted order.
- **Save as Draft** / **Save Order**:
  - Writes draft into store (`upsertOrder`).
  - Sets selected order id to saved order.
  - Toast feedback shown.

### Validation & safeguards currently present
- Numeric fields use `type=number`, min constraints on key quantity/price fields.
- `Number(value) || 0` coercion prevents NaN propagation.
- No hard business validation for required fields/empty lines/negative logic beyond min attr.
- Save actions are always enabled.

### Feedback patterns in Order Booking
- Toast success/info via global toasts.
- Empty state messages for no lines and empty calendar results.
- Hover/focus states throughout controls.
- No inline error banners or blocking dialogs.

### Edge cases currently handled
- Empty query returns all orders.
- Missing selection falls back to first order.
- Empty lines collection handled gracefully.
- Photo upload supports click/drag/paste and clear.

### Edge cases currently missing
- Duplicate order numbers allowed.
- Random order number collisions possible.
- Filter/sort UI not functionally wired.
- No required field checks prior to save.
- No guard if mock arrays are empty (new line assumes index 0 exists).
- No undo/history beyond cancel within current selection.

## 9) Data to Persist Later in Firestore (as observed from current UX)

Minimum persisted entities from current behavior:
- Order header: id/number/date/paymentBy/wechatId/status.
- Order lines: all editable fields + optional photo URLs.
- Entity tables for suppliers/customers/products/payment agents.
- Created/updated timestamps.
- Optional computed totals can be denormalized for querying.

