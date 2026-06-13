"use client";

type Props = {
  open: boolean;
  title?: string;
  message?: string;
};

export function LoadingOverlay({ open, title = "Loading", message = "Please wait..." }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/35 p-4">
      <div className="card w-full max-w-sm p-5 text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-[var(--brand)]" />
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-1 text-sm text-fg-subtle">{message}</div>
      </div>
    </div>
  );
}
