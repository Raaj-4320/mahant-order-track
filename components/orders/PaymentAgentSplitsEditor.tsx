"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { PaymentAgent, PaymentAgentOrderSplit } from "@/lib/types";

type Props = {
  splits: PaymentAgentOrderSplit[];
  paymentAgents: PaymentAgent[];
  totalAmount: number;
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

export function PaymentAgentSplitsEditor({
  splits,
  paymentAgents,
  totalAmount,
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

  const totalAssigned = useMemo(
    () => splits.reduce((sum, split) => sum + (Number(split.assignedAmount) || 0), 0),
    [splits],
  );

  const updateSplit = (splitId: string, updater: (split: PaymentAgentOrderSplit) => PaymentAgentOrderSplit) => {
    onChange(splits.map((split) => (split.id === splitId ? updater(split) : split)));
  };

  return (
    <div className="rounded-xl border border-border bg-bg-card px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Payment Agent Splits</div>
          <div className="mt-0.5 text-[12px] text-fg-subtle">Assigned {totalAssigned} / {totalAmount}</div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}>+ Add Payment Agent</Button>
      </div>

      <div className="mt-3 space-y-2">
        {splits.map((split, index) => {
          const query = queries[split.id] ?? "";
          const normalizedQuery = normalizeValue(query);
          const suggestions = paymentAgents
            .filter((agent) => agent.status !== "inactive" && agent.lifecycle?.status !== "deleted")
            .filter((agent) => !normalizedQuery || normalizeValue(agent.name).includes(normalizedQuery) || normalizeValue(agent.agentCode).includes(normalizedQuery))
            .slice(0, 6);

          return (
            <div key={split.id} className="rounded-lg border border-border/80 bg-bg-subtle/40 px-2 py-2">
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(220px,1.5fr)_110px_110px_auto]">
                <div className="relative">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Agent {index + 1}</div>
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
                    placeholder="Type payment agent"
                    className="h-9 text-[12.5px]"
                  />
                  {openRowId === split.id ? (
                    <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-white shadow-card">
                      {suggestions.length > 0 ? (
                        suggestions.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            className="block w-full border-b border-border/60 px-3 py-2 text-left text-[12px] text-fg last:border-b-0 hover:bg-bg-subtle"
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
                            {agent.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[11.5px] text-fg-subtle">No matching payment agent</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Amount</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={split.assignedAmount ? String(split.assignedAmount) : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                        updateSplit(split.id, (current) => ({
                          ...current,
                          assignedAmount: nextValue === "" ? 0 : Number(nextValue),
                        }));
                      }
                    }}
                    placeholder="0"
                    className="h-9 text-[12.5px]"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Paid Now</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={split.paidNow ? String(split.paidNow) : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
                        updateSplit(split.id, (current) => ({
                          ...current,
                          paidNow: nextValue === "" ? 0 : Number(nextValue),
                        }));
                      }
                    }}
                    placeholder="0"
                    className="h-9 text-[12.5px]"
                  />
                </label>

                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={cn("h-9 px-3 text-[12px]", splits.length <= 1 && "opacity-70")}
                    onClick={() => onRemove(split.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
