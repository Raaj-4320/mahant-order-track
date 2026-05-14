# Phase 3D — Products Add/Edit + Cloudinary Upload + Firebase Write

- Implemented Products `upsertProduct` in service contract, mock service, resolver, hook, and Firebase service.
- Firebase path used: `businesses/{businessId}/products/{productId}` with `NEXT_PUBLIC_FIREBASE_BUSINESS_ID` (default `mahant`).
- Products page now supports real Add/Edit modal flow.
- Image upload uses unsigned Cloudinary client (`uploadImageUnsigned`) and stores URL in `product.photo`.
- Mock mode remains default and supports in-memory Add/Edit for session.
- Firebase mode enabled via `NEXT_PUBLIC_PRODUCTS_DATA_SOURCE=firebase` + Firebase env config.

## Not migrated
- Orders/Customers/Suppliers/Payment Agents/Dashboard data-source migration not changed.
- No delete implementation.
- No backend/API routes.

## Local verification
1. Set Firebase + Cloudinary env values.
2. `npm run build`
3. `npm run dev`
4. Test `/products` Add/Edit in mock mode and Firebase mode.

## Risks
- Firestore rules may block writes.
- Cloudinary unsigned preset must be restricted in dashboard.
