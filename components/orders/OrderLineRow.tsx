"use client";

import { Trash2 } from "lucide-react";
import { Customer, OrderLine, lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { suppliers } from "@/lib/data";
import { Input } from "@/components/ui/Input";
import { applyTypedCustomerToLine } from "@/services/customers/customerResolution";
import { PhotoUpload } from "./PhotoUpload";

type Props = {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onRemove: () => void;
  onUploadingChange?: (isUploading: boolean) => void;
  supplierSuggestions?: string[];
  customerSuggestions?: string[];
  customers?: Customer[];
};

// Columns: supplier | prod-pic | dim-pic | marka | details | ctns | pcs/ctn | total pcs | rmb/pcs | line total | customer | action
export const LINE_GRID =
  "grid grid-cols-[minmax(0,0.6fr)_58px_58px_74px_minmax(0,1.05fr)_56px_76px_60px_60px_120px_minmax(0,0.5fr)_28px] items-center gap-1.5";

export function OrderLineRow({ line, onChange, onRemove, onUploadingChange, supplierSuggestions = [], customerSuggestions = [], customers = [] }: Props) {
  const pcs = lineTotalPcs(line);
  const totalRmb = lineTotalRmb(line);

  return (
    <div
      className={`${LINE_GRID} px-2 py-2 text-[13.75px] hover:bg-bg-subtle/60 transition-colors rounded-lg`}
    >
      <Input compact value={line.supplierName ?? suppliers.find((s) => s.id === line.supplierId)?.name ?? ""} onChange={(e) => onChange({ supplierName: e.target.value, supplierId: suppliers.find((s) => s.name.toLowerCase() === e.target.value.trim().toLowerCase())?.id ?? "" })} placeholder="Supplier name" list={`supplier-list-${line.id}`} />
      <datalist id={`supplier-list-${line.id}`}>{supplierSuggestions.map((name) => <option key={name} value={name} />)}</datalist>

      <PhotoUpload
        compact
        ariaLabel="Upload product photo"
        value={line.productPhotoUrl}
        onChange={(url) => onChange({ productPhotoUrl: url })}
        onUploadingChange={onUploadingChange}
      />

      <PhotoUpload
        compact
        ariaLabel="Upload weight/dimension photo"
        value={line.photoUrl}
        onChange={(url) => onChange({ photoUrl: url })}
        onUploadingChange={onUploadingChange}
      />

      <Input
        compact
        value={line.marka}
        onChange={(e) => onChange({ marka: e.target.value })}
        placeholder="MARKA"
      />

      <Input
        compact
        value={line.details}
        onChange={(e) => onChange({ details: e.target.value })}
      />

      <Input
        compact
        type="number"
        min={0}
        value={line.totalCtns}
        onChange={(e) => onChange({ totalCtns: Number(e.target.value) || 0 })}
        className="text-center"
      />

      <Input
        compact
        type="number"
        min={0}
        value={line.pcsPerCtn}
        onChange={(e) => onChange({ pcsPerCtn: Number(e.target.value) || 0 })}
        className="text-center"
      />

      <div className="text-center font-semibold text-[var(--success)] tabular-nums">
        {pcs.toLocaleString()}
      </div>

      <Input
        compact
        type="number"
        min={0}
        step="0.01"
        value={line.rmbPerPcs}
        onChange={(e) => onChange({ rmbPerPcs: Number(e.target.value) || 0 })}
        className="text-center"
      />

      <div className="rounded-md border border-border/70 bg-bg-subtle px-2 py-1 text-center tabular-nums leading-tight text-[14.5px] font-semibold">
        {totalRmb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <Input compact value={line.customerName ?? ""} onChange={(e) => onChange(applyTypedCustomerToLine(line, e.target.value, customers))} placeholder="Customer name" list={`customer-list-${line.id}`} />
      <datalist id={`customer-list-${line.id}`}>{customerSuggestions.map((name) => <option key={name} value={name} />)}</datalist>

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
