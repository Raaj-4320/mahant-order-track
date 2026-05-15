"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/types";

const isContent = (o: Order) => Boolean(o.wechatId?.trim() || o.paymentBy || o.paymentAgentId || o.lines.some((l) => l.details?.trim() || l.marka?.trim() || l.totalCtns || l.pcsPerCtn || l.rmbPerPcs || l.photoUrl || l.productPhotoUrl));

export function useDraftAutosave(params: { enabled: boolean; draft: Order; activeUploads: number; autosaveDraft: (order: Order) => Promise<Order>; onSaved?: (order: Order) => void; debounceMs?: number; }) {
  const { enabled, draft, activeUploads, autosaveDraft, onSaved, debounceMs = 1000 } = params;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | null>(null);
  const lastPayloadRef = useRef<string>("");
  useEffect(() => {
    if (!enabled || activeUploads > 0 || draft.status !== "draft" || !isContent(draft)) return;
    const payloadKey = JSON.stringify(draft);
    if (lastPayloadRef.current === payloadKey) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try { setStatus("saving"); const saved = await autosaveDraft({ ...draft, status: "draft" }); lastPayloadRef.current = payloadKey; onSaved?.(saved); setStatus("saved"); }
      catch { setStatus("error"); }
    }, debounceMs);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [enabled, draft, activeUploads, autosaveDraft, onSaved, debounceMs]);
  return status;
}
