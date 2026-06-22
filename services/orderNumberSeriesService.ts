import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ordersDataSourceSelection } from "@/lib/runtimeConfig";
import type { OrderNumberSeriesService } from "@/services/contracts";
import { orderNumberSeriesMockService } from "@/services/mock/orderNumberSeriesMockService";

export function getOrderNumberSeriesService(): OrderNumberSeriesService {
  const selection = ordersDataSourceSelection();
  if (selection.source !== "firebase") {
    return orderNumberSeriesMockService;
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase mode selected for orders but Firebase is not configured.");
  return {
    async listOrderNumberSeries(orders) {
      const { orderNumberSeriesFirebaseService } = await import("@/services/firebase/orderNumberSeriesFirebaseService");
      return orderNumberSeriesFirebaseService.listOrderNumberSeries(orders);
    },
    async createOrderNumberSeries(input, orders) {
      const { orderNumberSeriesFirebaseService } = await import("@/services/firebase/orderNumberSeriesFirebaseService");
      return orderNumberSeriesFirebaseService.createOrderNumberSeries(input, orders);
    },
    async syncOrderNumberSeriesFromOrder(order, orders) {
      const { orderNumberSeriesFirebaseService } = await import("@/services/firebase/orderNumberSeriesFirebaseService");
      return orderNumberSeriesFirebaseService.syncOrderNumberSeriesFromOrder(order, orders);
    },
    async deleteOrderNumberSeries(id, orders) {
      const { orderNumberSeriesFirebaseService } = await import("@/services/firebase/orderNumberSeriesFirebaseService");
      return orderNumberSeriesFirebaseService.deleteOrderNumberSeries?.(id, orders);
    },
  };
}
