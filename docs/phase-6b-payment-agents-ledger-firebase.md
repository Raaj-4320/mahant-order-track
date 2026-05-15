# Phase 6B — Payment Agents + Ledger Firebase migration

## Migrated in this phase
- Payment Agents read/write can now run via Firestore-backed service.
- Standalone `Pay Agent` writes durable ledger entries in Firestore.
- `usePaymentAgents` now uses a facade with env switch.

## Env switch
- `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE=mock|firebase`
- default: `mock`
- if `firebase` selected and Firebase client env is missing, service falls back to mock with warning.

## Firestore paths
- `businesses/{businessId}/paymentAgents/{agentId}`
- `businesses/{businessId}/paymentAgentLedger/{entryId}`

## Architecture
- `services/paymentAgentsService.ts` facade selects mock vs Firebase.
- `services/firebase/paymentAgentsFirebaseService.ts` handles agent CRUD + atomic payment transaction.
- `services/firebase/paymentAgentLedgerFirebaseService.ts` handles ledger list/create.
- `hooks/usePaymentAgents.ts` consumes facade for page and /orders dependencies.

## Add Payment Agent behavior
- Upsert writes to Firestore in firebase mode.
- New agent keeps `openingCreditBalance`; initializes `creditBalance` when missing.

## Pay Agent behavior
- `recordPaymentToAgent` runs Firestore transaction:
  - reads current agent summary
  - computes due reduction and new credit
  - writes `agent_payment` ledger row
  - updates agent summary atomically

## /orders dependency
- `/orders` Payment By dropdown and settlement preview read from `usePaymentAgents`.
- In firebase mode they now use Firestore-backed agents.

## Important limitation (until Phase 6C)
- Orders are still local/mock.
- Order-based recalculation is intentionally not persisted in firebase mode to avoid non-durable local orders mutating durable Firestore agent balances.
- Durable financial mutation in 6B is limited to standalone `Pay Agent` entries and direct agent upserts.

## Not migrated yet
- Orders/Drafts Firestore migration.
- Order-settlement ledger persistence from order save/edit/delete.
- Customer ledger.

## Test notes
- Mock mode: set `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE=mock`.
- Firebase mode: set `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE=firebase` plus Firebase env vars and business id.

## Vercel envs
- `NEXT_PUBLIC_PAYMENT_AGENTS_DATA_SOURCE`
- `NEXT_PUBLIC_FIREBASE_BUSINESS_ID`
- all required `NEXT_PUBLIC_FIREBASE_*`

## Risks
- Mixed-source period remains (orders local, agents optionally firebase).
- Settlement totals from local orders are transitional until 6C.
