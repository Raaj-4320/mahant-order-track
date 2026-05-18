import { formatIndianDate } from "@/lib/dateFormat";

export function openStatementPdfPrint(title: string, fileName: string, html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${fileName}.pdf</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}</style></head><body><div style="display:flex;justify-content:space-between"><h2>${title}</h2><div>Generated: ${formatIndianDate(new Date())}</div></div>${html}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
