"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  searchMedicinesForBuyer,
  submitOrder,
  type BuyerMedicineOption,
} from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";
import { discountPercent } from "@/lib/discount";
import { stockStatusLabel, type StockStatus } from "@/lib/stockStatus";
import { unitLabelsFor, capitalize } from "@/lib/unitLabels";

type CartLine = { medicine: BuyerMedicineOption; boxes: number };

export function BuyerBrowse() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BuyerMedicineOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // Only availability, box rate and MRP come back — never the raw stock
        // count or the retail (pata) price. See searchMedicinesForBuyer.
        const found = await searchMedicinesForBuyer(query);
        if (cancelled) return;
        setResults(found);
      } catch {
        if (!cancelled) setError("Medicine khoja jacche na, abar chesta koro");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function add(medicine: BuyerMedicineOption) {
    setDone("");
    setError("");
    setCart((current) => {
      const existing = current.find((l) => l.medicine.id === medicine.id);
      if (existing) {
        return current.map((l) =>
          l.medicine.id === medicine.id ? { ...l, boxes: l.boxes + 1 } : l,
        );
      }
      return [...current, { medicine, boxes: 1 }];
    });
  }

  function setBoxes(id: string, boxes: number) {
    setCart((current) =>
      current.map((l) =>
        l.medicine.id === id ? { ...l, boxes: Math.max(1, boxes) } : l,
      ),
    );
  }

  const total = cart.reduce(
    (sum, l) => sum + l.medicine.boxPricePaisa * l.boxes,
    0,
  );
  const inCart = new Set(cart.map((l) => l.medicine.id));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      await submitOrder(
        cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes })),
      );
      setDone("Order pathano hoyeche. Malik approve korle janiye deya hobe.");
      setCart([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Hero + search */}
      <section className="rounded-3xl bg-gradient-to-br from-brand to-brand-deep px-5 py-6 text-white shadow-sm">
        <h1 className="font-display text-xl font-extrabold">Order dao</h1>
        <p className="mt-0.5 text-sm text-white/85">
          Medicine khuje cart-e dao, malik approve korbe.
        </p>
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Medicine er nam likho..."
            className="w-full rounded-full border-0 bg-white py-3 pl-12 pr-4 text-sm text-ink shadow-sm placeholder:text-muted focus:ring-2 focus:ring-white/60"
          />
        </div>
      </section>

      {/* Search results */}
      {query.trim() && (
        <section className="space-y-2.5">
          {searching && results.length === 0 ? (
            <p className="px-1 text-sm text-muted">Khoja hocche...</p>
          ) : results.length === 0 ? (
            <p className="px-1 text-sm text-muted">
              &ldquo;{query}&rdquo; naame kono medicine pawa jay ni.
            </p>
          ) : (
            results.map((m) => (
              <ProductCard
                key={m.id}
                medicine={m}
                inCart={inCart.has(m.id)}
                onAdd={() => add(m)}
              />
            ))
          )}
        </section>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="px-1 font-display text-sm font-bold text-ink">
            Cart · {cart.length} ta
          </h2>
          {cart.map((line) => (
            <div
              key={line.medicine.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-bold text-ink">
                  {line.medicine.name}
                </div>
                <div className="text-xs text-muted">
                  {formatTaka(line.medicine.boxPricePaisa)}/
                  {unitLabelsFor(line.medicine.form).outer} ·{" "}
                  <span className="font-semibold text-brand-strong">
                    {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
                  </span>
                </div>
              </div>
              <Stepper
                value={line.boxes}
                onChange={(v) => setBoxes(line.medicine.id, v)}
                unitLabel={unitLabelsFor(line.medicine.form).outer}
              />
              <button
                type="button"
                onClick={() =>
                  setCart((c) => c.filter((l) => l.medicine.id !== line.medicine.id))
                }
                aria-label="Bad dao"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-bg hover:text-danger"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-xl bg-brand-tint px-4 py-2.5 text-sm font-medium text-brand-strong">
          {done}
        </p>
      )}

      {/* Sticky order bar */}
      {cart.length > 0 && (
        <div className="sticky bottom-20 z-20 md:bottom-4">
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-between rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong disabled:opacity-60"
          >
            <span>{busy ? "Wait..." : "Order pathao"}</span>
            <span className="font-display text-lg font-extrabold">
              {formatTaka(total)}
            </span>
          </button>
        </div>
      )}
    </form>
  );
}

function ProductCard({
  medicine,
  inCart,
  onAdd,
}: {
  medicine: BuyerMedicineOption;
  inCart: boolean;
  onAdd: () => void;
}) {
  const off = discountPercent(medicine.mrpBoxPricePaisa, medicine.boxPricePaisa);
  const out = medicine.availability === "out";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm ${
        out ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-sm font-bold text-ink">
            {medicine.name}
          </span>
          <AvailabilityBadge status={medicine.availability} />
        </div>
        {medicine.company ? (
          <div className="text-xs text-muted">{medicine.company}</div>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <span className="font-display text-base font-extrabold text-brand-strong">
            {formatTaka(medicine.boxPricePaisa)}
          </span>
          {off > 0 && (
            <>
              <span className="text-xs text-muted line-through">
                {formatTaka(medicine.mrpBoxPricePaisa)}
              </span>
              <span className="rounded-full bg-warm/15 px-2 py-0.5 text-[11px] font-bold text-warm">
                -{off}%
              </span>
            </>
          )}
          <span className="text-[11px] text-muted">
            /{unitLabelsFor(medicine.form).outer}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={out}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
          out
            ? "cursor-not-allowed bg-line text-muted"
            : inCart
              ? "bg-brand-tint-2 text-brand-strong"
              : "bg-brand text-white hover:bg-brand-strong"
        }`}
      >
        {out ? "Nai" : inCart ? "✓ Add" : "+ Add"}
      </button>
    </div>
  );
}

function AvailabilityBadge({ status }: { status: StockStatus }) {
  const style: Record<StockStatus, string> = {
    in: "bg-brand-tint-2 text-brand-strong",
    low: "bg-warn-bg text-warn",
    out: "bg-danger-bg text-danger",
  };
  const dot: Record<StockStatus, string> = {
    in: "bg-brand",
    low: "bg-warn",
    out: "bg-danger",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${style[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status]}`} />
      {stockStatusLabel(status)}
    </span>
  );
}

function Stepper({
  value,
  onChange,
  unitLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  unitLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-full border border-line bg-canvas">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label="Kom"
        className="grid h-8 w-8 place-items-center rounded-full text-brand-strong hover:bg-brand-tint-2"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={capitalize(unitLabel)}
        className="w-9 border-0 bg-transparent p-0 text-center text-sm font-semibold text-ink [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Beshi"
        className="grid h-8 w-8 place-items-center rounded-full text-brand-strong hover:bg-brand-tint-2"
      >
        +
      </button>
    </div>
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
    </svg>
  );
}
