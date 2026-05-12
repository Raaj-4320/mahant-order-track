# UI Design Blueprint (Extracted from Existing Frontend)

## A) Layout System

- **App shell**: Two-column desktop shell from `app/layout.tsx`:
  - Left fixed sidebar (`208px`, hidden below `lg`).
  - Right content pane (`flex-1`, full viewport height).
- **Page wrappers**:
  - `/orders` has custom toolbar + content + sticky footer.
  - Other modules use `PageShell` -> `TopBar` + scrollable content.
- **Header pattern**:
  - Height ~58px.
  - Border bottom + mild backdrop blur.
  - Page title on left, utility icons/actions on right.
- **Container/spacing rhythm**:
  - Common horizontal padding `px-5` in toolbars/footers.
  - Page sections usually `p-6` with `gap-4`/`gap-6`.
  - Card internals mostly `p-5`, smaller utility cards `p-3`/`p-3.5`.
- **Grid usage**:
  - Responsive KPI/product/supplier grids (`sm`, `lg`, `xl` breakpoints).
  - Order form header uses 1/2/4 column responsive layout.
- **Responsive behavior**:
  - Sidebar hidden on small screens.
  - Order lines table uses horizontal scroll container.
  - Footer actions collapse into stacked layout on narrow screens.

## B) Visual Style

### Color Tokens (CSS Variables)
- Backgrounds: `--bg`, `--bg-subtle`, `--bg-card`.
- Text: `--fg`, `--fg-muted`, `--fg-subtle`.
- Border: `--border`.
- Semantic: `--success`, `--danger`.
- Brand: `--brand`, `--brand-fg`.

### Typography
- System font stack (Apple/Segoe/Roboto/Arial).
- Frequent size tiers:
  - Micro labels: 10.5–12px
  - Body dense UI: ~13–14px
  - Section headings: 14–15px
  - KPI totals: 16–24px
- Weight hierarchy:
  - Labels: 500
  - Row/title emphasis: 600
  - KPI/value emphasis: 600+

### Shape/Depth
- Card radius: `14px` (`.card`).
- Inputs: `10px` default, `8px` compact.
- Buttons: `10px`, small buttons `8px`/`rounded-lg`.
- Soft borders everywhere (`1px`, tokenized border color).
- Shadow is minimal and contextual (`shadow-soft`, `shadow-card`).

### Iconography & States
- Lucide icons, mostly 13–16px.
- Hover generally shifts bg/border contrast.
- Focus uses subtle ring/shadow in input components.
- Active nav uses full inverse brand fill.

## C) Component Patterns

- **Stat cards**: label -> big value -> hint + right icon (`StatCard`).
- **Main cards/panels**: `.card` as baseline shell; often header + body.
- **Tables/data rows**:
  - Classic table (Dashboard).
  - Dense editable row-grid (Order Lines).
- **Forms**:
  - `Field` label above control.
  - Default and compact inputs/selects.
- **Search bars**:
  - `Input` with leading icon.
- **Buttons**:
  - Primary: solid brand.
  - Secondary: bordered card background.
  - Ghost: transparent hover fill.
  - Destructive: red text + red hover tint.
  - Icon buttons: circular bordered controls.
- **Badges/chips**:
  - Status shown via subtle rounded pills (e.g., draft/saved text).
- **Menus/dropdowns**:
  - Absolute positioned, rounded-xl, bordered, shadowed popovers.
- **Toasts/alerts**:
  - Bottom-right stacked toasts with icon + tone.
- **Empty states**:
  - Calm neutral copy in muted text inside card/table body.
- **Loading/skeleton**:
  - Not implemented yet.
- **Confirmation states**:
  - Save/cancel feedback via toasts only, no modal confirmations.

## D) Interaction Patterns

- **Add/Edit/Delete**:
  - Inline editing for order and rows.
  - Row deletion immediate (no confirm).
  - Add actions via clear CTA buttons.
- **Action confirmation**:
  - Non-blocking toast feedback.
- **Validation**:
  - Lightweight HTML constraints and numeric coercion.
  - No heavy inline validation summary.
- **Selection**:
  - Active order indicated by border/ring and selected state.
- **Search/filter**:
  - Search is live/filtering in-memory.
  - Filter/sort menus currently UI placeholders.
- **Responsive collapse**:
  - Control groups wrap.
  - Side nav hidden below `lg`.
  - Data-dense area scrolls horizontally.

## E) Reusable UI Rules for New Modules

1. Reuse existing **token palette** from `globals.css`; do not introduce unrelated colors.
2. Keep **card pattern** (`.card`, 14px radius, light border, soft shadow on hover).
3. Use `PageShell` + `TopBar` and match header spacing/height.
4. Maintain same **button hierarchy** (`primary`, `secondary`, `ghost`, `danger`).
5. Keep form controls on shared `Input`/`Select` components only.
6. Follow current **density**: 13–14px body text, compact controls for data tables.
7. Use existing tone for empty states (short, neutral, muted).
8. Keep motion style consistent (`animate-fadeSlide` / `animate-scaleIn`).
9. Prefer inline editing + unobtrusive toasts over heavy modal-first UX.
10. Do not redesign Order Booking visual language; treat it as the baseline system style.

