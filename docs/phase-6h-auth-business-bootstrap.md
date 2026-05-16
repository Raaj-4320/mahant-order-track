# Phase 6H — Auth + Business Bootstrap

## Purpose
Provide minimal client-side Firebase Auth and first business/member bootstrap so strict Firestore rules can be used safely.

## What was added
- Lightweight auth hook (`hooks/useAuthUser.ts`) for:
  - auth state listener
  - sign in
  - sign up
  - sign out
- Business bootstrap service (`services/firebase/businessBootstrapFirebaseService.ts`) for:
  - creating business doc if missing
  - creating current user member doc as owner
  - checking current membership
- Sidebar auth/bootstrap panel to:
  - sign in / sign up
  - show current business + role
  - bootstrap owner membership when missing

## Rules alignment
`firestore.rules` now supports owner bootstrap by allowing:
- business owner (`ownerUid`) to create their own member doc
- owner to read business-scoped data even before member doc exists

## Setup steps
1. Configure Firebase client env vars.
2. Enable Email/Password auth provider in Firebase Auth.
3. Start app, sign up/sign in from Sidebar panel.
4. Click **Bootstrap Owner Membership**.
5. Deploy rules manually when ready.

## Safety notes
- No backend/API routes
- No Admin SDK
- No Cloud Functions
- No automatic rules deployment

## Manual checks
- Signed-out user cannot read/write protected business data.
- Signed-in user without membership sees role `none`.
- Bootstrap creates owner membership.
- After bootstrap, normal app reads/writes succeed under rules model.
- Dev reset still requires owner/admin delete rights in rules.
