import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { CustomerLedgerEntry, Order } from "@/lib/types";

const SOURCE = process.env.NEXT_PUBLIC_CUSTOMERS_DATA_SOURCE ?? (process.env.NEXT_PUBLIC_ORDERS_DATA_SOURCE ?? "mock");

export const customerLedgerService = {
  async listCustomerLedgerEntries(customerId?: string): Promise<CustomerLedgerEntry[]> {
    if (SOURCE !== "firebase" || !isFirebaseConfigured()) return [];
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    return customerLedgerFirebaseService.listCustomerLedgerEntries(customerId);
  },
  async applyOrderCustomerReceivables(order: Order): Promise<void> {
    if (SOURCE !== "firebase" || !isFirebaseConfigured()) return;
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    await customerLedgerFirebaseService.applyOrderCustomerReceivables(order);
  },
  async reverseOrderCustomerReceivables(order: Order): Promise<void> {
    if (SOURCE !== "firebase" || !isFirebaseConfigured()) return;
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    await customerLedgerFirebaseService.reverseOrderCustomerReceivables(order);
  },
};
