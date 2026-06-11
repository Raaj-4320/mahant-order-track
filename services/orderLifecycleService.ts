import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { Customer, LifecycleMetadata, Order, PaymentAgent, Product, RecycleBinEntry, ReferenceRecord, ReferenceRecordType } from "@/lib/types";
import { joinLineDetails } from "@/lib/orderLineDetails";
import { getProductsService } from "@/services/productsService";
import { getCustomersService } from "@/services/customersService";
import { getPaymentAgentsService } from "@/services/paymentAgentsService";
import { getOrdersService } from "@/services/ordersService";
import { customerLedgerService } from "@/services/customerLedgerService";
import { customersDataSourceSelection, ordersDataSourceSelection } from "@/lib/runtimeConfig";

const RECYCLE_BIN_PREFIX = "recycle";

const deterministicRecycleBinId = (itemType: RecycleBinEntry["itemType"], itemId: string) => `${RECYCLE_BIN_PREFIX}-${itemType}-${itemId}`;

const ensureLifecycle = (
  current: LifecycleMetadata | undefined,
  patch: Partial<LifecycleMetadata> & Pick<LifecycleMetadata, "status" | "sourceType">,
): LifecycleMetadata => ({
  ...current,
  ...patch,
  type: patch.type ?? current?.type,
  status: patch.status,
  sourceType: patch.sourceType,
});

