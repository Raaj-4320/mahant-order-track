# Firebase-Only Architecture Blueprint (No Custom Backend)

## 1) Architectural Goals

- Keep UI components framework-focused and presentation-first.
- Isolate all persistence logic behind services/hooks.
- Preserve ability to run with mock data during transition.
- Support incremental module rollout without breaking Order Booking.

## 2) Suggested Folder Structure

```txt
lib/
  firebase/
    client.ts        # Firebase app init + singleton getters
    firestore.ts     # Firestore helper refs + converters

types/
  domain.ts          # Shared domain interfaces (Product, Customer, Supplier, Order)
  dto.ts             # Firestore document DTOs / snapshot types

services/
  productsService.ts
  customersService.ts
  suppliersService.ts
  ordersService.ts

hooks/
  useProducts.ts
  useCustomers.ts
  useSuppliers.ts
  useOrders.ts

mocks/
  productsMock.ts
  customersMock.ts
  suppliersMock.ts
  ordersMock.ts
```

## 3) UI/Service Separation Strategy

- Page/component code should only call hooks/services (not raw Firebase SDK).
- Services expose CRUD + query functions with typed return values.
- Hooks own loading/error/realtime subscription lifecycle.
- This lets `mockService` and `firebaseService` share identical interfaces.

## 4) Type-First Design

Define stable interfaces before implementation:
- `Product`
- `Customer`
- `Supplier`
- `Order`
- `OrderItem`
- snapshots (`CustomerSnapshot`, `OrderItemSnapshot`)

Keep mapping functions explicit:
- Firestore doc -> domain model
- Domain model -> Firestore payload

## 5) Firestore Collection Model

Recommended multitenant path:

```txt
businesses/{businessId}
businesses/{businessId}/products/{productId}
businesses/{businessId}/customers/{customerId}
businesses/{businessId}/suppliers/{supplierId}
businesses/{businessId}/orders/{orderId}
```

### businesses/{businessId}
- id
- name
- ownerUid
- createdAt
- updatedAt

### products/{productId}
- id
- name
- sku
- category
- unit
- purchasePrice
- sellingPrice
- stockQty
- lowStockLimit
- supplierId
- active
- createdAt
- updatedAt

### customers/{customerId}
- id
- name
- phone
- email
- address
- totalOrders
- totalSpent
- outstandingAmount
- active
- createdAt
- updatedAt

### suppliers/{supplierId}
- id
- name
- phone
- email
- address
- companyName
- gstNumber
- totalPurchases
- outstandingAmount
- active
- createdAt
- updatedAt

### orders/{orderId}
- id
- orderNumber
- customerId (nullable if multi-customer line model is retained)
- customerSnapshot
- items[]
- subtotal
- discount
- tax
- grandTotal
- paidAmount
- dueAmount
- paymentStatus
- orderStatus
- notes
- createdAt
- updatedAt

Order `items[]` each should include snapshot fields:
- productId
- productSnapshot: name, sku, marka, unit, priceAtOrder, etc.
- supplierId / supplierSnapshot (if required by business flow)
- quantity metrics (ctns, pcsPerCtn, totalPcs)
- rmbPerPcs
- lineTotal
- photo references (Storage URLs)

## 6) Why Snapshots Are Required

- Product/customer/supplier records can change after order creation.
- Historical invoices must remain accurate as originally transacted.
- `customerSnapshot` and item/product snapshots preserve immutable history even when master profiles update.

## 7) Hook & Service Responsibilities

### services/*
- Pure data access (get/list/create/update/delete).
- Optional query helpers (e.g., list low-stock products).
- Zero React dependencies.

### hooks/*
- Manage `loading`, `error`, `data` state.
- Subscribe/unsubscribe realtime listeners where useful:
  - Orders list (recent updates)
  - Product stock changes (for booking screen)
- Provide mutation methods with optimistic UI options.

## 8) Loading/Error/Empty Handling Contract

All module hooks should return:
- `data`
- `isLoading`
- `error`
- `isEmpty`
- mutation handlers (create/update/delete)

UI pages should render:
- skeleton/placeholder for loading
- inline alert for recoverable error
- calm empty-state card with CTA

## 9) Offline/Failure Safety Notes

- Enable Firestore offline persistence when desired.
- Use retry-safe write patterns and idempotent order numbers.
- Surface sync/pending state for order save actions.
- Keep derived totals calculated client-side and validated before write.

## 10) Static-to-Firebase Replacement Strategy

- Step 1: keep existing `lib/data.ts` but route all calls through service functions.
- Step 2: swap service implementations from mock to Firebase.
- Step 3: keep UI untouched except hook imports.
- Step 4: add module-by-module realtime only where operationally useful.

