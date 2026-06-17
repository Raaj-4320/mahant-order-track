"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Printer, Search, Trash2, X } from "lucide-react";
import { TablePagination } from "@/components/table/TablePagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { usePaymentAgents } from "@/hooks/usePaymentAgents";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { formatAmount, formatDate } from "@/lib/data";
import { formatWholeMoney } from "@/lib/numbers";
import { joinLineDetails } from "@/lib/orderLineDetails";
import { getOrderPaymentAgentDisplay } from "@/lib/orderDisplay";
import { lineTotalPcs, type Customer, type Order } from "@/lib/types";
import { getOrderCustomerReceivableAmount } from "@/services/settlement/customerReceivableLedger";
import { useStore } from "@/lib/store";
import { ordersDataSource } from "@/lib/runtimeConfig";
import { orderLifecycleService } from "@/services/orderLifecycleService";

const PAGE_SIZE = 100;

type CustomerLedgerRow = {
  customerId: string;
  orderId: string;
  lineId: string;
  orderNumber: string;
  orderDate: string;
  loadingDate: string;
  status: string;
  paidBy: string;
  wechatId: string;
  productName: string;
  productImage: string;
  marka: string;
  details: string;
  totalCtns: number;
  pcsPerCtn: number;
  totalPieces: number;
  pricePerPiece: number;
  totalAmount: number;
};

type CustomerSummaryRow = {
  customer: Customer;
  ledgerRows: CustomerLedgerRow[];
  totalOrders: number;
  totalPurchaseAmount: number;
  lastOrderNumber: string;
  lastOrderDate: string;
  lastOrderMarka: string;
  lastOrderAmount: number;
  lastPaidBy: string;
  lastWechatId: string;
  lastOrderImage: string;
  searchIndex: string;
};

const getLineImage = (line: Order["lines"][number]) => {
  const candidate = line as Order["lines"][number] & { productImage?: string; image?: string };
  return candidate.productPhotoUrl || candidate.productImage || candidate.image || candidate.photoUrl || "";
};

const getOrderTimelineValue = (order: Order) => order.date || order.createdAt || order.updatedAt || "";

const sameCustomer = (line: Order["lines"][number], customer: Customer) => line.customerId === customer.id;

const sortLedgerRowsNewestFirst = (rows: CustomerLedgerRow[]) =>
  [...rows].sort((left, right) => {
    const dateDiff = (right.orderDate || "").localeCompare(left.orderDate || "");
    if (dateDiff !== 0) return dateDiff;
    const orderNumberDiff = (right.orderNumber || "").localeCompare(left.orderNumber || "", undefined, { numeric: true, sensitivity: "base" });
    if (orderNumberDiff !== 0) return orderNumberDiff;
    return (right.lineId || "").localeCompare(left.lineId || "");
  });

const formatTotalAmount = (value: number) => formatWholeMoney(value);

