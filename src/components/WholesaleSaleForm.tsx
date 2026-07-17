"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordWholesaleSale } from "@/actions/sales";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { computeTotals } from "@/lib/saleTotals";

type BuyerOption = {
  id: string;
  name: string;
  shopName: string;
};

type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
};

export function WholesaleSaleForm({ buyers }: { buyers: BuyerOption[] }) {
  const router = useRouter();
  const [buyerId, setBuyerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const subtotalPaisa = cart.reduce(
    (sum, line) => sum + line.medicine.boxPricePaisa * line.boxes,
    0,
  );
  const discountPaisa = Math.round(takaToPaisa(discount || 0));
  const paidPaisa = Math.round(takaToPaisa(paid || 0));

  // Reuse the server's own totals math instead of a second, looser
  // definition (the old Math.max(0, ...) here would happily show ৳0.00 for
  // a discount larger than the subtotal, then fail on submit with a server
  // error the form never previewed). computeTotals throws on the same
  // over-discount / over-payment conditions recordWholesaleSale enforces,
  // so the client and server always agree.
  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let totalsError = "";
  try {
    const totals = computeTotals(
      cart.map((line) => ({ ratePaisa: line.medicine.boxPricePaisa, quantity: line.boxes })),
      discountPaisa,
      paidPaisa,
    );
    totalPaisa = totals.totalPaisa;
    duePaisa = totals.duePaisa;
  } catch (err) {
    totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
  }

  function addMedicine(medicine: PickedMedicine) {
    if (cart.some((l) => l.medicine.id === medicine.id)) return;
    setLastInvoice(null);
    setCart((prev) => [...prev, { medicine, boxes: 1 }]);
  }

  function updateBoxes(idx: number, raw: string) {
    const val = Number(raw);
    setCart((prev) =>
      prev.map((line, i) =>
        i === idx
          ? { ...line, boxes: Number.isInteger(val) && val >= 1 ? val : 1 }
          : line,
      ),
    );
  }

  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!buyerId) {
      setError("Buyer select koro");
      return;
    }
    if (cart.length === 0) {
      setError("Cart khali");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const sale = await recordWholesaleSale({
        buyerId,
        items: cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes })),
        discountPaisa: Math.round(takaToPaisa(discount || 0)),
        paidPaisa: Math.round(takaToPaisa(paid || 0)),
      });
      setCart([]);
      setDiscount("");
      setPaid("");
      setBuyerId("");
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const td = "px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Wholesale Bikri</h1>

      {lastInvoice && lastSaleId && (
        <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
          Invoice {lastInvoice} record kora hoyeche.{" "}
          <Link href={`/invoice/${lastSaleId}`} className="font-medium underline">
            Print koro
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="space-y-2">
            <label htmlFor="buyerSelect" className="text-sm text-slate-700">
              Buyer
            </label>
            <select
              id="buyerSelect"
              className={field}
              value={buyerId}
              onChange={(e) => setBuyerId(e.target.value)}
              required
            >
              <option value="">— buyer select koro —</option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.shopName ? ` — ${b.shopName}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <MedicinePicker onPick={addMedicine} />
        </div>

        {cart.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className={td}>Medicine</th>
                  <th className={td}>Box rate</th>
                  <th className={td}>Box</th>
                  <th className={`${td} text-right`}>Mot</th>
                  <th className={td}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, idx) => (
                  <tr key={line.medicine.id} className="border-b border-slate-100">
                    <td className={td}>
                      <div className="font-medium text-slate-900">{line.medicine.name}</div>
                      <div className="text-xs text-slate-500">
                        {line.medicine.patasPerBox} pata/box
                      </div>
                    </td>
                    <td className={td}>{formatTaka(line.medicine.boxPricePaisa)}</td>
                    <td className={td}>
                      <input
                        type="number"
                        min={1}
                        value={line.boxes}
                        onChange={(e) => updateBoxes(idx, e.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className={`${td} text-right font-medium text-slate-900`}>
                      {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="discount" className="text-sm text-slate-700">Discount (৳)</label>
            <input id="discount" type="number" step="0.01" min={0} className={field}
              value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="paid" className="text-sm text-slate-700">Joma (৳)</label>
            <input id="paid" type="number" step="0.01" min={0} className={field}
              value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{formatTaka(subtotalPaisa)}</span>
            </div>
            {discountPaisa > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Discount</span>
                <span>− {formatTaka(discountPaisa)}</span>
              </div>
            )}
            {totalsError ? (
              <p role="alert" className="text-sm text-red-600">{totalsError}</p>
            ) : (
              <>
                <div className="flex justify-between text-sm font-semibold text-slate-900">
                  <span>Mot</span>
                  <span>{formatTaka(totalPaisa)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-red-600">
                  <span>Baki</span>
                  <span>{formatTaka(duePaisa)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || cart.length === 0 || !buyerId || !!totalsError}
          className="rounded-lg bg-teal-700 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Bikri confirm koro"}
        </button>
      </form>
    </div>
  );
}
