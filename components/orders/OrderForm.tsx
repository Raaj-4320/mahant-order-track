"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { formatAmount } from "@/lib/data";
import { OrderLineRow, LINE_GRID, LINE_GRID_TEMPLATE, LINE_TABLE_MIN_WIDTH } from "./OrderLineRow";
import { Customer, Order, OrderLine, PaymentAgent } from "@/lib/types";
import { resolveOrderPaymentAgent } from "@/lib/orderDisplay";
import { getPaymentAgentDirectFinance } from "@/services/paymentAgentFinance";

export function newLine(defaultMarka = ""): OrderLine {
  return {
    id: "ln-" + Math.random().toString(36).slice(2, 9),
    supplierId: "",
    picDim: "",
    productId: "",
    marka: defaultMarka,
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
  onCustomerValidityChange?: (lineId: string, issue: string | null) => void;
  defaultMarka?: string;
};

export function OrderForm({ draft, setDraft, onUploadingChange, onRemoveLine, wechatSuggestions = [], customerSuggestions = [], customers = [], paymentAgents = [], showOrderInfo = true, onPreviewImage, onCustomerValidityChange, defaultMarka = "" }: Props) {
  const sectionShellClass = showOrderInfo ? "card flex min-h-0 flex-1 flex-col overflow-visible" : "flex min-h-0 flex-1 flex-col overflow-visible";
  const sectionBodyClass = showOrderInfo ? "min-h-0 overflow-x-auto overflow-y-visible px-2.5 py-2.5" : "min-h-0 overflow-x-auto overflow-y-visible bg-bg-card px-1 py-1.5";
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [wechatOpen, setWechatOpen] = useState(false);
  const collator = useMemo(() => new Intl.Collator(undefined, { sensitivity: "base", numeric: true }), []);

  const paymentSuggestions = useMemo(() => {
    const q = paymentQuery.trim().toLowerCase();
    return paymentAgents
      .filter((p) => {
        if (!q) return true;
        return p.name.toLowerCase().startsWith(q) || (p.agentCode || "").toLowerCase().startsWith(q) || p.id.toLowerCase().startsWith(q);
      })
      .sort((left, right) => collator.compare(left.name, right.name))
      .slice(0, 4);
  }, [collator, paymentAgents, paymentQuery]);

  const paymentLabel = (p: PaymentAgent) => {
    const creditLeft = getPaymentAgentDirectFinance(p).creditLeft;
    return creditLeft > 0 ? `${p.name} - Credit: ${formatAmount(creditLeft)}` : p.name;
  };

  const filteredWechatSuggestions = useMemo(() => {
    const q = draft.wechatId.trim().toLowerCase();
    return Array.from(new Set(wechatSuggestions.filter(Boolean)))
      .sort((left, right) => collator.compare(left, right))
      .filter((entry) => !q || entry.toLowerCase().startsWith(q))
      .slice(0, 4);
  }, [collator, draft.wechatId, wechatSuggestions]);

  const updateLine = (id: string, patch: Partial<OrderLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  const addLine = () => setDraft((d) => ({ ...d, lines: [...d.lines, newLine(defaultMarka)] }));

  const selectedPaymentAgent = resolveOrderPaymentAgent(draft, paymentAgents);
  const selectedLabel = selectedPaymentAgent ? paymentLabel(selectedPaymentAgent) : "";

  useEffect(() => {
    if (paymentOpen) return;
    setPaymentQuery(selectedLabel || draft.paymentAgentSnapshot?.name || draft.paymentByName || draft.paymentAgentName || draft.paymentBy || "");
  }, [selectedLabel, draft.paymentAgentSnapshot?.name, draft.paymentByName, draft.paymentAgentName, draft.paymentBy, paymentOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-3 py-2.5">
      {showOrderInfo ? (
        <section className="card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(180px,0.7fr)_minmax(145px,0.55fr)_minmax(145px,0.55fr)_minmax(150px,0.55fr)_minmax(180px,0.7fr)]">
            <Field label="Payment By">
              <div className="relative">
                <Input
                  value={paymentQuery}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onFocus={() => setPaymentOpen(true)}
                  onBlur={() => window.setTimeout(() => setPaymentOpen(false), 120)}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPaymentQuery(next);
                    setPaymentOpen(true);
                    setDraft((d) => ({ ...d, paymentBy: next, paymentAgentId: "", paymentByName: "", paymentAgentName: "", paymentAgentSnapshot: undefined }));
                  }}
                  placeholder={paymentAgents.length ? "Search payment agent" : "No payment agents yet"}
                />
                {paymentQuery || draft.paymentAgentId || draft.paymentBy ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-fg-subtle transition-colors hover:text-fg"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setPaymentQuery("");
                      setPaymentOpen(false);
                      setDraft((d) => ({ ...d, paymentBy: "", paymentAgentId: "", paymentByName: "", paymentAgentName: "", paymentAgentSnapshot: undefined }));
                    }}
                  >
                    Clear
                  </button>
                ) : null}
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
                          setDraft((d) => ({
                            ...d,
                            paymentBy: p.id,
                            paymentAgentId: p.id,
                            paymentByName: p.name,
                            paymentAgentName: p.name,
                            paymentAgentSnapshot: { id: p.id, name: p.name, code: p.agentCode },
                          }));
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
              <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
            </Field>

            <Field label="Loading Date">
              <Input type="date" value={draft.loadingDate || ""} onChange={(e) => setDraft((d) => ({ ...d, loadingDate: e.target.value || undefined }))} />
            </Field>

            <Field label="Order Number">
              <Input value={draft.number} onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value, orderNumber: e.target.value }))} trailingIcon={<Pencil size={14} />} />
            </Field>

            <Field label="WeChat ID">
              <div className="relative">
                <Input
                  value={draft.wechatId}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onFocus={() => setWechatOpen(true)}
                  onBlur={() => window.setTimeout(() => setWechatOpen(false), 120)}
                  onChange={(e) => {
                    setWechatOpen(true);
                    setDraft((d) => ({ ...d, wechatId: e.target.value }));
                  }}
                  placeholder="Enter WeChat ID"
                />
                {wechatOpen && filteredWechatSuggestions.length > 0 ? (
                  <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-bg-card shadow-card">
                    {filteredWechatSuggestions.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="block w-full px-2 py-1.5 text-left text-[12px] hover:bg-bg-subtle"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setWechatOpen(false);
                          setDraft((d) => ({ ...d, wechatId: w }));
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
          </div>
        </section>
      ) : null}

      <section className={sectionShellClass}>
        <div className={sectionBodyClass}>
          <div className="min-w-0" style={{ minWidth: `${LINE_TABLE_MIN_WIDTH}px` }}>
            <div
              className={`${LINE_GRID} sticky top-0 z-10 border-b border-border/60 bg-bg-card/95 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle backdrop-blur`}
              style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}
            >
              <span className="text-center">Pic + Dim</span>
              <span className="text-center">Product</span>
              <span>MARKA</span>
              <span>Detail 1</span>
              <span>Detail 2</span>
              <span>Detail 3</span>
              <span className="text-center">CTNs</span>
              <span className="text-center">pcs / ctn</span>
              <span className="text-center">Total PCS</span>
              <span className="text-center">Rate / PCS</span>
              <span className="text-center">Total Amount</span>
              <span className="text-center">Customer</span>
              <span className="text-center">Action</span>
            </div>

            <div className="flex flex-col gap-1 py-1.5">
              {draft.lines.map((l) => (
                <OrderLineRow
                  key={l.id}
                  line={l}
                  onChange={(patch) => updateLine(l.id, patch)}
                  customerSuggestions={customerSuggestions}
                  customers={customers}
                  onCustomerValidityChange={onCustomerValidityChange}
                  onRemove={() => {
                    if (onRemoveLine) onRemoveLine(l.id);
                  }}
                  onUploadingChange={onUploadingChange}
                  onPreviewImage={onPreviewImage}
                />
              ))}
              {draft.lines.length === 0 ? <div className="rounded-xl bg-bg-subtle/30 py-8 text-center text-[13px] text-fg-subtle">No lines yet</div> : null}
            </div>

            <button
              onClick={addLine}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-medium text-fg-muted transition-colors hover:bg-bg-subtle/40 hover:text-fg"
            >
              <Plus size={15} />
              Add New Line
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}



