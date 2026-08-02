"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordWholesaleSale } from "@/actions/sales";
import { formatTaka } from "@/lib/money";
import { parseTakaInput } from "@/lib/takaInput";
import { computeTotals } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";

type BuyerOption = {
  id: string;
  name: string;
  shopName: string;
};

export function WholesaleSaleForm({
  buyers,
  allowCustomItems = false,
}: {
  buyers: BuyerOption[];
  allowCustomItems?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [buyerId, setBuyerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  function lineTotalFor(line: CartLine): number {
    return (
      line.boxes * line.medicine.wholesaleBoxPricePaisa +
      line.patas * line.medicine.wholesalePataPricePaisa
    );
  }

  const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
  const hasBillableLine = cart.some(
    (line) => line.boxes > 0 || line.patas > 0 || line.medicine.id.startsWith("custom_"),
  );
  const discountPercent = Number(discount || 0);
  // Parsed through the guard, not takaToPaisa directly: this runs during
  // render, and a typed "-5" used to throw here and blank the screen.
  const paidPaisa = parseTakaInput(paid);

  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let discountPaisa = 0;
  let totalsError = "";
  if (paidPaisa === null) {
    totalsError = "Joma thik nai";
  } else {
    try {
      const totals = computeTotals(
        cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
        { kind: "percent", percent: discountPercent },
        paidPaisa,
      );
      discountPaisa = totals.discountPaisa;
      totalPaisa = totals.totalPaisa;
      duePaisa = totals.duePaisa;
    } catch (err) {
      totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
    }
  }

  function updateBoxes(idx: number, raw: string) {
    const boxes = parseQuantityInput(raw, 0);
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, boxes } : line)),
    );
  }

  function updatePatas(idx: number, raw: string) {
    const newPatas = parseQuantityInput(raw, 0);
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, patas: newPatas } : line)),
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
    if (!hasBillableLine) {
      setError("Onto ekta line e poriman dite hobe");
      return;
    }
    // The submit button is disabled while these are unusable; this is the
    // belt-and-braces check so a bad joma can never reach the server as a
    // silently-coerced 0.
    if (totalsError || paidPaisa === null) {
      setError(totalsError || "Hisab thik nai");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const payloadItems = cart.map((l) => {
        if (l.medicine.id.startsWith("custom_")) {
          return {
            customName: l.medicine.name,
            customPricePaisa: l.medicine.wholesaleBoxPricePaisa,
            boxes: l.boxes,
            patas: l.patas,
          };
        }
        return { medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas };
      });

      const result = await recordWholesaleSale({
        buyerId,
        items: payloadItems,
        discountPercent,
        paidPaisa,
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const sale = result.data;
      setCart([]);
      setDiscount("");
      setPaid("");
      setBuyerId("");
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      setStep(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";
  const tdCls = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
              <span className="text-yellow-300">📦</span> Wholesale
            </div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              {step === 1 ? "Notun Bikri" : "Checkout"}
            </h1>
            <p className="text-sm text-white/90">
              {step === 1 ? "Product khuje cart e add korun." : "Order final koro ebong invoice print koro."}
            </p>
          </div>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 transition backdrop-blur-sm"
            >
              ← Piche ferot
            </button>
          )}
        </div>
      </section>

      {lastInvoice && lastSaleId && (
        <div className="mb-6 flex flex-col items-center justify-center rounded-3xl bg-surface border-2 border-brand p-8 text-center shadow-lg">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint mb-4 text-3xl">
            🎉
          </div>
          <h3 className="mb-2 font-display text-xl font-bold text-ink">
            Invoice {lastInvoice} record kora hoyeche!
          </h3>
          <p className="mb-6 text-muted">
            Order successfully save hoyeche, ebar invoice print korte paren.
          </p>
          <Link
            href={`/invoice/${lastSaleId}`}
            className="rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-brand/30 hover:bg-brand-strong transition"
          >
            🖨️ Invoice Print Koro
          </Link>
        </div>
      )}

      {step === 1 ? (
        <SaleItemPicker
          cart={cart}
          priceMode="wholesale"
          allowCustomItems={allowCustomItems}
          onAdd={(med, boxes, patas) => {
            setCart((prev) => {
              if (prev.find((l) => l.medicine.id === med.id)) return prev;
              return [...prev, { medicine: med, boxes, patas }];
            });
          }}
          onRemove={(id) => {
            setCart((prev) => prev.filter((l) => l.medicine.id !== id));
          }}
          onQuantityChange={(id, boxes, patas) => {
            setCart((prev) =>
              prev.map((l) => (l.medicine.id === id ? { ...l, boxes, patas } : l)),
            );
          }}
          onAddCustom={(med, boxes) => {
            setCart((prev) => [...prev, { medicine: med, boxes, patas: 0 }]);
          }}
          onProceed={() => setStep(2)}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-md">
            <div className="space-y-2">
              <label htmlFor="buyerSelect" className="text-sm font-medium text-ink">
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

          <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-md">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted bg-canvas/50">
                <tr>
                  <th className={tdCls}>Medicine</th>
                  <th className={tdCls}>Pack rate</th>
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
                      <div className="text-xs font-medium text-muted mt-0.5">
                        {line.medicine.patasPerBox}{" "}
                        {unitLabelsFor(line.medicine.form).inner}/
                        {unitLabelsFor(line.medicine.form).outer}
                      </div>
                    </td>
                    <td className={tdCls}>{formatTaka(line.medicine.wholesaleBoxPricePaisa)}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={line.boxes}
                          onChange={(e) => updateBoxes(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
                        />
                        <span className="text-xs font-medium text-muted">{unitLabelsFor(line.medicine.form).outer}</span>
                        <input
                          type="number"
                          min={0}
                          value={line.patas}
                          onChange={(e) => updatePatas(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
                        />
                        <span className="text-xs font-medium text-muted">{unitLabelsFor(line.medicine.form).inner}</span>
                      </div>
                      {line.boxes === 0 && line.patas === 0 && (
                        <div className="mt-1 text-[11px] font-medium text-muted">
                          invoice e thakbe, dam nai
                        </div>
                      )}
                    </td>
                    <td className={`${tdCls} text-right font-bold text-ink`}>
                      {formatTaka(lineTotalFor(line))}
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
            </table>
          </div>

          <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-md sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="discount" className="text-sm font-medium text-ink">Discount (%)</label>
              <input id="discount" type="number" step="0.01" className={field}
                placeholder="0" value={discount}
                onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="paid" className="text-sm font-medium text-ink">Joma (৳)</label>
              <input id="paid" type="number" step="0.01" min={0} className={field}
                placeholder="0"
                value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
            <div className="space-y-3 rounded-2xl bg-brand/5 p-4 border border-brand/10">
              <div className="flex justify-between text-sm text-muted">
                <span>Subtotal</span>
                <span>{formatTaka(subtotalPaisa)}</span>
              </div>
              {discountPaisa > 0 && (
                <div className="flex justify-between text-sm text-muted">
                  <span>Discount ({discountPercent}%)</span>
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
                  {duePaisa >= 0 ? (
                    <div className="flex justify-between text-sm font-semibold text-danger">
                      <span>Baki</span>
                      <span>{formatTaka(duePaisa)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm font-semibold text-teal-700">
                      <span>Buyer pabe</span>
                      <span>{formatTaka(Math.abs(duePaisa))}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {cart.length > 0 && !hasBillableLine && (
            <p className="text-sm text-muted">
              Shob line 0 — onto ekta line e poriman dile invoice kora jabe.
            </p>
          )}

          {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}

          <button
            type="submit"
            disabled={
              busy || cart.length === 0 || !hasBillableLine || !buyerId || !!totalsError
            }
            className="w-full rounded-full bg-brand hover:bg-brand-strong px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand/30 disabled:opacity-50 transition"
          >
            {busy ? "Wait..." : "Order Confirm Koro"}
          </button>
        </form>
      )}
    </div>
  );
}
