"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordRetailSale, searchRetailCustomers, type RetailSaleInput } from "@/actions/sales";
import { retailDueBalance } from "@/actions/due";
import { formatTaka } from "@/lib/money";
import { parseTakaInput, parsePercentInput } from "@/lib/takaInput";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";
import { describeDue } from "@/lib/dueDisplay";
import { card } from "@/components/ui";

type CustomerSuggestion = {
  name: string;
  phone: string;
};

export function RetailSaleForm({
  allowCustomItems = false,
}: {
  allowCustomItems?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [nameFromHistory, setNameFromHistory] = useState(false);
  const [priorDuePaisa, setPriorDuePaisa] = useState<number | null>(null);

  // Phone autocomplete
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Discount: Segmented toggle between % and ৳
  const [discountSource, setDiscountSource] = useState<"percent" | "amount">("percent");
  const [percentDiscount, setPercentDiscount] = useState("");
  const [amountDiscount, setAmountDiscount] = useState("");
  const [paid, setPaid] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const customerNameRef = useRef(customerName);
  customerNameRef.current = customerName;
  const nameFromHistoryRef = useRef(nameFromHistory);
  nameFromHistoryRef.current = nameFromHistory;

  // Phone lookup and suggestions debounce
  useEffect(() => {
    const trimmed = customerPhone.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      setPriorDuePaisa(null);
      setNameFromHistory(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchRetailCustomers(trimmed);
        if (cancelled) return;
        setSuggestions(found);
        setShowSuggestions(found.length > 0);

        const exact = found.find((c) => c.phone === trimmed);
        if (exact) {
          if (!customerNameRef.current.trim() || nameFromHistoryRef.current) {
            setCustomerName(exact.name);
            setNameFromHistory(true);
          }
        }

        const bal = await retailDueBalance(trimmed);
        if (!cancelled) {
          setPriorDuePaisa(bal);
        }
      } catch {
        // Ignore lookup errors
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectSuggestion(suggestion: CustomerSuggestion) {
    setCustomerPhone(suggestion.phone);
    setCustomerName(suggestion.name);
    setNameFromHistory(true);
    setShowSuggestions(false);
    retailDueBalance(suggestion.phone)
      .then((bal) => setPriorDuePaisa(bal))
      .catch(() => setPriorDuePaisa(null));
  }

  function lineTotalFor(line: CartLine): number {
    return (
      line.boxes * line.medicine.retailBoxPricePaisa +
      line.patas * line.medicine.retailPataPricePaisa
    );
  }

  const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
  const hasBillableLine = cart.some(
    (line) => line.boxes > 0 || line.patas > 0 || line.medicine.id.startsWith("custom_"),
  );
  const paidPaisa = parseTakaInput(paid);

  let discountArg: DiscountInput | null = null;
  if (discountSource === "percent") {
    const percent = parsePercentInput(percentDiscount);
    discountArg = percent === null ? null : { kind: "percent", percent };
  } else {
    const amountPaisa = parseTakaInput(amountDiscount);
    discountArg = amountPaisa === null ? null : { kind: "amount", amountPaisa };
  }

  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let discountPaisa = 0;
  let discountPercent = 0;
  let totalsError = "";
  if (discountArg === null) {
    totalsError = "ডিসকাউন্টের পরিমাণ সঠিক নয়";
  } else if (paidPaisa === null) {
    totalsError = "জমার পরিমাণ সঠিক নয়";
  } else {
    try {
      const totals = computeTotals(
        cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
        discountArg,
        paidPaisa,
      );
      discountPaisa = totals.discountPaisa;
      discountPercent = totals.discountPercent;
      totalPaisa = totals.totalPaisa;
      duePaisa = totals.duePaisa;
    } catch (err) {
      totalsError = err instanceof Error ? err.message : "হিসাবে ত্রুটি হয়েছে";
    }
  }

  const hasPriorDue = priorDuePaisa !== null && priorDuePaisa !== 0;
  const effectivePriorDue = priorDuePaisa ?? 0;
  const totalPayablePaisa = totalPaisa + effectivePriorDue;
  const finalDuePaisa = totalPayablePaisa - (paidPaisa ?? 0);

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

  const isDueWithoutPhone = duePaisa > 0 && !customerPhone.trim();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) {
      setError("কার্ট খালি। অন্তত একটি পণ্য নির্বাচন করুন।");
      return;
    }
    if (!hasBillableLine) {
      setError("অন্তত একটি পণ্যের পরিমাণ দিন।");
      return;
    }
    if (!customerName.trim()) {
      setError("কাস্টমারের নাম লিখা বাধ্যতামূলক।");
      return;
    }
    if (isDueWithoutPhone) {
      setError("বাকি থাকলে কাস্টমারের মোবাইল নম্বর দেওয়া বাধ্যতামূলক।");
      return;
    }
    if (totalsError || discountArg === null || paidPaisa === null) {
      setError(totalsError || "হিসাবে ত্রুটি রয়েছে");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const payloadItems = cart.map((l) => {
        if (l.medicine.id.startsWith("custom_")) {
          return {
            customName: l.medicine.name,
            customPricePaisa: l.medicine.retailBoxPricePaisa,
            boxes: l.boxes,
            patas: l.patas,
          };
        }
        return { medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas };
      });

      const payload: RetailSaleInput = {
        items: payloadItems,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        discount: discountArg,
        paidPaisa,
      };

      const result = await recordRetailSale(payload);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const sale = result.data;
      setCart([]);
      setDiscountSource("percent");
      setPercentDiscount("");
      setAmountDiscount("");
      setPaid("");
      setCustomerPhone("");
      setCustomerName("");
      setNameFromHistory(false);
      setPriorDuePaisa(null);
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      setStep(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "বিক্রি সেভ করতে সমস্যা হয়েছে");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition shadow-2xs";
  const tdCls = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col pb-12">
      {/* Header Banner with Step Indicator */}
      <section className="-mx-4 -mt-4 mb-5 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-5 pb-6 pt-6 text-white shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-40 w-40 rounded-full bg-black/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold backdrop-blur-sm">
              <span className="text-yellow-300">🏪</span> খুচরা বিক্রি (Retail Sale)
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-black leading-tight">
              {step === 1 ? "নতুন খুচরা বিক্রি" : "চেকআউট ও বিল বিবরণী"}
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              {step === 1
                ? "পণ্য খুঁজুন, পরিমাণ নির্বাচন করুন এবং কার্টে যোগ করুন।"
                : "কাস্টমারের নাম, ফোন, ছাড় ও পেমেন্ট হিসাব সম্পন্ন করুন।"}
            </p>
          </div>

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/20 px-4 py-2.5 text-xs font-black text-white hover:bg-white/30 backdrop-blur-sm active:scale-95 transition"
            >
              <span>← আইটেম পরিবর্তন</span>
            </button>
          )}
        </div>

        {/* 2-Step Progress Indicator */}
        <div className="relative z-10 mt-4 flex items-center gap-3 border-t border-white/15 pt-3 text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 font-bold transition ${
              step === 1 ? "text-yellow-300" : "text-white/70 hover:text-white"
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px]">
              ১
            </span>
            <span>পণ্য নির্বাচন</span>
          </button>
          <span className="text-white/30">➔</span>
          <div
            className={`flex items-center gap-1.5 font-bold ${
              step === 2 ? "text-yellow-300" : "text-white/60"
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px]">
              ২
            </span>
            <span>কাস্টমার ও চেকআউট</span>
          </div>
        </div>
      </section>

      {/* Success Notification Alert */}
      {lastInvoice && lastSaleId && (
        <div className="mb-6 rounded-3xl bg-surface border-2 border-brand p-5 sm:p-6 text-center shadow-md animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">
            🎉
          </div>
          <h2 className="font-display text-lg sm:text-xl font-black text-ink">
            মেমো #{lastInvoice} সফলভাবে তৈরি হয়েছে!
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            খুচরা বিক্রি সেভ হয়েছে। আপনি এখনই রসিদ প্রিন্ট বা ভিউ করতে পারেন।
          </p>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/invoice/${lastSaleId}`}
              className="w-full sm:w-auto rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-xs hover:bg-brand-strong active:scale-95 transition"
            >
              🖨️ ইনভয়েস / রসিদ দেখুন
            </Link>
            <button
              type="button"
              onClick={() => {
                setLastInvoice(null);
                setLastSaleId(null);
              }}
              className="w-full sm:w-auto rounded-2xl border border-line bg-canvas px-5 py-3 text-sm font-bold text-ink hover:bg-line/50 transition"
            >
              + আরেকটি নতুন বিক্রি শুরু করুন
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Search & Pick Items */}
      {step === 1 ? (
        <SaleItemPicker
          cart={cart}
          priceMode="retail"
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
        /* Step 2: Checkout & Finalize */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Information Card */}
          <div className={`${card} p-4 sm:p-5 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-tint text-brand-strong text-sm">
                  👤
                </span>
                <h3 className="font-display text-sm font-extrabold text-ink">
                  কাস্টমারের বিবরণ (Customer Info)
                </h3>
              </div>

              {hasPriorDue && (
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-lg border ${
                    priorDuePaisa! > 0
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {describeDue(priorDuePaisa!).label}: {describeDue(priorDuePaisa!).amountText}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Phone Input with Autocomplete */}
              <div className="relative space-y-1.5" ref={suggestionsRef}>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="customerPhone"
                    className="text-xs font-bold text-ink"
                  >
                    মোবাইল নম্বর{" "}
                    {isDueWithoutPhone ? (
                      <span className="text-danger font-bold">* (বাকি থাকলে আবশ্যক)</span>
                    ) : (
                      <span className="text-[11px] text-muted font-normal">(ঐচ্ছিক)</span>
                    )}
                  </label>
                </div>
                <input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="০১৭xxxxxxxx"
                  className={`${field} ${
                    isDueWithoutPhone ? "border-danger focus:ring-danger" : ""
                  }`}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-xl">
                    {suggestions.map((s) => (
                      <button
                        key={s.phone}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-canvas transition"
                      >
                        <span className="font-semibold text-ink">{s.name || "(নাম নেই)"}</span>
                        <span className="text-xs text-brand-strong font-mono">{s.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Name Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="customerName"
                  className="text-xs font-bold text-ink"
                >
                  কাস্টমারের নাম <span className="font-bold text-danger">*</span>
                </label>
                <input
                  id="customerName"
                  required
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setNameFromHistory(false);
                  }}
                  placeholder="উদাঃ মোঃ কামাল"
                  className={`${field} ${
                    !customerName.trim() ? "border-danger/70 focus:ring-danger" : ""
                  }`}
                />
                {nameFromHistory && (
                  <p className="text-[11px] font-bold text-brand-strong">
                    ✓ পূর্বের কাস্টমার ডাটা থেকে নাম এসেছে
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cart Items Section */}
          <div className={`${card} p-4 sm:p-5 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-tint text-brand-strong text-sm">
                  🛒
                </span>
                <h3 className="font-display text-sm font-extrabold text-ink">
                  অর্ডারের পণ্যসমূহ ({cart.length} টি)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-brand-strong hover:underline"
              >
                + পণ্য পরিবর্তন
              </button>
            </div>

            {/* Mobile Item Cards */}
            <div className="md:hidden space-y-2.5">
              {cart.map((line, idx) => {
                const units = unitLabelsFor(line.medicine.form);
                const isCustom = line.medicine.id.startsWith("custom_");

                return (
                  <div
                    key={line.medicine.id}
                    className="rounded-2xl border border-line bg-surface p-3 space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-sm font-bold text-ink">
                          {line.medicine.name}
                        </div>
                        <div className="text-xs text-muted">
                          দর: {formatTaka(line.medicine.retailBoxPricePaisa)}/{units.outer}
                          {line.medicine.retailPataPricePaisa > 0 &&
                            ` · ${formatTaka(line.medicine.retailPataPricePaisa)}/${units.inner}`}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition text-xs font-bold"
                        title="মুছে ফেলুন"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-t border-line/50 pt-2">
                      <div className="flex items-center gap-2">
                        {/* Box Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={line.boxes}
                            onChange={(e) => updateBoxes(idx, e.target.value)}
                            className="w-14 rounded-xl border border-line px-2 py-1.5 text-center text-xs font-bold text-ink focus:border-brand focus:outline-none"
                          />
                          <span className="text-[11px] text-muted font-medium">{units.outer}</span>
                        </div>

                        {/* Pata Input */}
                        {!isCustom && line.medicine.patasPerBox > 1 && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={line.patas}
                              onChange={(e) => updatePatas(idx, e.target.value)}
                              className="w-14 rounded-xl border border-line px-2 py-1.5 text-center text-xs font-bold text-ink focus:border-brand focus:outline-none"
                            />
                            <span className="text-[11px] text-muted font-medium">{units.inner}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right font-display text-sm font-black text-ink">
                        {formatTaka(lineTotalFor(line))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs font-bold text-muted bg-canvas/50">
                  <tr>
                    <th className={tdCls}>মেডিসিন</th>
                    <th className={tdCls}>খুচরা দর</th>
                    <th className={tdCls}>পরিমাণ</th>
                    <th className={`${tdCls} text-right`}>মোট</th>
                    <th className={tdCls}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {cart.map((line, idx) => {
                    const units = unitLabelsFor(line.medicine.form);
                    const isCustom = line.medicine.id.startsWith("custom_");

                    return (
                      <tr key={line.medicine.id} className="hover:bg-canvas/40 transition">
                        <td className={tdCls}>
                          <div className="font-bold text-ink">{line.medicine.name}</div>
                          <div className="text-xs text-muted">
                            {line.medicine.patasPerBox} {units.inner}/{units.outer}
                          </div>
                        </td>
                        <td className={tdCls}>
                          {formatTaka(line.medicine.retailBoxPricePaisa)}
                        </td>
                        <td className={tdCls}>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={line.boxes}
                              onChange={(e) => updateBoxes(idx, e.target.value)}
                              className="w-16 rounded-xl border border-line px-2 py-1 text-xs font-bold text-ink focus:border-brand focus:outline-none"
                            />
                            <span className="text-xs text-muted">{units.outer}</span>
                            {!isCustom && line.medicine.patasPerBox > 1 && (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  value={line.patas}
                                  onChange={(e) => updatePatas(idx, e.target.value)}
                                  className="w-16 rounded-xl border border-line px-2 py-1 text-xs font-bold text-ink focus:border-brand focus:outline-none"
                                />
                                <span className="text-xs text-muted">{units.inner}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className={`${tdCls} text-right font-display font-bold text-ink`}>
                          {formatTaka(lineTotalFor(line))}
                        </td>
                        <td className={tdCls}>
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-muted hover:text-danger rounded-full p-1 hover:bg-danger-bg transition"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discount & Payment Controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Discount Card */}
            <div className={`${card} p-4 sm:p-5 shadow-xs space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🏷️</span>
                  <label className="text-xs font-bold text-ink">ডিসকাউন্ট / ছাড়</label>
                </div>

                {/* Segmented Toggle: % vs ৳ */}
                <div className="flex rounded-xl bg-canvas p-0.5 border border-line">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountSource("percent");
                      setPercentDiscount("");
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      discountSource === "percent"
                        ? "bg-brand text-white shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    % শতাংশ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountSource("amount");
                      setAmountDiscount("");
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      discountSource === "amount"
                        ? "bg-brand text-white shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    ৳ টাকা
                  </button>
                </div>
              </div>

              {discountSource === "percent" ? (
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      id="discountPercent"
                      type="number"
                      step="0.01"
                      min={0}
                      className={field}
                      placeholder="শতাংশ (%) দিন, উদাঃ ৫"
                      value={percentDiscount}
                      onChange={(e) => {
                        setDiscountSource("percent");
                        setPercentDiscount(e.target.value);
                        setAmountDiscount("");
                      }}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-muted">
                      %
                    </span>
                  </div>
                  {discountPaisa > 0 && (
                    <div className="text-[11px] text-emerald-700 font-bold">
                      ছাড়ের পরিমাণ: − {formatTaka(discountPaisa)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      id="discountAmount"
                      type="number"
                      step="0.01"
                      min={0}
                      className={field}
                      placeholder="টাকার পরিমাণ দিন, উদাঃ ৫০"
                      value={amountDiscount}
                      onChange={(e) => {
                        setDiscountSource("amount");
                        setAmountDiscount(e.target.value);
                        setPercentDiscount("");
                      }}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-muted">
                      ৳
                    </span>
                  </div>
                  {discountPaisa > 0 && (
                    <div className="text-[11px] text-emerald-700 font-bold">
                      ছাড়ের পরিমাণ: − {formatTaka(discountPaisa)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Input Card */}
            <div className={`${card} p-4 sm:p-5 shadow-xs space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">💵</span>
                  <label htmlFor="paid" className="text-xs font-bold text-ink">
                    নগদ জমা / Payment (৳)
                  </label>
                </div>

                {/* Quick Payment Presets */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaid("0")}
                    className="rounded-lg bg-canvas border border-line px-2 py-0.5 text-[10px] font-bold text-muted hover:text-ink transition"
                  >
                    ০ বাকি
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaid((totalPayablePaisa / 100).toString())}
                    className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    সম্পূর্ণ পরিশোধ
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  id="paid"
                  type="number"
                  step="0.01"
                  min={0}
                  className={`${field} text-base font-black`}
                  placeholder="০.০০"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-muted">
                  ৳
                </span>
              </div>
            </div>
          </div>

          {/* Financial Breakdown & Summary */}
          <div className="rounded-3xl border border-line bg-gradient-to-br from-surface to-canvas p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-line/60 pb-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-tint text-brand-strong text-xs">
                🧾
              </span>
              <h4 className="font-display text-xs font-black uppercase tracking-wider text-muted">
                হিসাব বিবরণী (Summary)
              </h4>
            </div>

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-muted">
                <span>পণ্যের মোট মূল্য (Subtotal):</span>
                <span className="font-bold text-ink">{formatTaka(subtotalPaisa)}</span>
              </div>

              {discountPaisa > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>
                    ডিসকাউন্ট / ছাড়
                    {discountSource === "percent" && discountPercent > 0
                      ? ` (${discountPercent}%)`
                      : ""}
                    :
                  </span>
                  <span className="font-bold">− {formatTaka(discountPaisa)}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-ink border-t border-line/40 pt-1.5">
                <span>বর্তমান বিল:</span>
                <span className="font-display font-black text-ink">{formatTaka(totalPaisa)}</span>
              </div>

              {hasPriorDue && (
                <div className="flex justify-between text-muted pt-1">
                  <span>
                    {priorDuePaisa! > 0 ? "পূর্বের বকেয়া বাকি (+):" : "পূর্বের অগ্রিম জমা (−):"}
                  </span>
                  <span
                    className={`font-bold ${
                      priorDuePaisa! > 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {priorDuePaisa! > 0 ? "+ " : "− "}
                    {formatTaka(Math.abs(priorDuePaisa!))}
                  </span>
                </div>
              )}

              {paidPaisa !== null && paidPaisa > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium border-t border-line/40 pt-1.5">
                  <span>নগদ জমা পরিশোধ (−):</span>
                  <span className="font-bold">− {formatTaka(paidPaisa)}</span>
                </div>
              )}
            </div>

            {/* Final Balance Card */}
            <div
              className={`rounded-2xl p-4 border flex items-center justify-between mt-2 ${
                finalDuePaisa > 0
                  ? "bg-rose-50/80 border-rose-200 text-rose-900"
                  : finalDuePaisa < 0
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  : "bg-surface border-line text-ink"
              }`}
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {finalDuePaisa > 0
                    ? "অবশিষ্ট মোট বাকি (Due)"
                    : finalDuePaisa < 0
                    ? "ক্রেতার অগ্রিম জমা (Credit)"
                    : "সম্পূর্ণ পরিশোধিত (Paid)"}
                </div>
                <div className="font-display text-xl sm:text-2xl font-black mt-0.5">
                  {formatTaka(Math.abs(finalDuePaisa))}
                </div>
              </div>

              <div
                className={`grid h-10 w-10 place-items-center rounded-2xl text-lg font-black ${
                  finalDuePaisa > 0
                    ? "bg-rose-200/60 text-rose-700"
                    : finalDuePaisa < 0
                    ? "bg-emerald-200/60 text-emerald-700"
                    : "bg-line text-muted"
                }`}
              >
                {finalDuePaisa > 0 ? "⚠️" : finalDuePaisa < 0 ? "💳" : "✓"}
              </div>
            </div>
          </div>

          {/* Validation Messages */}
          {!customerName.trim() && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>কাস্টমারের নাম লিখা বাধ্যতামূলক।</span>
            </div>
          )}

          {isDueWithoutPhone && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>বাকি থাকলে কাস্টমারের মোবাইল নম্বর দেওয়া বাধ্যতামূলক।</span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              busy ||
              cart.length === 0 ||
              !hasBillableLine ||
              !customerName.trim() ||
              isDueWithoutPhone ||
              !!totalsError
            }
            className="w-full rounded-2xl bg-brand py-4 text-base sm:text-lg font-black text-white shadow-lg hover:bg-brand-strong active:scale-95 transition disabled:opacity-50"
          >
            {busy ? "বিক্রি সম্পন্ন হচ্ছে..." : "✓ খুচরা বিক্রি নিশ্চিত করুন"}
          </button>
        </form>
      )}
    </div>
  );
}
