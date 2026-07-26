"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { recordRetailSale, lookupRetailCustomer } from "@/actions/sales";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import { formatTaka } from "@/lib/money";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";

type CartLine = {
  medicine: PickedMedicine;
  patas: number;
};

export function RetailSaleForm() {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  // Set when the name below was filled from a past sale rather than typed, so
  // the owner can see why the text changed instead of wondering.
  const [nameFromHistory, setNameFromHistory] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const totalPaisa = cart.reduce(
    (sum, line) => sum + line.medicine.pataPricePaisa * line.patas,
    0,
  );

  // Debounced for the same reason MedicinePicker debounces its type-ahead:
  // otherwise this is one query per keystroke.
  useEffect(() => {
    const phone = customerPhone.trim();
    if (!phone) {
      setNameFromHistory(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await lookupRetailCustomer(phone);
        if (cancelled || !found) return;
        // Overwrites whatever is in the field: one phone, one remembered
        // name. The field stays editable, so a correction is still possible.
        setCustomerName(found.name);
        setNameFromHistory(true);
      } catch {
        // A broken convenience must never block a counter sale. The owner
        // types the name themselves and the sale goes through unchanged.
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  function addMedicine(medicine: PickedMedicine) {
    // Don't allow a duplicate line — see the "one medicine once" rule.
    if (cart.some((l) => l.medicine.id === medicine.id)) return;
    setDone(null);
    setCart((prev) => [...prev, { medicine, patas: 1 }]);
  }

  // Minimum 1: a retail sale prints nothing, so a zero line would have no
  // reader. Dropping an item means removing the line, not zeroing it.
  function updatePatas(idx: number, raw: string) {
    const patas = parseQuantityInput(raw, 1);
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, patas } : line)),
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
    if (!customerName.trim()) {
      setError("Customer nam likhte hobe");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const result = await recordRetailSale({
        items: cart.map((l) => ({ medicineId: l.medicine.id, patas: l.patas })),
        customerName,
        customerPhone,
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setNameFromHistory(false);
      setDone("Bikri record kora hoyeche.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";
  const tdCls = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
              <span className="text-yellow-300">🏪</span> Khuchra
            </div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              Notun Bikri
            </h1>
            <p className="text-sm text-white/90">
              Sadharon customer er kache khuchra bikri korun.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-md sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="customerPhone" className="text-sm font-medium text-ink">
            Customer phone (optional)
          </label>
          <input
            id="customerPhone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="customerName" className="text-sm font-medium text-ink">
            Customer nam
          </label>
          <input
            id="customerName"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setNameFromHistory(false);
            }}
            placeholder="Nam likho"
            className={field}
          />
          {nameFromHistory && (
            <p className="text-xs text-brand-strong">Ager naam — bodlano jabe</p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-5 shadow-md">
        <MedicinePicker onPick={addMedicine} />
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-md">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted bg-canvas/50">
              <tr>
                <th className={tdCls}>Medicine</th>
                <th className={tdCls}>Rate</th>
                <th className={tdCls}>Poriman</th>
                <th className={`${tdCls} text-right`}>Mot</th>
                <th className={tdCls}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, idx) => (
                <tr key={line.medicine.id} className="border-b border-line/50 last:border-0">
                  <td className={tdCls}>
                    <div className="font-bold text-ink">{line.medicine.name}</div>
                    <div className="text-xs font-medium text-muted mt-0.5">{line.medicine.genericName}</div>
                  </td>
                  <td className={tdCls}>
                    {formatTaka(line.medicine.pataPricePaisa)}/
                    {unitLabelsFor(line.medicine.form).inner}
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min={1}
                        value={line.patas}
                        onChange={(e) => updatePatas(idx, e.target.value)}
                        className="w-20 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
                      />
                      <span className="ml-2 text-xs font-medium text-muted">
                        {unitLabelsFor(line.medicine.form).inner} <br/>(stock: {line.medicine.stockPatas})
                      </span>
                    </div>
                  </td>
                  <td className={`${tdCls} text-right font-bold text-ink`}>
                    {formatTaka(line.medicine.pataPricePaisa * line.patas)}
                  </td>
                  <td className={tdCls}>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-muted hover:text-danger rounded-full p-1 hover:bg-danger-bg transition"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-canvas/30">
                <td colSpan={3} className={`${tdCls} text-right font-display font-bold text-ink`}>
                  Mot
                </td>
                <td className={`${tdCls} text-right text-lg font-bold text-brand-strong`}>
                  {formatTaka(totalPaisa)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}
      {done && <p className="text-sm font-medium text-brand-strong px-2">{done}</p>}

      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={busy || cart.length === 0 || !customerName.trim()}
          className="w-full sm:w-auto rounded-full bg-brand hover:bg-brand-strong px-8 py-3 text-sm font-bold text-white shadow-md shadow-brand/20 disabled:opacity-50 transition"
        >
          {busy ? "Wait..." : "Bikri confirm koro"}
        </button>
      </form>
    </div>
  );
}
