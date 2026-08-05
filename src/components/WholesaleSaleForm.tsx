"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordWholesaleSale } from "@/actions/sales";
import { buyerDueBalance } from "@/actions/due";
import { formatTaka, paisaToTaka } from "@/lib/money";
import { parseTakaInput, parsePercentInput } from "@/lib/takaInput";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";
import { describeDue } from "@/lib/dueDisplay";
import { BuyerPicker, type BuyerOption } from "./BuyerPicker";
import { AddBuyerModal } from "./AddBuyerModal";
import { card, input, errorBox } from "@/components/ui";

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
  const [addingBuyerQuery, setAddingBuyerQuery] = useState<string | null>(null);
  const [priorDuePaisa, setPriorDuePaisa] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountSource, setDiscountSource] = useState<"percent" | "amount">("percent");
  const [percentDiscount, setPercentDiscount] = useState("");
  const [amountDiscount, setAmountDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  useEffect(() => {
    (window as any).showAddBuyerModal = (query: string) => {
      setAddingBuyerQuery(query);
    };
    return () => {
      delete (window as any).showAddBuyerModal;
    };
  }, []);

  useEffect(() => {
    if (!buyerId) {
      setPriorDuePaisa(null);
      return;
    }
    let cancelled = false;
    buyerDueBalance(buyerId)
      .then((bal) => {
        if (!cancelled) setPriorDuePaisa(bal);
      })
      .catch(() => {
        if (!cancelled) setPriorDuePaisa(null);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerId]);

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
    totalsError = "ডিসকাউন্ট সঠিক নয়";
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!buyerId) {
      setError("অনুগ্রহ করে পাইকারি ক্রেতা (Buyer) নির্বাচন করুন");
      return;
    }
    if (cart.length === 0) {
      setError("কার্ট খালি — ঔষধ নির্বাচন করুন");
      return;
    }
    if (!hasBillableLine) {
      setError("অন্তত একটি পণ্যের পরিমাণ থাকতে হবে");
      return;
    }
    if (totalsError || paidPaisa === null) {
      setError(totalsError || "হিসাবে ভুল রয়েছে");
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
        discount: discountArg!,
        paidPaisa,
      });
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
      setBuyerId("");
      setPriorDuePaisa(null);
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      setStep(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "অর্ডার সেভ করতে সমস্যা হয়েছে");
    } finally {
      setBusy(false);
    }
  }

  const selectedBuyer = buyers.find((b) => b.id === buyerId);

  return (
    <div className="flex flex-col pb-12">
      {/* Curved Hero Banner */}
      <section className="-mx-4 -mt-4 mb-5 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-5 pb-6 pt-6 text-white shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-40 w-40 rounded-full bg-black/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold backdrop-blur-sm">
              <span className="text-yellow-300">📦</span> পাইকারি বিক্রি (Wholesale)
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-black leading-tight">
              {step === 1 ? "নতুন পাইকারি অর্ডার" : "চেকআউট ও বিল ফাইনাল"}
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              {step === 1
                ? "ঔষধ খুঁজুন এবং কার্টে পরিমাণ নির্ধারণ করুন।"
                : "ক্রেতা নির্বাচন, ডিসকাউন্ট ও জমা নির্ধারণ করে অর্ডার সম্পন্ন করুন।"}
            </p>
          </div>

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 transition backdrop-blur-sm active:scale-95"
            >
              ← ঔষধ পরিবর্তন / কার্ট দেখুন
            </button>
          )}
        </div>

        {/* Step Indicator Bar */}
        <div className="relative z-10 mt-4 flex items-center gap-2 border-t border-white/15 pt-3 text-xs">
          <div
            className={`flex items-center gap-1.5 font-bold ${
              step === 1 ? "text-yellow-300" : "text-white/60"
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px]">
              ১
            </span>
            <span>ঔষধ নির্বাচন {cart.length > 0 ? `(${cart.length})` : ""}</span>
          </div>
          <span className="text-white/30">➔</span>
          <div
            className={`flex items-center gap-1.5 font-bold ${
              step === 2 ? "text-yellow-300" : "text-white/60"
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px]">
              ২
            </span>
            <span>ক্রেতা ও চেকআউট</span>
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
            অর্ডারটি সেভ হয়েছে। আপনি এখনই রসিদ প্রিন্ট বা ডাউনলোড করতে পারেন।
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
        /* Step 2: Checkout & Finalize */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Buyer Selection Card */}
          <div className={`${card} p-4 sm:p-5 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-tint text-brand-strong text-sm">
                  🏪
                </span>
                <label className="font-display text-sm font-extrabold text-ink">
                  পাইকারি ক্রেতা (Buyer) <span className="text-danger">*</span>
                </label>
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

            <BuyerPicker
              buyers={buyers}
              value={buyerId}
              onChange={setBuyerId}
              disabled={busy}
            />

            {selectedBuyer && (
              <div className="rounded-xl bg-brand-tint/20 p-2.5 text-xs text-brand-strong flex items-center justify-between">
                <span>
                  দোকান: <strong>{selectedBuyer.shopName || "—"}</strong>
                </span>
                <span>ফোন: {selectedBuyer.phone || "—"}</span>
              </div>
            )}
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
                + পণ্য যোগ / পরিবর্তন
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
                          দর: {formatTaka(line.medicine.wholesaleBoxPricePaisa)}/{units.outer}
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
                <thead className="border-b border-line text-left text-muted bg-canvas/40">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">ঔষধ ও বিবরণ</th>
                    <th className="px-3 py-2.5 font-semibold">প্যাক দর</th>
                    <th className="px-3 py-2.5 font-semibold">পরিমাণ</th>
                    <th className="px-3 py-2.5 font-semibold text-right">মোট টাকা</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {cart.map((line, idx) => {
                    const units = unitLabelsFor(line.medicine.form);
                    const isCustom = line.medicine.id.startsWith("custom_");

                    return (
                      <tr key={line.medicine.id} className="hover:bg-surface-hover transition">
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-ink">{line.medicine.name}</div>
                          <div className="text-xs text-muted">
                            {line.medicine.patasPerBox} {units.inner}/{units.outer}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          {formatTaka(line.medicine.wholesaleBoxPricePaisa)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
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
                        <td className="px-3 py-2.5 text-right font-bold text-ink">
                          {formatTaka(lineTotalFor(line))}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-muted hover:text-danger p-1 rounded-lg hover:bg-rose-50 transition"
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

          {/* Discount & Payment Controls + Financial Summary Card */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Discount & Joma Form Card */}
            <div className={`${card} p-4 sm:p-5 shadow-xs space-y-4`}>
              <h3 className="font-display text-sm font-extrabold text-ink border-b border-line/60 pb-2">
                ডিসকাউন্ট ও জমা নির্ধারণ
              </h3>

              {/* Discount Segmented Switch & Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">বিশেষ ছাড় (Discount)</label>
                  <div className="inline-flex rounded-xl bg-canvas p-0.5 border border-line text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountSource("percent");
                        setAmountDiscount("");
                      }}
                      className={`rounded-lg px-2.5 py-1 transition ${
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
                        setPercentDiscount("");
                      }}
                      className={`rounded-lg px-2.5 py-1 transition ${
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
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className={`${input} pr-8 font-bold text-ink`}
                      placeholder="0.00 %"
                      value={percentDiscount}
                      onChange={(e) => setPercentDiscount(e.target.value)}
                    />
                    <span className="absolute right-3 top-2.5 text-sm font-bold text-muted">%</span>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-bold text-muted">৳</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className={`${input} pl-7 font-bold text-ink`}
                      placeholder="0.00"
                      value={amountDiscount}
                      onChange={(e) => setAmountDiscount(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Joma (Paid) Field with Quick Buttons */}
              <div className="space-y-2 border-t border-line/50 pt-3">
                <label className="text-xs font-bold text-ink">নগদ জমা / পেমেন্ট (৳)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm font-bold text-muted">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className={`${input} pl-7 font-bold text-ink text-base`}
                    placeholder="0.00"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPaid("0")}
                    className="rounded-xl border border-line bg-canvas px-3 py-1 text-xs font-bold text-muted hover:text-ink transition"
                  >
                    ০ (সম্পূর্ণ বাকি)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaid(paisaToTaka(totalPaisa).toString())}
                    className="rounded-xl border border-brand/40 bg-brand-tint/30 px-3 py-1 text-xs font-bold text-brand-strong hover:bg-brand hover:text-white transition"
                  >
                    সম্পূর্ণ বিল পরিশোধ (৳{formatTaka(totalPaisa)})
                  </button>
                </div>
              </div>
            </div>

            {/* Financial Summary Card */}
            <div className="rounded-3xl border border-brand/30 bg-surface p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-display text-sm font-extrabold text-ink border-b border-line/60 pb-2 mb-3">
                  বিল ও হিসাব বিবরণী
                </h3>

                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between text-muted">
                    <span>সাবটোটাল (Subtotal):</span>
                    <span className="font-semibold text-ink">{formatTaka(subtotalPaisa)}</span>
                  </div>

                  {discountPaisa > 0 && (
                    <div className="flex justify-between text-rose-600 font-medium">
                      <span>
                        ডিসকাউন্ট ছাড়
                        {discountSource === "percent" && discountPercent > 0
                          ? ` (${discountPercent}%)`
                          : ""}
                        :
                      </span>
                      <span>− {formatTaka(discountPaisa)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-ink border-t border-line/50 pt-1.5">
                    <span>বর্তমান বিল (Current Bill):</span>
                    <span className="text-base">{formatTaka(totalPaisa)}</span>
                  </div>

                  {hasPriorDue && (
                    <>
                      {priorDuePaisa! > 0 ? (
                        <div className="flex justify-between text-rose-600 font-semibold">
                          <span>পূর্বের বকেয়া (Prior Due):</span>
                          <span>+ {formatTaka(priorDuePaisa!)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-emerald-700 font-semibold">
                          <span>পূর্বের জমা (Advance Credit):</span>
                          <span>− {formatTaka(Math.abs(priorDuePaisa!))}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-ink border-t border-brand/20 pt-1.5">
                        <span>সর্বমোট প্রদেয় (Total Payable):</span>
                        <span className="text-brand-strong">{formatTaka(totalPayablePaisa)}</span>
                      </div>
                    </>
                  )}

                  {paidPaisa !== null && paidPaisa > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>জমা পরিশোধ (Paid):</span>
                      <span>− {formatTaka(paidPaisa)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Net Balance Banner */}
              <div className="rounded-2xl bg-canvas p-3.5 border border-line">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold text-muted uppercase">
                    অবশিষ্ট অবস্থা:
                  </span>
                  {finalDuePaisa > 0 ? (
                    <div className="text-right">
                      <div className="font-display text-lg font-black text-rose-600">
                        {formatTaka(finalDuePaisa)}
                      </div>
                      <div className="text-[10px] font-bold text-rose-500">মোট বাকি থাকবে</div>
                    </div>
                  ) : finalDuePaisa < 0 ? (
                    <div className="text-right">
                      <div className="font-display text-lg font-black text-emerald-600">
                        {formatTaka(Math.abs(finalDuePaisa))}
                      </div>
                      <div className="text-[10px] font-bold text-emerald-600">ক্রেতার অগ্রিম জমা থাকবে</div>
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="font-display text-base font-black text-emerald-700">
                        ৳0.00
                      </div>
                      <div className="text-[10px] font-bold text-emerald-600">সম্পূর্ণ পরিশোধিত (Shodh)</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && <p role="alert" className={errorBox}>{error}</p>}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy || cart.length === 0 || !hasBillableLine || !buyerId || !!totalsError}
            className="w-full rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-lg hover:bg-brand-strong active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              <span>অর্ডার প্রসেস হচ্ছে...</span>
            ) : (
              <>
                <span>✓ পাইকারি অর্ডার নিশ্চিত করুন</span>
                <span>({formatTaka(totalPaisa)})</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Add Buyer Modal */}
      {addingBuyerQuery !== null && (
        <AddBuyerModal
          initialQuery={addingBuyerQuery}
          onClose={() => setAddingBuyerQuery(null)}
          onCreated={(newBuyerId) => {
            setAddingBuyerQuery(null);
            setBuyerId(newBuyerId);
          }}
        />
      )}
    </div>
  );
}
