# Order Booking UI Design Audit

Date: 2026-05-17  
Scope: UI audit only (no code changes to logic), focused on Order Booking tab and Order History presentation.

## Files audited
- `app/orders/page.tsx`
- `components/orders/OrderForm.tsx`
- `components/orders/OrderLineRow.tsx`
- `components/orders/OrderFooter.tsx`
- `components/orders/OrderLinesDetailModal.tsx`
- `components/orders/OrderToolbar.tsx` (present in repo; not currently rendered by `app/orders/page.tsx`)
- `components/orders/OrdersSidebar.tsx` (present in repo; not currently rendered by `app/orders/page.tsx`)
- `hooks/useOrders.ts`
- `hooks/useDraftAutosave.ts`
- `services/ordersService.ts`
- `services/selectors.ts`
- `types/domain.ts`

---

## 1) Page/header toolbar audit
Rendered toolbar source: `app/orders/page.tsx`.

### Search
- **Visible label/placeholder**: `Search order history...`
- **Purpose**: Filters order history list by order number, WeChat ID, supplier text, customer text, and payment agent name.
- **Current behavior**: Working.
- **Handler/function**:
  - Input bound to `query` state.
  - `setQuery` on change.
  - `history` derived via `useMemo` using `query` filter.
- **Enabled state**: Enabled.

### Order selector/dropdown
- **In current Orders page toolbar**: Not present.
- **Related component**: `components/orders/OrderToolbar.tsx` has an order picker (`Order` dropdown), but this component is not mounted by `app/orders/page.tsx`.
- **Status**: Not visible in active Orders page implementation.

### Filter
- **Visible label**: `Filter`
- **Purpose**: Intended future filtering control.
- **Current behavior**: Disabled (`disabled` prop) with explanatory title.
- **Handler/function**: No active handler while disabled.
- **Enabled state**: Disabled intentionally.

### Sort
- **Visible label**: `Sort`
- **Purpose**: Intended future sort control.
- **Current behavior**: Disabled (`disabled` prop) with explanatory title.
- **Handler/function**: No active handler while disabled.
- **Enabled state**: Disabled intentionally.

### View buttons (list/grid/calendar)
- **In current Orders page toolbar**: Not present.
- **Related component**: `components/orders/OrderToolbar.tsx` has view toggle buttons.
- **Status**: Not visible in active Orders page implementation.

### Add Order
- **Visible label**: `Add Order`
- **Purpose**: Starts a fresh add flow.
- **Current behavior**: Working.
- **Handler/function**: `startAdd()`
  - Clears editing context.
  - Peeks next order number (`peekNextOrderNumber`).
  - Initializes draft with reserved preview number.
  - Sets `mode = "add"`.
- **Enabled state**: Enabled.

### Draft (N)
- **Visible label**: `Draft ({drafts.length})`
- **Purpose**: Opens draft management view.
- **Current behavior**: Working.
- **Handler/function**: `onClick={() => setMode("drafts")}`
- **Data source for N**: `drafts` memo:
  - Firebase mode: `firebaseDraftOrders` from `useOrders`.
  - Mock/local mode: `orders.filter((o) => o.status === "draft")`.
- **Enabled state**: Enabled.

### Notification/theme icons
- **In current Orders page toolbar**: Not present.
- **Related component**: `components/orders/OrderToolbar.tsx` includes notification + theme toggle icons.
- **Status**: Not visible in active Orders page implementation.

---

## 2) Order form header fields audit
Rendered form source: `components/orders/OrderForm.tsx`, parent state in `app/orders/page.tsx`.

### Payment By
- **Purpose**: Selects payment agent for order settlement/persistence.
- **Data field**: `draft.paymentBy` and mirrored to `draft.paymentAgentId`.
- **Behavior**:
  - `Select` options from `paymentAgents` list.
  - On change updates both `paymentBy` and `paymentAgentId`.
- **Validation relevance**:
  - Considered by order validation (`validateOrderForSave(draft)` in page).
  - Draft save can proceed with partial data if any meaningful content exists.

### Date
- **Purpose**: Order date.
- **Data field**: `draft.date`.
- **Behavior**: Date input updates draft state directly.
- **Validation relevance**: Included in overall required checks for final save.

### Order Number
- **Purpose**: Displays order number preview/final number context.
- **Data field**: `draft.number` (also mirrors `draft.orderNumber` in setter).
- **Behavior**:
  - Rendered read-only in form.
  - In add flow: preview comes from `peekNextOrderNumber`.
  - In final save: canonical number assigned by `ensureFinalOrderNumber`.
  - In draft save: persisted with blank `number/orderNumber` intentionally.
- **Validation relevance**: Final numbering is system-controlled, not manual.

### WeChat ID
- **Purpose**: Customer communication/order identification field.
- **Data field**: `draft.wechatId`.
- **Behavior**:
  - Text input with `datalist` suggestions derived from existing orders (`wechatSuggestions`).
