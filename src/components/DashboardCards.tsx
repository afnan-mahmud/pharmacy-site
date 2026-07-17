import Link from "next/link";
import type { DashboardSummary } from "@/actions/dashboard";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-teal-50 p-4 shadow-sm">
          <div className="text-xs text-teal-700">Aj ker bikri</div>
          <div className="text-2xl font-semibold text-teal-900">
            {formatTaka(summary.todayTotalPaisa)}
          </div>
          <div className="mt-1 text-xs text-teal-700">
            {summary.todaySaleCount} ta bikri · khuchra{" "}
            {formatTaka(summary.todayRetailPaisa)} · wholesale{" "}
            {formatTaka(summary.todayWholesalePaisa)}
          </div>
        </div>

        <Link href="/due" className="rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="text-xs text-slate-500">Mot baki</div>
          <div className={`text-2xl font-semibold ${
            summary.totalDuePaisa > 0 ? "text-red-600" : "text-slate-400"
          }`}>
            {formatTaka(summary.totalDuePaisa)}
          </div>
          {summary.totalCreditPaisa > 0 && (
            <div className="mt-1 text-xs text-teal-700">
              Buyer der joma ache {formatTaka(summary.totalCreditPaisa)}
            </div>
          )}
        </Link>

        <Link href="/medicines" className="rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="text-xs text-slate-500">Stock kom</div>
          <div className={`text-2xl font-semibold ${
            summary.lowStock.length > 0 ? "text-amber-600" : "text-slate-400"
          }`}>
            {summary.lowStock.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">ta medicine</div>
        </Link>
      </div>

      {summary.lowStock.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-slate-900">Stock kome geche</h2>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="p-3">Medicine</th>
                  <th className="p-3">Ekhon ache</th>
                  <th className="p-3">Alert level</th>
                </tr>
              </thead>
              <tbody>
                {summary.lowStock.map((row) => (
                  <tr key={row.medicineId} className="border-b border-slate-100">
                    <td className="p-3 font-medium text-slate-900">{row.name}</td>
                    <td className="p-3 font-medium text-amber-600">
                      {formatStock(row.stockPatas, row.patasPerBox)}
                    </td>
                    <td className="p-3 text-slate-500">
                      {row.lowStockThreshold} pata
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Stock In menu theke notun maal dhukao.
          </p>
        </div>
      )}
    </div>
  );
}
