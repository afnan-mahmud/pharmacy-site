import Link from "next/link";
import type { DashboardSummary } from "@/actions/dashboard";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { unitLabelsFor } from "@/lib/unitLabels";
import { card, pageTitle, thead, th, td, trow } from "@/components/ui";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="flex flex-col pb-6">
      {/* Hero Section */}
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10">
          <div className="mb-2 text-sm font-medium text-white/80">Aj ker bikri</div>
          <h1 className="mb-2 font-display text-4xl font-extrabold leading-tight">
            {formatTaka(summary.todayTotalPaisa)}
          </h1>
          <p className="text-sm text-white/90">
            {summary.todaySaleCount} ta bikri · khuchra {formatTaka(summary.todayRetailPaisa)} · wholesale {formatTaka(summary.todayWholesalePaisa)}
          </p>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <GridCard
          href="/due"
          title="Baki Khata"
          value={formatTaka(summary.totalDuePaisa)}
          subtitle={summary.totalCreditPaisa > 0 ? `Joma: ${formatTaka(summary.totalCreditPaisa)}` : "Total Due"}
          bgTint={summary.totalDuePaisa > 0 ? "bg-red-50" : "bg-emerald-50"}
          valueColor={summary.totalDuePaisa > 0 ? "text-danger" : "text-brand-strong"}
        />
        <GridCard
          href="/medicines"
          title="Stock Alert"
          value={summary.lowStock.length.toString()}
          subtitle="Stock kom"
          bgTint={summary.lowStock.length > 0 ? "bg-yellow-50" : "bg-emerald-50"}
          valueColor={summary.lowStock.length > 0 ? "text-warn" : "text-brand-strong"}
        />
        <GridCard
          href="/orders"
          title="Pending Order"
          value={summary.pendingOrderCount.toString()}
          subtitle={summary.pendingOrderCount > 0 ? "Opekkhay ache" : "Shob clear"}
          bgTint={summary.pendingOrderCount > 0 ? "bg-yellow-50" : "bg-emerald-50"}
          valueColor={summary.pendingOrderCount > 0 ? "text-warn" : "text-brand-strong"}
        />
        <GridCard
          href="/sell"
          title="Khuchra Bikri"
          value="+"
          subtitle="Notun khuchra bikri"
          bgTint="bg-blue-50"
          valueColor="text-blue-600"
        />
        <GridCard
          href="/buyers"
          title="Buyers"
          value="👥"
          subtitle="Customer list"
          bgTint="bg-purple-50"
          valueColor="text-purple-600"
        />
        <GridCard
          href="/reports"
          title="Report"
          value="📈"
          subtitle="Bikrir hisab"
          bgTint="bg-indigo-50"
          valueColor="text-indigo-600"
        />
        <GridCard
          href="/custom-bill"
          title="Custom Bill"
          value="📝"
          subtitle="Generate bill"
          bgTint="bg-orange-50"
          valueColor="text-orange-600"
        />
        <GridCard
          href="/settings"
          title="Settings"
          value="⚙️"
          subtitle="App settings"
          bgTint="bg-slate-50"
          valueColor="text-slate-600"
        />
      </div>

      {summary.lowStock.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface shadow-md overflow-hidden">
          <div className="bg-brand/5 px-5 py-4 border-b border-line">
            <h2 className="font-display text-lg font-bold text-brand-strong">
              Stock kome geche
            </h2>
            <p className="mt-1 text-xs text-muted">
              Medicine edit korte giye notun maal dhukao.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr>
                  <th className={th}>Medicine</th>
                  <th className={`${th} text-right`}>Stock</th>
                  <th className={`${th} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.lowStock.map((row) => (
                  <tr key={row.medicineId} className={trow}>
                    <td className={`${td} font-medium text-ink`}>{row.name}</td>
                    <td className={`${td} text-right font-medium`}>
                      <span className="text-danger">
                        {formatStock(row.stockPatas, row.patasPerBox, row.form)}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <Link
                        href={`/medicines?search=${encodeURIComponent(row.name)}`}
                        className="inline-flex rounded-lg bg-brand-tint px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-brand/20 transition"
                      >
                        Update
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function GridCard({
  href,
  title,
  value,
  subtitle,
  bgTint,
  valueColor,
}: {
  href: string;
  title: string;
  value: string;
  subtitle: string;
  bgTint: string;
  valueColor: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-surface p-4 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] transition hover:shadow-md border border-white"
    >
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full ${bgTint} blur-xl opacity-60`}></div>
      <div className="mb-2 relative z-10">
        <h3 className="font-bold text-ink text-sm">{title}</h3>
      </div>
      <div className={`font-display text-2xl font-extrabold relative z-10 ${valueColor}`}>
        {value}
      </div>
      <p className="mt-1 text-[10px] font-medium text-muted relative z-10">{subtitle}</p>
    </Link>
  );
}
