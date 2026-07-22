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
      await recordRetailSale({
        items: cart.map((l) => ({ medicineId: l.medicine.id, patas: l.patas })),
        customerName,
        customerPhone,
      });
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

  const td = "px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-extrabold text-ink">Khuchra Bikri</h1>

      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="customerPhone" className="text-sm text-ink">
            Customer phone (optional)
          </label>
          <input
            id="customerPhone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="customerName" className="text-sm text-ink">
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
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm"
          />
          {nameFromHistory && (
            <p className="text-xs text-muted">Ager naam — bodlano jabe</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <MedicinePicker onPick={addMedicine} />
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className={td}>Medicine</th>
                <th className={td}>Rate</th>
                <th className={td}>Poriman</th>
                <th className={`${td} text-right`}>Mot</th>
                <th className={td}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, idx) => (
                <tr key={line.medicine.id} className="border-b border-line">
                  <td className={td}>
                    <div className="font-medium text-ink">{line.medicine.name}</div>
                    <div className="text-xs text-muted">{line.medicine.genericName}</div>
                  </td>
                  <td className={td}>
                    {formatTaka(line.medicine.pataPricePaisa)}/
                    {unitLabelsFor(line.medicine.form).inner}
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      min={1}
                      max={line.medicine.stockPatas}
                      value={line.patas}
                      onChange={(e) => updatePatas(idx, e.target.value)}
                      className="w-20 rounded border border-line px-2 py-1 text-sm"
                    />
                    <span className="ml-1 text-xs text-muted">
                      {unitLabelsFor(line.medicine.form).inner} /{" "}
                      {line.medicine.stockPatas}
                    </span>
                  </td>
                  <td className={`${td} text-right font-medium text-ink`}>
                    {formatTaka(line.medicine.pataPricePaisa * line.patas)}
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-muted hover:text-danger"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className={`${td} text-right font-display font-bold text-ink`}>
                  Mot
                </td>
                <td className={`${td} text-right text-lg font-bold text-brand-strong`}>
                  {formatTaka(totalPaisa)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {done && <p className="text-sm text-brand-strong">{done}</p>}

      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={busy || cart.length === 0 || !customerName.trim()}
          className="rounded-full bg-brand hover:bg-brand-strong px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Bikri confirm koro"}
        </button>
      </form>
    </div>
  );
}
