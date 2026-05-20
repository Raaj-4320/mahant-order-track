# Runtime Flow Breaker Audit (2026-05-17)

## Scope audited
- Dashboard
- Orders
- Customers
- Suppliers
- Payment Agents
- Products

---

## Bug list

| ID | Page/module | Bug / flow breaker | Evidence/file/function | Severity | Fix approach | Fixed in this pass |
|---|---|---|---|---|---|---|
| RFB-001 | Products | KPI scope mismatch (active view previously mixed inactive context) | `app/products/page.tsx` KPI cards and filters | P1 | Already fixed in recent pass by status-scoped KPIs and active catalog value labeling | Already fixed before this audit pass |
| RFB-002 | Orders service (mock vs firebase) | `deleteOrder` behavior mismatch by data source: Firebase soft-archives while mock hard-deletes | `services/ordersService.ts` + `services/mock/ordersMockService.ts` (`deleteOrder`) | P1 | Align mock `deleteOrder` to archive status to preserve history and parity with firebase | ✅ Yes |
| RFB-003 | Payment Agents | KPI cards always include global totals while table is filter-scoped, creating potential confusion similar to products | `app/payment-agents/page.tsx` cards use `rows` totals while table uses `filtered` | P1 | Introduce filter-scoped KPI totals + explicit scope labels + active-only helper note for hidden inactive records | ✅ Yes |
| RFB-004 | Customers | KPI cards are global while table is filter-scoped; acceptable but can confuse in active/inactive slices | `app/customers/page.tsx` cards use `base` totals while table uses `filtered` | P1 | Add status-scoped KPI totals and explicit scope labels; show active-filter helper text for hidden inactive customers | ✅ Yes |
| RFB-005 | Orders sidebar | Customer/supplier name summarization relies on static seed lists by id and can degrade for deleted/missing masters | `components/orders/OrdersSidebar.tsx` `summarize` using `lib/data` ids | P1 | Resolve names from order snapshots/raw line fields with deleted fallback strings; remove static seed dependence | ✅ Yes |
| RFB-006 | Dashboard | Current rows exclude `archived` but include non-saved statuses depending on upstream rows source assumptions | `app/dashboard/page.tsx` `base.filter(o => o.status !== "archived")` | P1 | Centralize dashboard eligibility with explicit included statuses and exclude draft/archived for cards + rows | ✅ Yes |
| RFB-007 | Suppliers / WeChat tab | Supplier activity derived only from strict `saved` orders; operational statuses (`loading`,`shipped`,`received`,`completed`,`cancelled`,`delayed`) were incorrectly excluded | `app/suppliers/page.tsx` + `services/supplierSelectors.ts` | P1 | Add `isSupplierSourceOrder` eligibility (include operational statuses, exclude `draft`/`archived`) and keep selectors on real `wechatId` + line supplier fields | ✅ Yes |

---

## Fixed items in this pass

### RFB-002: Mock vs Firebase order delete parity
- Updated mock `deleteOrder` to archive (status=`archived`) instead of hard-removing the order row.
- This preserves history in mock mode and matches Firebase behavior via `ordersService` routing.
- File changed:
  - `services/mock/ordersMockService.ts`

---

## Deferred items


---

## Browser QA checklist

1. **Orders delete parity**
   - In mock mode, delete/archive an order and confirm it no longer appears in active list but remains archived in persisted dataset behavior.
   - Confirm no hard disappearance that breaks audit/history flows.

2. **Products KPI consistency**
   - Verify status-scoped cards still behave correctly across Active / Inactive / All.

3. **Delete flows**
   - Customer/payment-agent force delete modals still function.
   - Historical orders/ledger remain visible after master deletion.

4. **Dashboard**
   - Confirm totals and rows stay consistent with saved order expectations.
