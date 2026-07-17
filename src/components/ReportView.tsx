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

  const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Report</h1>

      <form onSubmit={handleSubmit} className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="fromDate" className="text-sm text-slate-700">Shuru</label>
            <input id="fromDate" type="date" max={today} required className={field}
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="toDate" className="text-sm text-slate-700">Sesh</label>
            <input id="toDate" type="date" max={today} required className={field}
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Wait..." : "Dekhao"}
          </button>
          <button type="button" onClick={() => setRange(today, today)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
            Aj
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Khuchra bikri</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatTaka(report.retail.totalPaisa)}
          </div>
          <div className="text-xs text-slate-500">{report.retail.count} ta</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Wholesale bikri</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatTaka(report.wholesale.totalPaisa)}
          </div>
          <div className="text-xs text-slate-500">
            {report.wholesale.count} ta · baki {formatTaka(report.wholesale.duePaisa)}
          </div>
        </div>
        <div className="rounded-xl bg-teal-50 p-4 shadow-sm">
          <div className="text-xs text-teal-700">Mot bikri</div>
          <div className="text-lg font-semibold text-teal-900">
            {formatTaka(report.grandTotalPaisa)}
          </div>
          {report.cancelledCount > 0 && (
            <div className="text-xs text-slate-500">
              {report.cancelledCount} ta cancel (hisab e nai)
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
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
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  Ei somoy e kono bikri nai.
                </td>
              </tr>
            )}
            {report.rows.map((row) => (
              <tr key={row.saleId}
                className={`border-b border-slate-100 ${row.cancelled ? "text-slate-400" : ""}`}>
                <td className="p-3">{formatDhakaDateTime(row.createdAt)}</td>
                <td className="p-3">
                  {row.type === "retail" ? "Khuchra" : "Wholesale"}
                  {row.cancelled && (
                    <span className="ml-2 text-xs text-red-600">Cancelled</span>
                  )}
                </td>
                <td className="p-3">
                  {row.invoiceNo ? (
                    <Link href={`/invoice/${row.saleId}`} className="text-teal-700 hover:underline">
                      {row.invoiceNo}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                  {row.buyerName && (
                    <span className="ml-2 text-xs text-slate-500">{row.buyerName}</span>
                  )}
                </td>
                <td className={`p-3 text-right ${row.cancelled ? "line-through" : ""}`}>
                  {formatTaka(row.totalPaisa)}
                </td>
                <td className="p-3 text-right">{formatTaka(row.paidPaisa)}</td>
                <td className={`p-3 text-right ${
                  !row.cancelled && row.duePaisa > 0 ? "text-red-600" : ""
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
