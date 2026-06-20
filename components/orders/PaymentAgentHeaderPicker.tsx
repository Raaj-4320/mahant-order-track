"use client";

import { useEffect, useState } from "react";
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
  if (agent) {
    return `Credit left: ${formatAmount(agent.creditBalance ?? 0)}`;
  }
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

  const updateSplit = (splitId: string, updater: (split: PaymentAgentOrderSplit) => PaymentAgentOrderSplit) => {
    onChange(splits.map((split) => (split.id === splitId ? updater(split) : split)));
  };

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <span className="pt-2 text-[11.5px] text-fg-muted">Payment By</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        {splits.map((split, index) => {
          const query = queries[split.id] ?? "";
          const normalizedQuery = normalizeValue(query);
          const resolvedAgent =
            paymentAgents.find((agent) => agent.id === split.paymentAgentId)
            ?? paymentAgents.find((agent) => agent.id === split.paymentBy)
            ?? paymentAgents.find((agent) => normalizeValue(agent.name) === normalizeValue(split.paymentAgentName || split.paymentBy || query))
            ?? null;
          const suggestions = paymentAgents
            .filter((agent) => agent.status !== "inactive" && agent.lifecycle?.status !== "deleted")
            .filter((agent) => !normalizedQuery || normalizeValue(agent.name).includes(normalizedQuery) || normalizeValue(agent.agentCode).includes(normalizedQuery) || normalizeValue(agent.id).includes(normalizedQuery))
            .slice(0, 6);

          return (
            <div key={split.id} className="w-[168px] max-w-full">
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={query}
                    onFocus={() => setOpenRowId(split.id)}
                    onBlur={() => window.setTimeout(() => setOpenRowId((current) => (current === split.id ? null : current)), 120)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setQueries((current) => ({ ...current, [split.id]: nextValue }));
                      setOpenRowId(split.id);
                      updateSplit(split.id, (current) => ({
                        ...current,
                        paymentAgentId: "",
                        paymentBy: nextValue,
                        paymentAgentName: nextValue,
                        paymentAgentSnapshot: undefined,
                      }));
                    }}
                    placeholder={index === 0 ? "Search payment agent" : "Add another payment agent"}
                    className="h-10 rounded-xl border-border/60 bg-bg-card px-3 text-[12px] shadow-none"
                  />
                  {query || split.paymentAgentId || split.paymentBy ? (
                    <button
                      type="button"
                      aria-label="Clear payment agent"
                      title="Clear payment agent"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-medium text-fg-subtle transition-colors hover:text-fg"
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
                      x
                    </button>
                  ) : null}
                  {openRowId === split.id ? (
                    <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border/70 bg-bg-card shadow-card">
                      {suggestions.length > 0 ? (
                        suggestions.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            className="block w-full border-b border-border/50 px-2.5 py-1.5 text-left text-[11.5px] text-fg last:border-b-0 hover:bg-bg-subtle"
                            onMouseDown={(event) => {
                              event.preventDefault();
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
                            {(agent.creditBalance ?? 0) > 0 ? `${agent.name} - Credit: ${formatAmount(agent.creditBalance ?? 0)}` : agent.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[11.5px] text-fg-subtle">No matching payment agent</div>
                      )}
                    </div>
                  ) : null}
                </div>

                {splits.length > 1 ? (
                  <button type="button" aria-label="Remove payment agent" title="Remove payment agent" className="shrink-0 pt-0.5 text-[11px] font-medium text-fg-subtle hover:text-fg" onClick={() => onRemove(split.id)}>x</button>
                ) : null}
              </div>

              <div className="mt-0.5 truncate text-[10px] leading-tight text-fg-subtle">
                {resolvedAgent ? `Credit left: ${formatAmount(resolvedAgent.creditBalance ?? 0)}` : getPaymentAgentNote(resolvedAgent, query)}
              </div>
            </div>
          );
        })}

        <Button type="button" size="sm" variant="secondary" className="h-10 whitespace-nowrap rounded-xl border-border/60 px-3 text-[12px] shadow-none" onClick={onAdd}>
          + Add Payment Agent
        </Button>
      </div>
    </div>
  );
}
