import { requireAdmin } from "@/lib/session";
import { listStockEntries } from "@/actions/stock";
import { StockInForm } from "@/components/StockInForm";

export default async function StockPage() {
  await requireAdmin();
  const entries = await listStockEntries();

  return (
    <div className="space-y-6">
      <StockInForm />

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Ager stock entry</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Medicine</th>
                <th className="p-3">Box</th>
                <th className="p-3">Pata</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    Ekhono kono stock entry nai.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry._id} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      timeZone: "Asia/Dhaka",
                    })}
                  </td>
                  <td className="p-3 font-medium text-slate-900">{entry.medicineName}</td>
                  <td className="p-3">{entry.boxes}</td>
                  <td className="p-3 text-slate-600">{entry.patasAdded}</td>
                  <td className="p-3 text-slate-500">{entry.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
