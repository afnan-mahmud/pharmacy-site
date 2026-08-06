"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  searchMedicinesForBuyer,
  submitOrder,
  type BuyerMedicineOption,
} from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";
import { unitLabelsFor } from "@/lib/unitLabels";
import { stockStatusLabel, type StockStatus } from "@/lib/stockStatus";

type CartLine = { medicine: BuyerMedicineOption; boxes: number; patas: number };

export function BuyerBrowse() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BuyerMedicineOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [quantitiesBoxes, setQuantitiesBoxes] = useState<Record<string, number>>({});
  const [quantitiesPatas, setQuantitiesPatas] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // We now allow empty queries to load the initial list of active products.
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchMedicinesForBuyer(query);
        if (cancelled) return;
        setResults(found);
      } catch {
        if (!cancelled) toast.error("Medicine khoja jacche na, abar chesta koro");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function toggleCart(medicine: BuyerMedicineOption, checked: boolean) {
    if (checked) {
      setCart((current) => {
        if (current.find((l) => l.medicine.id === medicine.id)) return current;
        const b = quantitiesBoxes[medicine.id] ?? (quantitiesPatas[medicine.id] > 0 ? 0 : 1);
        const p = quantitiesPatas[medicine.id] ?? 0;
        return [...current, { medicine, boxes: b, patas: p }];
      });
    } else {
      setCart((current) => current.filter((l) => l.medicine.id !== medicine.id));
    }
  }

  function handleQuantityChangeBoxes(id: string, boxes: number) {
    const validBoxes = Math.max(0, boxes);
    setQuantitiesBoxes((prev) => ({ ...prev, [id]: validBoxes }));
    setCart((current) => current.map((l) => l.medicine.id === id ? { ...l, boxes: validBoxes } : l));
  }

  function handleQuantityChangePatas(id: string, patas: number) {
    const validPatas = Math.max(0, patas);
    setQuantitiesPatas((prev) => ({ ...prev, [id]: validPatas }));
    setCart((current) => current.map((l) => l.medicine.id === id ? { ...l, patas: validPatas } : l));
  }

  const total = cart.reduce(
    (sum, l) =>
      sum +
      l.boxes * l.medicine.wholesaleBoxPricePaisa +
      l.patas * l.medicine.wholesalePataPricePaisa,
    0,
  );
  const inCart = new Set(cart.map((l) => l.medicine.id));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const result = await submitOrder(
        cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas })),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Order pathano hoyeche. Malik approve korle janiye deya hobe.");
      setCart([]);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col pb-6">
      
      {/* Sticky Search Bar */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 bg-surface px-4 py-3 shadow-sm border-b border-line">
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

      {/* Results Meta */}
      <div className="mb-4">
        <p className="font-bold text-brand-strong text-sm">
          {searching ? "খোঁজা হচ্ছে..." : `${results.length} টি পণ্য`}
        </p>
      </div>

      {/* Table Layout */}
      {results.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm border border-line overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_65px_65px_65px_40px] gap-1 border-b border-line bg-canvas/50 px-2 py-3 text-xs font-bold text-ink">
            <div>Product</div>
            <div className="text-center">Box</div>
            <div className="text-center">Pata</div>
            <div className="text-center">MRP</div>
            <div className="text-center">Sel</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-line">
            {results.map((m) => (
              <ProductTableRow
                key={m.id}
                medicine={m}
                inCart={inCart.has(m.id)}
                boxes={quantitiesBoxes[m.id] ?? (quantitiesPatas[m.id] > 0 ? 0 : 1)}
                patas={quantitiesPatas[m.id] ?? 0}
                onBoxesChange={(val) => handleQuantityChangeBoxes(m.id, val)}
                onPatasChange={(val) => handleQuantityChangePatas(m.id, val)}
                onToggle={(checked) => toggleCart(m, checked)}
              />
            ))}
          </div>
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">
          "{query}" নামে কোনো মেডিসিন পাওয়া যায়নি।
        </p>
      )}

      {/* Sticky Order Bar */}
      {cart.length > 0 && (
        <div className="sticky bottom-20 z-20 mt-6 md:bottom-4">
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-between rounded-full bg-brand px-6 py-4 font-bold text-white shadow-xl shadow-brand/30 transition hover:bg-brand-strong disabled:opacity-60"
          >
            <span className="text-base">{busy ? "Wait..." : "Order pathao"}</span>
            <span className="font-display text-xl font-extrabold">
              {formatTaka(total)}
            </span>
          </button>
        </div>
      )}
    </form>
  );
}

