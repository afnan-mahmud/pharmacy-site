"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { salesReport, type SalesReport } from "@/actions/reports";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";
import { Pager } from "./Pager";

type ChannelFilter = "all" | "retail" | "wholesale";
type StatusFilter = "all" | "due" | "paid" | "cancelled";
type SortOption = "newest" | "oldest" | "amount_desc" | "profit_desc" | "due_desc";

const BENGALI_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"
];

const BENGALI_DIGITS: Record<string, string> = {
  "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
  "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯"
};

function toBengaliNumber(num: number | string): string {
  return String(num).replace(/[0-9]/g, (w) => BENGALI_DIGITS[w] || w);
}

function formatPrettyBengaliDate(isoDateStr: string): string {
  if (!isoDateStr) return "";
  const [yStr, mStr, dStr] = isoDateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const monthName = BENGALI_MONTHS[m - 1] || "";
  return `${toBengaliNumber(d)} ${monthName} ${toBengaliNumber(y)}`;
}

function shiftIsoDate(isoDateStr: string, deltaDays: number): string {
  const [y, m, d] = isoDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().split("T")[0];
}

function getDaysDifference(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000)) + 1;
}

export function ReportView({
  initialReport,
  today,
}: {
  initialReport: SalesReport;
  today: string;
}) {
  const [report, setReport] = useState(initialReport);
  const [fromDate, setFromDate] = useState(initialReport.fromDate);
  const [toDate, setToDate] = useState(initialReport.toDate);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Temporary inputs for custom modal
  const [tempFromDate, setTempFromDate] = useState(initialReport.fromDate);
  const [tempToDate, setTempToDate] = useState(initialReport.toDate);

  // Helper date calculations based on Dhaka 'today'
  function computePresetRange(preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "last30" | "thisYear") {
    const [y, m, d] = today.split("-").map(Number);

    if (preset === "today") {
      return { from: today, to: today };
    }
    if (preset === "yesterday") {
      const prevDate = new Date(Date.UTC(y, m - 1, d - 1));
      const yStr = prevDate.toISOString().split("T")[0];
      return { from: yStr, to: yStr };
    }
    if (preset === "last7") {
      const prev7 = new Date(Date.UTC(y, m - 1, d - 6));
      return { from: prev7.toISOString().split("T")[0], to: today };
    }
    if (preset === "last30") {
      const prev30 = new Date(Date.UTC(y, m - 1, d - 29));
      return { from: prev30.toISOString().split("T")[0], to: today };
    }
    if (preset === "thisMonth") {
      const monthStart = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
      return { from: monthStart, to: today };
    }
    if (preset === "lastMonth") {
      const prevMonthStart = new Date(Date.UTC(y, m - 2, 1));
      const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));
      return {
        from: prevMonthStart.toISOString().split("T")[0],
        to: prevMonthEnd.toISOString().split("T")[0],
      };
    }
    if (preset === "thisYear") {
      return {
        from: `${String(y).padStart(4, "0")}-01-01`,
        to: today,
      };
    }
    return { from: today, to: today };
  }

  /**
   * Loads one page of the report.
   *
   * Every filter, the sort and the page number are part of the request rather
   * than applied to what came back: rows arrive one page at a time now, and
   * ranking or filtering a page in the browser would answer only for the rows
   * that happened to land on it.
   */
  const fetchReport = useCallback(
    (opts: {
      from: string;
      to: string;
      channel?: ChannelFilter;
      status?: StatusFilter;
      sort?: SortOption;
      query?: string;
      page?: number;
    }) => {
      setFromDate(opts.from);
      setToDate(opts.to);
      setTempFromDate(opts.from);
      setTempToDate(opts.to);
      setError("");
      startTransition(async () => {
        try {
          const res = await salesReport({
            fromDate: opts.from,
            toDate: opts.to,
            channel: opts.channel ?? channelFilter,
            status: opts.status ?? statusFilter,
            sortBy: opts.sort ?? sortBy,
            search: opts.query ?? search,
            page: opts.page ?? 1,
          });
          setReport(res);
        } catch (err) {
          setError(err instanceof Error ? err.message : "\u09b0\u09bf\u09aa\u09cb\u09b0\u09cd\u099f \u09b2\u09cb\u09a1 \u0995\u09b0\u09a4\u09c7 \u09b8\u09ae\u09b8\u09cd\u09af\u09be \u09b9\u09df\u09c7\u099b\u09c7");
        }
      });
    },
    [channelFilter, statusFilter, sortBy, search],
  );

  // Changing a filter, the sort or the page re-queries. Typing in the search
  // box is debounced; the rest are deliberate single actions and fire at once.
  // The date pickers call fetchReport directly, so they are not listed here.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // The server already sent page 1 of today.
    }
    const t = setTimeout(
      () => fetchReport({ from: fromDate, to: toDate, page }),
      search.trim() ? 250 : 0,
    );
    return () => clearTimeout(t);
    // fetchReport is intentionally left out of the deps: it changes identity
    // whenever a filter does, which this effect already reacts to directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter, sortBy, search, page]);

  // A filter change invalidates the page number - staying on page 4 while a
  // search narrows the results to one page is how a list silently empties.
  useEffect(() => {
    setPage(1);
  }, [channelFilter, statusFilter, search]);

  function handlePresetClick(preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth") {
    const range = computePresetRange(preset);
    fetchReport({ from: range.from, to: range.to });
  }

  function handleCustomPresetApply(preset: "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisYear") {
    const range = computePresetRange(preset);
    setTempFromDate(range.from);
    setTempToDate(range.to);
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCustomModalOpen(false);
    fetchReport({ from: tempFromDate, to: tempToDate });
  }

  // Stepper logic: Shift day(s) backward / forward
  const isSingleDay = fromDate === toDate;
  const isNextDisabled = toDate >= today;

  function handleStepBackward() {
    if (isSingleDay) {
      const prev = shiftIsoDate(fromDate, -1);
      fetchReport({ from: prev, to: prev });
    } else {
      const span = getDaysDifference(fromDate, toDate);
      const newFrom = shiftIsoDate(fromDate, -span);
      const newTo = shiftIsoDate(toDate, -span);
      fetchReport({ from: newFrom, to: newTo });
    }
  }

  function handleStepForward() {
    if (isNextDisabled) return;
    if (isSingleDay) {
      const next = shiftIsoDate(fromDate, 1);
      const safeNext = next > today ? today : next;
      fetchReport({ from: safeNext, to: safeNext });
    } else {
      const span = getDaysDifference(fromDate, toDate);
      let newTo = shiftIsoDate(toDate, span);
      if (newTo > today) newTo = today;
      const newFrom = shiftIsoDate(newTo, -(span - 1));
      fetchReport({ from: newFrom, to: newTo });
    }
  }

  // Active preset detection
  const isTodayActive = fromDate === today && toDate === today;
  const yesterdayRange = computePresetRange("yesterday");
  const isYesterdayActive = fromDate === yesterdayRange.from && toDate === yesterdayRange.to;
  const last7Range = computePresetRange("last7");
  const isLast7Active = fromDate === last7Range.from && toDate === last7Range.to;
  const thisMonthRange = computePresetRange("thisMonth");
  const isThisMonthActive = fromDate === thisMonthRange.from && toDate === thisMonthRange.to;
  const lastMonthRange = computePresetRange("lastMonth");
  const isLastMonthActive = fromDate === lastMonthRange.from && toDate === lastMonthRange.to;
  const isCustomActive =
    !isTodayActive &&
    !isYesterdayActive &&
    !isLast7Active &&
    !isThisMonthActive &&
    !isLastMonthActive;

  // The server filters, sorts and pages; this is one page, already in order.
  const sortedRows = report.rows;
  const lastPage = Math.max(1, Math.ceil(report.totalRows / report.pageSize));

  // Computed metrics according to active channel tab
  let displayTotal = report.grandTotalPaisa || 0;
  let displayCost = report.grandCostPaisa || 0;
  let displayProfit = report.grandProfitPaisa || 0;
  let displayDue = report.grandDuePaisa || 0;
  let displayCount = (report.retail?.count || 0) + (report.wholesale?.count || 0);

  if (channelFilter === "retail") {
    displayTotal = report.retail?.totalPaisa || 0;
    displayCost = report.retail?.costPaisa || 0;
    displayProfit = report.retail?.profitPaisa || 0;
    displayDue = report.retail?.duePaisa || 0;
    displayCount = report.retail?.count || 0;
  } else if (channelFilter === "wholesale") {
    displayTotal = report.wholesale?.totalPaisa || 0;
    displayCost = report.wholesale?.costPaisa || 0;
    displayProfit = report.wholesale?.profitPaisa || 0;
    displayDue = report.wholesale?.duePaisa || 0;
    displayCount = report.wholesale?.count || 0;
  }

  const marginPercent =
    displayTotal > 0 && Number.isFinite(displayProfit)
      ? ((displayProfit / displayTotal) * 100).toFixed(1)
      : "0.0";

  // Formatted date string for user
  const totalDays = getDaysDifference(fromDate, toDate);
  const formattedDateTitle = isSingleDay
    ? isTodayActive
      ? `আজ, ${formatPrettyBengaliDate(fromDate)}`
      : isYesterdayActive
      ? `গতকাল, ${formatPrettyBengaliDate(fromDate)}`
      : formatPrettyBengaliDate(fromDate)
    : `${formatPrettyBengaliDate(fromDate)} – ${formatPrettyBengaliDate(toDate)}`;

  return (
    <div className="flex flex-col pb-12">
      {/* Hero Header & Date Selection Card */}
      <section className="-mx-4 -mt-4 mb-5 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand via-brand-strong to-brand-deep px-4 py-5 sm:px-6 sm:py-7 text-white shadow-md relative overflow-hidden">
        {/* Decorative background glows */}
        <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/4 -translate-x-1/4 h-48 w-48 rounded-full bg-black/15 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-4">
          {/* Top Title & Quick Actions */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                বিক্রি ও লাভের হিসাব
              </h1>
              <p className="text-xs text-white/85 mt-0.5 hidden sm:block">
                মোট বিক্রি, কেনা খরচ, লাভ ও বাকির দৈনিক/মাসিক অডিট
              </p>
            </div>

            <div className="flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={() => fetchReport({ from: fromDate, to: toDate, page })}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition disabled:opacity-50"
                title="রিপোর্ট রিফ্রেশ করুন"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span className="hidden sm:inline">{isPending ? "লোড হচ্ছে..." : "রিফ্রেশ"}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition"
                title="প্রিন্ট বা PDF সেভ করুন"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                <span>প্রিন্ট</span>
              </button>
            </div>
          </div>

          {/* Ultra-UX Date Stepper Bar */}
          <div className="rounded-2xl bg-black/20 p-2 sm:p-2.5 backdrop-blur-md border border-white/15 shadow-inner">
            <div className="flex items-center justify-between gap-2">
              {/* Previous Day/Period Button */}
              <button
                type="button"
                onClick={handleStepBackward}
                disabled={isPending}
                className="flex items-center gap-1 rounded-xl bg-white/15 hover:bg-white/25 px-2.5 sm:px-3 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40"
                title={isSingleDay ? "আগের দিন" : "আগের সময়কাল"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden sm:inline">আগের দিন</span>
              </button>

              {/* Main Date Display & Modal Opener */}
              <button
                type="button"
                onClick={() => {
                  setTempFromDate(fromDate);
                  setTempToDate(toDate);
                  setCustomModalOpen(true);
                }}
                className="flex-1 flex flex-col items-center justify-center py-1 px-2 rounded-xl hover:bg-white/10 transition group text-center"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-base font-extrabold tracking-tight group-hover:underline">
                    {formattedDateTitle}
                  </span>
                  <svg
                    className="w-3.5 h-3.5 text-white/80 group-hover:text-white transition"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/80 font-medium mt-0.5">
                  <span>{isSingleDay ? "১ দিনের হিসাব" : `${toBengaliNumber(totalDays)} দিনের মোট হিসাব`}</span>
                  <span>•</span>
                  <span className="text-emerald-300 font-bold">তারিখ বদলাতে ট্যাপ করুন</span>
                </div>
              </button>

              {/* Next Day/Period Button */}
              <button
                type="button"
                onClick={handleStepForward}
                disabled={isPending || isNextDisabled}
                className="flex items-center gap-1 rounded-xl bg-white/15 hover:bg-white/25 px-2.5 sm:px-3 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                title={isSingleDay ? "পরের দিন" : "পরের সময়কাল"}
              >
                <span className="hidden sm:inline">পরের দিন</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Fast Preset Chips (Horizontally Scrollable) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold no-print">
            <button
              type="button"
              onClick={() => handlePresetClick("today")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
                isTodayActive
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              আজ
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick("yesterday")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
                isYesterdayActive
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              গতকাল
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick("last7")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
                isLast7Active
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              গত ৭ দিন
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick("thisMonth")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
                isThisMonthActive
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              এই মাস
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick("lastMonth")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
                isLastMonthActive
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              গত মাস
            </button>
            <button
              type="button"
              onClick={() => {
                setTempFromDate(fromDate);
                setTempToDate(toDate);
                setCustomModalOpen(true);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition flex items-center gap-1 ${
                isCustomActive
                  ? "bg-white text-brand-strong font-bold shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <span>📅 কাস্টম রেঞ্জ</span>
            </button>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-500/90 px-3.5 py-2 text-xs text-white">
              {error}
            </div>
          )}
        </div>
      </section>

      {/* CUSTOM DATE RANGE MODAL / POPUP */}
      {customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print">
          <div className="w-full max-w-md rounded-3xl bg-surface p-5 sm:p-6 shadow-2xl border border-line relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    তারিখ বা রেঞ্জ নির্বাচন করুন
                  </h3>
                  <p className="text-[11px] text-muted">নির্দিষ্ট তারিখ বা সময়ের হিসাব দেখতে বেছে নিন</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                className="h-8 w-8 rounded-full bg-canvas text-muted hover:text-ink flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Quick Shortcuts inside Modal */}
            <div className="mb-4">
              <div className="text-xs font-bold text-muted mb-2">দ্রুত নির্বাচন (Shortcuts):</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("today")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  আজ (Today)
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("yesterday")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  গতকাল (Yesterday)
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("last7")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  গত ৭ দিন
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("last30")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  গত ৩০ দিন
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("thisMonth")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  চলতি মাস
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomPresetApply("lastMonth")}
                  className="rounded-xl border border-line bg-canvas/60 hover:bg-canvas p-2 text-left font-semibold text-ink transition"
                >
                  গত মাস
                </button>
              </div>
            </div>

            {/* Custom From / To Inputs Form */}
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="modalFromDate" className="text-xs font-bold text-ink">
                    শুরুর তারিখ (From)
                  </label>
                  <input
                    id="modalFromDate"
                    type="date"
                    max={today}
                    required
                    value={tempFromDate}
                    onChange={(e) => setTempFromDate(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-xs sm:text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="modalToDate" className="text-xs font-bold text-ink">
                    শেষ তারিখ (To)
                  </label>
                  <input
                    id="modalToDate"
                    type="date"
                    max={today}
                    required
                    value={tempToDate}
                    onChange={(e) => setTempToDate(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-xs sm:text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                  />
                </div>
              </div>

              {/* Selected Preview in Modal */}
              <div className="rounded-2xl bg-brand-tint/60 border border-brand/20 p-3 text-center">
                <div className="text-[11px] text-brand-strong font-medium">নির্বাচিত সময়কাল:</div>
                <div className="text-xs sm:text-sm font-bold text-brand-deep mt-0.5">
                  {formatPrettyBengaliDate(tempFromDate)} – {formatPrettyBengaliDate(tempToDate)} (
                  {toBengaliNumber(getDaysDifference(tempFromDate, tempToDate))} দিন)
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="flex-1 rounded-2xl border border-line bg-canvas hover:bg-line/40 py-2.5 text-xs font-bold text-muted transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-2xl bg-brand hover:bg-brand-strong py-2.5 text-xs font-bold text-white shadow-md shadow-brand/20 transition disabled:opacity-50"
                >
                  {isPending ? "লোড হচ্ছে..." : "হিসাব দেখুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel Switcher (Segmented Control Tabs) */}
      <div className="mb-4 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center rounded-2xl bg-canvas p-1 border border-line shadow-inner text-xs font-semibold">
          <button
            type="button"
            onClick={() => setChannelFilter("all")}
            className={`rounded-xl px-3.5 py-1.5 transition ${
              channelFilter === "all"
                ? "bg-surface text-ink shadow-sm font-bold"
                : "text-muted hover:text-ink"
            }`}
          >
            সব বিক্রি ({report.retail.count + report.wholesale.count})
          </button>
          <button
            type="button"
            onClick={() => setChannelFilter("retail")}
            className={`rounded-xl px-3.5 py-1.5 transition flex items-center gap-1 ${
              channelFilter === "retail"
                ? "bg-blue-50 text-blue-700 shadow-sm font-bold"
                : "text-muted hover:text-ink"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            <span>খুচরা ({report.retail.count})</span>
          </button>
          <button
            type="button"
            onClick={() => setChannelFilter("wholesale")}
            className={`rounded-xl px-3.5 py-1.5 transition flex items-center gap-1 ${
              channelFilter === "wholesale"
                ? "bg-emerald-50 text-emerald-800 shadow-sm font-bold"
                : "text-muted hover:text-ink"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
            <span>পাইকারি ({report.wholesale.count})</span>
          </button>
        </div>

        {report.cancelledCount > 0 && (
          <span className="shrink-0 rounded-full bg-danger-bg px-2.5 py-1 text-[11px] font-semibold text-danger">
            {report.cancelledCount} টি বাতিল
          </span>
        )}
      </div>

      {/* Executive Key Metrics Grid (2x2 on Mobile, 4 Cols on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        {/* 1. মোট বিক্রি (Total Revenue) */}
        <div className="rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-sm hover:shadow transition relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted">
              মোট বিক্রি
            </span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-brand-strong">
              {displayCount} টি
            </span>
          </div>
          <div className="mt-2 font-display text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            {formatTaka(displayTotal)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] sm:text-xs text-muted">
            <span>Total Sales Revenue</span>
          </div>
        </div>

        {/* 2. ক্রয় খরচ (Buying Cost) */}
        <div className="rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-sm hover:shadow transition relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted">
              ক্রয় খরচ
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-slate-700">
              Cost
            </span>
          </div>
          <div className="mt-2 font-display text-xl sm:text-2xl font-extrabold text-slate-700 tracking-tight">
            {formatTaka(displayCost)}
          </div>
          <div className="mt-1 text-[10px] sm:text-xs text-muted truncate">
            ঔষধের ক্রয়মূল্য হিসাব
          </div>
        </div>

        {/* 3. মোট লাভ (Net Gross Profit) */}
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 p-4 sm:p-5 shadow-sm hover:shadow transition relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800">
              মোট লাভ (Profit)
            </span>
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white shadow-xs">
              {marginPercent}%
            </span>
          </div>
          <div className="mt-2 font-display text-xl sm:text-2xl font-extrabold text-emerald-700 tracking-tight">
            {formatTaka(displayProfit)}
          </div>
          <div className="mt-1 text-[10px] sm:text-xs font-medium text-emerald-800/80">
            মার্জিন (বিক্রি - ক্রয়)
          </div>
        </div>

        {/* 4. মোট বাকি (Unpaid Due) */}
        <div className="rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-sm hover:shadow transition relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted">
              মোট বাকি (Due)
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-bold ${
                displayDue > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {displayDue > 0 ? "বাকি আছে" : "পরিশোধ"}
            </span>
          </div>
          <div
            className={`mt-2 font-display text-xl sm:text-2xl font-extrabold tracking-tight ${
              displayDue > 0 ? "text-amber-600" : "text-ink"
            }`}
          >
            {formatTaka(displayDue)}
          </div>
          <div className="mt-1 text-[10px] sm:text-xs text-muted truncate">
            এই সময়ের অপরিশোধিত টাকা
          </div>
        </div>
      </div>

      {/* Secondary Channel Details Breakdown Card (Retail vs Wholesale quick glance) */}
      {channelFilter === "all" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Retail quick tile */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                খু
              </div>
              <div>
                <div className="text-xs font-bold text-blue-900">
                  খুচরা বিক্রি ({report.retail.count} টি)
                </div>
                <div className="text-[11px] text-blue-700/80">
                  খরচ: {formatTaka(report.retail.costPaisa)} · লাভ: {formatTaka(report.retail.profitPaisa)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-extrabold text-sm text-blue-900">
                {formatTaka(report.retail.totalPaisa)}
              </div>
              {report.retail.duePaisa > 0 && (
                <div className="text-[10px] font-bold text-amber-700">
                  বাকি: {formatTaka(report.retail.duePaisa)}
                </div>
              )}
            </div>
          </div>

          {/* Wholesale quick tile */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                পা
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-900">
                  পাইকারি বিক্রি ({report.wholesale.count} টি)
                </div>
                <div className="text-[11px] text-emerald-700/80">
                  খরচ: {formatTaka(report.wholesale.costPaisa)} · লাভ: {formatTaka(report.wholesale.profitPaisa)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-extrabold text-sm text-emerald-900">
                {formatTaka(report.wholesale.totalPaisa)}
              </div>
              {report.wholesale.duePaisa > 0 && (
                <div className="text-[10px] font-bold text-amber-700">
                  বাকি: {formatTaka(report.wholesale.duePaisa)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="rounded-3xl border border-line bg-surface p-3.5 sm:p-4 shadow-sm mb-4 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ক্রেতার নাম, ফোন নম্বর বা ইনভয়েস দিয়ে খুঁজুন..."
            className="w-full rounded-2xl border border-line bg-canvas/60 pl-10 pr-9 py-2.5 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills & Sort Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line/60">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-3 py-1 transition ${
                statusFilter === "all"
                  ? "bg-ink text-white font-bold"
                  : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              সব
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("due")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 ${
                statusFilter === "due"
                  ? "bg-amber-600 text-white font-bold"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`}
            >
              <span>বাকি আছে</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("paid")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 ${
                statusFilter === "paid"
                  ? "bg-emerald-600 text-white font-bold"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              <span>পরিশোধিত</span>
            </button>
            {report.cancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("cancelled")}
                className={`rounded-full px-3 py-1 transition flex items-center gap-1 ${
                  statusFilter === "cancelled"
                    ? "bg-rose-600 text-white font-bold"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                <span>বাতিল ({report.cancelledCount})</span>
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted ml-auto">
            <span className="hidden sm:inline">সাজান:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="বিক্রির তালিকা সাজান"
              className="rounded-xl border border-line bg-canvas px-2.5 py-1 text-xs text-ink font-medium focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
            >
              <option value="newest">নতুন আগে</option>
              <option value="oldest">পুরাতন আগে</option>
              <option value="amount_desc">বেশি বিক্রি</option>
              <option value="profit_desc">বেশি লাভ</option>
              <option value="due_desc">বেশি বাকি</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Header Count */}
      <div className="flex items-center justify-between px-1 mb-2.5 text-xs text-muted">
        <span>
          দেখাচ্ছে <strong className="text-ink">{sortedRows.length}</strong> / {report.totalRows} টি বিক্রির হিসাব
        </span>
        {search && (
          <span>
            ফিল্টার: &ldquo;<span className="text-brand-strong font-medium">{search}</span>&rdquo;
          </span>
        )}
      </div>

      {/* Empty State */}
      {sortedRows.length === 0 && (
        <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-2xl">
            🔍
          </div>
          <h3 className="font-display text-base font-bold text-ink mb-1">
            কোনো হিসাব পাওয়া যায়নি
          </h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {search.trim()
              ? `"${search}" এর সাথে মিলে এমন কোনো বিক্রির রেকর্ড নেই। অন্য কোনো নাম বা নম্বর দিয়ে খুঁজুন।`
              : "এই নির্ধারিত সময় বা ফিল্টারে কোনো বিক্রির হিসাব নেই।"}
          </p>
          {(search || channelFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setChannelFilter("all");
                setStatusFilter("all");
              }}
              className="mt-3 inline-flex rounded-full bg-brand/10 hover:bg-brand/20 px-4 py-1.5 text-xs font-semibold text-brand-strong transition"
            >
              সব ফিল্টার রিসেট করুন
            </button>
          )}
        </div>
      )}

      {/* MOBILE VIEW: Rich Transaction Cards (Visible on screens < 640px) */}
      <div className="block sm:hidden space-y-3">
        {sortedRows.map((row) => {
          const rowMargin =
            row.totalPaisa > 0 && Number.isFinite(row.profitPaisa)
              ? ((row.profitPaisa / row.totalPaisa) * 100).toFixed(1)
              : "0.0";

          return (
            <div
              key={row.saleId}
              className={`rounded-3xl border bg-surface p-4 shadow-sm transition ${
                row.cancelled
                  ? "border-danger/30 bg-danger-bg/15 opacity-80"
                  : "border-line hover:border-brand/30"
              }`}
            >
              {/* Card Header: Invoice / Type & Date */}
              <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      row.type === "retail"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {row.type === "retail" ? "খুচরা" : "পাইকারি"}
                  </span>
                  {row.cancelled && (
                    <span className="inline-flex rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-bold text-danger">
                      বাতিল
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-medium text-muted">
                  {formatDhakaDateTime(row.createdAt)}
                </span>
              </div>

              {/* Customer / Buyer & Invoice Link */}
              <div className="flex items-start justify-between gap-2 my-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-ink truncate">
                    {row.buyerName || (row.type === "retail" ? "খুচরা ক্রেতা" : "ক্রেতার নাম নেই")}
                  </div>
                  {row.buyerPhone && (
                    <a
                      href={`tel:${row.buyerPhone}`}
                      className="text-xs text-muted hover:text-brand inline-flex items-center gap-1 mt-0.5 transition"
                    >
                      <span>📞</span>
                      <span>{row.buyerPhone}</span>
                    </a>
                  )}
                </div>

                {row.invoiceNo ? (
                  <Link
                    href={`/invoice/${row.saleId}`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-strong hover:bg-brand/20 transition"
                  >
                    <span>📄 {row.invoiceNo}</span>
                  </Link>
                ) : (
                  <Link
                    href={`/invoice/${row.saleId}`}
                    className="shrink-0 text-xs font-medium text-brand hover:underline"
                  >
                    রশিদ দেখুন
                  </Link>
                )}
              </div>

              {/* Financial Metrics Strip: 3-column pill / stats */}
              <div
                className={`grid grid-cols-3 gap-2 rounded-2xl bg-canvas/70 p-2.5 text-center my-2.5 ${
                  row.cancelled ? "line-through opacity-60" : ""
                }`}
              >
                {/* 1. বিক্রি */}
                <div className="border-r border-line/70 pr-1">
                  <div className="text-[10px] uppercase font-bold text-muted">বিক্রি</div>
                  <div className="font-display text-xs sm:text-sm font-extrabold text-ink mt-0.5">
                    {formatTaka(row.totalPaisa)}
                  </div>
                </div>

                {/* 2. ক্রয় খরচ */}
                <div className="border-r border-line/70 px-1">
                  <div className="text-[10px] uppercase font-bold text-muted">ক্রয় খরচ</div>
                  <div className="font-display text-xs sm:text-sm font-bold text-slate-700 mt-0.5">
                    {formatTaka(row.costPaisa)}
                  </div>
                </div>

                {/* 3. লাভ */}
                <div className="pl-1">
                  <div className="text-[10px] uppercase font-bold text-muted">লাভ</div>
                  <div
                    className={`font-display text-xs sm:text-sm font-extrabold mt-0.5 ${
                      row.profitPaisa >= 0 ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {row.profitPaisa > 0 ? "+" : ""}
                    {formatTaka(row.profitPaisa)}
                  </div>
                  {!row.cancelled && (
                    <div className="text-[9px] font-bold text-emerald-800/80">
                      {rowMargin}%
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer: Paid / Due Status & Actions */}
              <div className="flex items-center justify-between pt-2.5 mt-1 text-xs border-t border-line/60 gap-2">
                <div className="text-muted truncate">
                  জমা: <span className="font-bold text-ink">{formatTaka(row.paidPaisa)}</span>
                  {!row.cancelled && row.duePaisa > 0 ? (
                    <span className="ml-1.5 inline-flex items-center font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                      বাকি {formatTaka(row.duePaisa)}
                    </span>
                  ) : !row.cancelled ? (
                    <span className="ml-1.5 inline-flex items-center font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                      পরিশোধ
                    </span>
                  ) : (
                    <span className="ml-1.5 text-danger font-medium text-[10px]">বাতিল</span>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <Link
                    href={`/invoice/${row.saleId}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-canvas hover:bg-line/40 border border-line px-2.5 py-1 text-xs font-semibold text-ink transition active:scale-95 shadow-2xs"
                    title="রশিদ দেখুন ও প্রিন্ট করুন"
                  >
                    <span>📄 রশিদ</span>
                  </Link>
                  {!row.cancelled && (
                    <Link
                      href={`/sales/${row.saleId}/edit`}
                      className="inline-flex items-center gap-1 rounded-xl bg-brand/10 hover:bg-brand/20 border border-brand/30 px-2.5 py-1 text-xs font-bold text-brand-strong transition active:scale-95 shadow-2xs"
                      title="অর্ডার / বিক্রির প্রোডাক্ট, মূল্য বা জমা এডিট করুন"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>এডিট</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP VIEW: High-Density Structured Table (Visible on screens >= 640px) */}
      <div className="hidden sm:block overflow-x-auto rounded-3xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3.5 font-bold">তারিখ ও সময়</th>
              <th className="px-4 py-3.5 font-bold">ধরণ</th>
              <th className="px-4 py-3.5 font-bold">ইনভয়েস / ক্রেতা</th>
              <th className="px-4 py-3.5 text-right font-bold">মোট বিক্রি</th>
              <th className="px-4 py-3.5 text-right font-bold">ক্রয় খরচ</th>
              <th className="px-4 py-3.5 text-right font-bold">লাভ (Profit)</th>
              <th className="px-4 py-3.5 text-right font-bold">জমা</th>
              <th className="px-4 py-3.5 text-right font-bold">বাকি</th>
              <th className="px-4 py-3.5 text-right font-bold">অ্যাকশন</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {sortedRows.map((row) => {
              const rowMargin =
                row.totalPaisa > 0 && Number.isFinite(row.profitPaisa)
                  ? ((row.profitPaisa / row.totalPaisa) * 100).toFixed(1)
                  : "0.0";

              return (
                <tr
                  key={row.saleId}
                  className={`hover:bg-canvas/40 transition ${
                    row.cancelled ? "bg-danger-bg/15 text-muted" : ""
                  }`}
                >
                  {/* 1. Date */}
                  <td className="px-4 py-3.5 text-xs font-medium text-ink/80 whitespace-nowrap">
                    {formatDhakaDateTime(row.createdAt)}
                  </td>

                  {/* 2. Type */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        row.type === "retail"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {row.type === "retail" ? "খুচরা" : "পাইকারি"}
                    </span>
                    {row.cancelled && (
                      <span className="ml-1.5 inline-flex rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-bold text-danger">
                        বাতিল
                      </span>
                    )}
                  </td>

                  {/* 3. Invoice / Buyer */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {row.invoiceNo ? (
                        <Link
                          href={`/invoice/${row.saleId}`}
                          className="font-bold text-brand hover:text-brand-strong hover:underline transition"
                        >
                          {row.invoiceNo}
                        </Link>
                      ) : (
                        <Link
                          href={`/invoice/${row.saleId}`}
                          className="text-xs text-muted hover:text-brand hover:underline"
                        >
                          রশিদ
                        </Link>
                      )}
                    </div>
                    {row.buyerName ? (
                      <div className="mt-0.5 text-xs font-medium text-ink truncate max-w-[180px]">
                        {row.buyerName}
                        {row.buyerPhone ? (
                          <span className="text-muted font-normal"> · {row.buyerPhone}</span>
                        ) : null}
                      </div>
                    ) : (
                      row.type === "retail" && (
                        <div className="mt-0.5 text-[11px] text-muted/70">(নাম নেই)</div>
                      )
                    )}
                  </td>

                  {/* 4. Total */}
                  <td
                    className={`px-4 py-3.5 text-right font-bold text-ink whitespace-nowrap ${
                      row.cancelled ? "line-through opacity-50" : ""
                    }`}
                  >
                    {formatTaka(row.totalPaisa)}
                  </td>

                  {/* 5. Cost */}
                  <td
                    className={`px-4 py-3.5 text-right font-medium text-slate-700 whitespace-nowrap ${
                      row.cancelled ? "line-through opacity-50" : ""
                    }`}
                  >
                    {formatTaka(row.costPaisa)}
                  </td>

                  {/* 6. Profit */}
                  <td
                    className={`px-4 py-3.5 text-right font-bold whitespace-nowrap ${
                      row.cancelled
                        ? "line-through opacity-50 text-muted"
                        : row.profitPaisa >= 0
                        ? "text-emerald-700"
                        : "text-rose-600"
                    }`}
                  >
                    <div>
                      {row.profitPaisa > 0 ? "+" : ""}
                      {formatTaka(row.profitPaisa)}
                    </div>
                    {!row.cancelled && (
                      <div className="text-[10px] font-semibold text-emerald-800/80">
                        {rowMargin}% margin
                      </div>
                    )}
                  </td>

                  {/* 7. Paid */}
                  <td className="px-4 py-3.5 text-right font-medium text-ink/80 whitespace-nowrap">
                    {formatTaka(row.paidPaisa)}
                  </td>

                  {/* 8. Due */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {!row.cancelled && row.duePaisa > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                        {formatTaka(row.duePaisa)}
                      </span>
                    ) : !row.cancelled ? (
                      <span className="text-xs text-muted">পরিশোধ</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  {/* 9. Actions */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <Link
                        href={`/invoice/${row.saleId}`}
                        className="inline-flex items-center gap-1 rounded-xl bg-canvas hover:bg-line/40 border border-line px-2.5 py-1 text-xs font-semibold text-ink transition active:scale-95 shadow-2xs"
                        title="রশিদ দেখুন ও প্রিন্ট করুন"
                      >
                        <span>📄 রশিদ</span>
                      </Link>
                      {!row.cancelled && (
                        <Link
                          href={`/sales/${row.saleId}/edit`}
                          className="inline-flex items-center gap-1 rounded-xl bg-brand/10 hover:bg-brand/20 border border-brand/30 px-2.5 py-1 text-xs font-bold text-brand-strong transition active:scale-95 shadow-2xs"
                          title="অর্ডার / বিক্রির প্রোডাক্ট, মূল্য বা জমা এডিট করুন"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>এডিট</span>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager
        page={report.page}
        lastPage={lastPage}
        total={report.totalRows}
        busy={isPending}
        onGo={setPage}
      />
    </div>
  );
}
