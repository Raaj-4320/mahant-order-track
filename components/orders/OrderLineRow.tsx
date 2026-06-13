"use client";

import { Trash2 } from "lucide-react";
import { Customer, OrderLine, lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { applyTypedCustomerToLine } from "@/services/customers/customerResolution";
import { PhotoUpload } from "./PhotoUpload";
import { useMemo, useState } from "react";
import { getLineDetailsParts } from "@/lib/orderLineDetails";
import { formatAmount } from "@/lib/data";

type Props = {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onRemove: () => void;
  onUploadingChange?: (isUploading: boolean) => void;
  customerSuggestions?: string[];
  customers?: Customer[];
  onPreviewImage?: (src: string) => void;
};

// Columns: pic+dim | product | marka | details | ctns | pcs/ctn | total pcs | rmb/pcs | line total | customer | action
export const LINE_GRID =
  "grid grid-cols-[72px_72px_minmax(0,0.6fr)_minmax(0,0.6fr)_56px_76px_60px_76px_132px_minmax(0,0.5fr)_28px] items-center gap-1.5";

export function OrderLineRow({ line, onChange, onRemove, onUploadingChange, customerSuggestions = [], customers = [], onPreviewImage }: Props) {
  const pcs = lineTotalPcs(line);
  const totalRmb = lineTotalRmb(line);
  const detailParts = getLineDetailsParts(line);
  const customerQuery = (line.customerName || "").trim().toLowerCase();
  const [customerOpen, setCustomerOpen] = useState(false);

  const topCustomerSuggestions = useMemo(
    () => customerSuggestions.filter((name) => !customerQuery || name.toLowerCase().includes(customerQuery)).slice(0, 4),
    [customerSuggestions, customerQuery]
  );

  return (
    <div
      className={`${LINE_GRID} px-2 py-2 text-[13.75px] hover:bg-bg-subtle/60 transition-colors rounded-lg`}
    >
      <PhotoUpload
        compact
        ariaLabel="Upload weight/dimension photo"
        value={line.photoUrl}
        onChange={(url) => onChange({ photoUrl: url })}
        onUploadingChange={onUploadingChange}
        onPreview={onPreviewImage}
      />

      <PhotoUpload
        compact
        ariaLabel="Upload product photo"
        value={line.productPhotoUrl}
        onChange={(url) => onChange({ productPhotoUrl: url })}
        onUploadingChange={onUploadingChange}
        onPreview={onPreviewImage}
      />

      <Input
        compact
        value={line.marka}
        onChange={(e) => onChange({ marka: e.target.value })}
        placeholder="MARKA"
      />

      <div className="grid grid-cols-3 gap-1">
        <Input compact value={detailParts.detail1} onChange={(e) => onChange({ detail1: e.target.value })} placeholder="Detail 1" />
        <Input compact value={detailParts.detail2} onChange={(e) => onChange({ detail2: e.target.value })} placeholder="Detail 2" />
        <Input compact value={detailParts.detail3} onChange={(e) => onChange({ detail3: e.target.value })} placeholder="Detail 3" />
      </div>

      <Input
        compact
        type="number"
        inputMode="numeric"
        min={0}
        step="any"
        value={line.totalCtns}
        onChange={(e) => onChange({ totalCtns: Number(e.target.value) || 0 })}
        className="text-center no-spinner"
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
      />

      <Input
        compact
        type="number"
        inputMode="numeric"
        min={0}
        step="any"
        value={line.pcsPerCtn}
        onChange={(e) => onChange({ pcsPerCtn: Number(e.target.value) || 0 })}
        className="text-center no-spinner"
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
      />

      <div className="text-center font-semibold text-[var(--success)] tabular-nums">
        {formatAmount(pcs)}
      </div>

      <Input
        compact
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={line.rmbPerPcs}
        onChange={(e) => onChange({ rmbPerPcs: Number(e.target.value) || 0 })}
        className="text-center no-spinner"
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
      />

      <div className="rounded-md border border-border/70 bg-bg-subtle px-2 py-1 text-center tabular-nums leading-tight text-[14.5px] font-semibold">
        {formatAmount(totalRmb)}
      </div>

      <div className="relative"><Input compact value={line.customerName ?? ""} onFocus={() => setCustomerOpen(true)} onBlur={() => window.setTimeout(() => setCustomerOpen(false), 120)} onChange={(e) => { onChange(applyTypedCustomerToLine(line, e.target.value, customers)); setCustomerOpen(true); }} placeholder="Customer" />{customerOpen && topCustomerSuggestions.length > 0 ? <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-bg-card shadow-card">{topCustomerSuggestions.map((name) => <button key={name} type="button" className="block w-full px-2 py-1 text-left text-[12px] hover:bg-bg-subtle" onMouseDown={(e)=>{e.preventDefault(); onChange(applyTypedCustomerToLine(line, name, customers)); setCustomerOpen(false);}}>{name}</button>)}</div> : null}</div>

      <button
        onClick={onRemove}
        aria-label="Remove line"
        className="mx-auto grid h-6 w-6 place-items-center rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
