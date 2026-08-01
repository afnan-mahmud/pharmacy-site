"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordWholesaleSale } from "@/actions/sales";
import { listMedicines } from "@/actions/medicines";
import { type PickedMedicine } from "./MedicinePicker";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { computeTotals } from "@/lib/saleTotals";
import { toMedicineForm } from "@/lib/unitLabels";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";

type BuyerOption = {
  id: string;
  name: string;
  shopName: string;
};

type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
  patas: number;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function WholesaleSaleForm({ buyers, allowCustomItems = false }: { buyers: BuyerOption[], allowCustomItems?: boolean }) {
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

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);
  const [searching, setSearching] = useState(false);

  // Custom Item state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);

  function addCustomItem() {
    if (!customName.trim()) {
      alert("Product name dite hobe");
      return;
    }
    const pricePaisa = Math.round(takaToPaisa(customPrice || 0));
    if (pricePaisa < 0) {
      alert("Price thik nai");
      return;
    }
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const customMed: PickedMedicine = {
      id,
      name: customName.trim(),
      genericName: "Custom Item",
      form: "other",
      patasPerBox: 1,
      wholesaleBoxPricePaisa: pricePaisa,
      wholesalePataPricePaisa: pricePaisa,
      retailBoxPricePaisa: pricePaisa,
      retailPataPricePaisa: pricePaisa,
      stockPatas: 0,
    };
    
    setStep1Boxes((prev) => ({ ...prev, [id]: customBoxes }));
    setCart((prev) => [...prev, { medicine: customMed, boxes: customBoxes, patas: 0 }]);
    
    setCustomName("");
    setCustomPrice("");
    setCustomBoxes(1);
    setShowCustomForm(false);
  }

  useEffect(() => {
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await listMedicines(query);
        if (cancelled) return;
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
          }))
        );
      } catch (err) {
        if (!cancelled) setError("Medicine khoja jacche na");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function lineTotalFor(line: CartLine): number {
    return (
      line.boxes * line.medicine.wholesaleBoxPricePaisa +
      line.patas * line.medicine.wholesalePataPricePaisa
    );
  }

  const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
  const hasBillableLine = cart.some((line) => line.boxes > 0 || line.patas > 0 || line.medicine.id.startsWith("custom_"));
  const discountPercent = Number(discount || 0);
  const paidPaisa = Math.round(takaToPaisa(paid || 0));

  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let discountPaisa = 0;
  let totalsError = "";
  try {
    const totals = computeTotals(
      cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
      discountPercent,
      paidPaisa,
    );
    discountPaisa = totals.discountPaisa;
    totalPaisa = totals.totalPaisa;
    duePaisa = totals.duePaisa;
  } catch (err) {
    totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
  }

  // Step 1 quantities
  const [step1Boxes, setStep1Boxes] = useState<Record<string, number>>({});
  const [step1Patas, setStep1Patas] = useState<Record<string, number>>({});

  function handleStep1BoxesChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Boxes((prev) => ({ ...prev, [m.id]: valid }));
    setCart((prev) => prev.map((l) => l.medicine.id === m.id ? { ...l, boxes: valid } : l));
  }

  function handleStep1PatasChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Patas((prev) => ({ ...prev, [m.id]: valid }));
    setCart((prev) => prev.map((l) => l.medicine.id === m.id ? { ...l, patas: valid } : l));
  }

  function toggleCart(medicine: PickedMedicine, checked: boolean) {
    if (checked) {
      setCart((prev) => {
        if (prev.find((l) => l.medicine.id === medicine.id)) return prev;
        return [...prev, { medicine, boxes: step1Boxes[medicine.id] ?? 1, patas: step1Patas[medicine.id] ?? 0 }];
      });
    } else {
      setCart((prev) => prev.filter((l) => l.medicine.id !== medicine.id));
    }
  }

  function updateBoxes(idx: number, raw: string) {
    const boxes = parseQuantityInput(raw, 0);
    setCart((prev) =>
      prev.map((line, i) => {
        if (i === idx) {
          setStep1Boxes((sb) => ({ ...sb, [line.medicine.id]: boxes }));
          return { ...line, boxes };
        }
        return line;
      }),
    );
  }

  function updatePatas(idx: number, raw: string) {
    setCart((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const newPatas = parseQuantityInput(raw, 0);
        
        setStep1Patas((sp) => ({ ...sp, [line.medicine.id]: newPatas }));
        
        return {
          ...line,
          patas: newPatas,
        };
      }),
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
        discountPercent: Number(discount || 0),
        paidPaisa: Math.round(takaToPaisa(paid || 0)),
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
      setQuery("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";
  const tdCls = "px-4 py-3 text-sm";
  const inCartSet = new Set(cart.map((l) => l.medicine.id));

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
        <div className="space-y-4">
          <div className="sticky top-0 z-30 -mx-4 bg-surface px-4 py-3 shadow-sm border-b border-line sm:-mx-0 sm:rounded-3xl sm:px-5">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Medicine search করুন..."
                className="w-full rounded-full border border-line bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-ink shadow-sm placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div className="mb-2">
            <p className="font-bold text-brand-strong text-sm">
              {searching ? "খোঁজা হচ্ছে..." : `${results.length} টি পণ্য`}
            </p>
          </div>

          {results.length > 0 && (
            <div className="rounded-2xl bg-white shadow-sm border border-line overflow-hidden">
              <div className="grid grid-cols-[1fr_75px_75px_40px] gap-1 border-b border-line bg-canvas/50 px-2 py-3 text-[11px] font-bold text-ink">
                <div>Product</div>
                <div className="text-center">Box</div>
                <div className="text-center">Pata</div>
                <div className="text-center">Sel</div>
              </div>

              <div className="divide-y divide-line">
                {[
                  ...results,
                  ...cart.filter(l => l.medicine.id.startsWith("custom_")).map(l => l.medicine)
                ].map((m) => {
                  const inCart = inCartSet.has(m.id);
                  const boxes = step1Boxes[m.id] ?? 1;
                  const patas = step1Patas[m.id] ?? 0;
                  
                  return (
                    <div key={m.id} className="grid grid-cols-[1fr_75px_75px_40px] items-center gap-1 p-2">
                      <div className="min-w-0 pr-1">
                        <div className="break-words font-display text-xs font-extrabold uppercase text-brand-strong leading-snug">
                          {m.name}
                        </div>
                        <div className="break-words text-[10px] text-muted">
                          {m.genericName}
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-medium text-muted">
                          <span className="text-ink">Rate: {formatTaka(m.wholesaleBoxPricePaisa)}</span>
                          <span className={m.stockPatas < 0 ? "text-danger font-bold" : ""}>
                            Stock: {Math.floor(m.stockPatas / m.patasPerBox)} box
                          </span>
                        </div>
                      </div>

                      {/* Box Stepper */}
                      <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                        <button type="button" onClick={() => handleStep1BoxesChange(m, boxes - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                        <input type="number" min={0} value={boxes} onChange={(e) => handleStep1BoxesChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                        <button type="button" onClick={() => handleStep1BoxesChange(m, boxes + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
                      </div>

                      {/* Pata Stepper */}
                      <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                        <button type="button" onClick={() => handleStep1PatasChange(m, patas - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                        <input type="number" min={0} value={patas} onChange={(e) => handleStep1PatasChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                        <button type="button" onClick={() => handleStep1PatasChange(m, patas + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
                      </div>

                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={inCart}
                          onChange={(e) => toggleCart(m, e.target.checked)}
                          className="h-5 w-5 rounded border-line text-brand focus:ring-brand disabled:opacity-50"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted">
              "{query}" নামে কোনো মেডিসিন পাওয়া যায়নি।
            </p>
          )}

          {allowCustomItems && (
            <div className={`fixed right-4 z-40 flex flex-col items-end md:right-12 ${cart.length > 0 ? "bottom-[150px] sm:bottom-[150px] md:bottom-28" : "bottom-[90px] sm:bottom-[90px] md:bottom-20"}`}>
              {showCustomForm ? (
                <div className="mb-2 w-[300px] rounded-3xl border border-line bg-surface p-5 shadow-2xl">
                  <h4 className="mb-4 text-sm font-bold text-brand-strong">Add Custom Item</h4>
                  <div className="flex flex-col gap-3">
                    <input
                      placeholder="Item name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                    />
                    <div className="flex gap-3">
                      <input
                        type="number"
                        placeholder="Price"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        className="w-full rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        min={1}
                        value={customBoxes}
                        onChange={(e) => setCustomBoxes(Number(e.target.value) || 1)}
                        className="w-24 rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                      />
                    </div>
                    <div className="mt-2 flex gap-3">
                      <button
                        onClick={addCustomItem}
                        className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-strong transition"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowCustomForm(false)}
                        className="rounded-xl border border-line bg-canvas px-5 py-3 text-sm font-bold text-ink hover:bg-line/50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomForm(true)}
                  className="flex items-center gap-2 rounded-full bg-brand-strong px-5 py-3 text-sm font-bold text-white shadow-xl shadow-brand-strong/30 hover:bg-brand-deep transition-transform hover:scale-105 active:scale-95"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Custom Item
                </button>
              )}
            </div>
          )}

          {cart.length > 0 && (
            <div className="sticky bottom-20 z-20 mt-6 md:bottom-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex w-full items-center justify-between rounded-full bg-brand px-6 py-4 font-bold text-white shadow-xl shadow-brand/30 transition hover:bg-brand-strong"
              >
                <span className="text-base">Checkout a jan</span>
                <span className="font-display text-xl font-extrabold">
                  {cart.length} ti product
                </span>
              </button>
            </div>
          )}
        </div>
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
