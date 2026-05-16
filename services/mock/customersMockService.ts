import { customers } from "@/lib/data";
import type { Customer } from "@/lib/types";
import type { CustomersService } from "@/services/contracts";
import { isDemoDataEnabled } from "@/lib/runtimeConfig";
import { getCustomerCurrentReceivable, getCustomerStoreCredit, getCustomerTotalReceived, getCustomerTotalReceivable } from "@/services/customers/customerFinance";

const seedRows = (): Customer[] => JSON.parse(JSON.stringify(isDemoDataEnabled() ? customers : []));
let inMemoryCustomers: Customer[] | null = null;

const getRows = () => {
  if (!inMemoryCustomers) inMemoryCustomers = seedRows();
  return inMemoryCustomers;
};

export const customersMockService: CustomersService = {
  async listCustomers() { return JSON.parse(JSON.stringify(getRows())); },
  async getCustomerById(id) { return JSON.parse(JSON.stringify(getRows().find((x) => x.id === id) ?? null)); },
  async recordPaymentToCustomer(customerId, input) {
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than 0.");
    const rows = getRows();
    const idx = rows.findIndex((x) => x.id === customerId);
    if (idx < 0) throw new Error("Customer not found.");
    const customer = rows[idx];
    const currentReceivable = getCustomerCurrentReceivable(customer);
    const receivableReduced = Math.min(currentReceivable, amount);
    const creditCreated = Math.max(0, amount - receivableReduced);
    const nextCurrentReceivable = Math.max(0, currentReceivable - receivableReduced);
    const next: Customer = {
      ...customer,
      currentReceivable: nextCurrentReceivable,
      outstandingAmount: nextCurrentReceivable,
      totalReceivableGenerated: getCustomerTotalReceivable(customer),
      totalSpent: getCustomerTotalReceivable(customer),
      storeCreditBalance: getCustomerStoreCredit(customer) + creditCreated,
      totalReceived: getCustomerTotalReceived(customer) + amount,
      updatedAt: new Date().toISOString(),
    };
    rows[idx] = next;
    return JSON.parse(JSON.stringify(next));
  },
};
