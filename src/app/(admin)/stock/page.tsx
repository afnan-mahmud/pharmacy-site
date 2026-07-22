import { requireAdmin } from "@/lib/session";
import { listStockEntries } from "@/actions/stock";
import { StockInForm } from "@/components/StockInForm";
import { unitLabelsFor } from "@/lib/unitLabels";

export default async function StockPage() {
  await requireAdmin();
  const entries = await listStockEntries();

  return (
    <div className="space-y-6">
      <StockInForm />

      <div>
        <h2 className="mb-2 font-display text-sm font-bold text-ink">Ager stock entry</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Medicine</th>
                <th className="p-3">Pack</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">
                    Ekhono kono stock entry nai.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry._id} className="border-b border-line">
                  <td className="p-3 text-muted">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      timeZone: "Asia/Dhaka",
                    })}
                  </td>
                  <td className="p-3 font-medium text-ink">{entry.medicineName}</td>
                  <td className="p-3">
                    {entry.boxes} {unitLabelsFor(entry.form).outer}
                  </td>
                  <td className="p-3 text-muted">
                    {entry.patasAdded} {unitLabelsFor(entry.form).inner}
                  </td>
                  <td className="p-3 text-muted">{entry.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
