"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setBuyerActive } from "@/actions/buyers";
import { filterBuyers } from "@/lib/buyerSearch";
import { BuyerForm, type BuyerFormValues } from "./BuyerForm";
import { card, thead, th, td, trow, errorBox } from "@/components/ui";

export type BuyerRow = BuyerFormValues & {
  id: string;
  active: boolean;
};

export function BuyerTable({ buyers }: { buyers: BuyerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BuyerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(row: BuyerRow) {
    setError("");
    setTogglingId(row.id);
    try {
      const result = await setBuyerActive(row.id, !row.active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "অবস্থা পরিবর্তন করতে সমস্যা হয়েছে");
    } finally {
      setTogglingId(null);
    }
  }

  if (adding || editing) {
    return (
      <BuyerForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  // Filter by query and status
  const searchedBuyers = filterBuyers(buyers, query);
  const shown = searchedBuyers.filter((b) => {
    if (statusFilter === "active") return b.active;
    if (statusFilter === "inactive") return !b.active;
    return true;
  });

  const totalCount = buyers.length;
  const activeCount = buyers.filter((b) => b.active).length;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="flex flex-col pb-12">
      {/* Hero Banner with Stats & Search */}
      <section className="-mx-4 -mt-4 mb-5 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-5 pb-6 pt-6 text-white shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-40 w-40 rounded-full bg-black/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold backdrop-blur-sm">
              <span className="text-yellow-300">🏪</span> বায়ার তালিকা (Wholesale Buyers)
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-black leading-tight">
              পাইকারি ক্রেতা ব্যবস্থাপনা
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              সকল পাইকারি ফার্মেসি ও বায়ারদের তালিকা, ফোন এবং অ্যাকাউন্ট স্ট্যাটাস।
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-brand-strong shadow-lg hover:bg-brand-tint active:scale-95 transition"
          >
            <span>+ নতুন বায়ার যোগ</span>
          </button>
        </div>

        {/* Stats Pill Badges */}
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
          <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur-xs text-center">
            <div className="text-[10px] text-white/80 font-medium">মোট বায়ার</div>
            <div className="font-display text-lg font-black text-white">{totalCount}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur-xs text-center">
            <div className="text-[10px] text-emerald-200 font-medium">সক্রিয় (Active)</div>
            <div className="font-display text-lg font-black text-emerald-300">{activeCount}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur-xs text-center">
            <div className="text-[10px] text-rose-200 font-medium">বন্ধ (Inactive)</div>
            <div className="font-display text-lg font-black text-rose-300">{inactiveCount}</div>
          </div>
        </div>

        {/* Built-in Search Bar */}
        <div className="relative z-10 mt-4">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
            <SearchIcon className="h-5 w-5 text-white/60" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="বায়ার নাম, দোকান বা মোবাইল নম্বর দিয়ে খুঁজুন..."
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

      {error && <p role="alert" className={`${errorBox} mb-3`}>{error}</p>}

      {/* Filter Tabs */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
            statusFilter === "all"
              ? "bg-ink text-white shadow-xs"
              : "bg-surface border border-line text-muted hover:text-ink"
          }`}
        >
          সব বায়ার ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("active")}
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
            statusFilter === "active"
              ? "bg-emerald-700 text-white shadow-xs"
              : "bg-surface border border-line text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          সক্রিয় ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("inactive")}
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
            statusFilter === "inactive"
              ? "bg-rose-700 text-white shadow-xs"
              : "bg-surface border border-line text-rose-700 hover:bg-rose-50"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-rose-400"></span>
          বন্ধ ({inactiveCount})
        </button>
      </div>

      {/* Content Rendering */}
      {buyers.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-muted`}>
          কোনো বায়ার নেই। ওপরের বাটনে ক্লিক করে নতুন বায়ার যোগ করুন।
        </div>
      ) : shown.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-muted`}>
          "{query.trim()}" দিয়ে কোনো বায়ার পাওয়া যায়নি।
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (Phones & Tablets) */}
          <div className="md:hidden space-y-2.5">
            {shown.map((b) => (
              <div
                key={b.id}
                className={`rounded-2xl border p-3.5 space-y-3 transition shadow-2xs ${
                  b.active
                    ? "border-line bg-surface"
                    : "border-line/80 bg-canvas/60 opacity-80"
                }`}
              >
                {/* Header: Avatar, Name, Shop & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-black uppercase ${
                        b.active
                          ? "bg-brand-tint text-brand-strong"
                          : "bg-line text-muted"
                      }`}
                    >
                      {b.name.charAt(0) || "B"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-ink truncate">
                        {b.name}
                      </div>
                      {b.shopName ? (
                        <div className="text-xs text-muted truncate flex items-center gap-1 mt-0.5">
                          <span>🏪</span>
                          <span>{b.shopName}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted italic mt-0.5">দোকান উল্লেখ নেই</div>
                      )}
                    </div>
                  </div>

                  <StatusPill active={b.active} />
                </div>

                {/* Contact & Location Info */}
                <div className="space-y-1 rounded-xl bg-canvas p-2.5 text-xs text-ink border border-line/60">
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-1">
                      <span>📞</span> ফোন:
                    </span>
                    <a
                      href={`tel:${b.phone}`}
                      className="font-bold text-brand-strong hover:underline"
                    >
                      {b.phone}
                    </a>
                  </div>
                  {b.address && (
                    <div className="flex items-start justify-between gap-2 pt-1 border-t border-line/40">
                      <span className="text-muted shrink-0 flex items-center gap-1">
                        <span>📍</span> ঠিকানা:
                      </span>
                      <span className="font-medium text-right text-ink truncate">
                        {b.address}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                  <Link
                    href={`/due?buyer=${encodeURIComponent(b.name)}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-tint/30 px-3 py-1.5 text-xs font-bold text-brand-strong hover:bg-brand hover:text-white transition shadow-2xs"
                  >
                    <span>📒 বাকি খাতা</span>
                  </Link>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(b)}
                      className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:bg-line/50 transition shadow-2xs"
                    >
                      ✏️ এডিট
                    </button>

                    <button
                      type="button"
                      disabled={togglingId === b.id}
                      onClick={() => handleToggle(b)}
                      className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition shadow-2xs disabled:opacity-50 ${
                        b.active
                          ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {togglingId === b.id
                        ? "..."
                        : b.active
                        ? "বন্ধ করুন"
                        : "চালু করুন"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout */}
          <div className={`hidden md:block overflow-x-auto ${card} shadow-xs border border-line`}>
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr>
                  <th className={th}>বায়ার ও দোকান</th>
                  <th className={th}>মোবাইল নম্বর</th>
                  <th className={th}>ঠিকানা</th>
                  <th className={th}>অবস্থা</th>
                  <th className={`${th} text-right`}>অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {shown.map((row) => (
                  <tr key={row.id} className={trow}>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-black uppercase ${
                            row.active
                              ? "bg-brand-tint text-brand-strong"
                              : "bg-line text-muted"
                          }`}
                        >
                          {row.name.charAt(0) || "B"}
                        </div>
                        <div>
                          <div className="font-bold text-ink">{row.name}</div>
                          {row.shopName && (
                            <div className="text-xs text-muted">🏪 {row.shopName}</div>
                          )}
                        </div>
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
                    <td className={`${td} text-muted`}>{row.address || "—"}</td>
                    <td className={td}>
                      <StatusPill active={row.active} />
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/due?buyer=${encodeURIComponent(row.name)}`}
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
                        <button
                          type="button"
                          disabled={togglingId === row.id}
                          onClick={() => handleToggle(row)}
                          className={`rounded-xl px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${
                            row.active
                              ? "text-rose-600 hover:bg-rose-50"
                              : "text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {togglingId === row.id
                            ? "..."
                            : row.active
                            ? "বন্ধ"
                            : "চালু"}
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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        active
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-slate-100 text-slate-600 border border-slate-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {active ? "সক্রিয়" : "বন্ধ"}
    </span>
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
