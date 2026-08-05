"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTaka } from "@/lib/money";
import { describeDue } from "@/lib/dueDisplay";
import { recordPayment, type BuyerLedgerResult } from "@/actions/due";
import Link from "next/link";
import { card, input, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

type Props = {
  buyerId: string;
  buyerName: string;
  buyerShopName: string;
  duePaisa: number;
  ledger: BuyerLedgerResult;
  onClose: () => void;
};

type Entry = {
  id: string;
  date: Date;
  type: "sale" | "payment";
  desc: string;
  debit: number; // Increases due
  credit: number; // Decreases due
  link?: string;
};

export function BuyerLedger({ buyerId, buyerName, buyerShopName, duePaisa, ledger, onClose }: Props) {
  const router = useRouter();
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPayForm, setShowPayForm] = useState(true);

  const currentDue = describeDue(duePaisa);
  const hasDue = duePaisa > 0;
  const hasCredit = duePaisa < 0;

  const entries: Entry[] = [];

  for (const s of ledger.sales) {
    if (s.status === "cancelled") continue;
    entries.push({
      id: s._id as string,
      date: new Date(s.createdAt),
      type: "sale",
      desc: `মেমো #${s.invoiceNo}`,
      debit: s.duePaisa,
      credit: 0,
      link: `/invoice/${s._id}`,
    });
  }

  for (const p of ledger.payments) {
    entries.push({
      id: p._id as string,
      date: new Date(p.createdAt),
      type: "payment",
      desc: p.note ? `জমা (${p.note})` : "নগদ জমা",
      debit: 0,
      credit: p.amountPaisa,
    });
  }

  // Oldest first to calculate running balance
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  const rows = entries.map((e) => {
    runningBalance = runningBalance + e.debit - e.credit;
    return { ...e, balance: runningBalance };
  });

  // Most recent first for display
  rows.reverse();

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await recordPayment(buyerId, Number(payAmount), payNote);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPayAmount("");
      setPayNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "জমা যোগ করা যায়নি");
    } finally {
      setBusy(false);
    }
  }

  const td = tdCls;
  const firstChar = (buyerName || "B").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4 pb-8">
      {/* Top Navigation & Buyer Summary Card */}
      <div className="rounded-3xl bg-surface border border-line p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full bg-line/60 px-3 py-1 text-xs font-bold text-ink hover:bg-brand-tint hover:text-brand-strong transition mb-2"
            >
              ← বাকি তালিকায় ফিরুন
            </button>
            <div className="flex items-center gap-3">
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-bold ${
                  hasDue
                    ? "bg-rose-50 text-rose-600 border border-rose-200"
                    : hasCredit
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    : "bg-slate-50 text-slate-600 border border-slate-200"
                }`}
              >
                {firstChar}
              </div>
              <div>
                <h1 className="font-display text-lg sm:text-xl font-black text-ink">{buyerName}</h1>
                {buyerShopName && <p className="text-xs text-muted font-medium">{buyerShopName}</p>}
              </div>
            </div>
          </div>

          {/* Current Status Pill */}
          <div className="flex items-center sm:flex-col sm:items-end justify-between border-t border-line/60 sm:border-t-0 pt-2.5 sm:pt-0">
            <span className="text-xs text-muted font-medium">বর্তমান অবস্থা</span>
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-black border ${
                hasDue
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : hasCredit
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-muted border-slate-200"
              }`}
            >
              {currentDue.label !== "Baki nei" ? `${currentDue.label}: ${currentDue.amountText}` : currentDue.label}
            </div>
          </div>
        </div>
      </div>

      {/* Record Payment Form Card */}
      <div className={`${card} p-4 sm:p-5 border-brand/30 shadow-xs relative overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-tint text-brand-strong text-sm">
              💳
            </span>
            <h2 className="font-display text-sm font-extrabold text-ink">জমা গ্রহণ করুন (Record Payment)</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowPayForm(!showPayForm)}
            className="text-xs font-bold text-brand-strong sm:hidden"
          >
            {showPayForm ? "লুকান ▲" : "ফর্ম খুলুন ▼"}
          </button>
        </div>

        {showPayForm && (
          <form onSubmit={handlePayment} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <div className="space-y-1 sm:col-span-1">
                <label className="text-xs font-bold text-ink">টাকার পরিমাণ (৳)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm font-bold text-muted">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    required
                    placeholder="0.00"
                    className={`${input} pl-7 font-bold text-ink`}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-ink">নোট / পেমেন্ট মাধ্যম</label>
                <input
                  type="text"
                  className={input}
                  placeholder="উদাঃ Cash, Bkash, Bank"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={busy || !payAmount}
                className="w-full rounded-2xl bg-brand py-3 text-sm font-bold text-white shadow-xs hover:bg-brand-strong active:scale-95 transition disabled:opacity-50"
              >
                {busy ? "যোগ হচ্ছে..." : "✓ জমা এন্ট্রি করুন"}
              </button>
            </div>

            {error && <p role="alert" className={errorBox}>{error}</p>}
          </form>
        )}
      </div>

      {/* Transaction History Section Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-sm font-extrabold text-ink">
          লেনদেন খতিয়ান ({rows.length})
        </h2>
        <span className="text-xs text-muted">সর্বশেষ লেনদেন প্রথমে</span>
      </div>

      {/* Mobile Transaction Cards (Phones) */}
      <div className="md:hidden space-y-2.5">
        {rows.map((r) => {
          const rowBalance = describeDue(r.balance);
          const isSale = r.type === "sale";

          return (
            <div
              key={r.id}
              className={`rounded-2xl bg-surface border p-3.5 shadow-2xs space-y-2 ${
                isSale ? "border-rose-100 bg-rose-50/20" : "border-emerald-100 bg-emerald-50/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm ${
                    isSale ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {isSale ? "🧾" : "💵"}
                  </span>
                  <div>
                    {r.link ? (
                      <Link href={r.link} className="font-bold text-sm text-brand-strong hover:underline flex items-center gap-1">
                        {r.desc} ↗
                      </Link>
                    ) : (
                      <span className="font-bold text-sm text-ink">{r.desc}</span>
                    )}
                    <div className="text-[11px] text-muted">
                      {r.date.toLocaleDateString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </div>
                  </div>
                </div>

                {/* Amount Change */}
                <div className="text-right">
                  {r.debit > 0 ? (
                    <div className="text-sm font-black text-rose-600">
                      +{formatTaka(r.debit)}
                      <div className="text-[10px] text-rose-500 font-semibold">বাকি যোগ</div>
                    </div>
                  ) : r.credit > 0 ? (
                    <div className="text-sm font-black text-emerald-600">
                      -{formatTaka(r.credit)}
                      <div className="text-[10px] text-emerald-500 font-semibold">জমা পরিশোধ</div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>
              </div>

              {/* Running Balance Footer */}
              <div className="flex items-center justify-between border-t border-line/60 pt-1.5 text-[11px]">
                <span className="text-muted font-medium">লেনদেনের পর জের:</span>
                <span className={`font-bold ${rowBalance.className}`}>
                  {rowBalance.amountText} {rowBalance.label !== "Baki nei" ? `(${rowBalance.label})` : ""}
                </span>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            কোনো লেনদেনের রেকর্ড নেই।
          </div>
        )}
      </div>

      {/* Desktop Transaction Table */}
      <div className={`hidden md:block overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>তারিখ</th>
              <th className={th}>বিবরণ</th>
              <th className={`${th} text-right text-rose-600`}>বাকি (৳)</th>
              <th className={`${th} text-right text-emerald-600`}>জমা (৳)</th>
              <th className={`${th} text-right`}>জের / Balance (৳)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBalance = describeDue(r.balance);
              return (
                <tr key={r.id} className={trow}>
                  <td className={`${td} text-muted whitespace-nowrap`}>
                    {r.date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </td>
                  <td className={td}>
                    {r.link ? (
                      <Link href={r.link} className="font-semibold text-brand-strong hover:underline">
                        {r.desc}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{r.desc}</span>
                    )}
                  </td>
                  <td className={`${td} text-right font-bold text-rose-600`}>
                    {r.debit > 0 ? formatTaka(r.debit) : "—"}
                  </td>
                  <td className={`${td} text-right font-bold text-emerald-600`}>
                    {r.credit > 0 ? formatTaka(r.credit) : "—"}
                  </td>
                  <td className={`${td} text-right font-bold ${rowBalance.className}`}>
                    {rowBalance.amountText} {rowBalance.label !== "Baki nei" ? `(${rowBalance.label})` : ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted">
                  কোনো লেনদেনের রেকর্ড নেই।
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