function ProductTableRow({
  medicine,
  inCart,
  boxes,
  patas,
  onBoxesChange,
  onPatasChange,
  onToggle,
}: {
  medicine: BuyerMedicineOption;
  inCart: boolean;
  boxes: number;
  patas: number;
  onBoxesChange: (v: number) => void;
  onPatasChange: (v: number) => void;
  onToggle: (checked: boolean) => void;
}) {
  // Out of stock is shown, not enforced: the red badge says so, and the
  // controls stay live because ordering something the shop has run out of is
  // a normal request for the owner to fill from the next delivery. Dimming
  // and disabling the row — which is what this did while `out` was
  // unreachable and therefore never actually happened — would turn a label
  // into a refusal nobody decided on.
  return (
    <div className="grid grid-cols-[1fr_65px_65px_65px_40px] items-center gap-1 p-2">
      {/* Product Details */}
      <div className="min-w-0 pr-1">
        <div className="break-words font-display text-[13px] font-extrabold uppercase text-brand-strong leading-snug">
          {medicine.name}
        </div>
        {medicine.company && (
          <div className="break-words text-[11px] text-muted">
            {medicine.company}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <AvailabilityBadge status={medicine.availability} />
          <span className="text-[10px] text-muted border border-line rounded-full px-1.5 py-0.5">{medicine.patasPerBox} {unitLabelsFor(medicine.form).inner}/{unitLabelsFor(medicine.form).outer}</span>
        </div>
      </div>

      {/* Box Stepper */}
      <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[32px] w-full px-0.5`}>
        <button
          type="button"
          onClick={() => onBoxesChange(boxes - 1)}
          className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"} disabled:opacity-50`}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={boxes}
          onChange={(e) => onBoxesChange(Number(e.target.value))}
          className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`}
        />
        <button
          type="button"
          onClick={() => onBoxesChange(boxes + 1)}
          className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"} disabled:opacity-50`}
        >
          +
        </button>
      </div>

      {/* Pata Stepper */}
      <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[32px] w-full px-0.5`}>
        <button
          type="button"
          onClick={() => onPatasChange(patas - 1)}
          className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"} disabled:opacity-50`}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={patas}
          onChange={(e) => onPatasChange(Number(e.target.value))}
          className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`}
        />
        <button
          type="button"
          onClick={() => onPatasChange(patas + 1)}
          className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"} disabled:opacity-50`}
        >
          +
        </button>
      </div>

      {/* MRP */}
      <div className="flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-muted line-through decoration-muted/50 font-medium">
          {formatTaka(medicine.mrpBoxPricePaisa)}
        </span>
        <span className="text-[13px] font-extrabold text-ink mt-0.5">
          {formatTaka(medicine.wholesaleBoxPricePaisa)}
        </span>
      </div>

      {/* Select */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={inCart}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-5 w-5 rounded border-line text-brand focus:ring-brand disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function AvailabilityBadge({ status }: { status: StockStatus }) {
  const style: Record<StockStatus, string> = {
    in: "bg-brand-tint text-brand-strong border-brand-tint-2",
    low: "bg-warn/10 text-warn-strong border-warn/20",
    out: "bg-danger-bg text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${style[status]}`}>
      {stockStatusLabel(status)}
    </span>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
