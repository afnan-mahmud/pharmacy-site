"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordRetailSale } from "@/actions/sales";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import { formatTaka } from "@/lib/money";

type CartLine = {
  medicine: PickedMedicine;
  patas: number;
};

export function RetailSaleForm() {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const totalPaisa = cart.reduce(
    (sum, line) => sum + line.medicine.pataPricePaisa * line.patas,
    0,
  );

  function addMedicine(medicine: PickedMedicine) {
    // Don't allow a duplicate line — see the "one medicine once" rule.
    if (cart.some((l) => l.medicine.id === medicine.id)) return;
    setDone(null);
    setCart((prev) => [...prev, { medicine, patas: 1 }]);
  }

  function updatePatas(idx: number, raw: string) {
    const val = Number(raw);
    setCart((prev) =>
      prev.map((line, i) =>
        i === idx ? { ...line, patas: Number.isInteger(val) ? val : 1 } : line,
      ),
    );
  }

  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) {
      setError("Cart khali");
      return;
    }
    setError("");
    setBusy(true);

    try {
      await recordRetailSale({
        items: cart.map((l) => ({ medicineId: l.medicine.id, patas: l.patas })),
      });
      setCart([]);
      setDone("Bikri record kora hoyeche.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const td = "px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Khuchra Bikri</h1>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <MedicinePicker onPick={addMedicine} />
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className={td}>Medicine</th>
                <th className={td}>Rate</th>
                <th className={td}>Pata</th>
                <th className={`${td} text-right`}>Mot</th>
                <th className={td}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, idx) => (
                <tr key={line.medicine.id} className="border-b border-slate-100">
                  <td className={td}>
                    <div className="font-medium text-slate-900">{line.medicine.name}</div>
                    <div className="text-xs text-slate-500">{line.medicine.genericName}</div>
                  </td>
                  <td className={td}>{formatTaka(line.medicine.pataPricePaisa)}/pata</td>
                  <td className={td}>
                    <input
                      type="number"
                      min={1}
                      max={line.medicine.stockPatas}
                      value={line.patas}
                      onChange={(e) => updatePatas(idx, e.target.value)}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <span className="ml-1 text-xs text-slate-500">
                      / {line.medicine.stockPatas}
                    </span>
                  </td>
                  <td className={`${td} text-right font-medium text-slate-900`}>
                    {formatTaka(line.medicine.pataPricePaisa * line.patas)}
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className={`${td} text-right font-semibold text-slate-700`}>
                  Mot
                </td>
                <td className={`${td} text-right text-lg font-bold text-teal-700`}>
                  {formatTaka(totalPaisa)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">{done}</p>}

      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={busy || cart.length === 0}
          className="rounded-lg bg-teal-700 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Bikri confirm koro"}
        </button>
      </form>
    </div>
  );
}
