"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { updateSale } from "@/actions/sales";
import { buyerDueBalance } from "@/actions/due";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { parseTakaInput, parsePercentInput } from "@/lib/takaInput";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { formatDhakaDateTime } from "@/lib/dhakaDate";
import { parseQuantityInput } from "@/lib/quantityInput";
import { unitLabelsFor } from "@/lib/unitLabels";
import { describeDue } from "@/lib/dueDisplay";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import type { Serialized } from "@/lib/serialize";
import type { SaleDoc } from "@/models/Sale";

export type EditingSaleItem = {
  id: string; // medicineId or custom_X
  medicineId?: string;
  customName?: string;
  medicineName: string;
  boxes: number;
  patas: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  form: string;
  isAdded: boolean;
};

function itemTotal(item: EditingSaleItem): number {
  if (!item.medicineId) return item.boxPricePaisa * item.boxes;
  return item.boxPricePaisa * item.boxes + item.pataPricePaisa * item.patas;
}

export function SaleEditor({
  sale,
  currentPrices,
}: {
  sale: Serialized<SaleDoc>;
  currentPrices: Record<string, { boxPricePaisa: number; pataPricePaisa: number }>;
}) {
  const router = useRouter();

  const [items, setItems] = useState<EditingSaleItem[]>(() => {
    let customCounter = 0;
    return sale.items.map((line) => {
      const isCustom = !line.medicineId;
      const id = isCustom ? `custom_req_${customCounter++}` : String(line.medicineId);
      const current = line.medicineId ? currentPrices[String(line.medicineId)] : undefined;
      return {
        id,
        medicineId: line.medicineId ? String(line.medicineId) : undefined,
        customName: isCustom ? line.medicineName : undefined,
        medicineName: line.medicineName,
        boxes: line.quantity,
        patas: line.leftoverPatas ?? 0,
        boxPricePaisa: current?.boxPricePaisa ?? line.ratePaisa,
        pataPricePaisa: current?.pataPricePaisa ?? line.ratePaisa,
        form: line.form ?? "tablet",
        isAdded: false,
      };
    });
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);

  const [discountSource, setDiscountSource] = useState<"percent" | "amount">(
    sale.discountPercent > 0 ? "percent" : "amount",
  );
  const [percentDiscount, setPercentDiscount] = useState(
    sale.discountPercent > 0 ? sale.discountPercent.toString() : "",
  );
  const [amountDiscount, setAmountDiscount] = useState(
    sale.discountPercent === 0 && sale.discountPaisa > 0
      ? (sale.discountPaisa / 100).toString()
      : "",
  );
  const [paidStr, setPaidStr] = useState(
    sale.paidPaisa > 0 ? (sale.paidPaisa / 100).toString() : "0",
  );

  const [priorDuePaisa, setPriorDuePaisa] = useState<number | null>(
    sale.previousDuePaisa ?? null,
  );

  useEffect(() => {
    if (!sale.buyerId) return;
    let cancelled = false;
    buyerDueBalance(String(sale.buyerId))
      .then((bal) => {
        if (!cancelled) setPriorDuePaisa(bal);
      })
      .catch(() => {
        if (!cancelled) setPriorDuePaisa(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sale.buyerId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (id: string, updates: Partial<EditingSaleItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.info("আইটেমটি সরানো হয়েছে");
  };

  const addMedicine = (medicine: PickedMedicine) => {
    if (items.some((i) => i.medicineId === medicine.id)) {
      toast.error("এই প্রোডাক্টটি ইতিমধ্যে যুক্ত আছে");
      return;
    }
    const current = currentPrices[medicine.id];
    const isWholesale = sale.type === "wholesale";
    const boxPrice = current?.boxPricePaisa ?? (isWholesale ? medicine.wholesaleBoxPricePaisa : medicine.retailBoxPricePaisa);
    const pataPrice = current?.pataPricePaisa ?? (isWholesale ? medicine.wholesalePataPricePaisa : medicine.retailPataPricePaisa);

    setItems((prev) => [
      ...prev,
      {
        id: medicine.id,
        medicineId: medicine.id,
        medicineName: medicine.name,
        boxes: 1,
        patas: 0,
        boxPricePaisa: boxPrice,
        pataPricePaisa: pataPrice,
        form: medicine.form,
        isAdded: true,
      },
    ]);
    setPickerOpen(false);
    toast.success(`"${medicine.name}" যুক্ত করা হয়েছে`);
  };

  const addCustomItem = () => {
    if (!customName.trim()) {
      toast.error("আইটেমের নাম লিখুন");
      return;
    }
    const parsedPrice = parseFloat(customPrice || "0");
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("সঠিক মূল্য দিন");
      return;
    }
    const pricePaisa = Math.round(takaToPaisa(parsedPrice));
    setItems((prev) => [
      ...prev,
      {
        id: `custom_added_${Date.now()}`,
        customName: customName.trim(),
        medicineName: customName.trim(),
        boxes: customBoxes,
        patas: 0,
        boxPricePaisa: pricePaisa,
        pataPricePaisa: pricePaisa,
        form: "custom",
        isAdded: true,
      },
    ]);
    setShowCustomForm(false);
    setCustomName("");
    setCustomPrice("");
    setCustomBoxes(1);
    toast.success(`"${customName.trim()}" কাস্টম আইটেম যুক্ত হয়েছে`);
  };

  const handleSave = async () => {
    setError("");

    if (items.length === 0) {
      const msg = "কমপক্ষে একটি প্রোডাক্ট তালিকায় থাকতে হবে";
      setError(msg);
      toast.error(msg);
      return;
    }

    const hasQuantity = items.some((i) => i.boxes > 0 || i.patas > 0);
    if (!hasQuantity) {
      const msg = "কমপক্ষে একটি আইটেমের পরিমাণ ১ বা তার বেশি হতে হবে";
      setError(msg);
      toast.error(msg);
      return;
    }

    for (const item of items) {
      if (!item.medicineId && item.boxPricePaisa < 0) {
        const msg = `"${item.medicineName}" এর মূল্য সঠিক নয়`;
        setError(msg);
        toast.error(msg);
        return;
      }
    }

    setBusy(true);
    try {
      const inputItems = items.map((i) => ({
        medicineId: i.medicineId,
        customName: i.customName,
        customPricePaisa: i.boxPricePaisa,
        boxes: i.boxes,
        patas: i.patas,
      }));

      let discountArg: DiscountInput = { kind: "percent", percent: 0 };
      if (discountSource === "percent") {
        const percent = parsePercentInput(percentDiscount);
        if (percent === null) {
          const msg = "ডিসকাউন্ট সঠিক নয়";
          setError(msg);
          toast.error(msg);
          setBusy(false);
          return;
        }
        discountArg = { kind: "percent", percent };
      } else {
        const amountPaisa = parseTakaInput(amountDiscount);
        if (amountPaisa === null) {
          const msg = "ডিসকাউন্ট সঠিক নয়";
          setError(msg);
          toast.error(msg);
          setBusy(false);
          return;
        }
        discountArg = { kind: "amount", amountPaisa };
      }

      const paidPaisa = parseTakaInput(paidStr);
      if (paidPaisa === null) {
        const msg = "জমার পরিমাণ সঠিক নয়";
        setError(msg);
        toast.error(msg);
        setBusy(false);
        return;
      }

      const result = await updateSale({
        saleId: sale._id,
        items: inputItems,
        discount: discountArg,
        paidPaisa,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        setBusy(false);
        return;
      }

      toast.success("অর্ডার / বিক্রির হিসাব সফলভাবে আপডেট হয়েছে!");
      router.push(`/invoice/${result.data._id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "কিছু একটা সমস্যা হয়েছে";
      setError(msg);
      toast.error(msg);
      setBusy(false);
    }
  };

  const subtotalPaisa = items.reduce((sum, item) => sum + itemTotal(item), 0);

  let discountArg: DiscountInput | null = null;
  if (discountSource === "percent") {
    const percent = parsePercentInput(percentDiscount);
    discountArg = percent === null ? null : { kind: "percent", percent };
  } else {
    const amountPaisa = parseTakaInput(amountDiscount);
    discountArg = amountPaisa === null ? null : { kind: "amount", amountPaisa };
  }

  const paidPaisa = parseTakaInput(paidStr) ?? 0;

  let netTotalPaisa = subtotalPaisa;
  let discountPaisa = 0;
  let discountPercent = 0;

  if (discountArg !== null) {
    try {
      const totals = computeTotals(
        items.map((item) => ({ ratePaisa: itemTotal(item), quantity: 1 })),
        discountArg,
        paidPaisa,
      );
      discountPaisa = totals.discountPaisa;
      discountPercent = totals.discountPercent;
      netTotalPaisa = totals.totalPaisa;
    } catch {
      // Ignored during live computation
    }
  }

  const hasPriorDue = priorDuePaisa !== null && priorDuePaisa !== 0;
  const effectivePriorDue = priorDuePaisa ?? 0;
  const totalPayablePaisa = netTotalPaisa + effectivePriorDue;
  const finalDuePaisa = totalPayablePaisa - paidPaisa;

  return (
    <div className="flex flex-col pb-36 space-y-5 max-w-3xl mx-auto">
      {/* Header Banner */}
      <section className="-mx-4 -mt-4 mb-2 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-5 sm:px-8 pb-8 pt-7 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <Link
              href={`/invoice/${sale._id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25 transition backdrop-blur-xs"
            >
              <span>← ফিরে যান</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
                {sale.type === "wholesale" ? "পাইকারি অর্ডার" : "খুচরা বিক্রি"}
              </span>
              {sale.invoiceNo && (
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
                  {sale.invoiceNo}
                </span>
              )}
            </div>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight">
            অর্ডার / বিক্রির হিসাব এডিট
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/90">
            <span className="font-semibold">
              {sale.buyerName || (sale.type === "retail" ? "খুচরা ক্রেতা" : "ক্রেতার নাম নেই")}
              {sale.buyerShopName ? ` (${sale.buyerShopName})` : ""}
            </span>
            {sale.buyerPhone && <span>· 📞 {sale.buyerPhone}</span>}
            {hasPriorDue && (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                {describeDue(priorDuePaisa!).label}: {describeDue(priorDuePaisa!).amountText}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-white/70">
            রেকর্ডের তারিখ: {formatDhakaDateTime(sale.createdAt)}
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl bg-danger-bg border border-danger/30 p-3.5 text-xs font-semibold text-danger">
          ⚠️ {error}
        </div>
      )}

      {/* Items Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-base font-bold text-ink">
            প্রোডাক্ট তালিকা ({items.length} টি)
          </h2>
          <span className="text-xs text-muted">প্রয়োজনে পরিমাণ পরিবর্তন বা বাদ দিন</span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-sm font-semibold text-muted mb-2">তালিকায় কোনো প্রোডাক্ট নেই</p>
            <p className="text-xs text-muted/70 mb-4">নিচের বাটন দিয়ে নতুন প্রোডাক্ট বা কাস্টম আইটেম যুক্ত করুন</p>
          </div>
        ) : (
          items.map((item) => {
            const isCustom = !item.medicineId;
            const labels = isCustom ? { outer: "boxes", inner: "pcs" } : unitLabelsFor(item.form);

            return (
              <div
                key={item.id}
                className="rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-xs relative overflow-hidden transition hover:border-brand/30"
              >
                {/* Badges */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-ink">{item.medicineName}</h3>
                    {item.isAdded && (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand-strong">
                        নতুন যোগ
                      </span>
                    )}
                    {isCustom && !item.isAdded && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        কাস্টম আইটেম
                      </span>
                    )}
                  </div>

                  {/* Delete Item Button */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-danger-bg hover:bg-danger/20 px-2.5 py-1 text-xs font-semibold text-danger transition"
                    title="এই প্রোডাক্টটি বাদ দিন"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>বাদ দিন</span>
                  </button>
                </div>

                {/* Price & Quantity Controls */}
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-line/60 pt-3">
                  {/* Price info */}
                  <div className="min-w-0">
                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                      মূল্য / দর (Rate)
                    </label>
                    {isCustom ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-ink">৳</span>
                        <input
                          type="number"
                          placeholder="Price"
                          min={0}
                          step="any"
                          value={item.boxPricePaisa > 0 ? (item.boxPricePaisa / 100).toString() : item.boxPricePaisa === 0 ? "0" : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const pricePaisa = val === "" ? 0 : Math.round(takaToPaisa(parseFloat(val) || 0));
                            updateItem(item.id, { boxPricePaisa: pricePaisa, pataPricePaisa: pricePaisa });
                          }}
                          className="w-28 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs sm:text-sm font-bold text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="text-xs sm:text-sm font-bold text-ink">
                        {formatTaka(item.boxPricePaisa)}
                        <span className="text-xs text-muted font-normal">/{labels.outer}</span>
                        {" · "}
                        {formatTaka(item.pataPricePaisa)}
                        <span className="text-xs text-muted font-normal">/{labels.inner}</span>
                      </div>
                    )}
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {/* Box Stepper */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-canvas rounded-full border border-line p-0.5 shadow-inner">
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { boxes: Math.max(0, item.boxes - 1) })}
                          className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-surface text-ink font-bold shadow-xs hover:bg-line/40 active:scale-95 transition"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={item.boxes}
                          onChange={(e) => updateItem(item.id, { boxes: parseQuantityInput(e.target.value, 0) })}
                          className="w-10 sm:w-12 text-center text-xs sm:text-sm font-bold text-ink bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { boxes: item.boxes + 1 })}
                          className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-brand text-white font-bold shadow-xs hover:bg-brand-strong active:scale-95 transition"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-muted">{labels.outer}</span>
                    </div>

                    {/* Pata Stepper (for catalog items) */}
                    {!isCustom && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center bg-canvas rounded-full border border-line p-0.5 shadow-inner">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { patas: Math.max(0, item.patas - 1) })}
                            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-surface text-ink font-bold shadow-xs hover:bg-line/40 active:scale-95 transition"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.patas}
                            onChange={(e) => updateItem(item.id, { patas: parseQuantityInput(e.target.value, 0) })}
                            className="w-10 sm:w-12 text-center text-xs sm:text-sm font-bold text-ink bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { patas: item.patas + 1 })}
                            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-brand text-white font-bold shadow-xs hover:bg-brand-strong active:scale-95 transition"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs font-semibold text-muted">{labels.inner}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Item Billable Footer */}
                <div className="mt-3 flex justify-between items-center bg-canvas/60 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 sm:px-5 py-2.5 border-t border-line/60">
                  <div className="text-xs font-bold text-brand-strong">
                    আইটেম মোট: {formatTaka(itemTotal(item))}
                    {item.boxes === 0 && item.patas === 0 && (
                      <span className="ml-2 font-normal text-muted">(০ পরিমাণ)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    {item.boxes > 0 ? `${item.boxes} ${labels.outer}` : ""}
                    {item.boxes > 0 && item.patas > 0 ? " + " : ""}
                    {item.patas > 0 ? `${item.patas} ${labels.inner}` : ""}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Products / Custom Items Buttons */}
      <div className="space-y-3 pt-2">
        {pickerOpen ? (
          <div className="rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-ink">নতুন প্রোডাক্ট খুঁজুন ও যুক্ত করুন</h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs font-semibold text-muted hover:text-ink transition"
              >
                ✕ বন্ধ করুন
              </button>
            </div>
            <MedicinePicker onPick={addMedicine} placeholder="ঔষধের নাম বা জেনেরিক নাম লিখুন..." />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-2xl border-2 border-dashed border-brand/35 bg-brand-tint/15 py-3.5 text-xs sm:text-sm font-bold text-brand-strong hover:bg-brand-tint/30 active:scale-98 transition flex items-center justify-center gap-2"
          >
            <span className="text-base">＋</span>
            <span>প্রোডাক্ট যুক্ত করুন (Product Add)</span>
          </button>
        )}

        {showCustomForm ? (
          <div className="rounded-3xl border border-brand/40 bg-brand-tint/20 p-4 sm:p-5 shadow-md animate-in fade-in zoom-in-95 duration-150">
            <h4 className="mb-3 text-sm font-bold text-brand-strong">কাস্টম আইটেম যুক্ত করুন</h4>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="আইটেমের নাম লিখুন (যেমন: সার্জিক্যাল গ্লাভস)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs sm:text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted mb-1">মূল্য (৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="প্রতিটির দাম (৳)"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface px-4 py-2 text-xs sm:text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted mb-1">পরিমাণ</label>
                  <div className="flex items-center rounded-2xl border border-line bg-surface overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(Math.max(0, customBoxes - 1))}
                      className="grid h-10 w-10 place-items-center text-base font-bold text-brand hover:bg-brand/10 active:scale-95 transition"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={customBoxes}
                      onChange={(e) => setCustomBoxes(parseQuantityInput(e.target.value, 0))}
                      className="flex-1 border-0 bg-transparent p-0 text-center text-sm font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(customBoxes + 1)}
                      className="grid h-10 w-10 place-items-center text-base font-bold text-brand hover:bg-brand/10 active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={addCustomItem}
                  className="flex-1 rounded-2xl bg-brand py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-brand-strong active:scale-98 transition shadow-xs"
                >
                  যোগ করুন
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs sm:text-sm font-bold text-muted hover:text-ink hover:bg-canvas transition"
                >
                  বাতিল
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomForm(true)}
            className="w-full rounded-2xl border border-line bg-surface py-3 text-xs sm:text-sm font-bold text-ink hover:bg-canvas active:scale-98 transition flex items-center justify-center gap-1.5"
          >
            <span>📝</span>
            <span>কাস্টম আইটেম যুক্ত করুন (Custom Item)</span>
          </button>
        )}
      </div>

      {/* Discount & Payment Details */}
      <div className="space-y-4 pt-2">
        <h3 className="font-display text-base font-bold text-ink">
          ডিসকাউন্ট ও জমার হিসাব
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Discount % */}
          <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-1.5">
            <label className="block text-xs font-bold text-muted">ডিসকাউন্ট (%)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={percentDiscount}
                onChange={(e) => {
                  setDiscountSource("percent");
                  setPercentDiscount(e.target.value);
                  setAmountDiscount("");
                }}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs sm:text-sm font-bold text-ink focus:border-brand focus:outline-none"
                placeholder="0"
              />
              <span className="text-xs font-bold text-muted">%</span>
            </div>
          </div>

          {/* Discount Taka */}
          <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-1.5">
            <label className="block text-xs font-bold text-muted">ডিসকাউন্ট (৳)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                min={0}
                value={amountDiscount}
                onChange={(e) => {
                  setDiscountSource("amount");
                  setAmountDiscount(e.target.value);
                  setPercentDiscount("");
                }}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs sm:text-sm font-bold text-ink focus:border-brand focus:outline-none"
                placeholder="0"
              />
              <span className="text-xs font-bold text-muted">৳</span>
            </div>
          </div>

          {/* Paid Taka */}
          <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-1.5">
            <label className="block text-xs font-bold text-muted">জমা / পরিশোধ (৳)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                min={0}
                value={paidStr}
                onChange={(e) => setPaidStr(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs sm:text-sm font-bold text-ink focus:border-brand focus:outline-none"
                placeholder="0"
              />
              <span className="text-xs font-bold text-muted">৳</span>
            </div>
          </div>
        </div>

        {/* Calculation Summary Card */}
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-xs space-y-2.5 text-xs sm:text-sm">
          <div className="flex justify-between text-muted">
            <span>মোট সাবটোটাল (Subtotal):</span>
            <span className="font-bold text-ink">{formatTaka(subtotalPaisa)}</span>
          </div>

          {discountPaisa > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>
                ডিসকাউন্ট {discountSource === "percent" && discountPercent > 0 ? `(${discountPercent}%)` : ""}:
              </span>
              <span>− {formatTaka(discountPaisa)}</span>
            </div>
          )}

          <div className="flex justify-between text-ink font-bold border-t border-line/60 pt-2 text-sm sm:text-base">
            <span>সর্বমোট বিক্রি (Net Total):</span>
            <span className="font-extrabold text-brand-strong">{formatTaka(netTotalPaisa)}</span>
          </div>

          {hasPriorDue && (
            <div className="flex justify-between text-muted text-xs">
              <span>পূর্বের বকেয়া (Prior Due):</span>
              <span className="font-semibold text-ink">{formatTaka(effectivePriorDue)}</span>
            </div>
          )}

          <div className="flex justify-between text-muted">
            <span>জমা দেওয়া হয়েছে (Paid):</span>
            <span className="font-bold text-ink">{formatTaka(paidPaisa)}</span>
          </div>

          <div className="flex justify-between items-center border-t border-line/60 pt-2">
            <span className="font-bold text-ink">বর্তমান বাকি / স্ট্যাটাস:</span>
            {finalDuePaisa > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
                বাকি {formatTaka(finalDuePaisa)}
              </span>
            ) : finalDuePaisa < 0 ? (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">
                অগ্রিম জমা {formatTaka(-finalDuePaisa)}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                ✓ সম্পূর্ণ পরিশোধিত
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Floating Bottom Sticky Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line p-3 sm:p-4 shadow-xl no-print">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted">সর্বমোট বিল</div>
            <div className="font-display text-base sm:text-lg font-extrabold text-brand-strong truncate">
              {formatTaka(netTotalPaisa)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={busy}
              className="rounded-2xl border border-line bg-canvas hover:bg-line/40 px-4 py-2.5 text-xs sm:text-sm font-bold text-muted transition"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded-2xl bg-brand hover:bg-brand-strong active:scale-95 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-brand/20 transition disabled:opacity-50 flex items-center gap-2"
            >
              {busy ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>আপডেট হচ্ছে...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>হিসাব আপডেট করুন</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
