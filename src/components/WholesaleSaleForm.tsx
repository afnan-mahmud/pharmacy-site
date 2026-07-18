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

  const field = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm";
  const td = "px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-extrabold text-ink">Wholesale Bikri</h1>

      {lastInvoice && lastSaleId && (
        <div className="rounded-xl bg-brand-tint p-4 text-sm text-brand-strong">
          Invoice {lastInvoice} record kora hoyeche.{" "}
          <Link href={`/invoice/${lastSaleId}`} className="font-medium underline">
            Print koro
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="space-y-2">
            <label htmlFor="buyerSelect" className="text-sm text-ink">
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

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <MedicinePicker onPick={addMedicine} />
        </div>

        {cart.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted">
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
                  <tr key={line.medicine.id} className="border-b border-line">
                    <td className={td}>
                      <div className="font-medium text-ink">{line.medicine.name}</div>
                      <div className="text-xs text-muted">
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
                        className="w-20 rounded border border-line px-2 py-1 text-sm"
                      />
                    </td>
                    <td className={`${td} text-right font-medium text-ink`}>
                      {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
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
            </table>
          </div>
        )}

        <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="discount" className="text-sm text-ink">Discount (৳)</label>
            <input id="discount" type="number" step="0.01" min={0} className={field}
              value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="paid" className="text-sm text-ink">Joma (৳)</label>
            <input id="paid" type="number" step="0.01" min={0} className={field}
              value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
          <div className="space-y-3 rounded-full bg-brand-tint p-3">
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{formatTaka(subtotalPaisa)}</span>
            </div>
            {discountPaisa > 0 && (
              <div className="flex justify-between text-sm text-muted">
                <span>Discount</span>
                <span>− {formatTaka(discountPaisa)}</span>
              </div>
            )}
            {totalsError ? (
              <p role="alert" className="text-sm text-danger">{totalsError}</p>
            ) : (
              <>
                <div className="flex justify-between text-sm font-display font-bold text-ink">
                  <span>Mot</span>
                  <span>{formatTaka(totalPaisa)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-danger">
                  <span>Baki</span>
                  <span>{formatTaka(duePaisa)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || cart.length === 0 || !buyerId || !!totalsError}
          className="rounded-full bg-brand hover:bg-brand-strong px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Bikri confirm koro"}
        </button>
      </form>
    </div>
  );
}
