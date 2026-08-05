"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRetailCustomer,
  renameRetailCustomer,
} from "@/actions/retailCustomers";

export type RetailCustomerFormValues = {
  id?: string;
  name: string;
  phone: string;
};

export function RetailCustomerForm({
  initial,
  onDone,
}: {
  initial?: RetailCustomerFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<RetailCustomerFormValues>(
    initial ?? { name: "", phone: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const editing = Boolean(initial?.id);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("ক্রেতার নাম লিখুন");
      return;
    }
    if (!editing && !values.phone.trim()) {
      setError("মোবাইল নম্বর লিখুন");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = initial?.id
        ? await renameRetailCustomer(initial.id, values.name.trim())
        : await createRetailCustomer({
            name: values.name.trim(),
            phone: values.phone.trim(),
          });

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
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
    <div className="mx-auto max-w-lg animate-in fade-in zoom-in-95 duration-200">
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-line bg-surface p-5 sm:p-7 shadow-lg space-y-5"
      >
        <div className="flex items-center justify-between border-b border-line/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand-strong text-lg">
              {editing ? "✏️" : "👤"}
            </span>
            <div>
              <h2 className="font-display text-lg font-black text-ink">
                {editing ? "খুচরা ক্রেতা এডিট" : "নতুন খুচরা ক্রেতা যোগ"}
              </h2>
              <p className="text-xs text-muted">
                {editing
                  ? "ক্রেতার নাম পরিবর্তন করুন"
                  : "নতুন খুচরা ক্রেতার নাম ও মোবাইল নম্বর দিন"}
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="retailCustomerName" className="text-xs font-bold text-ink">
              ক্রেতার নাম <span className="text-danger">*</span>
            </label>
            <input
              id="retailCustomerName"
              className={field}
              required
              placeholder="উদাঃ মোঃ কামাল হোসেন"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retailCustomerPhone" className="text-xs font-bold text-ink">
              মোবাইল নম্বর <span className="text-danger">*</span>
            </label>
            <input
              id="retailCustomerPhone"
              type="tel"
              className={`${field} ${editing ? "bg-canvas text-muted cursor-not-allowed" : ""}`}
              required
              readOnly={editing}
              placeholder="০১৭xxxxxxxx"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
            />
            {editing && (
              <p className="text-[11px] text-muted">
                মোবাইল নম্বর পরিবর্তন করা যাবে না — কারণ বাকি ও বিক্রির সকল হিসাব এই নম্বর দিয়ে ট্র্যাক করা হয়।
              </p>
            )}
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
            {busy ? "সংরক্ষণ হচ্ছে..." : editing ? "✓ পরিবর্তন সংরক্ষণ করুন" : "✓ ক্রেতা যোগ করুন"}
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
