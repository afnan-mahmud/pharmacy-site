"use client";

import { useState, useEffect } from "react";
import { searchMedicines } from "@/actions/medicines";
import { formatStock } from "@/lib/units";

export type PickedMedicine = {
  id: string;
  name: string;
  genericName: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
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
            patasPerBox: m.patasPerBox,
            boxPricePaisa: m.boxPricePaisa,
            pataPricePaisa: m.pataPricePaisa,
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
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((medicine) => (
            <li key={medicine.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(medicine);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium text-slate-900">{medicine.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {medicine.genericName}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {formatStock(medicine.stockPatas, medicine.patasPerBox)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
