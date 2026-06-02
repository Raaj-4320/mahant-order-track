"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { OrderLineRow, LINE_GRID } from "./OrderLineRow";
import { Customer, Order, OrderLine, PaymentAgent } from "@/lib/types";

export function newLine(): OrderLine {
  return {
    id: "ln-" + Math.random().toString(36).slice(2, 9),
    supplierId: "",
    picDim: "",
    productId: "",
    marka: "",
    details: "",
    detail1: "",
    detail2: "",
    detail3: "",
    totalCtns: 0,
    pcsPerCtn: 0,
    rmbPerPcs: 0,
    customerId: "",
  };
}

type Props = {
  draft: Order;
  setDraft: (updater: (d: Order) => Order) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  onRemoveLine?: (lineId: string) => void;
  wechatSuggestions?: string[];
  customerSuggestions?: string[];
  customers?: Customer[];
  paymentAgents?: PaymentAgent[];
  showOrderInfo?: boolean;
  onPreviewImage?: (src: string) => void;
};

export function OrderForm({ draft, setDraft, onUploadingChange, onRemoveLine, wechatSuggestions = [], customerSuggestions = [], customers = [], paymentAgents = [], showOrderInfo = true, onPreviewImage }: Props) {
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const normalizeAgentValue = (value?: string) => (value || "").trim().toLowerCase();

  const paymentSuggestions = useMemo(() => {
    const q = paymentQuery.trim().toLowerCase();
    return paymentAgents
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.agentCode || "").toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      })
      .slice(0, 4);
  }, [paymentAgents, paymentQuery]);

  const paymentLabel = (p: PaymentAgent) =>
    (p.creditBalance ?? 0) > 0
      ? `${p.name} — Credit: ${(p.creditBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : p.name;

  const updateLine = (id: string, patch: Partial<OrderLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  const addLine = () =>
    setDraft((d) => ({ ...d, lines: [...d.lines, newLine()] }));

  const selectedPaymentAgent = paymentAgents.find((p) => {
    const reference = draft.paymentAgentId || draft.paymentBy;
    return p.id === reference || normalizeAgentValue(p.name) === normalizeAgentValue(reference);
  });
  const selectedLabel = selectedPaymentAgent ? paymentLabel(selectedPaymentAgent) : "";
  useEffect(() => {
    if (paymentOpen) return;
    setPaymentQuery(selectedLabel || draft.paymentBy || "");
  }, [selectedLabel, draft.paymentBy, paymentOpen]);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {showOrderInfo ? <section className="card p-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(180px,0.7fr)_minmax(145px,0.55fr)_minmax(150px,0.55fr)_minmax(180px,0.7fr)]">
          <Field label="Payment By">
            <div className="relative">
              <Input
                value={paymentQuery}
                onFocus={() => setPaymentOpen(true)}
                onBlur={() => window.setTimeout(() => setPaymentOpen(false), 120)}
                onChange={(e) => {
                  const next = e.target.value;
setPaymentQuery(next);
                  setPaymentOpen(true);
                  setDraft((d) => ({ ...d, paymentBy: next, paymentAgentId: "" }));
                }}
                placeholder={paymentAgents.length ? "Search payment agent" : "No payment agents yet"}
              />
              {paymentOpen && paymentSuggestions.length > 0 ? (
                <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">
                  {paymentSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const label = paymentLabel(p);
                        setPaymentQuery(label);
                        setPaymentOpen(false);
                        setDraft((d) => ({ ...d, paymentBy: p.id, paymentAgentId: p.id }));
                      }}
                      className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle"
                    >
                      {paymentLabel(p)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
            <div className="relative">
              <Input value={draft.wechatId} onChange={(e) => setDraft((d) => ({ ...d, wechatId: e.target.value }))} placeholder="Enter WeChat ID" list="wechat-suggestions" />
              <datalist id="wechat-suggestions">{wechatSuggestions.map((w) => <option key={w} value={w} />)}</datalist>
            </div>
          </Field>
        </div>
      </section> : null}

      <section className="card overflow-hidden">
        <div className="px-2 py-1.5 overflow-x-auto">
          <div className="flex justify-end px-2 pb-1 text-[11px] text-fg-subtle">{draft.lines.length} line{draft.lines.length === 1 ? "" : "s"}</div>
          <div className="min-w-[960px]">
            <div
              className={`${LINE_GRID} px-2 py-1.5 text-[13px] font-medium uppercase tracking-wide text-fg-subtle border-b border-border`}
            >
              <span className="text-center">Pic + Dim</span>
              <span className="text-center">Product</span>
              <span>MARKA</span>
              <span>Details</span>
              <span className="text-center">CTNs</span>
              <span className="text-center">pcs / ctn</span>
              <span className="text-center">Total PCS</span>
              <span className="text-center">Rate / PCS</span>
              <span className="text-center">Total Amount</span>
              <span>Customer</span>
              <span className="text-center">·</span>
            </div>

            <div className="flex flex-col py-0.5">
              {draft.lines.map((l) => (
                <OrderLineRow
                  key={l.id}
                  line={l}
                  onChange={(patch) => updateLine(l.id, patch)}
                  customerSuggestions={customerSuggestions}
                  customers={customers}
                  onRemove={() => {
                    if (onRemoveLine) onRemoveLine(l.id);
                  }}
                  onUploadingChange={onUploadingChange}
                  onPreviewImage={onPreviewImage}
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

