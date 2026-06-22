"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatAmount } from "@/lib/data";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";

type Props = {
  splits: PaymentAgentOrderSplit[];
  paymentAgents: PaymentAgent[];
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

const getPaymentAgentNote = (agent: PaymentAgent | null, query: string) => {
  if (agent) return `Credit left: ${formatAmount(agent.creditBalance ?? 0)}`;
  return query.trim() ? "Creates on save" : "Credit left: 0";
};

export function PaymentAgentHeaderPicker({
  splits,
  paymentAgents,
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

  const primarySplit = splits[0] ?? null;
  const primaryAgent =
    primarySplit
      ? paymentAgents.find((agent) => agent.id === primarySplit.paymentAgentId)
        ?? paymentAgents.find((agent) => agent.id === primarySplit.paymentBy)
        ?? paymentAgents.find((agent) => normalizeValue(agent.name) === normalizeValue(getSplitLabel(primarySplit)))
        ?? null
      : null;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[14px] font-medium tracking-[0.01em] text-fg-muted">Payment By</span>
        <span className="min-w-0 truncate text-[14px] font-medium tracking-[0.01em] text-fg-subtle">
          {primaryAgent ? `Credit left: ${formatAmount(primaryAgent.creditBalance ?? 0)}` : "Credit left: 0"}
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-visible pb-1">
        <div className="flex min-w-max items-center gap-2">
            {splits.map((split, index) => {
              const query = queries[split.id] ?? "";
              const normalizedQuery = normalizeValue(query);
              const duplicateKeys = duplicateKeysBySplit[split.id] ?? new Set<string>();
              const resolvedAgent =
                paymentAgents.find((agent) => agent.id === split.paymentAgentId)
                ?? paymentAgents.find((agent) => agent.id === split.paymentBy)
                ?? paymentAgents.find((agent) => normalizeValue(agent.name) === normalizeValue(split.paymentAgentName || split.paymentBy || query))
                ?? null;
              const suggestions = paymentAgents
                .filter((agent) => agent.status !== "inactive" && agent.lifecycle?.status !== "deleted")
                .filter((agent) => !normalizedQuery || normalizeValue(agent.name).includes(normalizedQuery) || normalizeValue(agent.agentCode).includes(normalizedQuery) || normalizeValue(agent.id).includes(normalizedQuery))
                .slice(0, 8);
              const typedDuplicate = Boolean(normalizedQuery && duplicateKeys.has(normalizedQuery));

              return (
                <div key={split.id} className="flex w-[198px] shrink-0 items-center gap-1.5">
                  <div className="relative min-w-0 flex-1 overflow-visible">
                    <Input
                      value={query}
                      onFocus={() => setOpenRowId(split.id)}
                      onBlur={() => window.setTimeout(() => setOpenRowId((current) => (current === split.id ? null : current)), 120)}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        const normalizedNextValue = normalizeValue(nextValue);
                        setQueries((current) => ({ ...current, [split.id]: nextValue }));
                        setOpenRowId(split.id);

                        if (normalizedNextValue && duplicateKeys.has(normalizedNextValue)) {
                          return;
                        }

                        updateSplit(split.id, (current) => ({
                          ...current,
                          paymentAgentId: "",
                          paymentBy: nextValue,
                          paymentAgentName: nextValue,
                          paymentAgentSnapshot: undefined,
                        }));
                      }}
                      placeholder="Search payment agent"
                      className={`h-10 rounded-xl bg-bg-card px-3 pr-8 text-[13px] shadow-none ${typedDuplicate ? "border-[var(--danger)]/50 focus:border-[var(--danger)]" : "border-border/60"}`}
                    />

                    {query || split.paymentAgentId || split.paymentBy ? (
                      <button
                        type="button"
                        aria-label="Clear payment agent"
                        title="Clear payment agent"
                        className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
                        onMouseDown={(event) => {
                          event.preventDefault();
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
                      >
                        <X size={11} />
                      </button>
                    ) : null}

                    {openRowId === split.id ? (
                      <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 overflow-hidden rounded-xl border border-border/70 bg-bg-card shadow-card">
                        {suggestions.length > 0 ? (
                          suggestions.map((agent) => {
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
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">{(agent.creditBalance ?? 0) > 0 ? `${agent.name} - Credit: ${formatAmount(agent.creditBalance ?? 0)}` : agent.name}</span>
                                  {isUsed ? <span className="shrink-0 text-[10px] uppercase">Used</span> : null}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-2 text-[11.5px] text-fg-subtle">No matching payment agent</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {splits.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove payment agent ${index + 1}`}
                      title="Remove payment agent"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-bg-card text-fg-subtle transition-colors hover:border-border hover:text-fg"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setOpenRowId(null);
                        onRemove(split.id);
                      }}
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>
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
