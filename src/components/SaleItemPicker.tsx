"use client";

import { useState, useEffect } from "react";
import { listMedicines } from "@/actions/medicines";
import { toMedicineForm, unitLabelsFor } from "@/lib/unitLabels";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { type PickedMedicine } from "./MedicinePicker";

export type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
  patas: number;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);

  const [step1Boxes, setStep1Boxes] = useState<Record<string, number>>({});
  const [step1Patas, setStep1Patas] = useState<Record<string, number>>({});

  const inCartSet = new Set(cart.map((l) => l.medicine.id));

  // Calculate cart estimated subtotal for bottom bar preview
  const cartSubtotalPaisa = cart.reduce((sum, line) => {
    const boxRate = priceMode === "wholesale" ? line.medicine.wholesaleBoxPricePaisa : line.medicine.retailBoxPricePaisa;
    const pataRate = priceMode === "wholesale" ? line.medicine.wholesalePataPricePaisa : line.medicine.retailPataPricePaisa;
    return sum + (line.boxes * boxRate + line.patas * pataRate);
  }, 0);

  function addCustomItem() {
    if (!customName.trim()) {
      alert("পণ্য বা আইটেমের নাম লিখুন");
      return;
    }
    const pricePaisa = Math.round(takaToPaisa(customPrice || 0));
    if (pricePaisa < 0) {
      alert("সঠিক দাম লিখুন");
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
    setShowCustomModal(false);
  }

  useEffect(() => {
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await listMedicines(query, true);
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
        if (!cancelled) setError("ঔষধ খোঁজা সম্ভব হয়নি");
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

  const allDisplayItems = [
    ...results,
    ...cart.filter((l) => l.medicine.id.startsWith("custom_")).map((l) => l.medicine),
  ];

  return (
    <div className="space-y-4 pb-20">
      {/* Sticky Search Header */}
      <div className="sticky top-0 z-20 -mx-4 bg-canvas/90 backdrop-blur-md px-4 py-2.5 sm:-mx-0 sm:rounded-3xl sm:px-0">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="মেডিসিন নাম বা জেনেরিক দিয়ে খুঁজুন..."
            className="w-full rounded-2xl border border-line bg-surface py-3.5 pl-11 pr-10 text-sm font-medium text-ink shadow-xs placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 transition focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full bg-line text-xs font-bold text-muted hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Header Info & Custom Item Trigger */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink">
            {searching ? "খোঁজা হচ্ছে..." : `পাওয়া গেছে: ${results.length} টি`}
          </span>
          {cart.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-brand-strong">
              ✓ {cart.length} টি কার্টে
            </span>
          )}
        </div>

        {allowCustomItems && (
          <button
            type="button"
            onClick={() => setShowCustomModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-strong hover:bg-brand hover:text-white transition shadow-2xs"
          >
            <span className="text-sm">+</span> কাস্টম আইটেম
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}

      {/* ========================================================================= */}
      {/* MOBILE LIST VIEW (Phones) */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-2.5">
        {allDisplayItems.map((m) => {
          const inCart = inCartSet.has(m.id);
          const boxes = step1Boxes[m.id] ?? 1;
          const patas = step1Patas[m.id] ?? 0;
          const boxRate = priceMode === "wholesale" ? m.wholesaleBoxPricePaisa : m.retailBoxPricePaisa;
          const pataRate = priceMode === "wholesale" ? m.wholesalePataPricePaisa : m.retailPataPricePaisa;
          const isCustom = m.id.startsWith("custom_");
          const units = unitLabelsFor(m.form);

          const stockBoxes = m.patasPerBox > 0 ? Math.floor(m.stockPatas / m.patasPerBox) : 0;
          const stockRemainingPatas = m.patasPerBox > 0 ? m.stockPatas % m.patasPerBox : 0;

          return (
            <div
              key={m.id}
              className={`rounded-2xl border p-3.5 transition shadow-2xs space-y-3 ${
                inCart
                  ? "border-brand bg-brand-tint/15 shadow-xs"
                  : "border-line bg-surface"
              }`}
            >
              {/* Top Row: Name, Generic, Rate & In-Cart Checkbox */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display text-sm font-extrabold uppercase text-ink leading-tight">
                      {m.name}
                    </span>
                    {isCustom && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-bold text-amber-800">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted truncate mt-0.5">{m.genericName}</div>

                  {/* Pricing and Stock Badges */}
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <span className="inline-flex items-center rounded-lg bg-line/60 px-2 py-0.5 text-xs font-bold text-ink">
                      {formatTaka(boxRate)} <span className="text-[10px] text-muted font-normal ml-0.5">/{units.outer}</span>
                    </span>
                    {m.patasPerBox > 1 && pataRate > 0 && (
                      <span className="text-[11px] text-muted font-medium">
                        ({formatTaka(pataRate)}/{units.inner})
                      </span>
                    )}
                    {!isCustom && (
                      <span
                        className={`text-[11px] font-bold ${
                          m.stockPatas <= 0
                            ? "text-rose-600"
                            : stockBoxes < 5
                            ? "text-amber-600"
                            : "text-emerald-700"
                        }`}
                      >
                        স্টক: {stockBoxes} {units.outer} {stockRemainingPatas > 0 ? `${stockRemainingPatas} ${units.inner}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Add / Select Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleCart(m, !inCart)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                    inCart
                      ? "bg-brand text-white hover:bg-brand-strong"
                      : "bg-surface border border-brand text-brand hover:bg-brand-tint"
                  }`}
                >
                  {inCart ? "✓ কার্টে আছে" : "+ যোগ করুন"}
                </button>
              </div>

              {/* Bottom Controls: Box & Pata Steppers */}
              <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                {/* Box Stepper */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-muted w-9">{units.outer}:</span>
                  <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden h-9 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleBoxesChange(m, boxes - 1)}
                      className="grid h-full w-8 place-items-center text-base font-bold text-ink hover:bg-line/40 active:bg-line transition"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={boxes}
                      onChange={(e) => handleBoxesChange(m, Number(e.target.value) || 0)}
                      className="w-10 border-0 bg-transparent p-0 text-center text-xs font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleBoxesChange(m, boxes + 1)}
                      className="grid h-full w-8 place-items-center text-base font-bold text-brand hover:bg-line/40 active:bg-line transition"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Pata Stepper (Only if multi-unit packaging) */}
                {!isCustom && m.patasPerBox > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-muted w-9">{units.inner}:</span>
                    <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden h-9 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handlePatasChange(m, patas - 1)}
                        className="grid h-full w-8 place-items-center text-base font-bold text-ink hover:bg-line/40 active:bg-line transition"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={patas}
                        onChange={(e) => handlePatasChange(m, Number(e.target.value) || 0)}
                        className="w-10 border-0 bg-transparent p-0 text-center text-xs font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => handlePatasChange(m, patas + 1)}
                        className="grid h-full w-8 place-items-center text-base font-bold text-brand hover:bg-line/40 active:bg-line transition"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted font-medium">
                    {m.patasPerBox} {units.inner} প্রতি {units.outer}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* DESKTOP TABLE VIEW */}
      {/* ========================================================================= */}
      {allDisplayItems.length > 0 && (
        <div className="hidden md:block rounded-2xl bg-surface shadow-xs border border-line overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px_100px] gap-2 border-b border-line bg-canvas/50 px-4 py-3 text-xs font-bold text-ink">
            <div>ঔষধ ও বিবরণ</div>
            <div className="text-center">বক্স (Box)</div>
            <div className="text-center">পাতা (Pata)</div>
            <div className="text-center">কার্ট নির্বাচন</div>
          </div>

          <div className="divide-y divide-line">
            {allDisplayItems.map((m) => {
              const inCart = inCartSet.has(m.id);
              const boxes = step1Boxes[m.id] ?? 1;
              const patas = step1Patas[m.id] ?? 0;
              const boxRate = priceMode === "wholesale" ? m.wholesaleBoxPricePaisa : m.retailBoxPricePaisa;
              const units = unitLabelsFor(m.form);

              return (
                <div
                  key={m.id}
                  className={`grid grid-cols-[1fr_120px_120px_100px] items-center gap-2 p-3 transition ${
                    inCart ? "bg-brand-tint/10" : "hover:bg-surface-hover"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-display text-sm font-extrabold uppercase text-ink">
                      {m.name}
                    </div>
                    <div className="text-xs text-muted">{m.genericName}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs font-medium text-muted">
                      <span className="font-bold text-ink">দর: {formatTaka(boxRate)}</span>
                      <span>
                        স্টক: {Math.floor(m.stockPatas / m.patasPerBox)} {units.outer}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden h-9">
                      <button
                        type="button"
                        onClick={() => handleBoxesChange(m, boxes - 1)}
                        className="grid h-full w-8 place-items-center text-sm font-bold text-ink hover:bg-line/40 transition"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={boxes}
                        onChange={(e) => handleBoxesChange(m, Number(e.target.value) || 0)}
                        className="w-12 border-0 bg-transparent p-0 text-center text-xs font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleBoxesChange(m, boxes + 1)}
                        className="grid h-full w-8 place-items-center text-sm font-bold text-brand hover:bg-line/40 transition"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    {m.patasPerBox > 1 ? (
                      <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden h-9">
                        <button
                          type="button"
                          onClick={() => handlePatasChange(m, patas - 1)}
                          className="grid h-full w-8 place-items-center text-sm font-bold text-ink hover:bg-line/40 transition"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={patas}
                          onChange={(e) => handlePatasChange(m, Number(e.target.value) || 0)}
                          className="w-12 border-0 bg-transparent p-0 text-center text-xs font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => handlePatasChange(m, patas + 1)}
                          className="grid h-full w-8 place-items-center text-sm font-bold text-brand hover:bg-line/40 transition"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </div>

                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => toggleCart(m, !inCart)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                        inCart
                          ? "bg-brand text-white hover:bg-brand-strong"
                          : "bg-surface border border-line text-ink hover:border-brand"
                      }`}
                    >
                      {inCart ? "✓ যুক্ত" : "+ যোগ"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!searching && query.trim() && allDisplayItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          "{query}" নামে কোনো মেডিসিন পাওয়া যায়নি।
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM ITEM MODAL OVERLAY */}
      {/* ========================================================================= */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-800 text-base">
                  📦
                </span>
                <h3 className="font-display text-base font-extrabold text-ink">
                  কাস্টম আইটেম যোগ করুন
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-line text-xs font-bold text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink">পণ্যের নাম</label>
                <input
                  placeholder="উদাঃ গজ ব্যান্ডেজ, স্যাভলন"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-ink">মূল্য (৳)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-line px-4 py-3 text-sm font-bold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">পরিমাণ (Box/Qty)</label>
                  <div className="mt-1 flex items-center rounded-2xl border border-line bg-surface overflow-hidden h-[46px]">
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(Math.max(0, customBoxes - 1))}
                      className="grid h-full w-10 place-items-center text-lg font-bold text-ink hover:bg-line/40 transition"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={customBoxes}
                      onChange={(e) => setCustomBoxes(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full border-0 bg-transparent p-0 text-center text-sm font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(customBoxes + 1)}
                      className="grid h-full w-10 place-items-center text-lg font-bold text-brand hover:bg-line/40 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={addCustomItem}
                className="flex-1 rounded-2xl bg-brand py-3.5 text-sm font-bold text-white shadow-md hover:bg-brand-strong transition active:scale-95"
              >
                ✓ কার্টে যোগ করুন
              </button>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="rounded-2xl border border-line bg-canvas px-5 py-3.5 text-sm font-bold text-ink hover:bg-line/50 transition"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING STICKY CHECKOUT BAR */}
      {/* ========================================================================= */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-4 md:static md:bottom-auto md:px-0">
          <div className="mx-auto max-w-2xl rounded-3xl bg-ink p-3 text-white shadow-2xl border border-white/10 backdrop-blur-md flex items-center justify-between gap-3">
            <div className="pl-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  {cart.length}
                </span>
                <span className="text-xs font-semibold text-white/80">টি আইটেম</span>
              </div>
              <div className="font-display text-base sm:text-lg font-black text-yellow-400">
                {formatTaka(cartSubtotalPaisa)}
              </div>
            </div>

            <button
              type="button"
              onClick={onProceed}
              className="rounded-2xl bg-brand px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg hover:bg-brand-strong active:scale-95 transition flex items-center gap-1.5"
            >
              <span>এগিয়ে যান (Checkout)</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
