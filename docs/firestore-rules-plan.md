# Firestore Rules Plan (Draft Only)

## Tenant model
All business data is nested under:
- `businesses/{businessId}/...`

## Future auth ownership model
- User must be authenticated.
- User must be member/owner of `businessId`.

## Collections to protect
- products
- customers
- suppliers
- paymentAgents
- orders

## Frontend-only caution
- Rules must enforce tenant access and write constraints.
- Never rely on UI-only hiding.
- Derived counter writes need strict validation to avoid tampering.

## Suggested staged security approach
1. Development: authenticated users only.
2. Add business membership documents.
3. Role-based permissions (owner/manager/staff).
4. Add stricter schema validation in rules for write payloads.

## Deployment status
- Draft documentation only.
- No rules deployed in Phase 3A.
