"use client";

import { Pencil, Plus } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { OrderLineRow, LINE_GRID } from "./OrderLineRow";
import { Order, OrderLine } from "@/lib/types";
import { customers, paymentAgents, products, suppliers } from "@/lib/data";

export function newLine(): OrderLine {
  const p = products[0];
  return {
    id: "ln-" + Math.random().toString(36).slice(2, 9),
    supplierId: suppliers[0].id,
    picDim: p.defaultDim ?? "",
    productId: p.id,
    marka: p.marka,
    details: p.name,
    totalCtns: 1,
    pcsPerCtn: 50,
    rmbPerPcs: 10,
    customerId: customers[0].id,
  };
}

type Props = {
  draft: Order;
  setDraft: (updater: (d: Order) => Order) => void;
  onUploadingChange?: (isUploading: boolean) => void;
};

export function OrderForm({ draft, setDraft, onUploadingChange }: Props) {
  const updateLine = (id: string, patch: Partial<OrderLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  const removeLine = (id: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));

  const addLine = () =>
    setDraft((d) => ({ ...d, lines: [...d.lines, newLine()] }));

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <section className="card p-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Payment By">
            <Select
              value={draft.paymentBy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, paymentBy: e.target.value }))
              }
              options={paymentAgents.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              placeholder="Search payment agent..."
            />
          </Field>

          <Field label="Date">
            <Input
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
            />
          </Field>

          <Field label="Order Number">
            <Input
              value={draft.number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, number: e.target.value, orderNumber: e.target.value }))
              }
              trailingIcon={<Pencil size={14} />}
            />
          </Field>

          <Field label="WeChat ID">
            <Input
              value={draft.wechatId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, wechatId: e.target.value }))
              }
              placeholder="Enter WeChat ID"
            />
          </Field>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-semibold">Order Lines</h2>
          <span className="text-[11.5px] text-fg-subtle">
            {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="px-2 py-1.5 overflow-x-auto">
          <div className="min-w-[960px]">
            <div
              className={`${LINE_GRID} px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle border-b border-border`}
            >
              <span>Supplier</span>
              <span className="text-center">Product</span>
              <span className="text-center">Pic + Dim</span>
              <span>MARKA</span>
              <span>Details</span>
              <span className="text-center">CTNs</span>
              <span className="text-center">pcs / ctn</span>
              <span className="text-center">Total PCS</span>
              <span className="text-center">RMB / PCS</span>
              <span className="text-center">Line Total</span>
              <span>Customer</span>
              <span className="text-center">·</span>
            </div>

            <div className="flex flex-col py-0.5">
              {draft.lines.map((l) => (
                <OrderLineRow
                  key={l.id}
                  line={l}
                  onChange={(patch) => updateLine(l.id, patch)}
                  onRemove={() => removeLine(l.id)}
                  onUploadingChange={onUploadingChange}
                />
              ))}
              {draft.lines.length === 0 && (
                <div className="py-6 text-center text-[12.5px] text-fg-subtle">
                  No lines yet — add your first line below.
                </div>
              )}
            </div>

            <button
              onClick={addLine}
              className="mt-1.5 w-full rounded-lg border border-dashed border-border bg-transparent py-2 text-[12.5px] text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              Add New Line
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
