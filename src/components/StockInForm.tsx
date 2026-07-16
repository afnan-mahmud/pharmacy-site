"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stockIn } from "@/actions/stock";
import { formatStock } from "@/lib/units";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";

export function StockInForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [medicine, setMedicine] = useState<PickedMedicine | null>(null);
  const [boxes, setBoxes] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!medicine) return;

    setBusy(true);
    setError("");
    setDone("");

    try {
      await stockIn({
        medicineId: medicine.id,
        boxes: Number(boxes),
        note,
        userId,
      });
      setDone(`${medicine.name} — ${boxes} box stock e dhuklo`);
      setMedicine(null);
      setBoxes("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Stock in</h2>

      {!medicine ? (
        <MedicinePicker onPick={setMedicine} />
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-slate-900">{medicine.name}</div>
            <div className="text-xs text-slate-500">
              Ekhon ache: {formatStock(medicine.stockPatas, medicine.patasPerBox)}
              {" · "}1 box = {medicine.patasPerBox} pata
            </div>
          </div>
          <button type="button" onClick={() => setMedicine(null)}
            className="text-xs text-slate-500 hover:text-red-600">
            Bodlao
          </button>
        </div>
      )}

      {medicine && (
        <>
          <div className="space-y-1">
            <label htmlFor="boxes" className="text-sm text-slate-700">Koto box dhuklo</label>
            <input id="boxes" type="number" min={1} value={boxes} required
              onChange={(e) => setBoxes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {boxes && Number(boxes) > 0 && (
              <p className="text-xs text-slate-500">
                = {Number(boxes) * medicine.patasPerBox} pata
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="note" className="text-sm text-slate-700">Note (optional)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <button type="submit" disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Wait..." : "Stock e dhukao"}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">{done}</p>}
    </form>
  );
}
