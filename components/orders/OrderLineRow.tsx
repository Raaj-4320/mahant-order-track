"use client";

import { Trash2 } from "lucide-react";
import { Customer, OrderLine, lineTotalPcs, lineTotalRmb } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { applyTypedCustomerToLine, findCustomerByTypedName } from "@/services/customers/customerResolution";
import { PhotoUpload } from "./PhotoUpload";
import { useEffect, useMemo, useState } from "react";
import { getLineDetailsParts } from "@/lib/orderLineDetails";
import { formatAmount } from "@/lib/data";
import { formatWholeMoney } from "@/lib/numbers";
import { cn } from "@/lib/cn";
import { UserRound } from "lucide-react";

type Props = {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onRemove: () => void;
  onUploadingChange?: (isUploading: boolean) => void;
  customerSuggestions?: string[];
  customers?: Customer[];
  onPreviewImage?: (src: string) => void;
  onCustomerValidityChange?: (lineId: string, issue: string | null) => void;
};

// Columns: pic+dim | product | marka | details | ctns | pcs/ctn | total pcs | rmb/pcs | line total | customer | action
export const LINE_GRID =
  "grid grid-cols-[72px_72px_minmax(0,0.6fr)_minmax(0,0.6fr)_56px_76px_60px_76px_132px_minmax(0,0.5fr)_28px] items-center gap-1.5";

export function OrderLineRow({ line, onChange, onRemove, onUploadingChange, customerSuggestions = [], customers = [], onPreviewImage, onCustomerValidityChange }: Props) {
  const pcs = lineTotalPcs(line);
  const totalRmb = lineTotalRmb(line);
  const detailParts = getLineDetailsParts(line);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerInput, setCustomerInput] = useState(line.customerName || line.customerSnapshot?.name || "");
  const [totalCtnsInput, setTotalCtnsInput] = useState(line.totalCtns ? String(line.totalCtns) : "");
  const [pcsPerCtnInput, setPcsPerCtnInput] = useState(line.pcsPerCtn ? String(line.pcsPerCtn) : "");
  const [rateInput, setRateInput] = useState(line.rmbPerPcs ? String(line.rmbPerPcs) : "");
  const currentCustomerLabel = line.customerName || line.customerSnapshot?.name || "";
  const normalizedCustomerInput = customerInput.trim().toLowerCase();
  const matchedTypedCustomer = useMemo(() => findCustomerByTypedName(customers, customerInput), [customers, customerInput]);

  const topCustomerSuggestions = useMemo(
    () => customerSuggestions.filter((name) => !normalizedCustomerInput || name.toLowerCase().includes(normalizedCustomerInput)).slice(0, 4),
    [customerSuggestions, normalizedCustomerInput]
  );

  useEffect(() => {
    setTotalCtnsInput(line.totalCtns ? String(line.totalCtns) : "");
  }, [line.totalCtns]);

  useEffect(() => {
    setPcsPerCtnInput(line.pcsPerCtn ? String(line.pcsPerCtn) : "");
  }, [line.pcsPerCtn]);

  useEffect(() => {
    setRateInput(line.rmbPerPcs ? String(line.rmbPerPcs) : "");
  }, [line.rmbPerPcs]);

  useEffect(() => {
    if (!customerOpen) {
      setCustomerInput(line.customerName || line.customerSnapshot?.name || "");
    }
  }, [line.customerName, line.customerSnapshot?.name, customerOpen]);

  useEffect(() => {
    if (!onCustomerValidityChange) return;
    const trimmed = customerInput.trim();
    if (!trimmed || matchedTypedCustomer || trimmed === currentCustomerLabel.trim()) {
      onCustomerValidityChange(line.id, null);
      return;
    }
    onCustomerValidityChange(line.id, null);
  }, [customerInput, matchedTypedCustomer, currentCustomerLabel, line.id, onCustomerValidityChange]);

  const handleDecimalInput = (nextValue: string, commit: (value: number) => void, setValue: (value: string) => void) => {
    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
      setValue(nextValue);
      commit(nextValue === "" ? 0 : Number(nextValue));
    }
  };

  const normalizeDecimalInput = (value: number, setValue: (next: string) => void) => {
    setValue(value ? String(value) : "");
  };

  const applyCustomerSelection = (name: string) => {
    onChange(applyTypedCustomerToLine(line, name, customers));
    setCustomerInput(name);
    setCustomerOpen(false);
  };

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
        value={totalCtnsInput}
        onChange={(e) => handleDecimalInput(e.target.value, (value) => onChange({ totalCtns: value }), setTotalCtnsInput)}
        onBlur={() => normalizeDecimalInput(line.totalCtns, setTotalCtnsInput)}
        className="text-center no-spinner"
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
      />

      <Input
        compact
        type="number"
        inputMode="numeric"
        min={0}
        step="any"
        value={pcsPerCtnInput}
        onChange={(e) => handleDecimalInput(e.target.value, (value) => onChange({ pcsPerCtn: value }), setPcsPerCtnInput)}
        onBlur={() => normalizeDecimalInput(line.pcsPerCtn, setPcsPerCtnInput)}
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
        value={rateInput}
        onChange={(e) => handleDecimalInput(e.target.value, (value) => onChange({ rmbPerPcs: value }), setRateInput)}
        onBlur={() => normalizeDecimalInput(line.rmbPerPcs, setRateInput)}
        className="text-center no-spinner"
        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
      />

      <div className="rounded-md border border-border/70 bg-bg-subtle px-2 py-1 text-center tabular-nums leading-tight text-[14.5px] font-semibold">
        <span className={totalRmb > 0 ? "text-fg" : "text-[var(--danger)]"}>{formatWholeMoney(totalRmb)}</span>
      </div>

      <div className="relative z-30">
        <Input
          compact
          value={customerInput}
          leadingIcon={<UserRound size={14} />}
          onFocus={() => setCustomerOpen(true)}
          onBlur={() => window.setTimeout(() => {
            setCustomerOpen(false);
          }, 120)}
          onChange={(e) => {
            const nextValue = e.target.value;
            setCustomerInput(nextValue);
            if (!nextValue.trim()) {
              onChange({ customerId: "", customerName: "", customerSnapshot: undefined });
              setCustomerOpen(true);
              return;
            }
            onChange(applyTypedCustomerToLine(line, nextValue, customers));
            setCustomerOpen(true);
          }}
          placeholder="Customer"
        />
        {customerOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-black/10 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
            {topCustomerSuggestions.length === 0 ? (
              <div className="px-3 py-2 text-[11.5px] text-slate-500">No matching customer</div>
            ) : topCustomerSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                className={cn("block w-full px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-slate-50", matchedTypedCustomer?.name === name ? "bg-slate-50 text-slate-900" : "text-slate-700")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCustomerSelection(name);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
