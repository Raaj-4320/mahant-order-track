import { ChevronLeft, ChevronRight } from "lucide-react";

export function TablePagination({
  total,
  onPageChange,
}: {
  total: number;
  onPageChange?: () => void;
}) {
  const isPaginated = Boolean(onPageChange);
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[12px] text-fg-subtle">
      <span>Showing 1-{Math.min(total, 10)} of {total}</span>
      <div className="flex items-center gap-2">
        <button onClick={onPageChange} disabled={!isPaginated} title={!isPaginated ? "Pagination is not enabled in this phase." : undefined} aria-label="Previous page" className="rounded-md border border-border px-2 py-1 disabled:opacity-60"><ChevronLeft size={13} /></button>
        <span className="rounded-md border border-border px-2 py-1 text-fg">1</span>
        <button onClick={onPageChange} disabled={!isPaginated} title={!isPaginated ? "Pagination is not enabled in this phase." : undefined} aria-label="Next page" className="rounded-md border border-border px-2 py-1 disabled:opacity-60"><ChevronRight size={13} /></button>
        <span className="ml-2">Rows: 10</span>
      </div>
    </div>
  );
}
