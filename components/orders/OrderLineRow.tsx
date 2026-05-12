"use client";

import { Trash2 } from "lucide-react";
import { OrderLine, lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { suppliers, customers } from "@/lib/data";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { PhotoUpload } from "./PhotoUpload";

type Props = {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onRemove: () => void;
};

// Columns: supplier | prod-pic | dim-pic | marka | details | ctns | pcs/ctn | total pcs | rmb/pcs | line total | customer | action
export const LINE_GRID =
  "grid grid-cols-[minmax(0,0.6fr)_58px_58px_74px_minmax(0,1.05fr)_56px_76px_60px_60px_120px_minmax(0,0.5fr)_28px] items-center gap-1.5";

export function OrderLineRow({ line, onChange, onRemove }: Props) {
  const pcs = lineTotalPcs(line);
  const totalRmb = lineTotalRmb(line);

  return (
    <div
      className={`${LINE_GRID} px-2 py-2 text-[13.75px] hover:bg-bg-subtle/60 transition-colors rounded-lg`}
    >
      <Select
        compact
        value={line.supplierId}
        onChange={(e) => onChange({ supplierId: e.target.value })}
        options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
      />

      <PhotoUpload
        compact
        ariaLabel="Upload product photo"
        value={line.productPhotoUrl}
        onChange={(url) => onChange({ productPhotoUrl: url })}
      />

      <PhotoUpload
        compact
        ariaLabel="Upload weight/dimension photo"
        value={line.photoUrl}
        onChange={(url) => onChange({ photoUrl: url })}
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

      <div className="rounded-md border border-border/70 bg-bg-subtle px-2 py-1 text-center tabular-nums leading-tight">
        <span className="mr-0.5 text-[10px] text-fg-subtle">¥</span>
        <span className="text-[14.5px] font-semibold">
          {totalRmb.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      <Select
        compact
        value={line.customerId}
        onChange={(e) => onChange({ customerId: e.target.value })}
        options={customers.map((c) => ({ value: c.id, label: c.name }))}
      />

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
