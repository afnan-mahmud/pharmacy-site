"use client";

import { useState, useEffect } from "react";
import { listMedicines } from "@/actions/medicines";
import { toMedicineForm } from "@/lib/unitLabels";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { type PickedMedicine } from "./MedicinePicker";

export type CartLine = {
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

export function SaleItemPicker({
  cart,
  priceMode,
  allowCustomItems,
  onAdd,
  onRemove,
  onQuantityChange,
  onAddCustom,
  onProceed,
}: {
  cart: CartLine[];
  priceMode: "retail" | "wholesale";
  allowCustomItems: boolean;
  onAdd: (medicine: PickedMedicine, boxes: number, patas: number) => void;
  onRemove: (medicineId: string) => void;
  onQuantityChange: (medicineId: string, boxes: number, patas: number) => void;
  onAddCustom: (medicine: PickedMedicine, boxes: number) => void;
  onProceed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);

  const [step1Boxes, setStep1Boxes] = useState<Record<string, number>>({});
  const [step1Patas, setStep1Patas] = useState<Record<string, number>>({});

  const inCartSet = new Set(cart.map((l) => l.medicine.id));

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
    onAddCustom(customMed, customBoxes);

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
          })),
        );
      } catch {
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

  function handleBoxesChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Boxes((prev) => ({ ...prev, [m.id]: valid }));
    if (inCartSet.has(m.id)) {
      onQuantityChange(m.id, valid, step1Patas[m.id] ?? 0);
    }
  }

  function handlePatasChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Patas((prev) => ({ ...prev, [m.id]: valid }));
    if (inCartSet.has(m.id)) {
      onQuantityChange(m.id, step1Boxes[m.id] ?? 1, valid);
    }
  }

  function toggleCart(medicine: PickedMedicine, checked: boolean) {
    if (checked) {
      onAdd(medicine, step1Boxes[medicine.id] ?? 1, step1Patas[medicine.id] ?? 0);
    } else {
      onRemove(medicine.id);
    }
  }

  return (
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
      {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}

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
              ...cart.filter((l) => l.medicine.id.startsWith("custom_")).map((l) => l.medicine),
            ].map((m) => {
              const inCart = inCartSet.has(m.id);
              const boxes = step1Boxes[m.id] ?? 1;
              const patas = step1Patas[m.id] ?? 0;
              const boxRate = priceMode === "wholesale" ? m.wholesaleBoxPricePaisa : m.retailBoxPricePaisa;

              return (
                <div key={m.id} className="grid grid-cols-[1fr_75px_75px_40px] items-center gap-1 p-2">
                  <div className="min-w-0 pr-1">
                    <div className="break-words font-display text-xs font-extrabold uppercase text-brand-strong leading-snug">
                      {m.name}
                    </div>
                    <div className="break-words text-[10px] text-muted">{m.genericName}</div>
                    <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-medium text-muted">
                      <span className="text-ink">Rate: {formatTaka(boxRate)}</span>
                      <span className={m.stockPatas < 0 ? "text-danger font-bold" : ""}>
                        Stock: {Math.floor(m.stockPatas / m.patasPerBox)} box
                      </span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                    <button type="button" onClick={() => handleBoxesChange(m, boxes - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                    <input type="number" min={0} value={boxes} onChange={(e) => handleBoxesChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                    <button type="button" onClick={() => handleBoxesChange(m, boxes + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
                  </div>

                  <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                    <button type="button" onClick={() => handlePatasChange(m, patas - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                    <input type="number" min={0} value={patas} onChange={(e) => handlePatasChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                    <button type="button" onClick={() => handlePatasChange(m, patas + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
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
        <p className="mt-4 text-center text-sm text-muted">"{query}" নামে কোনো মেডিসিন পাওয়া যায়নি।</p>
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
                  <button onClick={addCustomItem} className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-strong transition">
                    Add
                  </button>
                  <button onClick={() => setShowCustomForm(false)} className="rounded-xl border border-line bg-canvas px-5 py-3 text-sm font-bold text-ink hover:bg-line/50 transition">
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
            onClick={onProceed}
            className="flex w-full items-center justify-between rounded-full bg-brand px-6 py-4 font-bold text-white shadow-xl shadow-brand/30 transition hover:bg-brand-strong"
          >
            <span className="text-base">Checkout a jan</span>
            <span className="font-display text-xl font-extrabold">{cart.length} ti product</span>
          </button>
        </div>
      )}
    </div>
  );
}
