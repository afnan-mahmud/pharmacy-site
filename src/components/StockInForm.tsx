"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stockIn } from "@/actions/stock";
import { formatStock, boxesToPatas } from "@/lib/units";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import { card, input, label as labelCls, btnPrimary, errorBox, successBox } from "@/components/ui";

export function StockInForm() {
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
    <form onSubmit={handleSubmit} className={`space-y-4 ${card} p-5`}>
      <h2 className="font-display text-base font-bold text-ink">Stock in</h2>

      {!medicine ? (
        <MedicinePicker onPick={setMedicine} />
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-brand-tint px-3.5 py-2.5">
          <div>
            <div className="text-sm font-semibold text-ink">{medicine.name}</div>
            <div className="text-xs text-muted">
              Ekhon ache: {formatStock(medicine.stockPatas, medicine.patasPerBox)}
              {" · "}1 box = {medicine.patasPerBox} pata
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMedicine(null)}
            className="rounded-full px-3 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            Bodlao
          </button>
        </div>
      )}

      {medicine && (
        <>
          <div className="space-y-1.5">
            <label htmlFor="boxes" className={labelCls}>Koto box dhuklo</label>
            <input id="boxes" type="number" min={1} value={boxes} required
              onChange={(e) => setBoxes(e.target.value)} className={input} />
            {boxes && Number.isInteger(Number(boxes)) && Number(boxes) > 0 && (
              <p className="text-xs text-muted">
                = {boxesToPatas(Number(boxes), medicine.patasPerBox)} pata
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="note" className={labelCls}>Note (optional)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          </div>

          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Wait..." : "Stock e dhukao"}
          </button>
        </>
      )}

      {error && <p role="alert" className={errorBox}>{error}</p>}
      {done && <p className={successBox}>{done}</p>}
    </form>
  );
}
