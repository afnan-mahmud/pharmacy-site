"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMedicine, updateMedicine } from "@/actions/medicines";
import { takaToPaisa, paisaToTaka } from "@/lib/money";
// Aliased: `MedicineForm` is this file's component (a <form>), while the
// imported type is the dosage form (tablet, syrup, ...).
import {
  DEFAULT_MEDICINE_FORM,
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
  initial?: MedicineFormValues;
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const medicineInput = {
        name,
        genericName,
        company,
        form,
        patasPerBox: Number(patasPerBox),
        boxPricePaisa: takaToPaisa(boxPrice || 0),
        pataPricePaisa: takaToPaisa(pataPrice || 0),
        mrpBoxPricePaisa: takaToPaisa(mrp || 0),
        lowStockThreshold: Number(threshold),
      };

      if (initial?.id) {
        await updateMedicine(initial.id, medicineInput);
      } else {
        await createMedicine(medicineInput);
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
        <div className="space-y-1.5">
          <label htmlFor="ppb" className={labelCls}>1 box e koto pata</label>
          <input id="ppb" type="number" min={1} className={input} value={patasPerBox}
            onChange={(e) => setPatasPerBox(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="boxPrice" className={labelCls}>Box rate (৳) — wholesale</label>
          <input id="boxPrice" type="number" step="0.01" min={0} className={input}
            value={boxPrice} onChange={(e) => setBoxPrice(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mrp" className={labelCls}>MRP box rate (৳) — optional</label>
          <input id="mrp" type="number" step="0.01" min={0} className={input}
            value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="Kata dam dekhate hole" />
          <p className="text-xs text-muted">
            Box rate er cheye beshi dile buyer &ldquo;kata dam&rdquo; ar discount dekhbe.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pataPrice" className={labelCls}>Pata rate (৳) — khuchra</label>
          <input id="pataPrice" type="number" step="0.01" min={0} className={input}
            value={pataPrice} onChange={(e) => setPataPrice(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="threshold" className={labelCls}>Stock kom alert (pata)</label>
          <input id="threshold" type="number" min={0} className={input} value={threshold}
            onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>

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
