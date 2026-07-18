"use client";

import { useState } from "react";
import Link from "next/link";
import { salesReport, type SalesReport } from "@/actions/reports";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";

export function ReportView({
  initialReport,
  today,
}: {
  initialReport: SalesReport;
  today: string;
}) {
  const [report, setReport] = useState(initialReport);
  const [fromDate, setFromDate] = useState(initialReport.fromDate);
  const [toDate, setToDate] = useState(initialReport.toDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setReport(await salesReport(fromDate, toDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  function setRange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
  }

  const field = "rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-extrabold text-ink">Report</h1>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="fromDate" className="text-sm text-ink">Shuru</label>
            <input id="fromDate" type="date" max={today} required className={field}
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="toDate" className="text-sm text-ink">Sesh</label>
            <input id="toDate" type="date" max={today} required className={field}
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}
            className="rounded-full bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Wait..." : "Dekhao"}
          </button>
          <button type="button" onClick={() => setRange(today, today)}
            className="rounded-lg border border-line px-3 py-2 text-xs">
            Aj
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs text-muted">Khuchra bikri</div>
          <div className="font-display text-lg font-extrabold text-ink">
            {formatTaka(report.retail.totalPaisa)}
          </div>
          <div className="text-xs text-muted">{report.retail.count} ta</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs text-muted">Wholesale bikri</div>
          <div className="font-display text-lg font-extrabold text-ink">
            {formatTaka(report.wholesale.totalPaisa)}
          </div>
          <div className="text-xs text-muted">
            {report.wholesale.count} ta · baki {formatTaka(report.wholesale.duePaisa)}
          </div>
        </div>
        <div className="rounded-xl bg-brand-tint p-4 shadow-sm">
          <div className="text-xs text-brand-strong">Mot bikri</div>
          <div className="text-lg font-semibold text-brand-deep">
            {formatTaka(report.grandTotalPaisa)}
          </div>
          {report.cancelledCount > 0 && (
            <div className="text-xs text-muted">
              {report.cancelledCount} ta cancel (hisab e nai)
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Dhoron</th>
              <th className="p-3">Invoice / Buyer</th>
              <th className="p-3 text-right">Mot</th>
              <th className="p-3 text-right">Joma</th>
              <th className="p-3 text-right">Baki</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  Ei somoy e kono bikri nai.
                </td>
              </tr>
            )}
            {report.rows.map((row) => (
              <tr key={row.saleId}
                className={`border-b border-line ${row.cancelled ? "text-muted" : ""}`}>
                <td className="p-3">{formatDhakaDateTime(row.createdAt)}</td>
                <td className="p-3">
                  {row.type === "retail" ? "Khuchra" : "Wholesale"}
                  {row.cancelled && (
                    <span className="ml-2 text-xs text-danger">Cancelled</span>
                  )}
                </td>
                <td className="p-3">
                  {row.invoiceNo ? (
                    <Link href={`/invoice/${row.saleId}`} className="text-brand-strong hover:underline">
                      {row.invoiceNo}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  {row.buyerName && (
                    <span className="ml-2 text-xs text-muted">{row.buyerName}</span>
                  )}
                </td>
                <td className={`p-3 text-right ${row.cancelled ? "line-through" : ""}`}>
                  {formatTaka(row.totalPaisa)}
                </td>
                <td className="p-3 text-right">{formatTaka(row.paidPaisa)}</td>
                <td className={`p-3 text-right ${
                  !row.cancelled && row.duePaisa > 0 ? "text-danger" : ""
                }`}>
                  {formatTaka(row.duePaisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
