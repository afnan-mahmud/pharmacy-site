"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBuyer, updateBuyer, setBuyerPassword } from "@/actions/buyers";

export type BuyerFormValues = {
  id?: string;
  name: string;
  shopName: string;
  phone: string;
  address: string;
};

export function BuyerForm({
  initial,
  onDone,
}: {
  initial?: BuyerFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BuyerFormValues>(
    initial ?? { name: "", shopName: "", phone: "", address: "" },
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const editing = Boolean(initial?.id);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("ক্রেতার নাম লিখুন");
      return;
    }
    if (!values.phone.trim()) {
      setError("সঠিক মোবাইল নম্বর লিখুন");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const input = {
        name: values.name.trim(),
        shopName: values.shopName.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
      };

      if (initial?.id) {
        const updated = await updateBuyer(initial.id, input);
        if (!updated.ok) {
          setError(updated.error);
          setBusy(false);
          return;
        }
        if (password) {
          const pw = await setBuyerPassword(initial.id, password);
          if (!pw.ok) {
            setError(pw.error);
            setBusy(false);
            return;
          }
        }
      } else {
        const created = await createBuyer(input, password);
        if (!created.ok) {
          setError(created.error);
          setBusy(false);
          return;
        }
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "সংরক্ষণ করতে সমস্যা হয়েছে");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition shadow-2xs";

  return (
    <div className="mx-auto max-w-2xl animate-in fade-in zoom-in-95 duration-200">
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-line bg-surface p-5 sm:p-7 shadow-lg space-y-5"
      >
        <div className="flex items-center justify-between border-b border-line/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand-strong text-lg">
              {editing ? "✏️" : "🏪"}
            </span>
            <div>
              <h2 className="font-display text-lg font-black text-ink">
                {editing ? "বায়ার তথ্য পরিবর্তন" : "নতুন পাইকারি বায়ার যোগ"}
              </h2>
              <p className="text-xs text-muted">
                {editing
                  ? "ক্রেতার বিবরণ ও পাসওয়ার্ড আপডেট করুন"
                  : "নতুন পাইকারি ক্রেতার নাম ও যোগাযোগের তথ্য দিন"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDone}
            className="grid h-8 w-8 place-items-center rounded-full bg-line/60 text-xs font-bold text-muted hover:text-ink transition"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="buyerName" className="text-xs font-bold text-ink">
              ক্রেতার নাম <span className="text-danger">*</span>
            </label>
            <input
              id="buyerName"
              className={field}
              required
              placeholder="উদাঃ মোঃ রফিকুল ইসলাম"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="shopName" className="text-xs font-bold text-ink">
              ফার্মেসি / দোকানের নাম
            </label>
            <input
              id="shopName"
              className={field}
              placeholder="উদাঃ রফিক ফার্মেসি"
              value={values.shopName}
              onChange={(e) => setValues({ ...values, shopName: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="buyerPhone" className="text-xs font-bold text-ink">
              মোবাইল নম্বর <span className="text-danger">*</span>
            </label>
            <input
              id="buyerPhone"
              type="tel"
              className={field}
              required
              placeholder="০১৭xxxxxxxx"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="buyerAddress" className="text-xs font-bold text-ink">
              ঠিকানা / লোকেশন
            </label>
            <input
              id="buyerAddress"
              className={field}
              placeholder="উদাঃ বাজার রোড, ঢাকা"
              value={values.address}
              onChange={(e) => setValues({ ...values, address: e.target.value })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="buyerPassword" className="text-xs font-bold text-ink">
                {editing ? "নতুন পাসওয়ার্ড (ঐচ্ছিক)" : "লগইন পাসওয়ার্ড (ঐচ্ছিক)"}
              </label>
              {password && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-semibold text-brand-strong hover:underline"
                >
                  {showPassword ? "লুকান" : "দেখুন"}
                </button>
              )}
            </div>
            <input
              id="buyerPassword"
              type={showPassword ? "text" : "password"}
              className={field}
              placeholder={
                editing
                  ? "পাসওয়ার্ড পরিবর্তন না করতে চাইলে খালি রাখুন"
                  : "বায়ার পোর্টাল লগইনের পাসওয়ার্ড দিন"
              }
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-[11px] text-muted">
              ক্রেতা এই ফোন নম্বর ও পাসওয়ার্ড ব্যবহার করে বায়ার পোর্টালে লগইন করতে পারবেন।
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-2xl bg-brand py-3.5 text-sm font-bold text-white shadow-md hover:bg-brand-strong active:scale-95 transition disabled:opacity-50"
          >
            {busy ? "সংরক্ষণ হচ্ছে..." : editing ? "✓ পরিবর্তন সংরক্ষণ করুন" : "✓ বায়ার যুক্ত করুন"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-2xl border border-line bg-canvas px-5 py-3.5 text-sm font-bold text-ink hover:bg-line/50 transition"
          >
            বাতিল
          </button>
        </div>
      </form>
    </div>
  );
}
