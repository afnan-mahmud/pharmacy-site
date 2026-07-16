"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMedicine, updateMedicine } from "@/actions/medicines";
import { takaToPaisa, paisaToTaka } from "@/lib/money";

export type MedicineFormValues = {
  id?: string;
  name: string;
  genericName: string;
  company: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
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
  const [patasPerBox, setPatasPerBox] = useState(
    String(initial?.patasPerBox ?? 10),
  );
  const [boxPrice, setBoxPrice] = useState(
    initial ? String(paisaToTaka(initial.boxPricePaisa)) : "",
  );
  const [pataPrice, setPataPrice] = useState(
    initial ? String(paisaToTaka(initial.pataPricePaisa)) : "",
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
      const input = {
        name,
        genericName,
        company,
        patasPerBox: Number(patasPerBox),
        boxPricePaisa: takaToPaisa(boxPrice || 0),
        pataPricePaisa: takaToPaisa(pataPrice || 0),
        lowStockThreshold: Number(threshold),
      };

      if (initial?.id) {
        await updateMedicine(initial.id, input);
      } else {
        await createMedicine(input);
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const label = "text-sm text-slate-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">
        {initial?.id ? "Medicine edit" : "Notun medicine"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="name" className={label}>Nam</label>
          <input id="name" className={field} value={name}
            onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="generic" className={label}>Generic nam</label>
          <input id="generic" className={field} value={genericName}
            onChange={(e) => setGenericName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="company" className={label}>Company</label>
          <input id="company" className={field} value={company}
            onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ppb" className={label}>1 box e koto pata</label>
          <input id="ppb" type="number" min={1} className={field} value={patasPerBox}
            onChange={(e) => setPatasPerBox(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="boxPrice" className={label}>Box rate (৳) — wholesale</label>
          <input id="boxPrice" type="number" step="0.01" min={0} className={field}
            value={boxPrice} onChange={(e) => setBoxPrice(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="pataPrice" className={label}>Pata rate (৳) — khuchra</label>
          <input id="pataPrice" type="number" step="0.01" min={0} className={field}
            value={pataPrice} onChange={(e) => setPataPrice(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="threshold" className={label}>Stock kom alert (pata)</label>
          <input id="threshold" type="number" min={0} className={field} value={threshold}
            onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Save"}
        </button>
        <button type="button" onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
