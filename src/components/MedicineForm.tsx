"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createMedicine, updateMedicine } from "@/actions/medicines";
import { stockIn, listStockEntries } from "@/actions/stock";
import { takaToPaisa, paisaToTaka } from "@/lib/money";
import { boxesToPatas, formatStock } from "@/lib/units";
import type { StockEntryDoc } from "@/models/StockEntry";
import type { Serialized } from "@/lib/serialize";
import {
  MEDICINE_FORMS,
  DEFAULT_MEDICINE_FORM,
  unitLabelsFor,
  toMedicineForm,
  isPieceOnlyForm,
  capitalize,
  type MedicineForm as DosageForm,
} from "@/lib/unitLabels";
import { card, input, label as labelCls, btnPrimary, btnGhost, errorBox } from "@/components/ui";

export type MedicineFormValues = {
  id?: string;
  name: string;
  genericName: string;
  company: string;
  form: DosageForm;
  patasPerBox: number;
  purchasePricePaisa: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  mrpBoxPricePaisa: number;
  lowStockThreshold: number;
  expiryDate?: string | null;
};

export function MedicineForm({
  initial,
  onDone,
}: {
  initial?: MedicineFormValues & { stockPatas?: number };
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [genericName, setGenericName] = useState(initial?.genericName ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [form, setForm] = useState<DosageForm>(
    initial?.form ?? DEFAULT_MEDICINE_FORM,
  );
  const [patasPerBox, setPatasPerBox] = useState(
    String(initial?.patasPerBox ?? 10),
  );
  const [purchasePrice, setPurchasePrice] = useState(
    initial?.purchasePricePaisa ? String(paisaToTaka(initial.purchasePricePaisa)) : "",
  );
  const [wholesaleBoxPrice, setWholesaleBoxPrice] = useState(
    initial ? String(paisaToTaka(initial.wholesaleBoxPricePaisa)) : "",
  );
  const [wholesalePataPrice, setWholesalePataPrice] = useState(
    initial ? String(paisaToTaka(initial.wholesalePataPricePaisa)) : "",
  );
  const [retailBoxPrice, setRetailBoxPrice] = useState(
    initial ? String(paisaToTaka(initial.retailBoxPricePaisa)) : "",
  );
  const [retailPataPrice, setRetailPataPrice] = useState(
    initial ? String(paisaToTaka(initial.retailPataPricePaisa)) : "",
  );
  const [mrp, setMrp] = useState(
    initial?.mrpBoxPricePaisa ? String(paisaToTaka(initial.mrpBoxPricePaisa)) : "",
  );
  const [threshold, setThreshold] = useState(
    String(initial?.lowStockThreshold ?? 0),
  );
  const [expiryDate, setExpiryDate] = useState(
    initial?.expiryDate ? new Date(initial.expiryDate).toISOString().slice(0, 10) : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockBoxes, setStockBoxes] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockEntries, setStockEntries] = useState<Serialized<StockEntryDoc>[]>([]);
  
  const labels = unitLabelsFor(form);
  const isPieceOnly = isPieceOnlyForm(form);
  const effectivePPB = isPieceOnly ? 1 : Number(patasPerBox) || 1;

  useEffect(() => {
    if (!initial?.id) return;
    let cancelled = false;
    listStockEntries(initial.id).then((entries) => {
      if (!cancelled) setStockEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const wholesalePataPricePaisa = takaToPaisa(wholesalePataPrice || 0);
      const retailPataPricePaisa = takaToPaisa(retailPataPrice || 0);
      const medicineInput = {
        name,
        genericName,
        company,
        form,
        patasPerBox: isPieceOnly ? 1 : Number(patasPerBox),
        purchasePricePaisa: takaToPaisa(purchasePrice || 0),
        wholesaleBoxPricePaisa: isPieceOnly ? wholesalePataPricePaisa : takaToPaisa(wholesaleBoxPrice || 0),
        wholesalePataPricePaisa,
        retailBoxPricePaisa: isPieceOnly ? retailPataPricePaisa : takaToPaisa(retailBoxPrice || 0),
        retailPataPricePaisa,
        mrpBoxPricePaisa: takaToPaisa(mrp || 0),
        lowStockThreshold: Number(threshold),
        expiryDate: expiryDate ? expiryDate : null,
      };

      const result = initial?.id
        ? await updateMedicine(initial.id, medicineInput)
        : await createMedicine(medicineInput);

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      const targetId = initial?.id ?? result.data._id;
      if (stockBoxes.trim() !== "" && Number(stockBoxes) > 0) {
        const stockResult = await stockIn({
          medicineId: targetId,
          boxes: Number(stockBoxes),
          note: stockNote,
          expiryDate: expiryDate ? expiryDate : undefined,
        });
        if (!stockResult.ok) {
          setError(stockResult.error);
          setBusy(false);
          return;
        }
      }

      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col pb-10 space-y-4 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-3 bg-surface rounded-2xl p-4 border border-line shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink hover:bg-canvas-deep transition active:scale-95"
            title="ফিরে যান"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-lg sm:text-xl font-extrabold text-ink">
              {initial?.id ? "মেডিসিনের তথ্য এডিট" : "নতুন মেডিসিন যুক্ত করুন"}
            </h1>
            <p className="text-xs text-muted">
              {initial?.id ? `"${initial.name}" এর রেট ও পরিমাপ পরিবর্তন করুন` : "ওষুধের নাম, রেট ও স্টক বিবরণ দিন"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="hidden sm:inline-flex rounded-xl bg-canvas px-3.5 py-2 text-xs font-semibold text-muted hover:text-ink transition"
        >
          বাতিল
        </button>
      </div>

      {error && (
        <div role="alert" className={`${errorBox} flex items-center justify-between animate-in fade-in`}>
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-danger font-bold text-xs">✕</button>
        </div>
      )}

      {/* Section 1: Basic Information */}
      <div className={`${card} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 text-sm font-bold">
            ১
          </span>
          <h2 className="font-display text-sm sm:text-base font-bold text-ink">
            ওষুধের প্রাথমিক বিবরণ
          </h2>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Medicine Dosage Form */}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="form" className={labelCls}>
              মেডিসিনের ধরন (Dosage Type)
            </label>
            <select
              id="form"
              className={input}
              value={form}
              onChange={(e) => setForm(toMedicineForm(e.target.value))}
            >
              {MEDICINE_FORMS.map((option) => (
                <option key={option} value={option}>
                  {unitLabelsFor(option).formLabel}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              {isPieceOnly
                ? "এই ওষুধটি 'পিস' হিসেবে গণনা হবে।"
                : `এই ওষুধটি '${labels.outer}' এবং '${labels.inner}' হিসেবে হিসাব রাখা হবে।`}
            </p>
          </div>

          {/* Medicine Name */}
          <div className="space-y-1.5">
            <label htmlFor="name" className={labelCls}>
              ওষুধের নাম <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="যেমন: Napa Extra 500mg"
              required
            />
          </div>

          {/* Generic Name */}
          <div className="space-y-1.5">
            <label htmlFor="generic" className={labelCls}>
              জেনেরিক নাম (Generic Name)
            </label>
            <input
              id="generic"
              className={input}
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              placeholder="যেমন: Paracetamol + Caffeine"
            />
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <label htmlFor="company" className={labelCls}>
              কোম্পানির নাম
            </label>
            <input
              id="company"
              className={input}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="যেমন: Beximco Pharmaceuticals"
            />
          </div>

          {/* Expiry Date */}
          <div className="space-y-1.5">
            <label htmlFor="expiryDate" className={labelCls}>
              মেয়াদোত্তীর্ণের তারিখ / Expiry Date (ঐচ্ছিক)
            </label>
            <input
              id="expiryDate"
              type="date"
              className={input}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <p className="text-[11px] text-muted">
              ওষুধের মেয়াদ শেষ হওয়ার তারিখ (যদি থাকে)।
            </p>
          </div>

          {/* Patas Per Box */}
          {!isPieceOnly && (
            <div className="space-y-1.5">
              <label htmlFor="ppb" className={labelCls}>
                ১ {labels.outer} এ কত {labels.inner}? <span className="text-danger">*</span>
              </label>
              <input
                id="ppb"
                type="number"
                min={1}
                className={input}
                value={patasPerBox}
                onChange={(e) => setPatasPerBox(e.target.value)}
                placeholder="যেমন: 10"
                required
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Wholesale & Purchase Pricing */}
      <div className={`${card} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">
            ২
          </span>
          <h2 className="font-display text-sm sm:text-base font-bold text-ink">
            ক্রয় মূল্য ও পাইকারি রেট
          </h2>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Purchase Price */}
          <div className="space-y-1.5">
            <label htmlFor="purchasePrice" className={labelCls}>
              কেনা মূল্য (৳) — প্রতি {isPieceOnly ? labels.inner : labels.outer}
            </label>
            <div className="relative">
              <input
                id="purchasePrice"
                type="number"
                step="0.01"
                min={0}
                className={input}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                ৳
              </span>
            </div>
          </div>

          {/* MRP */}
          <div className="space-y-1.5">
            <label htmlFor="mrp" className={labelCls}>
              MRP / গায়ের রেট (৳) — ঐচ্ছিক
            </label>
            <div className="relative">
              <input
                id="mrp"
                type="number"
                step="0.01"
                min={0}
                className={input}
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                placeholder="কাটা দামের জন্য"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                ৳
              </span>
            </div>
          </div>

          {/* Wholesale Box & Pata */}
          <div className="space-y-1.5 sm:col-span-2">
            <p className={labelCls}>পাইকারি বিক্রয় মূল্য <span className="text-danger">*</span></p>
            <div className="grid gap-3 sm:grid-cols-2">
              {!isPieceOnly && (
                <div className="relative">
                  <input
                    id="wholesaleBoxPrice"
                    type="number"
                    step="0.01"
                    min={0}
                    className={input}
                    value={wholesaleBoxPrice}
                    onChange={(e) => setWholesaleBoxPrice(e.target.value)}
                    placeholder={`প্রতি ${labels.outer} পাইকারি রেট`}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                    ৳/{labels.outer}
                  </span>
                </div>
              )}
              <div className="relative">
                <input
                  id="wholesalePataPrice"
                  type="number"
                  step="0.01"
                  min={0}
                  className={input}
                  value={wholesalePataPrice}
                  onChange={(e) => setWholesalePataPrice(e.target.value)}
                  placeholder={`প্রতি ${labels.inner} পাইকারি রেট`}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                  ৳/{labels.inner}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Retail Pricing */}
      <div className={`${card} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 text-sm font-bold">
            ৩
          </span>
          <h2 className="font-display text-sm sm:text-base font-bold text-ink">
            খুচরা বিক্রির রেট
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {!isPieceOnly && (
            <div className="space-y-1.5">
              <label htmlFor="retailBoxPrice" className={labelCls}>
                প্রতি {labels.outer} খুচরা রেট (৳) <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  id="retailBoxPrice"
                  type="number"
                  step="0.01"
                  min={0}
                  className={input}
                  value={retailBoxPrice}
                  onChange={(e) => setRetailBoxPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                  ৳/{labels.outer}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="retailPataPrice" className={labelCls}>
              প্রতি {labels.inner} খুচরা রেট (৳) <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                id="retailPataPrice"
                type="number"
                step="0.01"
                min={0}
                className={input}
                value={retailPataPrice}
                onChange={(e) => setRetailPataPrice(e.target.value)}
                placeholder="0.00"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                ৳/{labels.inner}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Stock Alert & Stock-In */}
      <div className={`${card} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">
            ৪
          </span>
          <h2 className="font-display text-sm sm:text-base font-bold text-ink">
            স্টক অ্যালার্ট ও নতুন চালান এন্ট্রি
          </h2>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Low Stock Alert Threshold */}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="threshold" className={labelCls}>
              স্টক কম অ্যালার্ট থ্রেশহোল্ড ({labels.inner})
            </label>
            <input
              id="threshold"
              type="number"
              min={0}
              className={input}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="0 (অ্যালার্ট বন্ধ রাখতে ০ রাখুন)"
            />
            <p className="text-[11px] text-muted">
              ইনভেন্টরিতে স্টক {threshold || 0} {labels.inner} এর নিচে নামলে ড্যাশবোর্ডে স্টক অ্যালার্ট দেখাবে।
            </p>
          </div>

          {/* Quick Stock-In Box */}
          <div className="space-y-3 sm:col-span-2 rounded-2xl bg-canvas p-3.5 border border-line/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                নতুন স্টক যোগ করুন (ঐচ্ছিক)
              </h3>
              {initial?.id && (
                <span className="text-xs font-semibold text-brand-strong bg-brand-tint px-2.5 py-0.5 rounded-full">
                  বর্তমান স্টক: {formatStock(initial.stockPatas ?? 0, effectivePPB, form)}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="stockBoxes" className={labelCls}>
                  কত {labels.outer} ইনভেন্টরিতে যোগ হবে?
                </label>
                <input
                  id="stockBoxes"
                  type="number"
                  min={0}
                  className={input}
                  value={stockBoxes}
                  onChange={(e) => setStockBoxes(e.target.value)}
                  placeholder="যেমন: 5"
                />
                {stockBoxes && Number.isInteger(Number(stockBoxes)) && Number(stockBoxes) > 0 && !isPieceOnly && (
                  <p className="text-xs font-semibold text-emerald-700">
                    = {boxesToPatas(Number(stockBoxes), effectivePPB)} {labels.inner} যোগ হবে
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="stockNote" className={labelCls}>
                  স্টক নোট (ঐচ্ছিক)
                </label>
                <input
                  id="stockNote"
                  className={input}
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  placeholder="যেমন: ইনভয়েস #১২৩৪"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Previous Stock History (If editing) */}
      {initial?.id && stockEntries.length > 0 && (
        <div className={`${card} p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="font-display text-sm font-bold text-ink">
              পূর্বের স্টক এন্ট্রি হিস্ট্রি ({stockEntries.length} টি)
            </h3>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {stockEntries.map((entry) => (
              <div
                key={entry._id}
                className="flex items-center justify-between rounded-xl bg-canvas p-3 text-xs border border-line/50"
              >
                <div>
                  <div className="font-bold text-ink">
                    +{entry.boxes} {unitLabelsFor(entry.form).outer}{" "}
                    <span className="font-normal text-muted">
                      ({entry.patasAdded} {unitLabelsFor(entry.form).inner})
                    </span>
                  </div>
                  {entry.note && <div className="text-[11px] text-muted mt-0.5">{entry.note}</div>}
                  {entry.expiryDate && (
                    <div className="text-[11px] text-brand-strong font-medium mt-0.5">
                      মেয়াদ: {new Date(entry.expiryDate).toLocaleDateString("bn-BD", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "Asia/Dhaka",
                      })}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-muted text-right font-medium">
                  {new Date(entry.createdAt).toLocaleDateString("bn-BD", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Dhaka",
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-2xl bg-brand hover:bg-brand-strong py-3.5 text-sm font-bold text-white shadow-lg shadow-brand/20 transition active:scale-95 disabled:opacity-50"
        >
          {busy ? "সংরক্ষণ হচ্ছে..." : "✓ মেডিসিন সংরক্ষণ করুন"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-2xl border border-line bg-canvas hover:bg-canvas-deep py-3.5 px-6 text-sm font-bold text-muted transition active:scale-95"
        >
          বাতিল
        </button>
      </div>
    </form>
  );
}
