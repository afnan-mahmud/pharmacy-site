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
          row.buyerPhone.toLowerCase().includes(term) ||
          (row.invoiceNo && row.invoiceNo.toLowerCase().includes(term))
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

  const safeGrandTotal = report?.grandTotalPaisa || 0;
  const safeGrandProfit = report?.grandProfitPaisa || 0;
  const safeGrandCost = report?.grandCostPaisa || 0;
  const safeGrandDue = report?.grandDuePaisa ?? ((report?.retail?.duePaisa || 0) + (report?.wholesale?.duePaisa || 0));

  const safeRetailTotal = report?.retail?.totalPaisa || 0;
  const safeRetailCost = report?.retail?.costPaisa || 0;
  const safeRetailProfit = report?.retail?.profitPaisa || 0;
  const safeRetailDue = report?.retail?.duePaisa || 0;
  const safeRetailCount = report?.retail?.count || 0;

  const safeWholesaleTotal = report?.wholesale?.totalPaisa || 0;
  const safeWholesaleCost = report?.wholesale?.costPaisa || 0;
  const safeWholesaleProfit = report?.wholesale?.profitPaisa || 0;
  const safeWholesaleDue = report?.wholesale?.duePaisa || 0;
  const safeWholesaleCount = report?.wholesale?.count || 0;

  const grandMarginPercent =
    safeGrandTotal > 0 && Number.isFinite(safeGrandProfit)
      ? ((safeGrandProfit / safeGrandTotal) * 100).toFixed(1)
      : "0.0";

  const retailMarginPercent =
    safeRetailTotal > 0 && Number.isFinite(safeRetailProfit)
      ? ((safeRetailProfit / safeRetailTotal) * 100).toFixed(1)
      : "0.0";

  const wholesaleMarginPercent =
    safeWholesaleTotal > 0 && Number.isFinite(safeWholesaleProfit)
      ? ((safeWholesaleProfit / safeWholesaleTotal) * 100).toFixed(1)
      : "0.0";

  const field =
    "rounded-2xl border-0 bg-white/10 px-4 py-3 text-sm text-white focus:bg-white focus:text-ink focus:outline-none focus:ring-2 focus:ring-white transition [&::-webkit-calendar-picker-indicator]:invert-[1]";

  return (
    <div className="flex flex-col pb-6">
      {/* Header & Date Filter */}
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col gap-6">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              Report
            </h1>
            <p className="text-sm text-white/90">
              Bikri, Kroy Khoroch (Buying Cost) o Profit hisab.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-end gap-3 rounded-3xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm"
          >
            <div className="space-y-1">
              <label htmlFor="fromDate" className="text-sm font-medium text-white/90 ml-1">
                Shuru
              </label>
              <input
                id="fromDate"
                type="date"
                max={today}
                required
                className={field}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="toDate" className="text-sm font-medium text-white/90 ml-1">
                Sesh
              </label>
              <input
                id="toDate"
                type="date"
                max={today}
                required
                className={field}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-white hover:bg-white/90 px-6 py-3 text-sm font-bold text-brand-strong shadow-lg disabled:opacity-50 transition"
            >
              {busy ? "Wait..." : "Dekhao"}
            </button>
            <button
              type="button"
              onClick={() => setRange(today, today)}
              className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-3 text-sm font-medium text-white transition"
            >
              Aj
            </button>
            {error && (
              <p role="alert" className="w-full mt-2 text-sm text-yellow-300 ml-1">
                {error}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Main Totals Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Mot Bikri */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Mot Bikri
            </span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-strong">
              {safeRetailCount + safeWholesaleCount} ta sale
            </span>
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-ink">
            {formatTaka(safeGrandTotal)}
          </div>
          <div className="mt-1 text-xs text-muted">
            Total Revenue
          </div>
        </div>

        {/* Mot Kroy Khoroch */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Kroy Khoroch
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              Buying Cost
            </span>
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-slate-800">
            {formatTaka(safeGrandCost)}
          </div>
          <div className="mt-1 text-xs text-muted">
            Medicine purchase rate hisab
          </div>
        </div>

        {/* Mot Labh (Profit) */}
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Mot Labh (Profit)
            </span>
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
              {grandMarginPercent}% margin
            </span>
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-emerald-700">
            {formatTaka(safeGrandProfit)}
          </div>
          <div className="mt-1 text-xs font-medium text-emerald-800/80">
            Gross Profit (Bikri - Kroy)
          </div>
        </div>

        {/* Mot Baki */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Mot Baki
            </span>
            {(report?.cancelledCount || 0) > 0 && (
              <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">
                {report.cancelledCount} ta cancel
              </span>
            )}
          </div>
          <div className={`mt-2 font-display text-2xl font-extrabold ${
            safeGrandDue > 0 ? "text-amber-600" : "text-ink"
          }`}>
            {formatTaka(safeGrandDue)}
          </div>
          <div className="mt-1 text-xs text-muted">
            Ei somoy er baki
          </div>
        </div>
      </div>

      {/* Breakdown by Channel (Khuchra vs Wholesale) */}
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        {/* Retail Breakdown */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                Khuchra (Retail)
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted">{safeRetailCount} ta sale</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">Bikri</div>
              <div className="mt-0.5 font-bold text-ink">{formatTaka(safeRetailTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Kroy Khoroch</div>
              <div className="mt-0.5 font-bold text-slate-700">{formatTaka(safeRetailCost)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Labh ({retailMarginPercent}%)</div>
              <div className="mt-0.5 font-bold text-emerald-600">{formatTaka(safeRetailProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Baki</div>
              <div className={`mt-0.5 font-bold ${safeRetailDue > 0 ? "text-amber-600" : "text-ink"}`}>
                {formatTaka(safeRetailDue)}
              </div>
            </div>
          </div>
        </div>

        {/* Wholesale Breakdown */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand-strong">
                Wholesale (পাইকারি)
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted">{safeWholesaleCount} ta sale</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">Bikri</div>
              <div className="mt-0.5 font-bold text-ink">{formatTaka(safeWholesaleTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Kroy Khoroch</div>
              <div className="mt-0.5 font-bold text-slate-700">{formatTaka(safeWholesaleCost)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Labh ({wholesaleMarginPercent}%)</div>
              <div className="mt-0.5 font-bold text-emerald-600">{formatTaka(safeWholesaleProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Baki</div>
              <div className={`mt-0.5 font-bold ${safeWholesaleDue > 0 ? "text-amber-600" : "text-ink"}`}>
                {formatTaka(safeWholesaleDue)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buyer nam, phone number ba invoice diye khojo..."
          className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition shadow-sm"
        />
      </div>

      {/* Sales Table with Cost & Profit */}
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas/50 text-left text-muted">
            <tr>
              <th className="px-4 py-3.5 font-medium">Date</th>
              <th className="px-4 py-3.5 font-medium">Dhoron</th>
              <th className="px-4 py-3.5 font-medium">Invoice / Buyer</th>
              <th className="px-4 py-3.5 text-right font-medium">Mot Bikri</th>
              <th className="px-4 py-3.5 text-right font-medium">Kroy Khoroch</th>
              <th className="px-4 py-3.5 text-right font-medium">Labh (Profit)</th>
              <th className="px-4 py-3.5 text-right font-medium">Joma</th>
              <th className="px-4 py-3.5 text-right font-medium">Baki</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
                  {search.trim()
                    ? `"${search}" e kono bikri pawa jay ni.`
                    : "Ei somoy e kono bikri nai."}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr
                key={row.saleId}
                className={`border-b border-line/50 last:border-0 hover:bg-canvas/30 transition ${
                  row.cancelled ? "text-muted bg-danger-bg/20" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-ink/80">
                  {formatDhakaDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      row.type === "retail"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-brand/10 text-brand-strong"
                    }`}
                  >
                    {row.type === "retail" ? "Khuchra" : "Wholesale"}
                  </span>
                  {row.cancelled && (
                    <span className="ml-2 inline-flex rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">
                      Cancelled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.invoiceNo ? (
                    <Link
                      href={`/invoice/${row.saleId}`}
                      className="font-bold text-brand hover:text-brand-strong hover:underline transition"
                    >
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
                    row.type === "retail" && (
                      <div className="mt-0.5 text-xs font-medium text-muted/70">
                        (naam nai)
                      </div>
                    )
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right font-bold text-ink ${
                    row.cancelled ? "line-through opacity-50" : ""
                  }`}
                >
                  {formatTaka(row.totalPaisa)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium text-slate-600 ${
                    row.cancelled ? "line-through opacity-50" : ""
                  }`}
                >
                  {formatTaka(row.costPaisa)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-bold ${
                    row.cancelled
                      ? "line-through opacity-50 text-muted"
                      : row.profitPaisa >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {row.profitPaisa > 0 ? "+" : ""}
                  {formatTaka(row.profitPaisa)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-ink/80">
                  {formatTaka(row.paidPaisa)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-bold ${
                    !row.cancelled && row.duePaisa > 0
                      ? "text-danger"
                      : "text-ink/80"
                  }`}
                >
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
