# Phase 3F — Orders image upload to Cloudinary URLs

## Why
Order-line product sync to Products was working, but many order images were data URLs, which are skipped for Firebase-safe product sync.

## Old behavior
- Order line image uploads in `/orders` converted files to data URLs.
- Data URLs could be large and were not suitable for Firestore product catalog records.

## New behavior
- `/orders` PhotoUpload uploads selected/pasted/dropped images to Cloudinary unsigned upload.
- On success, order line stores Cloudinary `secure_url`.
- Existing previews are preserved (URL or legacy data URL values still render).
- Save actions are now blocked while any line image upload is still in progress.

## Fields affected
- `orderLine.productPhotoUrl`
- `orderLine.photoUrl`

## Sync impact
- Product sync can now copy order-line product image URL into `Product.photo` in Firebase mode.
- Legacy data URL guard remains for old lines.

## Env requirements
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

## Missing config behavior
- Upload is blocked with clear UI message: `Cloudinary is not configured. Please check upload settings.`
- No base64 fallback is written in this phase.

## Not changed
- No Orders Firebase migration.
- No order calculation changes.
- No backend/API route added.

## Risks
- Upload failures still require manual retry.

## Test checklist
- Upload product photo in order line.
- Upload pic/dim photo in order line.
- Try Save while uploading: verify warning toast and save blocked.
- Save Order, then verify generated product image in `/products`.
- Confirm old data URL preview entries still render.
