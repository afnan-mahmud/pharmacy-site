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
  const [search, setSearch] = useState("");

  const filteredRows = search.trim()
    ? report.rows.filter((row) => {
        const term = search.toLowerCase();
        return (
          row.buyerName.toLowerCase().includes(term) ||
          row.buyerPhone.toLowerCase().includes(term)
        );
      })
    : report.rows;

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

  const field = "rounded-2xl border-0 bg-white/10 px-4 py-3 text-sm text-white focus:bg-white focus:text-ink focus:outline-none focus:ring-2 focus:ring-white transition [&::-webkit-calendar-picker-indicator]:invert-[1]";

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col gap-6">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              Report
            </h1>
            <p className="text-sm text-white/90">
              Bikrir hisab o statistics.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-3xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
            <div className="space-y-1">
              <label htmlFor="fromDate" className="text-sm font-medium text-white/90 ml-1">Shuru</label>
              <input id="fromDate" type="date" max={today} required className={field}
                value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="toDate" className="text-sm font-medium text-white/90 ml-1">Sesh</label>
              <input id="toDate" type="date" max={today} required className={field}
                value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <button type="submit" disabled={busy}
              className="rounded-full bg-white hover:bg-white/90 px-6 py-3 text-sm font-bold text-brand-strong shadow-lg disabled:opacity-50 transition">
              {busy ? "Wait..." : "Dekhao"}
            </button>
            <button type="button" onClick={() => setRange(today, today)}
              className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-3 text-sm font-medium text-white transition">
              Aj
            </button>
            {error && <p role="alert" className="w-full mt-2 text-sm text-yellow-300 ml-1">{error}</p>}
          </form>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-md">
          <div className="text-sm font-medium text-muted">Khuchra bikri</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-ink">
            {formatTaka(report.retail.totalPaisa)}
          </div>
          <div className="mt-1 text-xs text-muted">{report.retail.count} ta</div>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-md">
          <div className="text-sm font-medium text-muted">Wholesale bikri</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-ink">
            {formatTaka(report.wholesale.totalPaisa)}
          </div>
          <div className="mt-1 text-xs text-muted">
            {report.wholesale.count} ta · baki {formatTaka(report.wholesale.duePaisa)}
          </div>
        </div>
        <div className="rounded-3xl bg-brand-tint border border-brand/20 p-5 shadow-md">
          <div className="text-sm font-bold text-brand-strong">Mot bikri</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-brand-deep">
            {formatTaka(report.grandTotalPaisa)}
          </div>
          {report.cancelledCount > 0 && (
            <div className="mt-1 text-xs font-medium text-danger/80">
              {report.cancelledCount} ta cancel (hisab e nai)
            </div>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buyer nam ba phone number diye khojo..."
          className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
        />
      </div>

      <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-md">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas/50 text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Dhoron</th>
              <th className="px-4 py-3 font-medium">Invoice / Buyer</th>
              <th className="px-4 py-3 text-right font-medium">Mot</th>
              <th className="px-4 py-3 text-right font-medium">Joma</th>
              <th className="px-4 py-3 text-right font-medium">Baki</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  {search.trim() ? `"${search}" e kono bikri pawa jay ni.` : "Ei somoy e kono bikri nai."}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.saleId}
                className={`border-b border-line/50 last:border-0 ${row.cancelled ? "text-muted bg-danger-bg/20" : ""}`}>
                <td className="px-4 py-3 font-medium text-ink/80">{formatDhakaDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${row.type === 'retail' ? 'bg-blue-50 text-blue-700' : 'bg-brand/10 text-brand-strong'}`}>
                    {row.type === "retail" ? "Khuchra" : "Wholesale"}
                  </span>
                  {row.cancelled && (
                    <span className="ml-2 inline-flex rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">Cancelled</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.invoiceNo ? (
                    <Link href={`/invoice/${row.saleId}`} className="font-bold text-brand hover:text-brand-strong hover:underline transition">
                      {row.invoiceNo}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  {row.buyerName ? (
                    <div className="mt-0.5 text-xs font-medium text-muted">
                      {row.buyerName}
                      {row.buyerPhone ? ` · ${row.buyerPhone}` : ""}
                    </div>
                  ) : (
                    // Retail sales made before the counter asked for a
                    // customer have no name and cannot be backfilled.
                    row.type === "retail" && (
                      <div className="mt-0.5 text-xs font-medium text-muted/70">
                        (naam nai)
                      </div>
                    )
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-bold text-ink ${row.cancelled ? "line-through opacity-50" : ""}`}>
                  {formatTaka(row.totalPaisa)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-ink/80">{formatTaka(row.paidPaisa)}</td>
                <td className={`px-4 py-3 text-right font-bold ${
                  !row.cancelled && row.duePaisa > 0 ? "text-danger" : "text-ink/80"
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
