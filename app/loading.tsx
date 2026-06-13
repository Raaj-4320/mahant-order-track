export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-sm p-5 text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-[var(--brand)]" />
        <div className="text-lg font-semibold">Loading</div>
        <div className="mt-1 text-sm text-fg-subtle">Fetching the latest data...</div>
      </div>
    </div>
  );
}
