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
    console.log("[CUSTOMER_SYNC_TRACE] sync_start", JSON.stringify({ source: selection.source, reason: selection.reason, orderId: order.id, status: order.status, path: selection.businessId ? `businesses/${selection.businessId}/customerLedger` : null, hasFirebaseConfig: selection.hasFirebaseConfig, hasBusinessId: selection.hasBusinessId }, null, 2));
    logLedger("apply_order_customer_receivables_start", { orderId: order.id, status: order.status });
    if (selection.source !== "firebase") {
      console.log("[CUSTOMER_SYNC_TRACE] sync_success", JSON.stringify({ source: selection.source, orderId: order.id, skipped: true, reason: selection.reason }, null, 2));
      return;
    }
    if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for customer sync but Firebase is not configured.");
    const { customerLedgerFirebaseService } = await import("@/services/firebase/customerLedgerFirebaseService");
    try { await customerLedgerFirebaseService.applyOrderCustomerReceivables(order); console.log("[CUSTOMER_SYNC_TRACE] sync_success", JSON.stringify({ source: selection.source, orderId: order.id, path: selection.businessId ? `businesses/${selection.businessId}/customerLedger` : null }, null, 2)); logLedger("apply_order_customer_receivables_success", { orderId: order.id }); } catch (e) { console.log("[CUSTOMER_SYNC_TRACE] sync_failed", JSON.stringify({ source: selection.source, orderId: order.id, error: e instanceof Error ? e.message : String(e) }, null, 2)); logError("apply_order_customer_receivables_failure", { orderId: order.id, error: e instanceof Error ? e.message : String(e) }); throw e; }
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
