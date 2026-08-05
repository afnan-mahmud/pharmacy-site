"use client";

import { useState, useMemo } from "react";
import { formatTaka } from "@/lib/money";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";
import type { RetailDueRow, RetailLedgerResult } from "@/actions/due";
import { RetailLedger } from "./RetailLedger";
import { card, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

type Props = {
  dues: RetailDueRow[];
  fetchLedger: (phone: string) => Promise<RetailLedgerResult>;
};

type FilterTab = "all" | "due" | "credit" | "zero";

export function RetailDueTable({ dues, fetchLedger }: Props) {
  const [openLedger, setOpenLedger] = useState<{
    phone: string;
    name: string;
    duePaisa: number;
    data: RetailLedgerResult;
  } | null>(null);
  const [loadingPhone, setLoadingPhone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  // Tab counts
  const counts = useMemo(() => {
    let dueCount = 0;
    let creditCount = 0;
    let zeroCount = 0;

    for (const d of dues) {
      if (d.duePaisa > 0) dueCount++;
      else if (d.duePaisa < 0) creditCount++;
      else zeroCount++;
    }

    return { total: dues.length, dueCount, creditCount, zeroCount };
  }, [dues]);

  const filtered = useMemo(() => {
    return dues.filter((row) => {
      // Tab filter
      if (tab === "due" && row.duePaisa <= 0) return false;
      if (tab === "credit" && row.duePaisa >= 0) return false;
      if (tab === "zero" && row.duePaisa !== 0) return false;

      // Search filter
      if (search.trim()) {
        const term = search.toLowerCase();
        const matchesName = (row.customerName || "").toLowerCase().includes(term);
        const matchesPhone = (row.phone || "").toLowerCase().includes(term);
        if (!matchesName && !matchesPhone) return false;
      }

      return true;
    });
  }, [dues, search, tab]);

  async function handleOpen(row: RetailDueRow) {
    setLoadingPhone(row.phone);
    setError("");
    try {
      const data = await fetchLedger(row.phone);
      setOpenLedger({ phone: row.phone, name: row.customerName, duePaisa: row.duePaisa, data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "লেজার লোড করা যায়নি");
    } finally {
      setLoadingPhone(null);
    }
  }

  if (openLedger) {
    return (
      <RetailLedger
        phone={openLedger.phone}
        customerName={openLedger.name}
        duePaisa={openLedger.duePaisa}
        ledger={openLedger.data}
        onClose={() => setOpenLedger(null)}
      />
    );
  }

  const td = tdCls;

  return (
    <div className="flex flex-col pb-8 space-y-4">
      {/* Hero Header */}
      <section className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 rounded-b-[2.5rem] bg-gradient-to-br from-brand-deep via-brand to-emerald-700 px-5 pb-7 pt-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-y-1/4 -translate-x-1/4 h-48 w-48 rounded-full bg-emerald-400/20 blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-emerald-100 mb-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7 0 3.75 3.75 0 017 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                খুচরা কাস্টমার খতিয়ান
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black leading-tight text-white">
                খুচরা বাকি
              </h1>
              <p className="text-xs text-white/80">
                খুচরা কাস্টমারদের বকেয়া ও জমার হিসাব
              </p>
            </div>

            {/* Total Balance Badges */}
            <div className="grid grid-cols-2 sm:flex sm:flex-col sm:items-end gap-2">
              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3 border border-white/15 text-left sm:text-right">
                <div className="text-[11px] font-medium text-emerald-100/90 mb-0.5">মোট বাকি</div>
                <div className="font-display text-xl sm:text-2xl font-black text-yellow-300 drop-shadow-xs">
                  {formatTaka(totalDuePaisa)}
                </div>
              </div>

              {totalCreditPaisa > 0 && (
                <div className="rounded-2xl bg-emerald-900/40 backdrop-blur-md px-3 py-2 border border-emerald-300/30 text-left sm:text-right">
                  <div className="text-[10px] font-medium text-emerald-200">কাস্টমারের জমা</div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-100">
                    {formatTaka(totalCreditPaisa)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search Bar inside Hero */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="কাস্টমারের নাম বা ফোন নাম্বার লিখুন..."
              className="w-full rounded-2xl border-0 bg-white/15 backdrop-blur-md pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white shadow-inner transition"
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3.5 top-3.5 h-4 w-4 text-white/70"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            </svg>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs font-bold text-white hover:bg-white/30 transition"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-0.5">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
            tab === "all"
              ? "bg-brand-strong text-white shadow-xs"
              : "bg-surface text-muted border border-line hover:border-brand/40"
          }`}
        >
          <span>সব কাস্টমার</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${tab === "all" ? "bg-white/20 text-white" : "bg-line/60 text-ink"}`}>
            {counts.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("due")}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
            tab === "due"
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-surface text-muted border border-line hover:border-rose-300"
          }`}
        >
          <span>বাকি আছে</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${tab === "due" ? "bg-white/20 text-white" : "bg-rose-50 text-rose-600 font-bold border border-rose-200"}`}>
            {counts.dueCount}
          </span>
        </button>

        {counts.creditCount > 0 && (
          <button
            type="button"
            onClick={() => setTab("credit")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              tab === "credit"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-surface text-muted border border-line hover:border-emerald-300"
            }`}
          >
            <span>জমা আছে</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${tab === "credit" ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600 font-bold border border-emerald-200"}`}>
              {counts.creditCount}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setTab("zero")}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
            tab === "zero"
              ? "bg-slate-700 text-white shadow-xs"
              : "bg-surface text-muted border border-line hover:border-slate-300"
          }`}
        >
          <span>পরিশোধিত (০)</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${tab === "zero" ? "bg-white/20 text-white" : "bg-line/60 text-ink"}`}>
            {counts.zeroCount}
          </span>
        </button>
      </div>

      {error && <p role="alert" className={`${errorBox} mx-0.5`}>{error}</p>}

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-2.5">
        {filtered.map((row) => {
          const due = describeDue(row.duePaisa);
          const hasDue = row.duePaisa > 0;
          const hasCredit = row.duePaisa < 0;
          const firstChar = (row.customerName || "C").trim().charAt(0).toUpperCase();

          return (
            <div
              key={row.phone}
              onClick={() => handleOpen(row)}
              className="group relative overflow-hidden rounded-2xl bg-surface border border-line/70 p-3.5 shadow-xs hover:border-brand/40 active:scale-[0.98] transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Avatar and Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-base font-bold shadow-2xs ${
                      hasDue
                        ? "bg-rose-50 text-rose-600 border border-rose-200/60"
                        : hasCredit
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                        : "bg-slate-50 text-slate-600 border border-slate-200/60"
                    }`}
                  >
                    {firstChar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-ink text-sm sm:text-base truncate group-hover:text-brand-strong transition">
                      {row.customerName || "(নাম নেই)"}
                    </h3>
                    <p className="text-xs text-muted truncate font-mono">
                      {row.phone}
                    </p>
                  </div>
                </div>

                {/* Due Status Pill */}
                <div className="text-right shrink-0">
                  <div
                    className={`inline-flex flex-col items-end px-2.5 py-1 rounded-xl border text-xs font-bold ${
                      hasDue
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : hasCredit
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-slate-50 border-slate-200 text-muted"
                    }`}
                  >
                    <span className="text-[10px] font-semibold opacity-75">
                      {hasDue ? "বকেয়া" : hasCredit ? "জমা" : "পরিশোধিত"}
                    </span>
                    <span className="font-extrabold text-sm">
                      {due.amountText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Row */}
              <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2 text-[11px]">
                <span className="text-muted">
                  হিসাব ও লেনদেন দেখতে ট্যাপ করুন
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-brand-strong group-hover:translate-x-0.5 transition">
                  {loadingPhone === row.phone ? "লোড হচ্ছে..." : "লেজার দেখুন →"}
                </span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <div className="text-3xl mb-2">📋</div>
            <p className="font-bold text-ink text-sm">কোনো কাস্টমার পাওয়া যায়নি</p>
            <p className="text-xs text-muted mt-1">
              {search.trim() ? `"${search}" এর সাথে কোনো কাস্টমার মিলেনি।` : "এই ক্যাটাগরিতে কোনো হিসাব নেই।"}
            </p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className={`hidden md:block overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>কাস্টমার ও মোবাইল নম্বর</th>
              <th className={`${th} text-right`}>বাকি / জমার হিসাব</th>
              <th className={`${th} text-right`}>অ্যাকশন</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const due = describeDue(row.duePaisa);
              const hasDue = row.duePaisa > 0;
              const hasCredit = row.duePaisa < 0;

              return (
                <tr key={row.phone} className={trow}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-sm font-bold ${
                          hasDue
                            ? "bg-rose-50 text-rose-600 border border-rose-200"
                            : hasCredit
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : "bg-slate-50 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {(row.customerName || "C").trim().charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-ink text-sm">{row.customerName || "(নাম নেই)"}</div>
                        <div className="text-xs text-muted font-mono">{row.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${td} text-right`}>
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        hasDue
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : hasCredit
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-muted border-slate-200"
                      }`}
                    >
                      {due.label !== "Baki nei" ? `${due.label} ${due.amountText}` : due.label}
                    </div>
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => handleOpen(row)}
                      disabled={loadingPhone === row.phone}
                      className="rounded-xl bg-brand-tint px-3.5 py-1.5 text-xs font-bold text-brand-strong hover:bg-brand/20 active:scale-95 transition disabled:opacity-50"
                    >
                      {loadingPhone === row.phone ? "খুলছে..." : "হিসাব দেখুন →"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-muted">
                  {search.trim() ? `"${search}" এর কোনো কাস্টমার পাওয়া যায়নি।` : "কোনো রেকর্ড নেই।"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