- **Validation relevance**: Part of final save validation requirements.

---

## 3) Order lines table audit
Primary files: `components/orders/OrderForm.tsx`, `components/orders/OrderLineRow.tsx`.

### Supplier
- **Purpose**: Associate supplier name/id per line.
- **Data field**: `line.supplierName`, `line.supplierId`.
- **Autocomplete/dropdown**:
  - Uses `<datalist>` fed by `supplierSuggestions` from existing order lines.
- **Behavior**:
  - Typing updates `supplierName`.
  - Attempts ID resolution from static `suppliers` data exact-name match.
- **Validation relevance**: Checked in `validateOrderForSave` line-level rules.

### Product (photo upload column)
- **Purpose**: Store/display product photo for line item.
- **Data field**: `line.productPhotoUrl`.
- **Image behavior**:
  - Uses `PhotoUpload` component.
  - Upload state notifies parent via `onUploadingChange` to gate save while uploads active.

### Pic + Dim (dimension photo upload column)
- **Purpose**: Store/display dimension/weight image.
- **Data field**: `line.photoUrl`.
- **Image behavior**: same upload workflow as Product photo.

### Marka
- **Purpose**: Product brand/mark identifier.
- **Data field**: `line.marka`.
- **Behavior**: Free-text input.

### Details
- **Purpose**: Line-item description.
- **Data field**: `line.details`.
- **Behavior**: Free-text input.

### CTNS
- **Purpose**: Carton count.
- **Data field**: `line.totalCtns`.
- **Behavior**: Numeric input, coerced to number.

### PCS / CTN
- **Purpose**: Pieces per carton.
- **Data field**: `line.pcsPerCtn`.
- **Behavior**: Numeric input, coerced to number.

### Total PCS
- **Purpose**: Derived quantity per line.
- **Calculation/function**:
  - `lineTotalPcs(line)` from `lib/types`.
- **Display**: Read-only computed text.

### Rate / PCS
- **Purpose**: Unit rate per piece.
- **Data field**: `line.rmbPerPcs`.
- **Behavior**: Numeric input with decimal step.

### Line Total
- **Purpose**: Derived monetary total per line.
- **Calculation/function**:
  - `lineTotalRmb(line)` from `lib/types`.
- **Display**: Read-only computed numeric display.

### Customer
- **Purpose**: Associate customer per line.
- **Data field**: `line.customerName`, `line.customerId` (resolved).
- **Autocomplete/dropdown**:
  - `datalist` from customer suggestions (customer table + historical lines).
- **Behavior**:
  - Uses `applyTypedCustomerToLine` to map typed value to known customer when possible.

### Delete line
- **Purpose**: Remove a line from current draft/edit.
- **Handler/function**:
  - Row `onRemove` -> page `handleRemoveLine(lineId)`.
  - In edit mode for original lines: confirmation appears; removed IDs tracked for product archival on save.
- **Side effects**: UI-state removal immediately; archival handling deferred to save flow.

### Add New Line
- **Purpose**: Append a new blank line.
- **Handler/function**: `addLine()` in `OrderForm`, uses `newLine()` factory.
- **Behavior**: Working.

---

## 4) Footer/buttons audit
Primary file: `components/orders/OrderFooter.tsx`; wired in `app/orders/page.tsx`.

### Cancel
- **Purpose**: Exit add/edit and reset working draft UI.
- **Handler/function**: `onCancel` in page.
- **Behavior**:
  - Clears edit context and removed-line tracking.
  - Resets draft via `createEmptyDraft`.
  - Sets mode back to `history`.
  - Shows info toast.
- **Side effects triggered/skipped**: No persistence side effects.

### Save as Draft
- **Purpose**: Persist current work as draft state.
- **Handler/function**: `onSave("draft")`.
- **Behavior**:
  - Blocks if uploads active.
  - Requires `hasAnyDraftContent(draft)`.
  - Persists with `status: "draft"`, blank order numbers.
  - Firebase uses `upsertFirebaseOrder` + reload; local uses `upsertOrder` store.
- **Side effects triggered/skipped**:
  - Skips final-order side effects (no settlement apply, no customer receivable apply as final order).

### Save Order / Save Changes
- **Purpose**: Persist as final saved order.
- **Handler/function**: `onSave("saved")`.
- **Behavior**:
  - Requires validation pass (`validateOrderForSave`).
  - Resolves customer refs (`resolveCustomersForOrderLines`).
  - Allocates/ensures final number (`ensureFinalOrderNumber`).
  - Upserts order.
  - Runs side effects: product sync, payment settlement apply (mode-dependent), customer receivable apply, recalculations, customer reload.
- **Side effects triggered/skipped**:
  - Triggers full final-save side effects.

### View Order Details
- **Purpose**: Open details modal for current draft/edit order.
- **Handler/function**: `onViewDetails={() => setViewOrder(draft)}`.
- **Behavior**: Opens `OrderLinesDetailModal`.