const isFirebaseLifecycleEnabled = () => {
  if (!isFirebaseConfigured()) return false;
  return ordersDataSourceSelection().source === "firebase";
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

async function getReferenceRecordsFirebaseService() {
  const { referenceRecordsFirebaseService } = await import("@/services/firebase/referenceRecordsFirebaseService");
  return referenceRecordsFirebaseService;
}

async function getRecycleBinFirebaseService() {
  const { recycleBinFirebaseService } = await import("@/services/firebase/recycleBinFirebaseService");
  return recycleBinFirebaseService;
}

const createRecycleEntry = async (input: Omit<RecycleBinEntry, "id"> & { id?: string }) => {
  const recycleBin = await getRecycleBinFirebaseService();
  return recycleBin.upsertRecycleBinEntry(input);
};

const markRecycleEntryRestored = async (entryId: string, existing: RecycleBinEntry | null, restoredBy: string) => {
  if (!entryId) return;
  await createRecycleEntry({
    id: entryId,
    itemId: existing?.itemId || entryId,
    itemType: existing?.itemType || "reference",
    referenceType: existing?.referenceType,
    label: existing?.label || entryId,
    originalReference: existing?.originalReference || entryId,
    sourceOrderId: existing?.sourceOrderId,
    snapshot: existing?.snapshot,
    deletedAt: existing?.deletedAt || new Date().toISOString(),
    deletedBy: existing?.deletedBy,
    restoredAt: new Date().toISOString(),
    restoredBy,
    status: "active",
  });
};

const createReferenceSnapshotLabel = (record: ReferenceRecord) => `${record.type}: ${record.value}`;

const orderUsesReference = (order: Order, type: ReferenceRecordType, value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (type === "wechatId") return (order.wechatId || "").trim().toLowerCase() === normalized;
  if (type === "orderNumber") return (order.number || order.orderNumber || "").trim().toLowerCase() === normalized;
  if (type === "marka") return order.lines.some((line) => (line.marka || "").trim().toLowerCase() === normalized);
  return order.lines.some((line) => joinLineDetails(line).trim().toLowerCase() === normalized);
};

const isActiveOrder = (order: Order) => order.lifecycle?.status !== "deleted" && order.status !== "archived";

export const orderLifecycleService = {
  async listRecycleBin() {
    if (!isFirebaseLifecycleEnabled()) return [];
    const recycleBin = await getRecycleBinFirebaseService();
    return recycleBin.listRecycleBinEntries();
  },

  async syncOrderLifecycleMetadata(order: Order, context: { knownCustomerIds: Set<string>; knownPaymentAgentIds: Set<string> }) {
    if (!isFirebaseLifecycleEnabled()) return order;

    const referenceService = await getReferenceRecordsFirebaseService();
    const productsService = getProductsService();
    const customersService = getCustomersService();
    const paymentAgentsService = getPaymentAgentsService();
    const ordersService = getOrdersService();

    const createdProductIds = order.lines.map((line) => `order-line-${order.id}-${line.id}`);
    const createdCustomerIds = unique(order.lines.map((line) => line.customerId).filter((id) => id && !context.knownCustomerIds.has(id)));
    const createdPaymentAgentIds = order.paymentAgentId && !context.knownPaymentAgentIds.has(order.paymentAgentId) ? [order.paymentAgentId] : [];

    const orderNumberRef = (order.number || order.orderNumber || "").trim()
      ? await referenceService.ensureReferenceRecord({ type: "orderNumber", value: order.number || order.orderNumber, sourceOrderId: order.id, lifecycle: { sourceType: "order", createdByOrder: true, reusable: false } })
      : null;
    const wechatRef = order.wechatId.trim()
      ? await referenceService.ensureReferenceRecord({ type: "wechatId", value: order.wechatId, sourceOrderId: order.id, lifecycle: { sourceType: "order", createdByOrder: true, reusable: true } })
      : null;

    const markaRefs = [];
    for (const marka of unique(order.lines.map((line) => line.marka?.trim() || ""))) {
      markaRefs.push(await referenceService.ensureReferenceRecord({ type: "marka", value: marka, sourceOrderId: order.id, lifecycle: { sourceType: "order", createdByOrder: true, reusable: true } }));
    }

    const detailRefs = [];
    for (const detail of unique(order.lines.map((line) => joinLineDetails(line).trim()))) {
      detailRefs.push(await referenceService.ensureReferenceRecord({ type: "detail", value: detail, sourceOrderId: order.id, lifecycle: { sourceType: "order", createdByOrder: true, reusable: true } }));
    }

    for (const productId of createdProductIds) {
      const product = await productsService.getProductById(productId);
      if (!product) continue;
      await productsService.upsertProduct({
        ...product,
        lifecycle: ensureLifecycle(product.lifecycle, {
          type: "product",
          status: "active",
          sourceType: "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          reusable: false,
          deletedAt: undefined,
          linkedCustomerIds: unique(order.lines.map((line) => line.customerId)),
          linkedPaymentAgentIds: unique([order.paymentAgentId || order.paymentBy]),
          linkedWechatIds: wechatRef ? [wechatRef.record.id] : [],
          linkedReferenceIds: unique([
            ...(orderNumberRef ? [orderNumberRef.record.id] : []),
            ...markaRefs.map((item) => item.record.id),
            ...detailRefs.map((item) => item.record.id),
          ]),
        }),
      });
    }

    for (const customerId of createdCustomerIds) {
      const customer = await customersService.getCustomerById(customerId);
      if (!customer || !customersService.upsertCustomer) continue;
      await customersService.upsertCustomer({
        ...customer,
        lifecycle: ensureLifecycle(customer.lifecycle, {
          type: "customer",
          status: "active",
          sourceType: "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          reusable: false,
          deletedAt: undefined,
          linkedLedgerEntryIds: order.lines.filter((line) => line.customerId === customerId).map((line) => `customer-receivable-${order.id}-${line.id}`),
        }),
      });
    }

    for (const agentId of createdPaymentAgentIds) {
      const agent = await paymentAgentsService.getPaymentAgentById(agentId);
      if (!agent) continue;
      await paymentAgentsService.upsertPaymentAgent({
        ...agent,
        lifecycle: ensureLifecycle(agent.lifecycle, {
          type: "paymentAgent",
          status: "active",
          sourceType: "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          reusable: false,
          deletedAt: undefined,
          linkedLedgerEntryIds: order.paymentAgentId ? [`order-settlement-${order.id}`] : [],
        }),
      });
    }

    const dependencyMap = {
      previousStatus: order.status,
      createdProductIds,
      createdCustomerIds,
      createdPaymentAgentIds,
      linkedWechatReferenceIds: wechatRef ? [wechatRef.record.id] : [],
      linkedMarkaReferenceIds: markaRefs.map((item) => item.record.id),
      linkedDetailReferenceIds: detailRefs.map((item) => item.record.id),
      linkedOrderNumberReferenceIds: orderNumberRef ? [orderNumberRef.record.id] : [],
      customerLedgerEntryIds: order.lines.filter((line) => line.customerId).map((line) => `customer-receivable-${order.id}-${line.id}`),
      paymentAgentLedgerEntryIds: order.paymentAgentId ? [`order-settlement-${order.id}`] : [],
      affectedCustomerIds: unique(order.lines.map((line) => line.customerId)),
      affectedPaymentAgentIds: unique([order.paymentAgentId || order.paymentBy]),
    } as Order["dependencyMap"];

    const nextOrder: Order = {
      ...order,
      lifecycle: ensureLifecycle(order.lifecycle, {
        type: "order",
        status: "active",
        sourceType: "manual",
        createdByOrder: false,
        reusable: false,
        deletedAt: undefined,
        linkedProductIds: createdProductIds,
        linkedCustomerIds: createdCustomerIds,
        linkedPaymentAgentIds: createdPaymentAgentIds,
        linkedWechatIds: wechatRef ? [wechatRef.record.id] : [],
        linkedReferenceIds: unique([
          ...(orderNumberRef ? [orderNumberRef.record.id] : []),
          ...markaRefs.map((item) => item.record.id),
          ...detailRefs.map((item) => item.record.id),
        ]),
        linkedLedgerEntryIds: unique([
          ...dependencyMap.customerLedgerEntryIds,
          ...dependencyMap.paymentAgentLedgerEntryIds,
        ]),
      }),
      dependencyMap,
    };

    await ordersService.upsertOrder(nextOrder);
    return nextOrder;
  },

  async softDeleteOrder(order: Order, deletedBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return order;
    const ordersService = getOrdersService();
    const productsService = getProductsService();
    const customersService = getCustomersService();
    const paymentAgentsService = getPaymentAgentsService();
    const referenceService = await getReferenceRecordsFirebaseService();
    const allOrders = await ordersService.listOrders();
    const activeOthers = allOrders.filter((item) => item.id !== order.id && isActiveOrder(item));
    const dependencyMap = order.dependencyMap;

    await paymentAgentsService.reverseOrderSettlement?.(order);
    await customerLedgerService.reverseOrderCustomerReceivables(order);

    for (const productId of dependencyMap?.createdProductIds ?? []) {
      const product = await productsService.getProductById(productId);
      if (!product) continue;
      const stillUsed = activeOthers.some((activeOrder) => (product.sourceOrderIds ?? []).includes(activeOrder.id));
      if (stillUsed) continue;
      const recycleEntry = await createRecycleEntry({
        id: deterministicRecycleBinId("product", product.id),
        itemId: product.id,
        itemType: "product",
        label: product.name || product.marka || product.id,
        originalReference: product.productCode || product.sku || product.id,
        sourceOrderId: order.id,
        snapshot: product as unknown as Record<string, unknown>,
        deletedAt: new Date().toISOString(),
        deletedBy,
        status: "deleted",
      });
      await productsService.upsertProduct({
        ...product,
        status: "inactive",
        lifecycle: ensureLifecycle(product.lifecycle, {
          type: "product",
          status: "deleted",
          sourceType: product.lifecycle?.sourceType ?? "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          deletedAt: recycleEntry.deletedAt,
          deletedBy,
          recycleBinEntryId: recycleEntry.id,
        }),
      });
    }

    for (const customerId of dependencyMap?.createdCustomerIds ?? []) {
      const customer = await customersService.getCustomerById(customerId);
      if (!customer || !customersService.upsertCustomer) continue;
      const stillUsed = activeOthers.some((activeOrder) => activeOrder.lines.some((line) => line.customerId === customerId));
      if (stillUsed) continue;
      const recycleEntry = await createRecycleEntry({
        id: deterministicRecycleBinId("customer", customer.id),
        itemId: customer.id,
        itemType: "customer",
        label: customer.displayName || customer.name || customer.id,
        originalReference: customer.customerCode || customer.id,
        sourceOrderId: order.id,
        snapshot: customer as unknown as Record<string, unknown>,
        deletedAt: new Date().toISOString(),
        deletedBy,
        status: "deleted",
      });
      await customersService.upsertCustomer({
        ...customer,
        status: "inactive",
        lifecycle: ensureLifecycle(customer.lifecycle, {
          type: "customer",
          status: "deleted",
          sourceType: customer.lifecycle?.sourceType ?? "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          deletedAt: recycleEntry.deletedAt,
          deletedBy,
          recycleBinEntryId: recycleEntry.id,
        }),
      });
    }

    for (const agentId of dependencyMap?.createdPaymentAgentIds ?? []) {
      const agent = await paymentAgentsService.getPaymentAgentById(agentId);
      if (!agent) continue;
      const stillUsed = activeOthers.some((activeOrder) => (activeOrder.paymentAgentId || activeOrder.paymentBy) === agentId);
      if (stillUsed) continue;
      const recycleEntry = await createRecycleEntry({
        id: deterministicRecycleBinId("paymentAgent", agent.id),
        itemId: agent.id,
        itemType: "paymentAgent",
        label: agent.name || agent.id,
        originalReference: agent.agentCode || agent.id,
        sourceOrderId: order.id,
        snapshot: agent as unknown as Record<string, unknown>,
        deletedAt: new Date().toISOString(),
        deletedBy,
        status: "deleted",
      });
      await paymentAgentsService.upsertPaymentAgent({
        ...agent,
        status: "inactive",
        lifecycle: ensureLifecycle(agent.lifecycle, {
          type: "paymentAgent",
          status: "deleted",
          sourceType: agent.lifecycle?.sourceType ?? "order",
          sourceOrderId: order.id,
          createdByOrder: true,
          deletedAt: recycleEntry.deletedAt,
          deletedBy,
          recycleBinEntryId: recycleEntry.id,
        }),
      });
    }

    const referenceIds = unique([
      ...(dependencyMap?.linkedWechatReferenceIds ?? []),
      ...(dependencyMap?.linkedMarkaReferenceIds ?? []),
      ...(dependencyMap?.linkedDetailReferenceIds ?? []),
      ...(dependencyMap?.linkedOrderNumberReferenceIds ?? []),
    ]);

    for (const referenceId of referenceIds) {
      const record = await referenceService.getReferenceRecordById(referenceId);
      if (!record) continue;
      const stillUsed = activeOthers.some((activeOrder) => orderUsesReference(activeOrder, record.type, record.value));
      if (stillUsed) continue;
      const recycleEntry = await createRecycleEntry({
        id: deterministicRecycleBinId("reference", record.id),
        itemId: record.id,
        itemType: "reference",
        referenceType: record.type,
        label: createReferenceSnapshotLabel(record),
        originalReference: record.value,
        sourceOrderId: order.id,
        snapshot: record as unknown as Record<string, unknown>,
        deletedAt: new Date().toISOString(),
        deletedBy,
        status: "deleted",
      });
      await referenceService.upsertReferenceRecord({
        ...record,
        status: "inactive",
        lifecycle: ensureLifecycle(record.lifecycle, {
          type: "reference",
          status: "deleted",
          sourceType: record.lifecycle?.sourceType ?? "order",
          sourceOrderId: order.id,
          createdByOrder: record.lifecycle?.createdByOrder ?? true,
          deletedAt: recycleEntry.deletedAt,
          deletedBy,
          recycleBinEntryId: recycleEntry.id,
        }),
      });
    }

    const recycleEntry = await createRecycleEntry({
      id: deterministicRecycleBinId("order", order.id),
      itemId: order.id,
      itemType: "order",
      label: order.number || order.orderNumber || order.id,
      originalReference: order.number || order.orderNumber || order.id,
      sourceOrderId: order.id,
      snapshot: order as unknown as Record<string, unknown>,
      deletedAt: new Date().toISOString(),
      deletedBy,
      status: "deleted",
    });

    const nextOrder: Order = {
      ...order,
      status: "archived",
      lifecycle: ensureLifecycle(order.lifecycle, {
        type: "order",
        status: "deleted",
        sourceType: order.lifecycle?.sourceType ?? "manual",
        deletedAt: recycleEntry.deletedAt,
        deletedBy,
        recycleBinEntryId: recycleEntry.id,
      }),
      dependencyMap: {
        ...order.dependencyMap,
        previousStatus: order.status,
      },
    };

    await ordersService.upsertOrder(nextOrder);
    return nextOrder;
  },

  async restoreOrder(orderId: string, restoredBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return null;
    const ordersService = getOrdersService();
    const order = await ordersService.getOrderById(orderId);
    if (!order) throw new Error("Order not found.");
    const productsService = getProductsService();
    const customersService = getCustomersService();
    const paymentAgentsService = getPaymentAgentsService();
    const referenceService = await getReferenceRecordsFirebaseService();
    const recycleBin = await getRecycleBinFirebaseService();
    const now = new Date().toISOString();

    for (const productId of order.dependencyMap?.createdProductIds ?? []) {
      const product = await productsService.getProductById(productId);
      if (!product) continue;
      await productsService.upsertProduct({
        ...product,
        status: "active",
        lifecycle: ensureLifecycle(product.lifecycle, {
          type: "product",
          status: "active",
          sourceType: product.lifecycle?.sourceType ?? "order",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      if (product.lifecycle?.recycleBinEntryId) {
        await markRecycleEntryRestored(product.lifecycle.recycleBinEntryId, await recycleBin.getRecycleBinEntryById(product.lifecycle.recycleBinEntryId), restoredBy);
      }
    }

    for (const customerId of order.dependencyMap?.createdCustomerIds ?? []) {
      const customer = await customersService.getCustomerById(customerId);
      if (!customer || !customersService.upsertCustomer) continue;
      await customersService.upsertCustomer({
        ...customer,
        status: "active",
        lifecycle: ensureLifecycle(customer.lifecycle, {
          type: "customer",
          status: "active",
          sourceType: customer.lifecycle?.sourceType ?? "order",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      if (customer.lifecycle?.recycleBinEntryId) {
        await markRecycleEntryRestored(customer.lifecycle.recycleBinEntryId, await recycleBin.getRecycleBinEntryById(customer.lifecycle.recycleBinEntryId), restoredBy);
      }
    }

    for (const agentId of order.dependencyMap?.createdPaymentAgentIds ?? []) {
      const agent = await paymentAgentsService.getPaymentAgentById(agentId);
      if (!agent) continue;
      await paymentAgentsService.upsertPaymentAgent({
        ...agent,
        status: "active",
        lifecycle: ensureLifecycle(agent.lifecycle, {
          type: "paymentAgent",
          status: "active",
          sourceType: agent.lifecycle?.sourceType ?? "order",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      if (agent.lifecycle?.recycleBinEntryId) {
        await markRecycleEntryRestored(agent.lifecycle.recycleBinEntryId, await recycleBin.getRecycleBinEntryById(agent.lifecycle.recycleBinEntryId), restoredBy);
      }
    }

    const referenceIds = unique([
      ...(order.dependencyMap?.linkedWechatReferenceIds ?? []),
      ...(order.dependencyMap?.linkedMarkaReferenceIds ?? []),
      ...(order.dependencyMap?.linkedDetailReferenceIds ?? []),
      ...(order.dependencyMap?.linkedOrderNumberReferenceIds ?? []),
    ]);
    for (const referenceId of referenceIds) {
      const record = await referenceService.getReferenceRecordById(referenceId);
      if (!record) continue;
      await referenceService.upsertReferenceRecord({
        ...record,
        status: "active",
        lifecycle: ensureLifecycle(record.lifecycle, {
          type: "reference",
          status: "active",
          sourceType: record.lifecycle?.sourceType ?? "order",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      if (record.lifecycle?.recycleBinEntryId) {
        await markRecycleEntryRestored(record.lifecycle.recycleBinEntryId, await recycleBin.getRecycleBinEntryById(record.lifecycle.recycleBinEntryId), restoredBy);
      }
    }

    const restoredOrder: Order = {
      ...order,
      status: order.dependencyMap?.previousStatus && order.dependencyMap.previousStatus !== "archived" ? order.dependencyMap.previousStatus : "saved",
      lifecycle: ensureLifecycle(order.lifecycle, {
        type: "order",
        status: "active",
        sourceType: order.lifecycle?.sourceType ?? "manual",
        restoredAt: now,
        restoredBy,
        deletedAt: undefined,
        deletedBy: undefined,
      }),
    };

    await ordersService.upsertOrder(restoredOrder);
    if (order.lifecycle?.recycleBinEntryId) {
      await markRecycleEntryRestored(order.lifecycle.recycleBinEntryId, await recycleBin.getRecycleBinEntryById(order.lifecycle.recycleBinEntryId), restoredBy);
    }
    await paymentAgentsService.applyOrderSettlement?.(restoredOrder);
    if (customersDataSourceSelection().source === "firebase") {
      await customerLedgerService.applyOrderCustomerReceivables(restoredOrder);
    }
    return restoredOrder;
  },

  async restoreRecycleBinItem(entryId: string, restoredBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return null;
    const recycleBin = await getRecycleBinFirebaseService();
    const referenceService = await getReferenceRecordsFirebaseService();
    const productsService = getProductsService();
    const customersService = getCustomersService();
    const paymentAgentsService = getPaymentAgentsService();
    const entry = await recycleBin.getRecycleBinEntryById(entryId);
    if (!entry) throw new Error("Recycle bin entry not found.");
    const now = new Date().toISOString();

    if (entry.itemType === "order") return this.restoreOrder(entry.itemId, restoredBy);
    if (entry.itemType === "product") {
      const product = await productsService.getProductById(entry.itemId);
      if (!product) throw new Error("Product not found.");
      await productsService.upsertProduct({
        ...product,
        status: "active",
        lifecycle: ensureLifecycle(product.lifecycle, {
          type: "product",
          status: "active",
          sourceType: product.lifecycle?.sourceType ?? "manual",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      await markRecycleEntryRestored(entry.id, entry, restoredBy);
      return product;
    }
    if (entry.itemType === "customer") {
      const customer = await customersService.getCustomerById(entry.itemId);
      if (!customer || !customersService.upsertCustomer) throw new Error("Customer not found.");
      await customersService.upsertCustomer({
        ...customer,
        status: "active",
        lifecycle: ensureLifecycle(customer.lifecycle, {
          type: "customer",
          status: "active",
          sourceType: customer.lifecycle?.sourceType ?? "manual",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      await markRecycleEntryRestored(entry.id, entry, restoredBy);
      return customer;
    }
    if (entry.itemType === "paymentAgent") {
      const agent = await paymentAgentsService.getPaymentAgentById(entry.itemId);
      if (!agent) throw new Error("Payment agent not found.");
      await paymentAgentsService.upsertPaymentAgent({
        ...agent,
        status: "active",
        lifecycle: ensureLifecycle(agent.lifecycle, {
          type: "paymentAgent",
          status: "active",
          sourceType: agent.lifecycle?.sourceType ?? "manual",
          restoredAt: now,
          restoredBy,
          deletedAt: undefined,
          deletedBy: undefined,
        }),
      });
      await markRecycleEntryRestored(entry.id, entry, restoredBy);
      return agent;
    }
    const record = await referenceService.getReferenceRecordById(entry.itemId);
    if (!record) throw new Error("Reference record not found.");
    await referenceService.upsertReferenceRecord({
      ...record,
      status: "active",
      lifecycle: ensureLifecycle(record.lifecycle, {
        type: "reference",
        status: "active",
        sourceType: record.lifecycle?.sourceType ?? "manual",
        restoredAt: now,
        restoredBy,
        deletedAt: undefined,
        deletedBy: undefined,
      }),
    });
    await markRecycleEntryRestored(entry.id, entry, restoredBy);
    return record;
  },

  async safeDeleteProduct(productId: string, deletedBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return null;
    const productsService = getProductsService();
    const ordersService = getOrdersService();
    const product = await productsService.getProductById(productId);
    if (!product) throw new Error("Product not found.");
    const activeOrders = (await ordersService.listOrders()).filter(isActiveOrder);
    const inUse = activeOrders.some((order) => (product.sourceOrderIds ?? []).includes(order.id));
    if (inUse) throw new Error("Product is still used by an active order and cannot be deleted.");
    const recycleEntry = await createRecycleEntry({
      id: deterministicRecycleBinId("product", product.id),
      itemId: product.id,
      itemType: "product",
      label: product.name || product.id,
      originalReference: product.productCode || product.sku || product.id,
      sourceOrderId: product.sourceOrderId,
      snapshot: product as unknown as Record<string, unknown>,
      deletedAt: new Date().toISOString(),
      deletedBy,
      status: "deleted",
    });
    await productsService.upsertProduct({
      ...product,
      status: "inactive",
      lifecycle: ensureLifecycle(product.lifecycle, {
        type: "product",
        status: "deleted",
        sourceType: product.lifecycle?.sourceType ?? (product.source === "order-line" ? "order" : "manual"),
        sourceOrderId: product.sourceOrderId,
        deletedAt: recycleEntry.deletedAt,
        deletedBy,
        recycleBinEntryId: recycleEntry.id,
      }),
    });
    return recycleEntry;
  },

  async safeDeleteCustomer(customerId: string, deletedBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return null;
    const customersService = getCustomersService();
    const ordersService = getOrdersService();
    const customer = await customersService.getCustomerById(customerId);
    if (!customer || !customersService.upsertCustomer) throw new Error("Customer not found.");
    if (!customer.lifecycle?.createdByOrder) throw new Error("Only customers created from an order can be deleted from here.");
    const activeOrders = (await ordersService.listOrders()).filter(isActiveOrder);
    const inUse = activeOrders.some((order) => order.lines.some((line) => line.customerId === customerId));
    if (inUse) throw new Error("Customer is still used by an active order and cannot be deleted.");
    const recycleEntry = await createRecycleEntry({
      id: deterministicRecycleBinId("customer", customer.id),
      itemId: customer.id,
      itemType: "customer",
      label: customer.displayName || customer.name || customer.id,
      originalReference: customer.customerCode || customer.id,
      sourceOrderId: customer.lifecycle?.sourceOrderId,
      snapshot: customer as unknown as Record<string, unknown>,
      deletedAt: new Date().toISOString(),
      deletedBy,
      status: "deleted",
    });
    await customersService.upsertCustomer({
      ...customer,
      status: "inactive",
      lifecycle: ensureLifecycle(customer.lifecycle, {
        type: "customer",
        status: "deleted",
        sourceType: customer.lifecycle?.sourceType ?? "order",
        deletedAt: recycleEntry.deletedAt,
        deletedBy,
        recycleBinEntryId: recycleEntry.id,
      }),
    });
    return recycleEntry;
  },

  async safeDeletePaymentAgent(agentId: string, deletedBy = "system") {
    if (!isFirebaseLifecycleEnabled()) return null;
    const paymentAgentsService = getPaymentAgentsService();
    const ordersService = getOrdersService();
    const agent = await paymentAgentsService.getPaymentAgentById(agentId);
    if (!agent) throw new Error("Payment agent not found.");
    if (!agent.lifecycle?.createdByOrder) throw new Error("Only payment agents created from an order can be deleted from here.");
    const activeOrders = (await ordersService.listOrders()).filter(isActiveOrder);
    const inUse = activeOrders.some((order) => (order.paymentAgentId || order.paymentBy) === agentId);
    if (inUse) throw new Error("Payment agent is still used by an active order and cannot be deleted.");
    const recycleEntry = await createRecycleEntry({
      id: deterministicRecycleBinId("paymentAgent", agent.id),
      itemId: agent.id,
      itemType: "paymentAgent",
      label: agent.name || agent.id,
      originalReference: agent.agentCode || agent.id,
      sourceOrderId: agent.lifecycle?.sourceOrderId,
      snapshot: agent as unknown as Record<string, unknown>,
      deletedAt: new Date().toISOString(),
      deletedBy,
      status: "deleted",
    });
    await paymentAgentsService.upsertPaymentAgent({
      ...agent,
      status: "inactive",
      lifecycle: ensureLifecycle(agent.lifecycle, {
        type: "paymentAgent",
        status: "deleted",
        sourceType: agent.lifecycle?.sourceType ?? "order",
        deletedAt: recycleEntry.deletedAt,
        deletedBy,
        recycleBinEntryId: recycleEntry.id,
      }),
    });
    return recycleEntry;
  },
};
