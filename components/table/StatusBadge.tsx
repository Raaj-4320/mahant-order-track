import { cn } from "@/lib/cn";

export function StatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase();
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium capitalize border",
      tone === "active" || tone === "paid" || tone === "packed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
      tone === "delayed" || tone === "inactive" ? "border-rose-200 bg-rose-50 text-rose-700" :
      "border-amber-200 bg-amber-50 text-amber-700")}>{status}</span>
  );
}
