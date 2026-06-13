"use client";

type Props = {
  total: number;
};

export function TablePagination({ total }: Props) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[12px] text-fg-subtle">
      <div>{total.toLocaleString()} row{total === 1 ? "" : "s"}</div>
      <div>Showing current results</div>
    </div>
  );
}