export default function CustomersPage() {
  const { data: customers, isLoading, error, reload: reloadCustomers } = useCustomers();
  const { data: firebaseOrders } = useOrders();
  const { data: paymentAgents } = usePaymentAgents();
  const { orders: localOrders, pushToast } = useStore();
  const source = ordersDataSource();
  const orders = source === "firebase" ? firebaseOrders : localOrders;

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [currentPage, setCurrentPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [viewCustomerId, setViewCustomerId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const summaries = useMemo(() => {
    return customers.map((customer) => {
      const ledgerRows = sortLedgerRowsNewestFirst(
        orders.flatMap((order) =>
          order.lines
            .filter((line) => sameCustomer(line, customer))
            .map((line) => {
              const totalPieces = lineTotalPcs(line);
              const totalAmount = getOrderCustomerReceivableAmount(order, line);
              return {
                customerId: customer.id,
                orderId: order.id,
                lineId: line.id,
                orderNumber: order.number || order.orderNumber || "—",
                orderDate: getOrderTimelineValue(order),
                loadingDate: order.loadingDate || "",
                status: order.status || "—",
                paidBy: getOrderPaymentAgentDisplay(order, paymentAgents).value,
                wechatId: order.wechatId?.trim() || "—",
                productName: line.productSnapshot?.name || "",
                productImage: getLineImage(line),
                marka: line.marka?.trim() || "—",
                details: joinLineDetails(line).trim() || "—",
                totalCtns: Number(line.totalCtns) || 0,
                pcsPerCtn: Number(line.pcsPerCtn) || 0,
                totalPieces,
                pricePerPiece: Number(line.rmbPerPcs) || 0,
                totalAmount,
              } satisfies CustomerLedgerRow;
            }),
        ),
      );

      const totalOrders = new Set(ledgerRows.map((row) => row.orderId)).size;
      const totalPurchaseAmount = ledgerRows.reduce((sum, row) => sum + row.totalAmount, 0);
      const latestLine = ledgerRows[0] || null;
      const searchIndex = [
        customer.displayName || customer.name || "",
        customer.name || "",
        customer.customerCode || "",
        customer.wechatId || "",
        customer.phone || "",
        customer.email || "",
        formatTotalAmount(totalPurchaseAmount),
        String(totalOrders),
        ...ledgerRows.flatMap((row) => [
          row.orderNumber,
          row.wechatId,
          row.productName,
          row.marka,
          row.details,
          row.paidBy,
          row.orderDate,
          row.loadingDate,
          row.status,
          formatTotalAmount(row.totalAmount),
          formatAmount(row.pricePerPiece),
          String(row.totalCtns),
          String(row.pcsPerCtn),
          String(row.totalPieces),
        ]),
      ]
        .join(" ")
        .toLowerCase();

      return {
        customer,
        ledgerRows,
        totalOrders,
        totalPurchaseAmount,
        lastOrderNumber: latestLine?.orderNumber || "—",
        lastOrderDate: latestLine?.orderDate || "",
        lastOrderMarka: latestLine?.marka || "—",
        lastOrderAmount: latestLine?.totalAmount || 0,
        lastPaidBy: latestLine?.paidBy || "—",
        lastWechatId: latestLine?.wechatId || customer.wechatId || "—",
        lastOrderImage: latestLine?.productImage || "",
        searchIndex,
      } satisfies CustomerSummaryRow;
    });
  }, [customers, orders, paymentAgents]);

  const filteredAndSorted = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = summaries.filter((row) => !normalizedQuery || row.searchIndex.includes(normalizedQuery));

    return [...filtered].sort((left, right) => {
      if (sortBy === "total_orders") return right.totalOrders - left.totalOrders;
      if (sortBy === "total_amount") return right.totalPurchaseAmount - left.totalPurchaseAmount;
      if (sortBy === "last_amount") return right.lastOrderAmount - left.lastOrderAmount;
      if (sortBy === "latest_date") return (right.lastOrderDate || "").localeCompare(left.lastOrderDate || "");
      return (left.customer.displayName || left.customer.name || "").localeCompare(right.customer.displayName || right.customer.name || "");
    });
  }, [summaries, query, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filteredAndSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filteredAndSorted, currentPage]);
  const activeSummary = filteredAndSorted.find((row) => row.customer.id === viewCustomerId) || null;
  const ledgerTotalPages = Math.max(1, Math.ceil((activeSummary?.ledgerRows.length || 0) / PAGE_SIZE));
  const pagedLedgerRows = useMemo(
    () => (activeSummary?.ledgerRows || []).slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE),
    [activeSummary, ledgerPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, sortBy]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setLedgerPage(1);
  }, [viewCustomerId]);

  useEffect(() => {
    setLedgerPage((page) => Math.min(page, ledgerTotalPages));
  }, [ledgerTotalPages]);

  const exportVisible = () => {
    const header = [
      "Customer Name",
      "Last Order Number",
      "Last Order Marka",
      "Last Order Date",
      "Last Order Amount",
      "Total Orders",
      "Total Purchase Amount",
      "Last Paid By",
      "WeChat ID",
    ];
    const rows = filteredAndSorted.map((row) => [
      row.customer.displayName || row.customer.name || "—",
      row.lastOrderNumber,
      row.lastOrderMarka,
      row.lastOrderDate ? formatDate(row.lastOrderDate) : "—",
      formatTotalAmount(row.lastOrderAmount),
      String(row.totalOrders),
      formatTotalAmount(row.totalPurchaseAmount),
      row.lastPaidBy,
      row.lastWechatId,
    ]);
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "customers-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportLedger = (summary: CustomerSummaryRow) => {
    const header = ["Order Number", "Date", "Marka", "Details", "CTNS", "PCS/CTN", "Total Pieces", "Price", "Total Amount", "Paid By", "Loading Date", "Status"];
    const rows = summary.ledgerRows.map((row) => [
      row.orderNumber,
      row.orderDate ? formatDate(row.orderDate) : "—",
      row.marka,
      row.details,
      String(row.totalCtns),
      String(row.pcsPerCtn),
      String(row.totalPieces),
      formatAmount(row.pricePerPiece),
      formatTotalAmount(row.totalAmount),
      row.paidBy,
      row.loadingDate ? formatDate(row.loadingDate) : "—",
      row.status,
    ]);
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(summary.customer.displayName || summary.customer.name || "customer").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printLedger = (summary: CustomerSummaryRow) => {
    const printableRows = summary.ledgerRows
      .map((row) => `
        <tr>
          <td>${row.orderNumber}</td>
          <td>${row.orderDate ? formatDate(row.orderDate) : "—"}</td>
          <td>${row.marka}</td>
          <td>${row.details}</td>
          <td>${row.totalCtns}</td>
          <td>${row.pcsPerCtn}</td>
          <td>${row.totalPieces}</td>
          <td>${formatAmount(row.pricePerPiece)}</td>
          <td>${formatTotalAmount(row.totalAmount)}</td>
          <td>${row.paidBy}</td>
          <td>${row.loadingDate ? formatDate(row.loadingDate) : "—"}</td>
          <td>${row.status}</td>
        </tr>
      `)
      .join("");
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${summary.customer.displayName || summary.customer.name} Ledger</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>${summary.customer.displayName || summary.customer.name || "Customer Ledger"}</h2>
          <div>Total Orders: ${summary.totalOrders}</div>
          <div>Total Purchase Amount: ${formatTotalAmount(summary.totalPurchaseAmount)}</div>
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Date</th>
                <th>Marka</th>
                <th>Details</th>
                <th>CTNS</th>
                <th>PCS/CTN</th>
                <th>Total Pieces</th>
                <th>Price</th>
                <th>Total Amount</th>
                <th>Paid By</th>
                <th>Loading Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${printableRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const removeCustomer = async () => {
    if (!pendingDeleteCustomer || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await orderLifecycleService.safeDeleteCustomer(pendingDeleteCustomer.id, "customers-page");
      await reloadCustomers();
      pushToast({ tone: "success", text: "Customer moved to Recycle Bin." });
      setPendingDeleteCustomer(null);
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Could not delete customer." });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <main className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <section className="card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-[280px] flex-1 max-w-xl">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, WeChat, order no., marka, details, paid by, amounts, dates..."
                leadingIcon={<Search size={14} />}
              />
            </div>
            <div className="w-[240px]">
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={[
                  { value: "name", label: "Sort: Customer Name" },
                  { value: "total_orders", label: "Sort: Total Orders High to Low" },
                  { value: "total_amount", label: "Sort: Total Purchase High to Low" },
                  { value: "latest_date", label: "Sort: Last Order Newest" },
                  { value: "last_amount", label: "Sort: Last Order Amount High to Low" },
                ]}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={exportVisible}>
              <Download size={14} />
              Export
            </Button>
          </section>

          {error ? <div className="text-[12px] text-fg-subtle">{error}</div> : null}

          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <div className="w-full min-w-0 px-0.5 py-1">
                <table className="w-full min-w-[1120px] text-[13px]">
                  <thead className="bg-white">
                    <tr className="border-b border-border text-[11px] uppercase tracking-[0.01em] text-fg-muted">
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-2 py-2 text-center">Last Image</th>
                      <th className="px-2 py-2 text-left">Last Order</th>
                      <th className="px-2 py-2 text-left">Last Marka</th>
                      <th className="px-2 py-2 text-right">Last Amount</th>
                      <th className="px-2 py-2 text-center">Total Orders</th>
                      <th className="px-2 py-2 text-right">Total Purchase</th>
                      <th className="px-2 py-2 text-left">Paid By</th>
                      <th className="px-2 py-2 text-left">WeChat ID</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.customer.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle/40">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-fg">{row.customer.displayName || row.customer.name || "—"}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">
                            {row.lastOrderImage ? (
                              <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(row.lastOrderImage)}>
                                <img
                                  src={getCloudinaryOptimizedUrl(row.lastOrderImage, { width: 120, height: 120, crop: "fit" })}
                                  alt="last order"
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
                        <td className="px-2 py-2.5 font-semibold">{row.lastOrderNumber}</td>
                        <td className="px-2 py-2.5">
                          <div className="max-w-[140px] truncate" title={row.lastOrderMarka}>
                            {row.lastOrderMarka}
                          </div>
                        </td>
                        <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${row.lastOrderAmount > 0 ? "text-fg" : "text-[var(--danger)]"}`}>{formatTotalAmount(row.lastOrderAmount)}</td>
                        <td className="px-2 py-2.5 text-center font-semibold">{row.totalOrders}</td>
                        <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${row.totalPurchaseAmount > 0 ? "text-fg" : "text-[var(--danger)]"}`}>{formatTotalAmount(row.totalPurchaseAmount)}</td>
                        <td className="px-2 py-2.5">{row.lastPaidBy}</td>
                        <td className="px-2 py-2.5">{row.lastWechatId}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              title="View Ledger"
                              aria-label="View Ledger"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                              onClick={() => setViewCustomerId(row.customer.id)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              title="Delete Customer"
                              aria-label="Delete Customer"
                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-card text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                              onClick={() => setPendingDeleteCustomer(row.customer)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {isLoading ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-fg-subtle">
                          Loading customers...
                        </td>
                      </tr>
                    ) : null}
                    {!isLoading && pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-fg-subtle">
                          No customer summaries found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePagination total={filteredAndSorted.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="customers" />
          </section>

          {activeSummary ? (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
              <div className="card flex h-[88vh] w-full max-w-[1150px] flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                  <div>
                    <div className="text-[20px] font-semibold">{activeSummary.customer.displayName || activeSummary.customer.name || "Customer Ledger"}</div>
                    <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-fg-subtle">
                      <span>Total Orders: {activeSummary.totalOrders}</span>
                      <span className={activeSummary.totalPurchaseAmount > 0 ? "" : "text-[var(--danger)]"}>Total Purchase: {formatTotalAmount(activeSummary.totalPurchaseAmount)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Export Ledger"
                      aria-label="Export Ledger"
                      className="grid h-9 w-9 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                      onClick={() => exportLedger(activeSummary)}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      type="button"
                      title="Print Ledger"
                      aria-label="Print Ledger"
                      className="grid h-9 w-9 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                      onClick={() => printLedger(activeSummary)}
                    >
                      <Printer size={15} />
                    </button>
                    <button
                      type="button"
                      title="Close"
                      aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-md border border-border bg-bg-card text-fg transition-colors hover:bg-bg-subtle"
                      onClick={() => setViewCustomerId(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[1140px] text-[12.5px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-border text-[11px] uppercase tracking-[0.01em] text-fg-muted">
                        <th className="px-2 py-2 text-center">Image</th>
                        <th className="px-2 py-2 text-left">Order Number</th>
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left">Marka</th>
                        <th className="px-2 py-2 text-left">Details</th>
                        <th className="px-2 py-2 text-center">CTNS</th>
                        <th className="px-2 py-2 text-center">PCS/CTN</th>
                        <th className="px-2 py-2 text-center">Total Pieces</th>
                        <th className="px-2 py-2 text-right">Price</th>
                        <th className="px-2 py-2 text-right">Total Amount</th>
                        <th className="px-2 py-2 text-left">Paid By</th>
                        <th className="px-2 py-2 text-left">Loading Date</th>
                        <th className="px-2 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLedgerRows.map((row) => (
                        <tr key={`${row.orderId}-${row.lineId}`} className="border-b border-border transition-colors hover:bg-bg-subtle/40">
                          <td className="px-2 py-2.5">
                            <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-lg border border-border bg-bg-subtle">
                              {row.productImage ? (
                                <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setPreviewImage(row.productImage)}>
                                  <img
                                    src={getCloudinaryOptimizedUrl(row.productImage, { width: 110, height: 110, crop: "fit" })}
                                    alt="line item"
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
                          <td className="px-2 py-2.5 font-semibold">{row.orderNumber}</td>
                          <td className="px-2 py-2.5">{row.orderDate ? formatDate(row.orderDate) : "—"}</td>
                          <td className="px-2 py-2.5">{row.marka}</td>
                          <td className="px-2 py-2.5">{row.details}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{row.totalCtns.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{row.pcsPerCtn.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{row.totalPieces.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{formatAmount(row.pricePerPiece)}</td>
                          <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${row.totalAmount > 0 ? "text-fg" : "text-[var(--danger)]"}`}>{formatTotalAmount(row.totalAmount)}</td>
                          <td className="px-2 py-2.5">{row.paidBy}</td>
                          <td className="px-2 py-2.5">{row.loadingDate ? formatDate(row.loadingDate) : "—"}</td>
                          <td className="px-2 py-2.5">{row.status}</td>
                        </tr>
                      ))}
                      {pagedLedgerRows.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="px-4 py-8 text-center text-fg-subtle">
                            No order lines found for this customer.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <TablePagination total={activeSummary.ledgerRows.length} currentPage={ledgerPage} pageSize={PAGE_SIZE} onPageChange={setLedgerPage} label="ledger rows" />
              </div>
            </div>
          ) : null}

          <ImageLightbox src={previewImage} alt="Customer order line image" open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} />
          <ConfirmDialog
            open={Boolean(pendingDeleteCustomer)}
            title="Delete this customer?"
            description={pendingDeleteCustomer ? `Move ${pendingDeleteCustomer.displayName || pendingDeleteCustomer.name || pendingDeleteCustomer.id} to Recycle Bin?` : ""}
            confirmLabel="Move to Recycle Bin"
            danger
            busy={deleteBusy}
            onCancel={() => { if (!deleteBusy) setPendingDeleteCustomer(null); }}
            onConfirm={() => { void removeCustomer(); }}
          />
        </div>
      </main>
    </div>
  );
}
