"use client";

type Props = {
  total: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  label?: string;
};

export function TablePagination({ total, currentPage, pageSize, onPageChange, label = "rows" }: Props) {
  const hasInteractivePagination = Boolean(onPageChange && pageSize && pageSize > 0);
  const totalPages = hasInteractivePagination ? Math.max(1, Math.ceil(total / (pageSize || 1))) : 1;
  const safeCurrentPage = hasInteractivePagination ? Math.min(Math.max(currentPage || 1, 1), totalPages) : 1;
  const startRow = hasInteractivePagination && total > 0 ? (safeCurrentPage - 1) * (pageSize || 0) + 1 : total === 0 ? 0 : 1;
  const endRow = hasInteractivePagination ? Math.min(total, safeCurrentPage * (pageSize || 0)) : total;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[12px] text-fg-subtle">
      <div>{total.toLocaleString()} {label === "rows" && total === 1 ? "row" : label}</div>
      {hasInteractivePagination ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 transition-colors hover:bg-bg-subtle disabled:opacity-50"
            onClick={() => onPageChange?.(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1}
          >
            Previous
          </button>
          <div>
            Page {safeCurrentPage} of {totalPages}
          </div>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 transition-colors hover:bg-bg-subtle disabled:opacity-50"
            onClick={() => onPageChange?.(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages}
          >
            Next
          </button>
          <div>
            {startRow}-{endRow} shown
          </div>
        </div>
      ) : (
        <div>Showing current results</div>
      )}
    </div>
  );
}
