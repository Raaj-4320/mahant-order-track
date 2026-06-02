"use client";

import { PageShell } from "@/components/PageShell";
import { TablePagination } from "@/components/table/TablePagination";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { formatAmount } from "@/lib/data";
import { lineTotalPcs, lineTotalRmb, orderTotal, type Customer, type Order } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { joinLineDetails } from "@/lib/orderLineDetails";
import { Download, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";

type CustomerOrderLineRow = {
  orderId: string;
  orderNumber: string;
  wechatId: string;
  orderDate: string;
  productImage: string;
  dimImage: string;
  marka: string;
  details1: string;
  details2: string;
  details3: string;
  ctn: number;
  pcsPerCtn: number;
  totalPieces: number;
  totalAmount: number;
};

type CustomerSummaryRow = {
  customer: Customer;
  latestOrderDate: string;
  latestOrderAmount: number;
  latestProductImage: string;
  latestProductMarka: string;
  totalOrders: number;
  totalOrdersAmount: number;
  allLineRows: CustomerOrderLineRow[];
};

const getLineImage = (line: Order["lines"][number]) => {
  const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
  return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
};

const getLineDimImage = (line: Order["lines"][number]) => {
  const candidate = line as Order["lines"][number] & { dimensionPhotoUrl?: string; sizePhotoUrl?: string };
  return candidate.photoUrl || candidate.dimensionPhotoUrl || candidate.sizePhotoUrl || "";
};

const sameCustomer = (line: Order["lines"][number], customer: Customer) => {
  const customerName = (customer.displayName || customer.name || "").trim().toLowerCase();
  const lineCustomerName = (line.customerName || line.customerSnapshot?.name || "").trim().toLowerCase();
  return line.customerId === customer.id || (Boolean(customerName) && lineCustomerName === customerName);
};

export default function CustomersPage() {
  const { data: customers, isLoading, error } = useCustomers();
  const { data: firebaseOrders } = useOrders();
  const { orders: localOrders } = useStore();
  const source = ordersDataSource();
  const orders = source === "firebase" ? firebaseOrders : localOrders;

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [viewCustomerId, setViewCustomerId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [exportTick, setExportTick] = useState(0);
  void exportTick;

  const summaries = useMemo(() => {
const rows: CustomerSummaryRow[] = customers.map((customer) => {
      const matchedOrders = orders.filter((order) => order.lines.some((line) => sameCustomer(line, customer)));
      const orderRows: CustomerOrderLineRow[] = matchedOrders.flatMap((order) =>
        order.lines
          .filter((line) => sameCustomer(line, customer))
          .map((line) => {
            const totalPieces = lineTotalPcs(line);
            const totalAmount = lineTotalRmb(line);
            return {
              orderId: order.id,
              orderNumber: order.number || order.orderNumber || "—",
              wechatId: order.wechatId || "—",
              orderDate: order.updatedAt || order.createdAt || order.date || "",
              productImage: getLineImage(line),
              dimImage: getLineDimImage(line),
              marka: line.marka || "—",
              details1: line.detail1 || line.details || "",
              details2: line.detail2 || "",
              details3: line.detail3 || "",
              ctn: Number(line.totalCtns) || 0,
              pcsPerCtn: Number(line.pcsPerCtn) || 0,
              totalPieces,
              totalAmount,
            };
          }),
      );

      const latestOrder = [...matchedOrders].sort((a, b) => {
        const ad = a.updatedAt || a.createdAt || a.date || "";
        const bd = b.updatedAt || b.createdAt || b.date || "";
        return bd.localeCompare(ad);
      })[0];
      const latestLine =
        latestOrder?.lines.find((line) => sameCustomer(line, customer)) ||
        latestOrder?.lines[0] ||
        null;

      return {
        customer,
        latestOrderDate: latestOrder?.updatedAt || latestOrder?.createdAt || latestOrder?.date || "",
        latestOrderAmount: latestOrder ? orderTotal(latestOrder) : 0,
        latestProductImage: latestLine ? getLineImage(latestLine) : "",
        latestProductMarka: latestLine?.marka || "—",
        totalOrders: matchedOrders.length,
        totalOrdersAmount: matchedOrders.reduce((sum, order) => sum + orderTotal(order), 0),
        allLineRows: orderRows.sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
      };
    });
return rows;
  }, [customers, orders, source]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = summaries.filter((row) => {
      if (!q) return true;
      const name = (row.customer.displayName || row.customer.name || "").toLowerCase();
      const wechat = row.allLineRows.map((line) => line.wechatId.toLowerCase()).join(" ");
      const marka = row.allLineRows.map((line) => line.marka.toLowerCase()).join(" ");
      const orderNo = row.allLineRows.map((line) => line.orderNumber.toLowerCase()).join(" ");
      return [name, wechat, marka, orderNo].join(" ").includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "total_orders") return b.totalOrders - a.totalOrders;
      if (sortBy === "total_amount") return b.totalOrdersAmount - a.totalOrdersAmount;
      if (sortBy === "last_amount") return b.latestOrderAmount - a.latestOrderAmount;
      if (sortBy === "latest_date") return b.latestOrderDate.localeCompare(a.latestOrderDate);
      return (a.customer.displayName || a.customer.name || "").localeCompare(b.customer.displayName || b.customer.name || "");
    });
  }, [summaries, query, sortBy]);

  const activeSummary = filteredAndSorted.find((row) => row.customer.id === viewCustomerId) || null;

  const exportVisible = () => {
const header = [
      "Customer Name",
      "Last Order Product Marka Name",
      "Last Order Total Amount",
      "Total Orders",
      "Total Orders Total Amount",
    ];
    const rows = filteredAndSorted.map((row) => [
      row.customer.displayName || row.customer.name || "—",
      row.latestProductMarka || "—",
      row.latestOrderAmount.toFixed(2),
      String(row.totalOrders),
      row.totalOrdersAmount.toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer-order-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
    setExportTick((x) => x + 1);
};

  return (
    <PageShell title="Customers">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">

        </div>

        <div className="card flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-[280px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer name, WeChat ID, marka, order number..."
              leadingIcon={<Search size={14} />}
            />
          </div>
          <div className="w-[200px]">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: "name", label: "Sort: Customer Name" },
                { value: "total_orders", label: "Sort: Total Orders" },
                { value: "total_amount", label: "Sort: Total Orders Total Amount" },
                { value: "last_amount", label: "Sort: Last Order Amount" },
                { value: "latest_date", label: "Sort: Latest Order Date" },
              ]}
            />
          </div>
          <Button size="sm" variant="secondary" disabled title="Additional filtering is not enabled in this phase.">
            <Filter size={14} />
            Filter
          </Button>
          <Button size="sm" variant="secondary" onClick={exportVisible}>
            <Download size={14} />
            Export
          </Button>
        </div>

        {error ? <div className="text-[12px] text-fg-subtle">{error}</div> : null}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1140px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[13x] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Customer Name</th>
                  <th>Last Order Product</th>
                  <th>Last Order Product Marka</th>
                  <th>Last Order Amount</th>
                  <th>Total Orders</th>
                  <th>Total Purchase Amount</th>
                  <th className="px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((row) => (
                  <tr key={row.customer.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{row.customer.displayName || row.customer.name || "—"}</div>
                      <div className="text-[11.5px] text-fg-subtle">{row.customer.customerCode}</div>
                    </td>
                    <td>
                      <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">
                        {row.latestProductImage ? (
                          <button
                            type="button"
                            className="h-full w-full cursor-zoom-in"
                            onClick={() => setPreviewImage(row.latestProductImage)}
                          >
                            <img
                              src={getCloudinaryOptimizedUrl(row.latestProductImage, { width: 140, height: 140, crop: "fit" })}
                              alt="latest product"
                              className="h-full w-full object-contain"
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                        ) : (
                          <span className="text-[10px] text-fg-subtle">—</span>
                        )}
                      </div>
                    </td>
                    <td>{row.latestProductMarka || "—"}</td>
                    <td className="tabular-nums">{formatAmount(row.latestOrderAmount)}</td>
                    <td>{row.totalOrders}</td>
                    <td className="font-semibold tabular-nums">{formatAmount(row.totalOrdersAmount)}</td>
                    <td className="px-4">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {

setViewCustomerId(row.customer.id);
                          }}
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">
                      Loading customers…
                    </td>
                  </tr>
                ) : null}
                {!isLoading && filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">
                      No customer summaries found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination total={filteredAndSorted.length} />
        </div>

        {activeSummary ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="card w-full max-w-[1400px] space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">
                  Customer Orders - {activeSummary.customer.displayName || activeSummary.customer.name}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setViewCustomerId(null)}>
                  Close
                </Button>
              </div>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[1320px] text-[13px]">
                  <thead className="bg-bg-subtle">
                    <tr className="text-left uppercase text-fg-subtle">
                      <th className="px-2 py-2">Order Number</th>
                      <th className="px-2 py-2">WeChat ID</th>
                      <th className="px-2 py-2">Dimension Image</th>
                      <th className="px-2 py-2">Product Image</th>
                      <th className="px-2 py-2">Marka Name</th>
                      <th className="px-2 py-2">Details</th>
                      <th className="px-2 py-2 text-center">CTN</th>
                      <th className="px-2 py-2 text-center">PCS/CTN</th>
                      <th className="px-2 py-2 text-center">Total Pieces</th>
                      <th className="px-2 py-2 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSummary.allLineRows.map((row, idx) => {
                      const details = [row.details1, row.details2, row.details3].filter(Boolean);
                      return (
                        <tr key={`${row.orderId}-${idx}`} className="border-t border-border">
                          <td className="px-2 py-2">{row.orderNumber}</td>
                          <td className="px-2 py-2">{row.wechatId || "—"}</td>
                          <td className="px-2 py-2">
                            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded border border-border bg-bg-subtle">
                              {row.dimImage ? (
                                <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(row.dimImage)}>
                                  <img
                                    src={getCloudinaryOptimizedUrl(row.dimImage, { width: 120, height: 120, crop: "fit" })}
                                    alt="dim"
                                    className="h-full w-full object-contain"
                                  />
                                </button>
                              ) : (
                                <span className="text-[10px] text-fg-subtle">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded border border-border bg-bg-subtle">
                              {row.productImage ? (
                                <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(row.productImage)}>
                                  <img
                                    src={getCloudinaryOptimizedUrl(row.productImage, { width: 120, height: 120, crop: "fit" })}
                                    alt="product"
                                    className="h-full w-full object-contain"
                                  />
                                </button>
                              ) : (
                                <span className="text-[10px] text-fg-subtle">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">{row.marka || "—"}</td>
                          <td className="px-2 py-2">
                            {details.length ? (
                              <div className="space-y-1">
                                <div>{details[0] || "—"}</div>
                                {details[1] ? <div>{details[1]}</div> : null}
                                {details[2] ? <div>{details[2]}</div> : null}
                              </div>
                            ) : (
                              joinLineDetails({ details: row.details1 }) || "—"
                            )}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">{row.ctn}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{row.pcsPerCtn}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{row.totalPieces}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatAmount(row.totalAmount)}</td>
                        </tr>
                      );
                    })}
                    {activeSummary.allLineRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-2 py-8 text-center text-fg-subtle">
                          No orders found for this customer.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        <ImageLightbox src={previewImage} alt="Customer order line image" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
      </div>
    </PageShell>
  );
}

