"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchMedicinesForBuyer, submitOrder } from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";

type Pick = { id: string; name: string; boxPricePaisa: number };
type CartLine = { medicine: Pick; boxes: number };

export function BuyerBrowse() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // searchMedicinesForBuyer (src/actions/buyerOrders.ts) already
        // returns only { id, name, boxPricePaisa } — no stock, no pata
        // price ever leaves the server for this screen.
        const found = await searchMedicinesForBuyer(query);
        if (cancelled) return;
        setResults(found);
      } catch {
        if (!cancelled) setError("Medicine khoja jacche na, abar chesta koro");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function add(medicine: Pick) {
    setDone("");
    setCart((current) => {
      const existing = current.find((l) => l.medicine.id === medicine.id);
      if (existing) {
        return current.map((l) =>
          l.medicine.id === medicine.id ? { ...l, boxes: l.boxes + 1 } : l,
        );
      }
      return [...current, { medicine, boxes: 1 }];
    });
    setQuery("");
    setResults([]);
  }

  const total = cart.reduce((sum, l) => sum + l.medicine.boxPricePaisa * l.boxes, 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      await submitOrder(cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes })));
      setDone("Order pathano hoyeche. Malik approve korle janiye deya hobe.");
      setCart([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h1 className="mb-3 font-semibold text-slate-900">Order dao</h1>
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Medicine er nam likho..." className={field} />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => add(m)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-900">{m.name}</span>
                    <span className="text-slate-600">{formatTaka(m.boxPricePaisa)}/box</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Medicine</th>
                <th className="p-3">Box rate</th>
                <th className="p-3">Koto box</th>
                <th className="p-3">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.medicine.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium text-slate-900">{line.medicine.name}</td>
                  <td className="p-3">{formatTaka(line.medicine.boxPricePaisa)}</td>
                  <td className="p-3">
                    <input type="number" min={1} value={line.boxes}
                      onChange={(e) =>
                        setCart((current) =>
                          current.map((l) =>
                            l.medicine.id === line.medicine.id
                              ? { ...l, boxes: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                  </td>
                  <td className="p-3 font-medium">
                    {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
                  </td>
                  <td className="p-3 text-right">
                    <button type="button"
                      onClick={() =>
                        setCart((current) => current.filter((l) => l.medicine.id !== line.medicine.id))
                      }
                      className="text-slate-400 hover:text-red-600">Bad dao</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 p-4">
            <span className="text-slate-600">Mot</span>
            <span className="text-lg font-semibold">{formatTaka(total)}</span>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">{done}</p>}

      {cart.length > 0 && (
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal-700 px-6 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Order pathao"}
        </button>
      )}
    </form>
  );
}
