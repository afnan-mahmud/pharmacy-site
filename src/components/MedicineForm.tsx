"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createMedicine, updateMedicine } from "@/actions/medicines";
import { stockIn, listStockEntries } from "@/actions/stock";
import { takaToPaisa, paisaToTaka } from "@/lib/money";
import { boxesToPatas, formatStock } from "@/lib/units";
import type { StockEntryDoc } from "@/models/StockEntry";
import type { Serialized } from "@/lib/serialize";
// Aliased: `MedicineForm` is this file's component (a <form>), while the
// imported type is the dosage form (tablet, syrup, ...).
import {
  MEDICINE_FORMS,
  DEFAULT_MEDICINE_FORM,
  unitLabelsFor,
  toMedicineForm,
  capitalize,
  type MedicineForm as DosageForm,
} from "@/lib/unitLabels";
import { card, input, label as labelCls, btnPrimary, btnGhost, errorBox } from "@/components/ui";

export type MedicineFormValues = {
  id?: string;
  name: string;
  genericName: string;
  company: string;
  form: DosageForm;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  mrpBoxPricePaisa: number;
  lowStockThreshold: number;
};

export function MedicineForm({
  initial,
  onDone,
}: {
  initial?: MedicineFormValues & { stockPatas?: number };
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [genericName, setGenericName] = useState(initial?.genericName ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [form, setForm] = useState<DosageForm>(
    initial?.form ?? DEFAULT_MEDICINE_FORM,
  );
  const [patasPerBox, setPatasPerBox] = useState(
    String(initial?.patasPerBox ?? 10),
  );
  const [boxPrice, setBoxPrice] = useState(
    initial ? String(paisaToTaka(initial.boxPricePaisa)) : "",
  );
  const [pataPrice, setPataPrice] = useState(
    initial ? String(paisaToTaka(initial.pataPricePaisa)) : "",
  );
  const [mrp, setMrp] = useState(
    initial?.mrpBoxPricePaisa ? String(paisaToTaka(initial.mrpBoxPricePaisa)) : "",
  );
  const [threshold, setThreshold] = useState(
    String(initial?.lowStockThreshold ?? 0),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockBoxes, setStockBoxes] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockEntries, setStockEntries] = useState<Serialized<StockEntryDoc>[]>([]);
  const labels = unitLabelsFor(form);
  // "other" has no outer pack — it's counted in pieces only, so the box
  // fields collapse into the piece price (1 box === 1 piece).
  const isOther = form === "other";

  useEffect(() => {
    if (!initial?.id) return;
    let cancelled = false;
    listStockEntries(initial.id).then((entries) => {
      if (!cancelled) setStockEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const pataPricePaisa = takaToPaisa(pataPrice || 0);
      const medicineInput = {
        name,
        genericName,
        company,
        form,
        patasPerBox: isOther ? 1 : Number(patasPerBox),
        boxPricePaisa: isOther ? pataPricePaisa : takaToPaisa(boxPrice || 0),
        pataPricePaisa,
        mrpBoxPricePaisa: takaToPaisa(mrp || 0),
        lowStockThreshold: Number(threshold),
      };

      const result = initial?.id
        ? await updateMedicine(initial.id, medicineInput)
        : await createMedicine(medicineInput);

      // The failure arrives as data, not as a throw: Next.js would have
      // redacted a thrown message in production. See src/lib/actionResult.ts.
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      const targetId = initial?.id ?? result.data._id;
      const boxesToAdd = Number(stockBoxes);
      if (stockBoxes.trim() !== "" && Number.isInteger(boxesToAdd) && boxesToAdd > 0) {
        const stockResult = await stockIn({
          medicineId: targetId,
          boxes: boxesToAdd,
          note: stockNote,
        });
        if (!stockResult.ok) {
          setError(stockResult.error);
          setBusy(false);
          return;
        }
      }

      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${card} p-5`}>
      <h2 className="font-display text-base font-bold text-ink">
        {initial?.id ? "Medicine edit" : "Notun medicine"}
      </h2>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="form" className={labelCls}>Medicine er dhoron</label>
          <select id="form" className={input} value={form}
            onChange={(e) => setForm(toMedicineForm(e.target.value))}>
            {MEDICINE_FORMS.map((option) => (
              <option key={option} value={option}>
                {unitLabelsFor(option).formLabel}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {isOther
              ? "Ei medicine piece hishebe cholbe — shob screen e oi naam e dekhabe."
              : `Ei medicine ${labels.outer} ar ${labels.inner} hishebe cholbe — shob screen e oi naam e dekhabe.`}
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="name" className={labelCls}>Nam</label>
          <input id="name" className={input} value={name}
            onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="generic" className={labelCls}>Generic nam</label>
          <input id="generic" className={input} value={genericName}
            onChange={(e) => setGenericName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="company" className={labelCls}>Company</label>
          <input id="company" className={input} value={company}
            onChange={(e) => setCompany(e.target.value)} />
        </div>
        {!isOther && (
          <div className="space-y-1.5">
            <label htmlFor="ppb" className={labelCls}>
              1 {labels.outer} e koto {labels.inner}
            </label>
            <input id="ppb" type="number" min={1} className={input} value={patasPerBox}
              onChange={(e) => setPatasPerBox(e.target.value)} required />
          </div>
        )}
        {!isOther && (
          <div className="space-y-1.5">
            <label htmlFor="boxPrice" className={labelCls}>
              {capitalize(labels.outer)} rate (৳) — wholesale
            </label>
            <input id="boxPrice" type="number" step="0.01" min={0} className={input}
              value={boxPrice} onChange={(e) => setBoxPrice(e.target.value)} required />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="mrp" className={labelCls}>
            MRP {labels.outer} rate (৳) — optional
          </label>
          <input id="mrp" type="number" step="0.01" min={0} className={input}
            value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="Kata dam dekhate hole" />
          {/* Explicit {" "}: relying on JSX's whitespace handling between an
              expression and the text after it rendered "Cartonrate" here. */}
          <p className="text-xs text-muted">
            {capitalize(labels.outer)}{" "}
            rate er cheye beshi dile buyer &ldquo;kata dam&rdquo; ar discount
            dekhbe.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pataPrice" className={labelCls}>
            {capitalize(labels.inner)} rate (৳) — khuchra
          </label>
          <input id="pataPrice" type="number" step="0.01" min={0} className={input}
            value={pataPrice} onChange={(e) => setPataPrice(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="threshold" className={labelCls}>
            Stock kom alert ({labels.inner})
          </label>
          <input id="threshold" type="number" min={0} className={input} value={threshold}
            onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
        <h3 className="text-sm font-semibold text-ink">Stock add koro</h3>
        {initial?.id && (
          <p className="text-xs text-muted">
            Ekhon ache: {formatStock(initial.stockPatas ?? 0, Number(patasPerBox) || 1, form)}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="stockBoxes" className={labelCls}>
              Koto {labels.outer} dhuklo
            </label>
            <input id="stockBoxes" type="number" min={0} className={input}
              value={stockBoxes} onChange={(e) => setStockBoxes(e.target.value)} />
            {stockBoxes && Number.isInteger(Number(stockBoxes)) && Number(stockBoxes) > 0 && (
              <p className="text-xs text-muted">
                = {boxesToPatas(Number(stockBoxes), Number(patasPerBox) || 1)} {labels.inner}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="stockNote" className={labelCls}>Note (optional)</label>
            <input id="stockNote" className={input} value={stockNote}
              onChange={(e) => setStockNote(e.target.value)} />
          </div>
        </div>
      </div>

      {initial?.id && stockEntries.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-ink">Ager stock entry</h3>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Pack</th>
                  <th className="p-2">Unit</th>
                  <th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {stockEntries.map((entry) => (
                  <tr key={entry._id} className="border-b border-line">
                    <td className="p-2 text-muted">
                      {new Date(entry.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </td>
                    <td className="p-2">{entry.boxes} {labels.outer}</td>
                    <td className="p-2 text-muted">{entry.patasAdded} {labels.inner}</td>
                    <td className="p-2 text-muted">{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p role="alert" className={errorBox}>{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Wait..." : "Save"}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
