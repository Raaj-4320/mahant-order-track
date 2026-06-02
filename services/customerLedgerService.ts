import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { CustomerLedgerEntry, Order } from "@/lib/types";
import { logDB, logError, logLedger } from "@/lib/logger";
import { customersDataSourceSelection } from "@/lib/runtimeConfig";

export const customerLedgerService = {
  async listCustomerLedgerEntries(customerId?: string): Promise<CustomerLedgerEntry[]> {
    const selection = customersDataSourceSelection();
    if (selection.source !== "firebase" || !isFirebaseConfigured()) return [];
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    return customerLedgerFirebaseService.listCustomerLedgerEntries(customerId);
  },
  async applyOrderCustomerReceivables(order: Order): Promise<void> {
    const selection = customersDataSourceSelection();
logLedger("apply_order_customer_receivables_start", { orderId: order.id, status: order.status });
    if (selection.source !== "firebase") {
return;
    }
    if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for customer sync but Firebase is not configured.");
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    try { await customerLedgerFirebaseService.applyOrderCustomerReceivables(order);
logLedger("apply_order_customer_receivables_success", { orderId: order.id }); } catch (e) {
logError("apply_order_customer_receivables_failure", { orderId: order.id, error: e instanceof Error ? e.message : String(e) }); throw e; }
  },

  async recalculateCustomerFromLedger(customerId: string) {
    if (customersDataSourceSelection().source !== "firebase" || !isFirebaseConfigured()) throw new Error("Reconciliation is available only in Firebase mode.");
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    return customerLedgerFirebaseService.recalculateCustomerFromLedger(customerId);
  },
  async recalculateAllCustomersFromLedger() {
    if (customersDataSourceSelection().source !== "firebase" || !isFirebaseConfigured()) throw new Error("Reconciliation is available only in Firebase mode.");
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    return customerLedgerFirebaseService.recalculateAllCustomersFromLedger();
  },

  async repairCustomerLedgerFromSavedOrders() {
    if (customersDataSourceSelection().source !== "firebase" || !isFirebaseConfigured()) throw new Error("Repair is available only in Firebase mode.");
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    return customerLedgerFirebaseService.repairCustomerLedgerFromSavedOrders();
  },
  async reverseOrderCustomerReceivables(order: Order): Promise<void> {
    if (customersDataSourceSelection().source !== "firebase" || !isFirebaseConfigured()) return;
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    await customerLedgerFirebaseService.reverseOrderCustomerReceivables(order);
  },
};

