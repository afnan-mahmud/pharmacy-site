import { myDueBalance, myLedger } from "@/actions/buyerOrders";
import { describeDue } from "@/lib/dueDisplay";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";

export default async function BuyerAccountPage() {
  const [duePaisa, ledger] = await Promise.all([myDueBalance(), myLedger()]);
  const due = describeDue(duePaisa);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Amar hisab</h1>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="text-xs text-slate-500">{due.label}</div>
        <div className={`text-2xl font-semibold ${due.className}`}>{due.amountText}</div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Bikri</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Invoice</th>
                <th className="p-3 text-right">Mot</th>
                <th className="p-3 text-right">Baki</th>
              </tr>
            </thead>
            <tbody>
              {ledger.sales.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">Kono bikri nai.</td></tr>
              )}
              {ledger.sales.map((sale) => (
                <tr key={sale._id} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">{formatDhakaDate(sale.createdAt)}</td>
                  <td className="p-3">
                    {sale.invoiceNo}
                    {sale.status === "cancelled" && (
                      <span className="ml-2 text-xs text-red-600">Cancelled</span>
                    )}
                  </td>
                  <td className="p-3 text-right">{formatTaka(sale.totalPaisa)}</td>
                  <td className={`p-3 text-right ${sale.status === "cancelled" ? "text-slate-400 line-through" : ""}`}>
                    {formatTaka(sale.duePaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Joma</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Taka</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.payments.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-slate-400">Kono joma nai.</td></tr>
              )}
              {ledger.payments.map((payment) => (
                <tr key={payment._id} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">{formatDhakaDate(payment.createdAt)}</td>
                  <td className="p-3 text-right text-teal-700">{formatTaka(payment.amountPaisa)}</td>
                  <td className="p-3 text-slate-500">{payment.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
