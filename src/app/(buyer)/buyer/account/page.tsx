import { myDueBalance, myLedger } from "@/actions/buyerOrders";
import { describeDue } from "@/lib/dueDisplay";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";
import { card, pageTitle, thead, th, td, trow } from "@/components/ui";

export default async function BuyerAccountPage() {
  const [duePaisa, ledger] = await Promise.all([myDueBalance(), myLedger()]);
  const due = describeDue(duePaisa);

  return (
    <div className="space-y-5">
      <h1 className={pageTitle}>Amar hisab</h1>

      {/* Balance — the figure the buyer opens this page for. */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-deep p-6 text-white shadow-sm">
        <div className="text-xs font-semibold text-white/80">{due.label}</div>
        <div className="mt-1 font-display text-3xl font-extrabold">
          {due.amountText}
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-display text-sm font-bold text-ink">Bikri</h2>
        <div className={`overflow-x-auto ${card}`}>
          <table className="w-full">
            <thead className={thead}>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Invoice</th>
                <th className={`${th} text-right`}>Mot</th>
                <th className={`${th} text-right`}>Baki</th>
              </tr>
            </thead>
            <tbody>
              {ledger.sales.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-muted">
                    Kono bikri nai.
                  </td>
                </tr>
              )}
              {ledger.sales.map((sale) => (
                <tr key={sale._id} className={trow}>
                  <td className={`${td} text-muted`}>
                    {formatDhakaDate(sale.createdAt)}
                  </td>
                  <td className={`${td} font-medium`}>
                    {sale.invoiceNo}
                    {sale.status === "cancelled" && (
                      <span className="ml-2 rounded-full bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold text-danger">
                        Cancelled
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>{formatTaka(sale.totalPaisa)}</td>
                  <td
                    className={`${td} text-right ${
                      sale.status === "cancelled" ? "text-muted line-through" : "font-medium"
                    }`}
                  >
                    {formatTaka(sale.duePaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-bold text-ink">Joma</h2>
        <div className={`overflow-x-auto ${card}`}>
          <table className="w-full">
            <thead className={thead}>
              <tr>
                <th className={th}>Date</th>
                <th className={`${th} text-right`}>Taka</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.payments.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-sm text-muted">
                    Kono joma nai.
                  </td>
                </tr>
              )}
              {ledger.payments.map((payment) => (
                <tr key={payment._id} className={trow}>
                  <td className={`${td} text-muted`}>
                    {formatDhakaDate(payment.createdAt)}
                  </td>
                  <td className={`${td} text-right font-semibold text-brand-strong`}>
                    {formatTaka(payment.amountPaisa)}
                  </td>
                  <td className={`${td} text-muted`}>{payment.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
