"use client";

import { useState } from "react";
import Link from "next/link";
import { filterBuyers } from "@/lib/buyerSearch";
import {
  RetailCustomerForm,
  type RetailCustomerFormValues,
} from "./RetailCustomerForm";
import { card, thead, th, td, trow } from "@/components/ui";

export type RetailCustomerRow = RetailCustomerFormValues & {
  id: string;
};

export function RetailCustomerTable({
  customers,
}: {
  customers: RetailCustomerRow[];
}) {
  const [editing, setEditing] = useState<RetailCustomerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  if (adding || editing) {
    return (
      <RetailCustomerForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  const shown = filterBuyers(customers, query);
  const totalCount = customers.length;

  return (
    <div className="flex flex-col pb-12">
      {/* Hero Banner */}
      <section className="-mx-4 -mt-4 mb-5 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-5 pb-6 pt-6 text-white shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-40 w-40 rounded-full bg-black/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold backdrop-blur-sm">
              <span className="text-yellow-300">👥</span> খুচরা ক্রেতা তালিকা (Retail Customers)
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-black leading-tight">
              খুচরা কাস্টমার তালিকা
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              দোকানের সকল খুচরা নিয়মিত কাস্টমার এবং তাদের ফোন নম্বর।
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-brand-strong shadow-lg hover:bg-brand-tint active:scale-95 transition"
          >
            <span>+ নতুন খুচরা ক্রেতা</span>
          </button>
        </div>

        {/* Count badge & Search */}
        <div className="relative z-10 mt-4 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
          <div className="rounded-2xl bg-white/10 px-4 py-2 backdrop-blur-xs text-xs font-bold text-white">
            মোট কাস্টমার: <span className="font-display text-sm font-black text-yellow-300 ml-1">{totalCount}</span> জন
          </div>
        </div>

        <div className="relative z-10 mt-3">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
            <SearchIcon className="h-5 w-5 text-white/60" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ক্রেতার নাম বা মোবাইল নম্বর দিয়ে খুঁজুন..."
            className="w-full rounded-2xl border border-white/20 bg-white/15 py-3 pl-11 pr-10 text-sm font-medium text-white placeholder:text-white/60 backdrop-blur-md focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white transition"
          />
          {query.trim() && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="মুছে দিন"
              className="absolute right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs font-bold text-white hover:bg-white/40 transition"
            >
              ✕
            </button>
          )}
        </div>
      </section>

      {/* Content */}
      {customers.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-muted`}>
          কোনো খুচরা ক্রেতা নেই। ওপরের বাটনে ক্লিক করে নতুন ক্রেতা যোগ করুন।
        </div>
      ) : shown.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-muted`}>
          "{query.trim()}" দিয়ে কোনো ক্রেতা পাওয়া যায়নি।
        </div>
      ) : (
        <>
          {/* Mobile Card List */}
          <div className="md:hidden space-y-2.5">
            {shown.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-line bg-surface p-3.5 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-tint text-brand-strong text-sm font-black uppercase">
                      {row.name.charAt(0) || "C"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-ink truncate">
                        {row.name}
                      </div>
                      <a
                        href={`tel:${row.phone}`}
                        className="text-xs font-bold text-brand-strong hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <span>📞</span> {row.phone}
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-ink hover:bg-line/50 transition shadow-2xs"
                  >
                    ✏️ এডিট
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                  <Link
                    href={`/retail-due?phone=${encodeURIComponent(row.phone)}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-tint/30 px-3 py-1.5 text-xs font-bold text-brand-strong hover:bg-brand hover:text-white transition"
                  >
                    <span>📒 খুচরা বাকি খাতা</span>
                  </Link>

                  <a
                    href={`tel:${row.phone}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    <span>📞 কল করুন</span>
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className={`hidden md:block overflow-x-auto ${card} shadow-xs border border-line`}>
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr>
                  <th className={th}>ক্রেতার নাম</th>
                  <th className={th}>মোবাইল নম্বর</th>
                  <th className={`${th} text-right`}>অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {shown.map((row) => (
                  <tr key={row.id} className={trow}>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-tint text-brand-strong text-xs font-black uppercase">
                          {row.name.charAt(0) || "C"}
                        </div>
                        <span className="font-bold text-ink">{row.name}</span>
                      </div>
                    </td>
                    <td className={td}>
                      <a
                        href={`tel:${row.phone}`}
                        className="font-semibold text-brand-strong hover:underline"
                      >
                        {row.phone}
                      </a>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/retail-due?phone=${encodeURIComponent(row.phone)}`}
                          className="rounded-xl bg-brand-tint/30 px-2.5 py-1 text-xs font-bold text-brand-strong hover:bg-brand hover:text-white transition"
                        >
                          বাকি খাতা
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          className="rounded-xl border border-line px-2.5 py-1 text-xs font-bold text-ink hover:bg-line/40 transition"
                        >
                          এডিট
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
