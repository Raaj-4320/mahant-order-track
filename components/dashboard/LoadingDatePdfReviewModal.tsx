"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { cn } from "@/lib/cn";

export type LoadingDatePdfPreviewRow = {
  orderId: string;
  lineId: string;
  orderNumber: string;
  imageUrl: string;
  marka: string;
  ctns: number;
  pcsPerCtn: number;
  totalPcs: number;
  customer: string;
  customerRate: string;
};

type Props = {
  open: boolean;
  loadingDateLabel: string;
  orderNumbers: string[];
  rows: LoadingDatePdfPreviewRow[];
  busy?: boolean;
  onClose: () => void;
  onSaveChanges: (rows: LoadingDatePdfPreviewRow[]) => Promise<void> | void;
  onGenerate: (rows: LoadingDatePdfPreviewRow[], includeCustomerRate: boolean) => void;
};

export function LoadingDatePdfReviewModal({
  open,
  loadingDateLabel,
  orderNumbers,
  rows,
  busy = false,
  onClose,
  onSaveChanges,
  onGenerate,
}: Props) {
  const [includeCustomerRate, setIncludeCustomerRate] = useState(false);
  const [draftRows, setDraftRows] = useState<LoadingDatePdfPreviewRow[]>(rows);

  useEffect(() => {
    if (!open) return;
    setIncludeCustomerRate(false);
    setDraftRows(rows);
  }, [open, rows]);

  const hasChanges = useMemo(
    () => draftRows.some((row, index) => (row.customerRate || "") !== (rows[index]?.customerRate || "")),
    [draftRows, rows],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] overflow-auto bg-black/50 p-4" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-[1100px] rounded-[28px] border border-border bg-bg-card shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="space-y-1">
            <div className="text-[22px] font-semibold text-fg">Loading Date: {loadingDateLabel}</div>
            <div className="text-[14px] text-fg-subtle">Order Numbers: {orderNumbers.join(", ")}</div>
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[14px] text-fg">
            <input
              type="checkbox"
              checked={includeCustomerRate}
              onChange={(event) => setIncludeCustomerRate(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Include Customer Rate
          </label>
        </div>

        <div className="max-h-[65vh] overflow-auto px-6 py-4">
          <div className="overflow-x-auto rounded-[20px] border border-border">
            <table className="w-fit min-w-[790px] max-w-full border-collapse text-[14px]">
              <colgroup>
                <col className="w-[90px]" />
                <col className="w-[320px]" />
                <col className="w-[90px]" />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
                {includeCustomerRate ? <col className="w-[130px]" /> : null}
                <col className="w-[220px]" />
              </colgroup>
              <thead className="bg-bg-subtle/60 text-[12px] uppercase tracking-[0.04em] text-fg-subtle">
                <tr className="align-middle">
                  <th className="border-b border-border px-3 py-2.5 text-left">Image</th>
                  <th className="border-b border-border px-3 py-2.5 text-left">Marka</th>
                  <th className="border-b border-border px-3 py-2.5 text-center">CTNS</th>
                  <th className="border-b border-border px-3 py-2.5 text-center">PCS/CTN</th>
                  <th className="border-b border-border px-3 py-2.5 text-center">Total PCS</th>
                  {includeCustomerRate ? <th className="border-b border-border px-3 py-2.5 text-left">Customer Rate</th> : null}
                  <th className="border-b border-border px-3 py-2.5 text-left">Customer Name</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row, index) => (
                  <tr key={row.lineId} className="border-b border-border/70 align-middle last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                        {row.imageUrl ? (
                          <img
                            src={getCloudinaryOptimizedUrl(row.imageUrl, { width: 160, height: 160, crop: "fit" })}
                            alt={row.marka}
                            className="h-full w-full object-contain"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="text-[11px] text-fg-subtle">No image</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-fg">{row.marka}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-fg">{row.ctns}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-fg">{row.pcsPerCtn}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-fg">{row.totalPcs}</td>
                    {includeCustomerRate ? (
                      <td className="px-3 py-2.5">
                        <Input
                          value={row.customerRate}
                          onChange={(event) =>
                            setDraftRows((prev) => prev.map((entry, entryIndex) => (
                              entryIndex === index ? { ...entry, customerRate: event.target.value } : entry
                            )))
                          }
                          placeholder="Customer Rate"
                          className="h-8 w-[110px] max-w-[120px]"
                        />
                      </td>
                    ) : null}
                    <td className={cn("px-3 py-2.5 text-fg", includeCustomerRate ? "" : "min-w-[180px]")}>{row.customer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onSaveChanges(draftRows)} disabled={busy || !hasChanges}>
            Save Changes
          </Button>
          <Button type="button" variant="primary" onClick={() => void onGenerate(draftRows, includeCustomerRate)} disabled={busy}>
            Generate PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
