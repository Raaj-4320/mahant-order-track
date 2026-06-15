"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { orderLifecycleService } from "@/services/orderLifecycleService";
import type { RecycleBinEntry } from "@/lib/types";
import { formatIndianDateTime } from "@/lib/dateFormat";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { sanitizeUserFacingText } from "@/lib/userFacingText";
import { TablePagination } from "@/components/table/TablePagination";

export default function RecycleBinPage() {
  const PAGE_SIZE = 100;
  const [entries, setEntries] = useState<RecycleBinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { pushToast } = useStore();

  const load = async () => {
    setLoading(true);
    try {
      const rows = await orderLifecycleService.listRecycleBin();
      setEntries(rows);
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Failed to load recycle bin." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entry.status !== "deleted") return false;
      if (!normalized) return true;
      return [
        sanitizeUserFacingText(entry.label, ""),
        sanitizeUserFacingText(entry.originalReference, ""),
        entry.itemType,
        entry.referenceType || "",
        entry.deletedBy || "",
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [entries, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedEntries = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const restore = async (entry: RecycleBinEntry) => {
    try {
      await orderLifecycleService.restoreRecycleBinItem(entry.id, "recycle-bin-page");
      pushToast({ tone: "success", text: `${entry.label} restored.` });
      await load();
    } catch (error) {
      pushToast({ tone: "danger", text: error instanceof Error ? error.message : "Restore failed." });
    }
  };

  return (
    <PageShell title="Recycle Bin">
      <div className="space-y-4 p-6">
        <div className="card flex items-center gap-2 p-3">
          <div className="min-w-[280px] flex-1">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deleted orders, products, customers, agents..." leadingIcon={<Search size={14} />} />
          </div>
          <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-bg-subtle">
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2">Type</th>
                  <th>Label</th>
                  <th>Original Reference</th>
                  <th>Deleted At</th>
                  <th>Deleted By</th>
                  <th className="px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-subtle">Loading recycle bin…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-subtle">No deleted items found.</td></tr>
                ) : (
                  pagedEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{entry.referenceType ? `${entry.itemType} / ${entry.referenceType}` : entry.itemType}</td>
                      <td>{sanitizeUserFacingText(entry.label)}</td>
                      <td>{sanitizeUserFacingText(entry.originalReference)}</td>
                      <td>{entry.deletedAt ? formatIndianDateTime(entry.deletedAt) : "—"}</td>
                      <td>{entry.deletedBy || "system"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => void restore(entry)}>Restore</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination total={filtered.length} currentPage={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} label="recycle bin records" />
        </div>
      </div>
    </PageShell>
  );
}
