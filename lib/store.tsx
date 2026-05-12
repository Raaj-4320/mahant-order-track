"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { initialOrders } from "./data";
import { Order, OrderLine } from "./types";

type Toast = { id: number; text: string; tone: "success" | "info" | "danger" };

type StoreCtx = {
  orders: Order[];
  selectedOrderId: string | null;
  selectOrder: (id: string | null) => void;
  upsertOrder: (o: Order) => void;
  deleteLine: (orderId: string, lineId: string) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
};

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders[0]?.id ?? null
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 2600);
  }, []);

  const upsertOrder = useCallback((o: Order) => {
    setOrders((prev) => {
      const exists = prev.some((p) => p.id === o.id);
      if (exists) return prev.map((p) => (p.id === o.id ? o : p));
      return [o, ...prev];
    });
    setSelectedOrderId(o.id);
  }, []);

  const deleteLine = useCallback((orderId: string, lineId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, lines: o.lines.filter((l: OrderLine) => l.id !== lineId) }
          : o
      )
    );
  }, []);

  const value = useMemo(
    () => ({
      orders,
      selectedOrderId,
      selectOrder: setSelectedOrderId,
      upsertOrder,
      deleteLine,
      toasts,
      pushToast,
    }),
    [orders, selectedOrderId, upsertOrder, deleteLine, toasts, pushToast]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}
