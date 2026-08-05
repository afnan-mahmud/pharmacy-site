"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/actions/settings";
import { card, input, label as labelCls, errorBox, successBox } from "@/components/ui";

export function SettingsForm({
  initial,
}: {
  initial: {
    pharmacyName: string;
    tagline: string;
    address: string;
    phone: string;
    invoicePrefix: string;
    aboutUs: string;
  };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone(false);

    try {
      const result = await updateSettings(values);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const saved = result.data;
      setValues({
        pharmacyName: saved.pharmacyName,
        tagline: saved.tagline ?? "",
        address: saved.address,
        phone: saved.phone,
        invoicePrefix: saved.invoicePrefix,
        aboutUs: saved.aboutUs ?? "",
      });
      setDone(true);
      setTimeout(() => setDone(false), 4000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
    } finally {
      setBusy(false);
    }
  }

  function updateField(patch: Partial<typeof values>) {
    setValues((prev) => ({ ...prev, ...patch }));
    setDone(false);
  }

  const sampleInvoiceNo = `${(values.invoicePrefix || "ABC").toUpperCase().trim()}-000142`;

  return (
    <div className="flex flex-col pb-12">
      {/* Hero Header Banner */}
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand via-brand-strong to-brand-deep px-5 pb-7 pt-7 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/15 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/15 backdrop-blur text-white text-base">
              ⚙️
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight">
              ফার্মেসি সেটিংস
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-white/85 mt-1 max-w-xl">
            ফার্মেসির নাম, ঠিকানা, ইনভয়েস প্রিফিক্স ও রশিদ সংক্রান্ত তথ্য পরিবর্তন করুন
          </p>

          {/* Quick Info Summary Pill */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white">
              <span>🏪</span>
              <span className="font-bold">{values.pharmacyName || "ফার্মেসির নাম"}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white">
              <span>🧾</span>
              <span>মেমো নম্বর: <strong className="font-mono">{sampleInvoiceNo}</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      {error && (
        <div role="alert" className={`${errorBox} mb-4 flex items-center justify-between animate-in fade-in`}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-danger font-bold text-xs ml-2">✕</button>
        </div>
      )}

      {done && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>সেটিংস সফলভাবে সংরক্ষিত হয়েছে।</span>
          </div>
          <button type="button" onClick={() => setDone(false)} className="text-emerald-800 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12 max-w-5xl mx-auto w-full">
        {/* Main Settings Form */}
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-7">
          {/* Section 1: Identity & Branding */}
          <div className={`${card} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-line pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 text-sm font-bold">
                ১
              </span>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-ink">
                  ফার্মেসির পরিচয় ও ব্র্যান্ডিং
                </h2>
                <p className="text-[11px] text-muted">অ্যাপ ও রশিদের হেডার হিসেবে প্রদর্শিত হবে</p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="pharmacyName" className={labelCls}>
                  ফার্মেসির নাম <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <input
                    id="pharmacyName"
                    className={input}
                    required
                    value={values.pharmacyName}
                    onChange={(e) => updateField({ pharmacyName: e.target.value })}
                    placeholder="যেমন: মেসার্স সুমি ড্রাগ হাউস"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="tagline" className={labelCls}>
                  স্লোগান / ট্যাগলাইন
                </label>
                <input
                  id="tagline"
                  className={input}
                  value={values.tagline}
                  onChange={(e) => updateField({ tagline: e.target.value })}
                  placeholder="যেমন: পাইকারি ও খুচরা ঔষধ বিক্রেতা"
                />
                <p className="text-[11px] text-muted">ফার্মেসির নামের নিচে ছোট আকারে দৃশ্যমান হবে।</p>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Address */}
          <div className={`${card} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-line pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">
                ২
              </span>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-ink">
                  যোগাযোগ ও ঠিকানা
                </h2>
                <p className="text-[11px] text-muted">রশিদ এবং বায়ার পোর্টালে এই তথ্য থাকবে</p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="phone" className={labelCls}>
                  মোবাইল / হেল্পলাইন নম্বর
                </label>
                <div className="relative">
                  <input
                    id="phone"
                    type="tel"
                    className={input}
                    value={values.phone}
                    onChange={(e) => updateField({ phone: e.target.value })}
                    placeholder="যেমন: 01712-345678"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">📞</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="address" className={labelCls}>
                  ঠিকানা
                </label>
                <div className="relative">
                  <input
                    id="address"
                    className={input}
                    value={values.address}
                    onChange={(e) => updateField({ address: e.target.value })}
                    placeholder="যেমন: স্টেশন রোড, ফার্মেসি মার্কেট, ঢাকা"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">📍</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Invoice Prefix Configuration */}
          <div className={`${card} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-line pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-700 text-sm font-bold">
                ৩
              </span>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-ink">
                  ইনভয়েস ও মেমো প্রিফিক্স
                </h2>
                <p className="text-[11px] text-muted">মেমো নম্বরের শুরুর সংক্ষিপ্ত কোড</p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="invoicePrefix" className={labelCls}>
                  ইনভয়েস প্রিফিক্স (২-৮ অক্ষর) <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <input
                    id="invoicePrefix"
                    className={`${input} font-mono uppercase tracking-wider font-bold`}
                    required
                    maxLength={8}
                    value={values.invoicePrefix}
                    onChange={(e) => updateField({ invoicePrefix: e.target.value.toUpperCase().trim() })}
                    placeholder="ABC"
                  />
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60 flex items-center justify-between text-xs">
                  <span className="text-muted">ইনভয়েস নম্বরের নমুনা:</span>
                  <span className="font-mono font-bold text-brand-strong bg-surface px-2.5 py-1 rounded-lg border border-brand-line">
                    {sampleInvoiceNo}
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  শুধুমাত্র ইংরেজি বড় হাতের অক্ষর ও সংখ্যা (A-Z, 0-9) ব্যবহার করুন। কোনো স্পেস বা ড্যাশ দেওয়া যাবে না।
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Buyer Portal About Us */}
          <div className={`${card} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center gap-2 border-b border-line pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">
                ৪
              </span>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-ink">
                  আমাদের সম্পর্কে (About Us)
                </h2>
                <p className="text-[11px] text-muted">বায়ার লগইন পোর্টালে দৃশ্যমান হবে</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <textarea
                id="aboutUs"
                className={`${input} min-h-[110px] text-xs sm:text-sm leading-relaxed`}
                value={values.aboutUs}
                onChange={(e) => updateField({ aboutUs: e.target.value })}
                placeholder="আপনার ফার্মেসি, ডেলিভারি পলিসি ও পাইকারি সেবা সম্পর্কে কিছু কথা লিখুন..."
              />
              <p className="text-[11px] text-muted">বায়াররা তাদের একাউন্ট হোমপেজে এই বিবরণটি দেখতে পারবেন।</p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand hover:bg-brand-strong py-4 px-6 text-sm font-bold text-white shadow-lg shadow-brand/25 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>সংরক্ষণ হচ্ছে...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>সেটিংস সংরক্ষণ করুন</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Thermal Receipt & Invoice Mockup Preview */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>🧾</span>
              <span>লাইভ ইনভয়েস প্রিভিউ</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="lg:hidden text-xs font-semibold text-brand-strong"
            >
              {showPreview ? "লুকান ▲" : "দেখান ▼"}
            </button>
          </div>

          {showPreview && (
            <div className="rounded-3xl border-2 border-dashed border-line bg-surface p-5 shadow-sm space-y-4 relative overflow-hidden">
              {/* Receipt Visual Top Jagged Edge */}
              <div className="text-center space-y-1 border-b border-dashed border-line pb-4">
                <div className="text-[10px] font-bold tracking-widest text-muted uppercase">
                  নমুনা মেমো রশিদ
                </div>
                <h4 className="font-display text-lg font-black text-ink leading-tight">
                  {values.pharmacyName || "ফার্মেসির নাম"}
                </h4>
                {values.tagline && (
                  <p className="text-xs font-medium text-brand-strong">
                    {values.tagline}
                  </p>
                )}
                {values.address && (
                  <p className="text-[11px] text-muted">
                    📍 {values.address}
                  </p>
                )}
                {values.phone && (
                  <p className="text-[11px] font-mono font-medium text-ink">
                    📞 {values.phone}
                  </p>
                )}
              </div>

              {/* Invoice Meta */}
              <div className="flex items-center justify-between text-xs py-1 border-b border-dashed border-line">
                <div>
                  <span className="text-muted">মেমো নং: </span>
                  <span className="font-mono font-bold text-ink">{sampleInvoiceNo}</span>
                </div>
                <div className="text-muted">
                  তারিখ: {new Date().toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}
                </div>
              </div>

              {/* Sample Items Table */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between font-bold text-muted text-[10px] uppercase border-b border-line pb-1">
                  <span>বিবরণ</span>
                  <span>পরিমাণ</span>
                  <span>মূল্য</span>
                </div>
                <div className="flex justify-between py-0.5 text-ink">
                  <span>Napa Extra 500mg</span>
                  <span className="font-mono">২ বক্স</span>
                  <span className="font-mono font-semibold">৳৪০০</span>
                </div>
                <div className="flex justify-between py-0.5 text-ink">
                  <span>Seclo 20mg Capsule</span>
                  <span className="font-mono">৫ পাতা</span>
                  <span className="font-mono font-semibold">৳৩০০</span>
                </div>
              </div>

              {/* Receipt Total */}
              <div className="border-t border-dashed border-line pt-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-muted">
                  <span>মোট বিল:</span>
                  <span className="font-mono">৳৭০০</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm text-ink pt-1 border-t border-line/60">
                  <span>সর্বমোট প্রদেয়:</span>
                  <span className="font-mono text-brand-strong">৳৭০০</span>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center pt-2 text-[10px] text-muted">
                ধন্যবাদ, আবার আসবেন!
              </div>
            </div>
          )}

          {/* Quick Help Card */}
          <div className="rounded-2xl bg-canvas p-4 border border-line/60 space-y-2 text-xs text-muted">
            <div className="font-bold text-ink flex items-center gap-1.5">
              <span>💡</span>
              <span>সহায়ক তথ্য</span>
            </div>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>এখানে সংরক্ষিত নাম এবং মোবাইল নম্বর সব রশিদে প্রিন্ট হবে।</li>
              <li>ইনভয়েস প্রিফিক্স পরিবর্তন করলে নতুন তৈরি হওয়া সেলগুলোতে তা কার্যকর হবে।</li>
              <li>বায়ার পোর্টালের হেডারেও আপনার ফার্মেসির এই নামটি দেখাবে।</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
