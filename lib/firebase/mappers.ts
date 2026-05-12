import type { Customer, Order, PaymentAgent, Product, Supplier } from "@/lib/types";

/**
 * Phase 3A scaffold only.
 * TODO(Phase 3B+): replace unknown with Firestore DocumentData/Timestamp-aware mapping.
 */

export const productFromFirestore = (doc: unknown): Product => doc as Product;
export const productToFirestore = (entity: Product): Record<string, unknown> => ({ ...entity });

export const customerFromFirestore = (doc: unknown): Customer => doc as Customer;
export const customerToFirestore = (entity: Customer): Record<string, unknown> => ({ ...entity });

export const supplierFromFirestore = (doc: unknown): Supplier => doc as Supplier;
export const supplierToFirestore = (entity: Supplier): Record<string, unknown> => ({ ...entity });

export const paymentAgentFromFirestore = (doc: unknown): PaymentAgent => doc as PaymentAgent;
export const paymentAgentToFirestore = (entity: PaymentAgent): Record<string, unknown> => ({ ...entity });

export const orderFromFirestore = (doc: unknown): Order => doc as Order;
export const orderToFirestore = (entity: Order): Record<string, unknown> => ({ ...entity });

/**
 * Timestamp strategy note:
 * - Future mapping should normalize Firestore Timestamp <-> ISO date strings.
 * - createdAt/updatedAt should be normalized at mapping boundaries.
 */
