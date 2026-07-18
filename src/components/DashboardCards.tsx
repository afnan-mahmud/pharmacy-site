import Link from "next/link";
import type { DashboardSummary } from "@/actions/dashboard";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { card, pageTitle, thead, th, td, trow } from "@/components/ui";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-5">
      <h1 className={pageTitle}>Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's sales — the hero figure, on the brand gradient. */}
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-deep p-5 text-white shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="text-xs font-semibold text-white/80">Aj ker bikri</div>
          <div className="mt-1 font-display text-3xl font-extrabold">
            {formatTaka(summary.todayTotalPaisa)}
          </div>
          <div className="mt-2 text-xs text-white/85">
            {summary.todaySaleCount} ta bikri · khuchra{" "}
            {formatTaka(summary.todayRetailPaisa)} · wholesale{" "}
            {formatTaka(summary.todayWholesalePaisa)}
          </div>
        </div>

        <StatCard href="/due" label="Mot baki" accent={summary.totalDuePaisa > 0 ? "danger" : "muted"}>
          <div className={`font-display text-2xl font-extrabold ${summary.totalDuePaisa > 0 ? "text-danger" : "text-muted"}`}>
            {formatTaka(summary.totalDuePaisa)}
          </div>
          {summary.totalCreditPaisa > 0 && (
            <div className="mt-1 text-xs font-medium text-brand-strong">
              Buyer der joma ache {formatTaka(summary.totalCreditPaisa)}
            </div>
          )}
        </StatCard>

        <StatCard href="/medicines" label="Stock kom" accent={summary.lowStock.length > 0 ? "warn" : "muted"}>
          <div className={`font-display text-2xl font-extrabold ${summary.lowStock.length > 0 ? "text-warn" : "text-muted"}`}>
            {summary.lowStock.length}
          </div>
          <div className="mt-1 text-xs text-muted">ta medicine</div>
        </StatCard>

        {summary.pendingOrderCount > 0 ? (
          <StatCard href="/orders" label="Pending order" accent="warn">
            <div className="font-display text-2xl font-extrabold text-warn">
              {summary.pendingOrderCount}
            </div>
            <div className="mt-1 text-xs text-muted">ta approve korar opekkhay</div>
          </StatCard>
        ) : (
          <StatCard href="/orders" label="Pending order" accent="muted">
            <div className="font-display text-2xl font-extrabold text-muted">0</div>
            <div className="mt-1 text-xs text-muted">sob approve kora</div>
          </StatCard>
        )}
      </div>

      {summary.lowStock.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm font-bold text-ink">
            Stock kome geche
          </h2>
          <div className={`overflow-x-auto ${card}`}>
            <table className="w-full">
              <thead className={thead}>
                <tr>
                  <th className={th}>Medicine</th>
                  <th className={th}>Ekhon ache</th>
                  <th className={th}>Alert level</th>
                </tr>
              </thead>
              <tbody>
                {summary.lowStock.map((row) => (
                  <tr key={row.medicineId} className={trow}>
                    <td className={`${td} font-semibold`}>{row.name}</td>
                    <td className={`${td} font-semibold text-warn`}>
                      {formatStock(row.stockPatas, row.patasPerBox)}
                    </td>
                    <td className={`${td} text-muted`}>{row.lowStockThreshold} pata</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Stock In menu theke notun maal dhukao.
          </p>
        </section>
      )}
    </div>
  );
}

function StatCard({
  href,
  label,
  accent,
  children,
}: {
  href: string;
  label: string;
  accent: "danger" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const ring: Record<typeof accent, string> = {
    danger: "hover:border-danger/30",
    warn: "hover:border-warn/30",
    muted: "hover:border-brand/30",
  };
  return (
    <Link
      href={href}
      className={`${card} block p-5 transition hover:shadow-md ${ring[accent]}`}
    >
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </Link>
  );
}
