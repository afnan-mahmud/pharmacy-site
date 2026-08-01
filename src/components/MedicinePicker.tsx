"use client";

import { useState, useEffect } from "react";
import { searchMedicines } from "@/actions/medicines";
import { formatStock } from "@/lib/units";
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
import { input } from "@/components/ui";

export type PickedMedicine = {
  id: string;
  name: string;
  genericName: string;
  form: MedicineForm;
  patasPerBox: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  stockPatas: number;
};

export function MedicinePicker({
  onPick,
  placeholder = "Medicine er nam likho...",
}: {
  onPick: (medicine: PickedMedicine) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError("");
      return;
    }

    // Debounced so typing does not fire a query per keystroke.
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchMedicines(query);
        if (cancelled) return;
        setError("");
        setResults(
          found.map((m) => ({
            id: m._id,
            name: m.name,
            genericName: m.genericName,
            form: toMedicineForm(m.form),
            patasPerBox: m.patasPerBox,
            wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
            wholesalePataPricePaisa: m.wholesalePataPricePaisa,
            retailBoxPricePaisa: m.retailBoxPricePaisa,
            retailPataPricePaisa: m.retailPataPricePaisa,
            stockPatas: m.stockPatas,
          })),
        );
      } catch (err) {
        // Without this catch, a rejection here (e.g. requireAdminAction()
        // throwing because a 7-day session just expired) became an
        // unhandled promise rejection and the dropdown silently showed no
        // results — indistinguishable from "no medicine matches", when the
        // real problem is "you're logged out." Surfacing it explicitly so
        // the owner sees a reason instead of a mid-sale dead end.
        if (cancelled) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={input}
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-lg">
          {results.map((medicine) => (
            <li key={medicine.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(medicine);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-tint"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{medicine.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {medicine.genericName}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xs font-medium ${
                    medicine.stockPatas < 0 ? "text-danger" : "text-muted"
                  }`}
                >
                  {formatStock(medicine.stockPatas, medicine.patasPerBox, medicine.form)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
