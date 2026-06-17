"use client";

import { PageShell } from "@/components/PageShell";
import { formatAmount, formatDate } from "@/lib/data";
import { formatWholeMoney } from "@/lib/numbers";
import { useStore } from "@/lib/store";
import { useSuppliers } from "@/hooks/useSuppliers";
import { getUniqueSupplierGroups, getWechatSupplierGroups, isSupplierSourceOrder } from "@/services/supplierSelectors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/StatCard";
import { TablePagination } from "@/components/table/TablePagination";
import { Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { logPageAccess, logDataFlow } from "@/lib/logger";
import { useOrders } from "@/hooks/useOrders";
import { ordersDataSource } from "@/lib/runtimeConfig";

const PAGE_SIZE = 100;

export default function SuppliersPage() {
  const { orders, pushToast } = useStore();
  const { data: remoteOrders, isLoading: ordersLoading } = useOrders();
  const { isLoading: suppliersLoading } = useSuppliers();
  const ordersSource = ordersDataSource();
  const isFirebaseOrdersMode = ordersSource === "firebase";
  const [tab, setTab] = useState<"wechat" | "unique">("wechat");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const sourceOrders = useMemo(() => {
    const base = isFirebaseOrdersMode ? remoteOrders : orders;
    return base.filter(isSupplierSourceOrder);
  }, [isFirebaseOrdersMode, remoteOrders, orders]);

  const wechatGroups = useMemo(() => getWechatSupplierGroups(sourceOrders), [sourceOrders]);
  const uniqueGroups = useMemo(() => getUniqueSupplierGroups(sourceOrders), [sourceOrders]);

  const filteredWechat = useMemo(
    () =>
      wechatGroups.filter((g) =>
        [g.wechatId, ...g.orders.map((o: any) => o.orderNumber), ...g.orders.flatMap((o: any) => o.lines.map((l: any) => l.supplierName))]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [wechatGroups, query],
  );

  const filteredUnique = useMemo(
    () =>
      uniqueGroups.filter((g) =>
        [g.supplierName, ...g.entries.map((e: any) => `${e.wechatId} ${e.orderNumber}`)]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [uniqueGroups, query],
  );

  const activeRows = tab === "wechat" ? filteredWechat : filteredUnique;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const pagedWechat = useMemo(
    () => filteredWechat.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredWechat, currentPage],
  );
  const pagedUnique = useMemo(
    () => filteredUnique.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredUnique, currentPage],
  );

  const explainDerivedDelete = (relatedCount: number, sampleOrderNumbers: string[]) => {
    const hint = sampleOrderNumbers.length ? ` Related orders: ${sampleOrderNumbers.join(", ")}${relatedCount > sampleOrderNumbers.length ? "..." : ""}.` : "";
    pushToast({ tone: "info", text: `Supplier is derived from saved orders. To remove this supplier, edit or archive the related saved orders. (${relatedCount} related orders).${hint}` });
  };

  useEffect(() => {
    logPageAccess("Suppliers", { component: "app/suppliers/page.tsx", source: ordersSource });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setExpanded(null);
  }, [query, tab]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const suppliersFlowLoggedRef = useRef(false);
  useEffect(() => {
    if (suppliersFlowLoggedRef.current) return;
    if (ordersLoading || suppliersLoading) return;
    suppliersFlowLoggedRef.current = true;
    logDataFlow("Suppliers", {
      source: ordersSource,
      functionsCalled: ["useOrders.reload"],
      dbPaths: ["businesses/{businessId}/orders"],
      counts: {
        ordersCount: (isFirebaseOrdersMode ? remoteOrders : orders).length,
        savedOrdersCount: sourceOrders.length,
        wechatGroups: filteredWechat.length,
        uniqueSupplierGroups: filteredUnique.length,
      },
      samples: {
        wechat: filteredWechat.slice(0, 5).map((g) => ({ wechatId: g.wechatId, totalOrders: g.totalOrders, totalLineCount: g.totalLineCount, totalAmount: g.totalAmount })),
        unique: filteredUnique.slice(0, 5).map((g) => ({ supplier: g.supplierName, totalOrders: g.totalOrders, totalLineCount: g.totalLineCount, totalAmount: g.totalAmount })),
      },
      result: { reachedComponent: true, renderedGroups: tab === "wechat" ? filteredWechat.length : filteredUnique.length },
    });
  }, [ordersLoading, suppliersLoading, filteredWechat.length, filteredUnique.length, isFirebaseOrdersMode, remoteOrders, orders, sourceOrders.length, ordersSource, tab]);

  return (
    <PageShell title="Suppliers">
      <div className="space-y-4 p-6">
        <div className="flex gap-2">
          <Button variant={tab === "wechat" ? "primary" : "secondary"} size="sm" onClick={() => setTab("wechat")}>WeChat IDs</Button>
          <Button variant={tab === "unique" ? "primary" : "secondary"} size="sm" onClick={() => setTab("unique")}>Unique Suppliers</Button>
        </div>

        <div className="min-w-[280px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "wechat" ? "Search by wechat, order, supplier..." : "Search by supplier, wechat, order..."}
            leadingIcon={<Search size={14} />}
          />
        </div>

        {isFirebaseOrdersMode && ordersLoading ? (
          <div className="card p-4 text-sm text-fg-subtle">Loading supplier activity from Firestore orders...</div>
        ) : sourceOrders.length === 0 ? (
          <div className="card p-4 text-sm text-fg-subtle">No supplier activity yet. Save orders with WeChat ID and supplier names to see data here.</div>
        ) : tab === "wechat" ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total WeChat IDs" value={filteredWechat.length.toString()} />
              <StatCard label="Total Orders" value={filteredWechat.reduce((s, g) => s + g.totalOrders, 0).toString()} />
              <StatCard label="Total Supplier Entries" value={filteredWechat.reduce((s, g) => s + g.totalLineCount, 0).toString()} />
              <StatCard label="Total Amount" value={formatWholeMoney(filteredWechat.reduce((s, g) => s + g.totalAmount, 0))} />
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left">WeChat ID</th>
                    <th className="text-left">Orders</th>
                    <th className="text-left">Suppliers</th>
                    <th className="text-left">Amount</th>
                    <th className="text-left">Last Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedWechat.map((g) => (
                    <Fragment key={g.wechatId}>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{g.wechatId}</td>
                        <td>{g.totalOrders}</td>
                        <td>{g.totalSuppliers}</td>
                        <td className={g.totalAmount > 0 ? "" : "text-[var(--danger)]"}>{formatWholeMoney(g.totalAmount)}</td>
                        <td>{g.lastOrderDate ? formatDate(g.lastOrderDate) : "—"}</td>
                        <td className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setExpanded(expanded === g.wechatId ? null : g.wechatId)}>View Details</Button>
                          <Button size="sm" variant="secondary" title="Supplier is derived from saved orders." onClick={() => explainDerivedDelete(g.totalOrders, g.orders.slice(0, 3).map((o: any) => o.orderNumber))}>Delete</Button>
                        </td>
                      </tr>
                      {expanded === g.wechatId ? (
                        <tr>
                          <td colSpan={6} className="bg-bg-subtle px-3 py-2">
                            {g.orders.map((o: any) => (
                              <div key={o.orderId} className="mb-2">
                                <div className="text-[12px] font-medium">{o.orderNumber} · {formatDate(o.date)}</div>
                                {o.lines.map((l: any) => (
                                  <div key={l.lineId} className="text-[12px] text-fg-subtle">{l.supplierName} · {formatWholeMoney(l.amount)} · CTNs {l.totalCtns} · PCS {l.totalPcs} · {l.customerName || "Not Linked"} · Marka: {l.marka || "—"} · Details: {l.details || "—"}</div>
                                ))}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <TablePagination total={filteredWechat.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="supplier groups" />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Unique Suppliers" value={filteredUnique.length.toString()} />
              <StatCard label="Total Orders" value={filteredUnique.reduce((s, g) => s + g.totalOrders, 0).toString()} />
              <StatCard label="Total WeChat IDs" value={filteredUnique.reduce((s, g) => s + g.totalWechatIds, 0).toString()} />
              <StatCard label="Total Amount" value={formatWholeMoney(filteredUnique.reduce((s, g) => s + g.totalAmount, 0))} />
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left">Supplier</th>
                    <th className="text-left">Orders</th>
                    <th className="text-left">WeChat IDs</th>
                    <th className="text-left">Amount</th>
                    <th className="text-left">Last Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedUnique.map((g) => (
                    <Fragment key={g.supplierKey}>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{g.supplierName}</td>
                        <td>{g.totalOrders}</td>
                        <td>{g.totalWechatIds}</td>
                        <td className={g.totalAmount > 0 ? "" : "text-[var(--danger)]"}>{formatWholeMoney(g.totalAmount)}</td>
                        <td>{g.lastOrderDate ? formatDate(g.lastOrderDate) : "—"}</td>
                        <td className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setExpanded(expanded === g.supplierKey ? null : g.supplierKey)}>View Details</Button>
                          <Button size="sm" variant="secondary" title="Supplier is derived from saved orders." onClick={() => explainDerivedDelete(g.totalOrders, g.entries.slice(0, 3).map((e: any) => e.orderNumber))}>Delete</Button>
                        </td>
                      </tr>
                      {expanded === g.supplierKey ? (
                        <tr>
                          <td colSpan={6} className="bg-bg-subtle px-3 py-2">
                            {g.entries.map((e: any) => (
                              <div key={e.lineId} className="text-[12px] text-fg-subtle">{e.orderNumber} · {e.wechatId || "—"} · {formatDate(e.date)} · {formatWholeMoney(e.amount)} · Marka: {e.marka || "—"} · Details: {e.details || "—"}</div>
                            ))}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <TablePagination total={filteredUnique.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="suppliers" />
            </div>
          </>
        )}

        <div className="text-xs text-fg-subtle">Suppliers are derived from saved orders (WeChat header + line supplier names). To remove supplier activity, archive or edit the related saved orders.</div>
      </div>
    </PageShell>
  );
}