### Total amount display
- **Purpose**: Show current order total.
- **Calculation/function**: `orderTotal(draft)` from `lib/types`.
- **Display location**: Footer right section.

---

## 5) Draft view audit
Primary file: `app/orders/page.tsx` (`mode === "drafts"`).

### Entry point: Draft (N)
- Top toolbar button sets drafts mode.

### Draft list/cards
- **Data source**: `drafts` memo (firebase drafts or local draft filter).
- **Fields shown**:
  - order number preview (`o.number || o.orderNumber || "Draft"`)
  - WeChat ID
  - payment agent name
  - line count
  - total CTNS (derived)
  - total amount
  - autosaved/updated timestamp
  - missing item count from `validateOrderForSave` result

### Continue
- **Purpose**: Open draft into edit mode for completion.
- **Handler/function**: `startEdit(o)`.
- **Behavior**:
  - Sets `editingOrderId`.
  - Clones order into `draft` state.
  - If source order status is draft, applies next-number preview via `peekNextOrderNumber`.
  - Sets mode to `edit`.

### Delete draft
- **Purpose**: Remove/archive draft via existing remove flow.
- **Handler/function**: `removeOrder(o)`.
- **Behavior**:
  - Uses same confirmation and archive/delete pipeline as history actions.
  - Firebase path archives (`archiveOrder`) after reversal steps where applicable.

---

## 6) Order history display audit
Primary file: `app/orders/page.tsx` history section.

### Fields currently shown per row
- Order number (or draft fallback label)
- WeChat ID
- Payment Agent name
- Up to 5 thumbnails from `line.productPhotoUrl || line.photoUrl`
- Hover tooltip for each thumbnail (`title`) using `marka` fallback to `details`
- Overflow indicator `+N` when lines > 5
- Total CTNS (sum of `line.totalCtns`)
- Total amount (numeric)

### Row actions
- **Loading date**:
  - Inline date input.
  - On change upserts updated order (`loadingDate` + `updatedAt`) to firebase/local path.
- **Status selector**:
  - Visible when status not draft/archived.
  - On change -> `changeOrderStatus` upsert.
- **View**:
  - Opens `OrderLinesDetailModal`.
- **Edit**:
  - `startEdit(o)`.
- **Delete**:
  - `removeOrder(o)` (archive/delete semantics by mode).

### Working/disabled status
- All history row actions are enabled, with async state disable only for status select when update pending.

---

## 7) Data/flow map

### Add Order flow
1. User clicks `Add Order`.
2. `startAdd()` clears edit context.
3. `peekNextOrderNumber()` gets preview number.
4. `createEmptyDraft(..., reservedNumber)` initializes draft.
5. UI enters `mode = "add"`.

### Save Draft flow
1. User clicks `Save as Draft`.
2. `onSave("draft")` checks uploads and meaningful content.
3. Persists as draft with blank number/orderNumber.
4. Resets UI to history mode.

### Complete Draft flow
1. User enters drafts view via `Draft (N)`.
2. Clicks `Continue` on draft card.
3. `startEdit(o)` loads draft into form, applies number preview if needed.
4. User can Save Draft again or Save Order.

### Save Order flow
1. User clicks `Save Order`/`Save Changes`.
2. `onSave("saved")` validates required fields/line issues.
3. Resolves customers, ensures final order number.
4. Upserts order.
5. Executes side effects:
   - product sync
   - payment settlement apply
   - customer receivable apply
   - recalc/reload dependent data
6. Resets UI to history mode.

### Edit Order flow
1. User clicks `Edit` in history.
2. `startEdit(o)` sets editing state and clones order.
3. Remove-line tracking enabled for original lines.
4. Save Changes reuses Save Order pipeline.

### Delete/Archive Order flow
1. User clicks `Delete` in history or draft card.
2. `removeOrder(o)` confirmation prompt.
3. Firebase mode:
   - reverse payment settlement
   - reverse customer receivables
   - archive generated products
   - `archiveOrder` and reload
4. Local/mock mode:
   - store delete/archive path
   - recalc orders
   - archive generated products

### Status/loading date update flow
- Loading date change:
  - inline date input -> upsert updated order.
- Status change:
  - select -> `changeOrderStatus` -> upsert order with new status and updatedAt.

---

## Notable implementation observations
1. `components/orders/OrderToolbar.tsx` contains richer toolbar controls (order picker, filter menu, sort menu, view toggle, notification, theme) but is not currently used by `app/orders/page.tsx`.
2. `components/orders/OrdersSidebar.tsx` is also not mounted by `app/orders/page.tsx`.
3. `OrderLinesDetailModal` displays payment agent as raw `order.paymentBy` value, which may be ID rather than resolved display name.
4. Filter/Sort controls in current Orders page are intentionally disabled with explanatory tooltips.
