"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent, PaymentAgentOrderSplit, PaymentAgentPaymentEvent } from "@/lib/types";

type Props = {
  splits: PaymentAgentOrderSplit[];
  events: PaymentAgentPaymentEvent[];
  paymentAgents: PaymentAgent[];
  availableCreditByAgentId?: Record<string, number>;
  onChange: (splits: PaymentAgentOrderSplit[]) => void;
  onAdd: () => void;
  onRemove: (splitId: string) => void;
};

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();

const getSplitLabel = (split: PaymentAgentOrderSplit) =>
  split.paymentAgentSnapshot?.name?.trim()
  || split.paymentAgentName?.trim()
  || split.paymentBy?.trim()
  || "";

type PickerRowProps = {
  split: PaymentAgentOrderSplit;
  index: number;
  totalSplits: number;
  paymentAgents: PaymentAgent[];
  availableCreditByAgentId?: Record<string, number>;
  query: string;
  duplicateKeys: Set<string>;
  onQueryChange: (value: string) => void;
  onSelect: (agent: PaymentAgent) => void;
  onClear: () => void;
  onRemove: () => void;
  onOpen: () => void;
  onClose: () => void;
  open: boolean;
};

function PaymentAgentPickerRow({
  split,
  index,
  totalSplits,
  paymentAgents,
  availableCreditByAgentId,
  query,
  duplicateKeys,
  onQueryChange,
  onSelect,
  onClear,
  onRemove,
  onOpen,
  onClose,
  open,
}: PickerRowProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ top: number; left: number; width: number } | null>(null);
  const [showAllAgents, setShowAllAgents] = useState(false);
  const normalizedQuery = normalizeValue(query);
  const collator = useMemo(() => new Intl.Collator(undefined, { sensitivity: "base", numeric: true }), []);
  const filteredAgents = paymentAgents
    .filter((agent) => agent.status !== "inactive" && agent.lifecycle?.status !== "deleted")
    .filter((agent) => !normalizedQuery || normalizeValue(agent.name).startsWith(normalizedQuery) || normalizeValue(agent.agentCode).startsWith(normalizedQuery) || normalizeValue(agent.id).startsWith(normalizedQuery))
    .sort((left, right) => collator.compare(left.name, right.name));
  const suggestions = filteredAgents.slice(0, 5);
  const typedDuplicate = Boolean(normalizedQuery && duplicateKeys.has(normalizedQuery));
  const selectedAgent =
    paymentAgents.find((agent) => agent.id === split.paymentAgentId)
    ?? paymentAgents.find((agent) => agent.id === split.paymentBy)
    ?? paymentAgents.find((agent) => normalizeValue(agent.name) === normalizeValue(getSplitLabel(split)))
    ?? null;
  const availableCredit = selectedAgent ? Math.max(0, Number(availableCreditByAgentId?.[selectedAgent.id]) || 0) : 0;

  useEffect(() => {
    if (!open) return;
    const updateLayout = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLayout({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [open]);

  return (
    <div className="w-[198px] shrink-0">
      <div className="flex items-center gap-2">
        <div ref={anchorRef} className="relative min-w-0 flex-1">
          <Input
            value={query}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onFocus={onOpen}
            onBlur={() => window.setTimeout(onClose, 120)}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onOpen();
            }}
            placeholder="Search payment agent"
            className={`h-10 rounded-xl bg-bg-card px-3 ${selectedAgent ? "pr-24" : "pr-8"} text-[13px] shadow-none ${typedDuplicate ? "border-[var(--danger)]/50 focus:border-[var(--danger)]" : "border-border/60"}`}
          />

          {selectedAgent ? (
            <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold text-emerald-600">
              {formatAmount(availableCredit)}
            </div>
          ) : null}

          {query || split.paymentAgentId || split.paymentBy ? (
            <button
              type="button"
              aria-label="Clear payment agent"
              title="Clear payment agent"
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
              onMouseDown={(event) => {
                event.preventDefault();
                onClear();
              }}
            >
              <X size={11} />
            </button>
          ) : null}

          {open && layout && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed z-[9999] overflow-hidden rounded-xl border border-border/70 bg-bg-card shadow-card"
                  style={{ top: layout.top, left: layout.left, width: layout.width }}
                >
                  {filteredAgents.length > 0 ? (
                    <>
                      {suggestions.map((agent) => {
                        const credit = Math.max(0, Number(availableCreditByAgentId?.[agent.id]) || 0);
                        const isUsed = duplicateKeys.has(normalizeValue(agent.id)) || duplicateKeys.has(normalizeValue(agent.name));
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            disabled={isUsed}
                            className={`block w-full border-b border-border/50 px-3 py-2 text-left text-[11.5px] last:border-b-0 ${isUsed ? "cursor-not-allowed bg-bg-subtle/40 text-fg-subtle" : "text-fg hover:bg-bg-subtle"}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (isUsed) return;
                              onSelect(agent);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">
                                {agent.name}
                                <span className="ml-1 text-emerald-600">- {formatAmount(credit)}</span>
                              </span>
                              {isUsed ? <span className="shrink-0 text-[10px] uppercase">Used</span> : null}
                            </div>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-[11.5px] font-medium text-brand hover:bg-bg-subtle"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setShowAllAgents(true);
                          onClose();
                        }}
                      >
                        + See all
                      </button>
                    </>
                  ) : (
                    <div className="px-3 py-2 text-[11.5px] text-fg-subtle">No matching payment agent. Add it from the Payment Agents tab first.</div>
                  )}
                </div>,
                document.body,
              )
            : null}
        </div>
        {totalSplits > 1 ? (
          <button
            type="button"
            aria-label={`Remove payment agent ${index + 1}`}
            title="Remove payment agent"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/60 bg-bg-card text-fg-subtle transition-colors hover:border-border hover:text-fg"
            onMouseDown={(event) => {
              event.preventDefault();
              onRemove();
            }}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
      {showAllAgents && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[10000] bg-black/40 p-4" onMouseDown={() => setShowAllAgents(false)}>
              <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-border bg-bg-card shadow-card" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="text-[14px] font-semibold text-fg">All Payment Agents</div>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
                    onClick={() => setShowAllAgents(false)}
                    aria-label="Close payment agent list"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  {filteredAgents.map((agent) => {
                    const credit = Math.max(0, Number(availableCreditByAgentId?.[agent.id]) || 0);
                    const isUsed = duplicateKeys.has(normalizeValue(agent.id)) || duplicateKeys.has(normalizeValue(agent.name));
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        disabled={isUsed}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-[12px] ${isUsed ? "cursor-not-allowed bg-bg-subtle/40 text-fg-subtle" : "text-fg hover:bg-bg-subtle"}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (isUsed) return;
                          setShowAllAgents(false);
                          onSelect(agent);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{agent.name}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-emerald-600">{formatAmount(credit)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function PaymentAgentHeaderPicker({
  splits,
  events: _events,
  paymentAgents,
  availableCreditByAgentId,
  onChange,
  onAdd,
  onRemove,
}: Props) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  useEffect(() => {
    setQueries((current) => {
      const next = { ...current };
      let changed = false;
      for (const split of splits) {
        if (openRowId === split.id) continue;
        const label = getSplitLabel(split);
        if ((next[split.id] ?? "") !== label) {
          next[split.id] = label;
          changed = true;
        }
      }
      Object.keys(next).forEach((id) => {
        if (!splits.some((split) => split.id === id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [splits, openRowId]);

  const duplicateKeysBySplit = useMemo(() => {
    const next: Record<string, Set<string>> = {};
    for (const split of splits) {
      const set = new Set<string>();
      for (const other of splits) {
        if (other.id === split.id) continue;
        const otherLabel = getSplitLabel(other);
        if (other.paymentAgentId) set.add(normalizeValue(other.paymentAgentId));
        if (otherLabel) set.add(normalizeValue(otherLabel));
      }
      next[split.id] = set;
    }
    return next;
  }, [splits]);

  const updateSplit = (splitId: string, updater: (split: PaymentAgentOrderSplit) => PaymentAgentOrderSplit) => {
    onChange(splits.map((split) => (split.id === splitId ? updater(split) : split)));
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[14px] font-medium tracking-[0.01em] text-fg-muted">Payment By</span>
      </div>

      <div className="overflow-x-auto overflow-y-visible pb-1">
        <div className="flex min-w-max items-center gap-2">
            {splits.map((split, index) => {
              const query = queries[split.id] ?? "";
              const duplicateKeys = duplicateKeysBySplit[split.id] ?? new Set<string>();

              return (
                <PaymentAgentPickerRow
                  key={split.id}
                  split={split}
                  index={index}
                  totalSplits={splits.length}
                  paymentAgents={paymentAgents}
                  availableCreditByAgentId={availableCreditByAgentId}
                  query={query}
                  duplicateKeys={duplicateKeys}
                  open={openRowId === split.id}
                  onOpen={() => setOpenRowId(split.id)}
                  onClose={() => {
                    setOpenRowId((current) => (current === split.id ? null : current));
                    setQueries((current) => ({
                      ...current,
                      [split.id]: getSplitLabel(split),
                    }));
                  }}
                  onQueryChange={(value) => {
                    setQueries((current) => ({ ...current, [split.id]: value }));
                  }}
                  onSelect={(agent) => {
                    setOpenRowId(null);
                    setQueries((current) => ({ ...current, [split.id]: agent.name }));
                    updateSplit(split.id, (current) => ({
                      ...current,
                      paymentAgentId: agent.id,
                      paymentBy: agent.id,
                      paymentAgentName: agent.name,
                      paymentAgentSnapshot: { id: agent.id, name: agent.name, code: agent.agentCode },
                    }));
                  }}
                  onClear={() => {
                    setQueries((current) => ({ ...current, [split.id]: "" }));
                    setOpenRowId(null);
                    updateSplit(split.id, (current) => ({
                      ...current,
                      paymentAgentId: "",
                      paymentBy: "",
                      paymentAgentName: "",
                      paymentAgentSnapshot: undefined,
                    }));
                  }}
                  onRemove={() => {
                    setOpenRowId(null);
                    onRemove(split.id);
                  }}
                />
              );
            })}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-10 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-medium shadow-none"
            onClick={onAdd}
          >
            + Add
          </Button>
        </div>
      </div>
    </div>
  );
}
