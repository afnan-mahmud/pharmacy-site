"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toggleMedicineActive, deleteMedicine, listMedicines } from "@/actions/medicines";
import { stockIn } from "@/actions/stock";
import { formatTaka } from "@/lib/money";
import { formatStock, boxesToPatas } from "@/lib/units";
import {
  unitLabelsFor,
  toMedicineForm,
  isPieceOnlyForm,
  MEDICINE_FORMS,
  type MedicineForm as DosageForm,
} from "@/lib/unitLabels";
import { MedicineForm, type MedicineFormValues } from "./MedicineForm";
import {
  card,
  thead,
  th,
  td,
  trow,
  errorBox,
} from "@/components/ui";

export type MedicineRow = MedicineFormValues & {
  id: string;
  stockPatas: number;
  active: boolean;
};

type FilterTab = "all" | "low-stock" | "active" | "inactive";

export function MedicineTable({ medicines }: { medicines: MedicineRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const initialFilterParam = searchParams.get("filter");
  const initialTab: FilterTab =
    initialFilterParam === "low-stock"
      ? "low-stock"
      : initialFilterParam === "inactive"
      ? "inactive"
      : initialFilterParam === "active"
      ? "active"
      : "all";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [selectedForm, setSelectedForm] = useState<string>("all");
  const [filteredMedicines, setFilteredMedicines] = useState(medicines);
  const [searching, setSearching] = useState(false);

  // Quick Stock-In Modal State
  const [stockInTarget, setStockInTarget] = useState<MedicineRow | null>(null);
  const [stockBoxes, setStockBoxes] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockInBusy, setStockInBusy] = useState(false);
  const [stockInError, setStockInError] = useState("");

  useEffect(() => {
    if (!search.trim()) setFilteredMedicines(medicines);
  }, [medicines, search]);

  const doSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setFilteredMedicines(medicines);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await listMedicines(term);
        setFilteredMedicines(
          results.map((m) => ({
            id: m._id,
            name: m.name,
            genericName: m.genericName,
            company: m.company,
            form: toMedicineForm(m.form),
            patasPerBox: m.patasPerBox,
            purchasePricePaisa: m.purchasePricePaisa ?? 0,
            wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
            wholesalePataPricePaisa: m.wholesalePataPricePaisa,
            retailBoxPricePaisa: m.retailBoxPricePaisa,
            retailPataPricePaisa: m.retailPataPricePaisa,
            mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
            lowStockThreshold: m.lowStockThreshold,
            stockPatas: m.stockPatas,
            active: m.active,
          })),
        );
      } catch {
        setFilteredMedicines(medicines);
      } finally {
        setSearching(false);
      }
    },
    [medicines],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      doSearch(search);
    }, 250);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  // Derived stats
  const totalCount = medicines.length;
  const lowStockCount = useMemo(
    () => medicines.filter((m) => m.stockPatas <= 0 || (m.lowStockThreshold > 0 && m.stockPatas <= m.lowStockThreshold)).length,
    [medicines],
  );
  const activeCount = useMemo(() => medicines.filter((m) => m.active).length, [medicines]);
  const inactiveCount = useMemo(() => medicines.filter((m) => !m.active).length, [medicines]);

  // Tab & Form Filtered list
  const displayedRows = useMemo(() => {
    return filteredMedicines.filter((m) => {
      // Tab filter
      if (tab === "low-stock") {
        const isLow = m.stockPatas <= 0 || (m.lowStockThreshold > 0 && m.stockPatas <= m.lowStockThreshold);
        if (!isLow) return false;
      } else if (tab === "active") {
        if (!m.active) return false;
      } else if (tab === "inactive") {
        if (m.active) return false;
      }

      // Form filter
      if (selectedForm !== "all") {
        if (m.form !== selectedForm) return false;
      }

      return true;
    });
  }, [filteredMedicines, tab, selectedForm]);

  async function handleDeactivate(row: MedicineRow) {
    setError("");
    setSuccessMsg("");
    setDeactivatingId(row.id);
    try {
      const result = await toggleMedicineActive(row.id, !row.active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessMsg(`"${row.name}" ${row.active ? "বন্ধ" : "চালু"} করা হয়েছে`);
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleDelete(row: MedicineRow) {
    if (!window.confirm(`আপনি কি নিশ্চিত "${row.name}" মুছে ফেলতে চান?`)) return;
    setError("");
    setSuccessMsg("");
    setDeletingId(row.id);
    try {
      const result = await deleteMedicine(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessMsg(`"${row.name}" মুছে ফেলা হয়েছে`);
      setTimeout(() => setSuccessMsg(""), 3000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleQuickStockIn(e: React.FormEvent) {
    e.preventDefault();
    if (!stockInTarget) return;
    setStockInError("");
    setStockInBusy(true);

    const boxesNum = Number(stockBoxes);
    if (!boxesNum || boxesNum < 1 || !Number.isInteger(boxesNum)) {
      setStockInError("সঠিক বক্স/পিস পরিমাণ লিখুন (কমপক্ষে ১)");
      setStockInBusy(false);
      return;
    }

    try {
      const res = await stockIn({
        medicineId: stockInTarget.id,
        boxes: boxesNum,
        note: stockNote.trim(),
      });

      if (!res.ok) {
        setStockInError(res.error);
        setStockInBusy(false);
        return;
      }

      setSuccessMsg(`"${stockInTarget.name}" এ ${boxesNum} ${unitLabelsFor(stockInTarget.form).outer} স্টক যোগ হয়েছে`);
      setTimeout(() => setSuccessMsg(""), 4000);
      setStockInTarget(null);
      setStockBoxes("");
      setStockNote("");
      router.refresh();
    } catch (err) {
      setStockInError(err instanceof Error ? err.message : "স্টক যোগ করতে ব্যর্থ হয়েছে");
    } finally {
      setStockInBusy(false);
    }
  }

  if (adding || editingId) {
    return (
      <MedicineForm
        initial={filteredMedicines.find((m) => m.id === editingId) ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col pb-8">
      {/* Hero Header */}
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand via-brand-strong to-brand-deep px-5 pb-7 pt-7 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/15 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/15 backdrop-blur text-white text-base">
                  💊
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight">
                  মেডিসিন ও স্টক
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-white/85 mt-1">
                ওষুধের তালিকা, পাইকারি ও খুচরা রেট এবং স্টক ব্যবস্থাপনা
              </p>
            </div>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-brand-strong shadow-lg shadow-black/10 transition active:scale-95 hover:bg-brand-tint hover:shadow-xl shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>নতুন মেডিসিন</span>
            </button>
          </div>

          {/* Quick Stat Counters */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`rounded-2xl p-3 text-left transition-all ${
                tab === "all"
                  ? "bg-white text-ink shadow-lg ring-2 ring-white/50"
                  : "bg-white/10 text-white backdrop-blur-md hover:bg-white/15"
              }`}
            >
              <div className="text-[11px] font-medium opacity-80">মোট ওষুধ</div>
              <div className="text-xl sm:text-2xl font-black mt-0.5">{totalCount}</div>
            </button>

            <button
              type="button"
              onClick={() => setTab("low-stock")}
              className={`rounded-2xl p-3 text-left transition-all relative overflow-hidden ${
                tab === "low-stock"
                  ? "bg-white text-ink shadow-lg ring-2 ring-white/50"
                  : lowStockCount > 0
                  ? "bg-amber-400/25 text-white border border-amber-300/40 hover:bg-amber-400/35"
                  : "bg-white/10 text-white backdrop-blur-md hover:bg-white/15"
              }`}
            >
              {lowStockCount > 0 && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                </span>
              )}
              <div className={`text-[11px] font-medium ${tab === "low-stock" ? "text-amber-700" : "text-amber-200"}`}>
                ⚠️ স্টক অ্যালার্ট
              </div>
              <div className={`text-xl sm:text-2xl font-black mt-0.5 ${tab === "low-stock" ? "text-amber-700" : "text-amber-200"}`}>
                {lowStockCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTab("active")}
              className={`rounded-2xl p-3 text-left transition-all ${
                tab === "active"
                  ? "bg-white text-ink shadow-lg ring-2 ring-white/50"
                  : "bg-white/10 text-white backdrop-blur-md hover:bg-white/15"
              }`}
            >
              <div className="text-[11px] font-medium opacity-80">সক্রিয়</div>
              <div className="text-xl sm:text-2xl font-black mt-0.5 text-emerald-400 sm:text-inherit">
                {activeCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTab("inactive")}
              className={`rounded-2xl p-3 text-left transition-all ${
                tab === "inactive"
                  ? "bg-white text-ink shadow-lg ring-2 ring-white/50"
                  : "bg-white/10 text-white backdrop-blur-md hover:bg-white/15"
              }`}
            >
              <div className="text-[11px] font-medium opacity-80">বন্ধ / নিষ্ক্রিয়</div>
              <div className="text-xl sm:text-2xl font-black mt-0.5">{inactiveCount}</div>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative z-10 mt-4">
            <div className="relative flex items-center">
              <svg
                className="absolute left-4 w-4 h-4 text-white/70 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="মেডিসিনের নাম, জেনেরিক বা কোম্পানি খুঁজুন..."
                className="w-full rounded-2xl border border-white/20 bg-white/15 pl-11 pr-10 py-3 text-sm text-white placeholder:text-white/65 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white/80 shadow-inner transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 p-1 text-white/75 hover:text-white rounded-full transition"
                  title="ক্লিয়ার করুন"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searching && (
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-white/80 animate-pulse">
                খোঁজা হচ্ছে...
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Toast Alerts */}
      {error && (
        <div role="alert" className={`${errorBox} mb-4 flex items-center justify-between`}>
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-danger font-bold text-xs ml-2">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-800 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Filter Tabs & Dosage Form Pills */}
      <div className="mb-4 space-y-2.5">
        {/* Main Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              tab === "all"
                ? "bg-brand text-white shadow-sm"
                : "bg-canvas text-muted hover:bg-canvas-deep hover:text-ink"
            }`}
          >
            সব ওষুধ ({totalCount})
          </button>

          <button
            type="button"
            onClick={() => setTab("low-stock")}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              tab === "low-stock"
                ? "bg-amber-600 text-white shadow-sm"
                : lowStockCount > 0
                ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                : "bg-canvas text-muted hover:bg-canvas-deep"
            }`}
          >
            <span>⚠️ স্টক অ্যালার্ট</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${tab === "low-stock" ? "bg-white/20 text-white" : "bg-amber-200/60 text-amber-900"}`}>
              {lowStockCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("active")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              tab === "active"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-canvas text-muted hover:bg-canvas-deep hover:text-ink"
            }`}
          >
            সক্রিয় ({activeCount})
          </button>

          <button
            type="button"
            onClick={() => setTab("inactive")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              tab === "inactive"
                ? "bg-slate-700 text-white shadow-sm"
                : "bg-canvas text-muted hover:bg-canvas-deep hover:text-ink"
            }`}
          >
            বন্ধ ({inactiveCount})
          </button>
        </div>

        {/* Dosage Form Sub-filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-[11px] font-semibold text-muted shrink-0 mr-1">ধরন:</span>
          <button
            type="button"
            onClick={() => setSelectedForm("all")}
            className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
              selectedForm === "all"
                ? "bg-brand-tint text-brand-strong font-bold border border-brand-line"
                : "bg-canvas text-muted hover:text-ink"
            }`}
          >
            সব ধরন
          </button>
          {MEDICINE_FORMS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSelectedForm(selectedForm === f ? "all" : f)}
              className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
                selectedForm === f
                  ? "bg-brand-tint text-brand-strong font-bold border border-brand-line"
                  : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              {unitLabelsFor(f).formLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Medicine List Content */}
      {displayedRows.length === 0 ? (
        <div className={`${card} p-10 text-center space-y-3`}>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-2xl">
            🔍
          </div>
          <p className="text-sm font-semibold text-ink">কোনো মেডিসিন পাওয়া যায়নি</p>
          <p className="text-xs text-muted max-w-xs mx-auto">
            {search
              ? `"${search}" দিয়ে কোনো ফলাফল পাওয়া যায়নি। ফিল্টার পরিবর্তন করে দেখতে পারেন।`
              : "এই ফিল্টারে বর্তমানে কোনো মেডিসিন নেই।"}
          </p>
          {(search || tab !== "all" || selectedForm !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTab("all");
                setSelectedForm("all");
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-canvas-deep px-3.5 py-2 text-xs font-bold text-ink hover:bg-line transition"
            >
              ফিল্টার রিসেট করুন
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <DesktopRows
            rows={displayedRows}
            onEdit={(row) => setEditingId(row.id)}
            onStockIn={(row) => {
              setStockInTarget(row);
              setStockBoxes("");
              setStockNote("");
              setStockInError("");
            }}
            onDeactivate={handleDeactivate}
            onDelete={handleDelete}
            deactivatingId={deactivatingId}
            deletingId={deletingId}
          />

          {/* Mobile Card List View */}
          <MobileCards
            rows={displayedRows}
            onEdit={(row) => setEditingId(row.id)}
            onStockIn={(row) => {
              setStockInTarget(row);
              setStockBoxes("");
              setStockNote("");
              setStockInError("");
            }}
            onDeactivate={handleDeactivate}
            onDelete={handleDelete}
            deactivatingId={deactivatingId}
            deletingId={deletingId}
          />
        </>
      )}

      {/* Quick Stock-In Modal */}
      {stockInTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-surface border border-line p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-strong bg-brand-tint px-2 py-0.5 rounded-full">
                  কুইক স্টক ইন
                </span>
                <h3 className="font-display text-lg font-bold text-ink mt-1">
                  {stockInTarget.name}
                </h3>
                <p className="text-xs text-muted">{stockInTarget.genericName || stockInTarget.company}</p>
              </div>
              <button
                type="button"
                onClick={() => setStockInTarget(null)}
                className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink transition"
              >
                ✕
              </button>
            </div>

            {/* Current Stock Banner */}
            <div className="rounded-2xl bg-canvas p-3 flex items-center justify-between text-xs">
              <span className="text-muted">বর্তমান স্টক:</span>
              <span className="font-bold text-ink">
                {formatStock(stockInTarget.stockPatas, stockInTarget.patasPerBox, stockInTarget.form)}
              </span>
            </div>

            {/* Stock In Form */}
            <form onSubmit={handleQuickStockIn} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink">
                  কত {unitLabelsFor(stockInTarget.form).outer} ঢুকলো?
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    autoFocus
                    required
                    value={stockBoxes}
                    onChange={(e) => setStockBoxes(e.target.value)}
                    placeholder="বক্স/পিস সংখ্যা লিখুন"
                    className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                    {unitLabelsFor(stockInTarget.form).outer}
                  </span>
                </div>

                {/* Presets */}
                <div className="flex gap-1.5 pt-1">
                  {[1, 5, 10, 20, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setStockBoxes(String(num))}
                      className="flex-1 rounded-xl bg-canvas hover:bg-brand-tint hover:text-brand-strong py-1 text-xs font-bold text-muted transition"
                    >
                      +{num}
                    </button>
                  ))}
                </div>

                {/* Calculated pata preview */}
                {stockBoxes && Number(stockBoxes) > 0 && !isPieceOnlyForm(stockInTarget.form) && (
                  <p className="text-xs text-brand-strong font-medium">
                    = {boxesToPatas(Number(stockBoxes), stockInTarget.patasPerBox)} {unitLabelsFor(stockInTarget.form).inner} যুক্ত হবে
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink">নোট (ঐচ্ছিক)</label>
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  placeholder="যেমন: নতুন চালানের স্টক বা ফেরত"
                  className="w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {stockInError && (
                <p className="text-xs font-semibold text-danger bg-danger-bg p-2.5 rounded-xl">
                  {stockInError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStockInTarget(null)}
                  className="flex-1 rounded-2xl border border-line py-3 text-xs font-bold text-muted hover:bg-canvas transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={stockInBusy}
                  className="flex-1 rounded-2xl bg-brand hover:bg-brand-strong py-3 text-xs font-bold text-white shadow-md shadow-brand/20 transition disabled:opacity-50"
                >
                  {stockInBusy ? "যোগ হচ্ছে..." : "✓ স্টক নিশ্চিত করুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StockStatusBadge({
  stockPatas,
  threshold,
  patasPerBox,
  form,
}: {
  stockPatas: number;
  threshold: number;
  patasPerBox: number;
  form: DosageForm;
}) {
  const isOutOfStock = stockPatas <= 0;
  const isLowStock = !isOutOfStock && threshold > 0 && stockPatas <= threshold;

  if (isOutOfStock) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
        স্টক শেষ
      </span>
    );
  }

  if (isLowStock) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        স্টক কম
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      পর্যাপ্ত স্টক
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
        active
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-slate-100 text-slate-600 border border-slate-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {active ? "সক্রিয়" : "বন্ধ"}
    </span>
  );
}

function DosageFormBadge({ form }: { form: DosageForm }) {
  const formStr = String(form).toLowerCase();
  const colorMap: Record<string, string> = {
    tablet: "bg-sky-50 text-sky-700 border-sky-200",
    syrup: "bg-amber-50 text-amber-700 border-amber-200",
    injection: "bg-purple-50 text-purple-700 border-purple-200",
    cream: "bg-rose-50 text-rose-700 border-rose-200",
    drops: "bg-teal-50 text-teal-700 border-teal-200",
    other: "bg-slate-50 text-slate-700 border-slate-200",
  };

  const badgeClass = colorMap[formStr] || "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
      {unitLabelsFor(form).formLabel}
    </span>
  );
}

function DesktopRows({
  rows,
  onEdit,
  onStockIn,
  onDeactivate,
  onDelete,
  deactivatingId,
  deletingId,
}: {
  rows: MedicineRow[];
  onEdit: (row: MedicineRow) => void;
  onStockIn: (row: MedicineRow) => void;
  onDeactivate: (row: MedicineRow) => void;
  onDelete: (row: MedicineRow) => void;
  deactivatingId: string | null;
  deletingId: string | null;
}) {
  return (
    <div className={`hidden overflow-x-auto md:block ${card}`}>
      <table className="w-full">
        <thead className={thead}>
          <tr>
            <th className={th}>ওষুধ ও বিবরণ</th>
            <th className={th}>কোম্পানি</th>
            <th className={th}>প্যাক সাইজ</th>
            <th className={th}>পাইকারি রেট</th>
            <th className={th}>খুচরা রেট</th>
            <th className={th}>বর্তমান স্টক</th>
            <th className={th}>স্ট্যাটাস</th>
            <th className={`${th} text-right`}>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const labels = unitLabelsFor(row.form);
            const isPiece = isPieceOnlyForm(row.form);
            return (
              <tr key={row.id} className={`${trow} transition hover:bg-canvas-subtle`}>
                <td className={`${td} font-medium text-ink`}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{row.name}</span>
                      <DosageFormBadge form={row.form} />
                    </div>
                    {row.genericName && (
                      <span className="text-[11px] text-muted mt-0.5 font-normal">
                        {row.genericName}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`${td} text-xs text-muted font-medium`}>{row.company || "—"}</td>
                <td className={`${td} text-xs text-muted`}>
                  {isPiece ? (
                    <span className="font-medium text-ink">পিস</span>
                  ) : (
                    <span>
                      {row.patasPerBox} {labels.inner} / {labels.outer}
                    </span>
                  )}
                </td>
                <td className={`${td} text-xs font-semibold text-ink`}>
                  <div>{formatTaka(row.wholesaleBoxPricePaisa)} <span className="text-[10px] text-muted">/{labels.outer}</span></div>
                  {!isPiece && (
                    <div className="text-[10px] text-muted font-normal">
                      {formatTaka(row.wholesalePataPricePaisa)} /{labels.inner}
                    </div>
                  )}
                </td>
                <td className={`${td} text-xs font-semibold text-ink`}>
                  <div>{formatTaka(row.retailBoxPricePaisa)} <span className="text-[10px] text-muted">/{labels.outer}</span></div>
                  {!isPiece && (
                    <div className="text-[10px] text-muted font-normal">
                      {formatTaka(row.retailPataPricePaisa)} /{labels.inner}
                    </div>
                  )}
                </td>
                <td className={td}>
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-ink">
                      {formatStock(row.stockPatas, row.patasPerBox, row.form)}
                    </div>
                    <StockStatusBadge
                      stockPatas={row.stockPatas}
                      threshold={row.lowStockThreshold}
                      patasPerBox={row.patasPerBox}
                      form={row.form}
                    />
                  </div>
                </td>
                <td className={td}>
                  <StatusPill active={row.active} />
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onStockIn(row)}
                      title="স্টক যোগ করুন"
                      className="rounded-xl bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-strong hover:bg-brand-tint-2 transition"
                    >
                      + স্টক
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      className="rounded-xl bg-canvas px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas-deep transition"
                    >
                      এডিট
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeactivate(row)}
                      disabled={deactivatingId === row.id || deletingId === row.id}
                      className="rounded-xl px-2.5 py-1 text-xs font-semibold text-muted hover:bg-amber-100 hover:text-amber-800 disabled:opacity-50 transition"
                    >
                      {deactivatingId === row.id ? "..." : row.active ? "বন্ধ" : "চালু"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={deactivatingId === row.id || deletingId === row.id}
                      className="rounded-xl px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-50 transition"
                    >
                      {deletingId === row.id ? "..." : "মুছুন"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  rows,
  onEdit,
  onStockIn,
  onDeactivate,
  onDelete,
  deactivatingId,
  deletingId,
}: {
  rows: MedicineRow[];
  onEdit: (row: MedicineRow) => void;
  onStockIn: (row: MedicineRow) => void;
  onDeactivate: (row: MedicineRow) => void;
  onDelete: (row: MedicineRow) => void;
  deactivatingId: string | null;
  deletingId: string | null;
}) {
  return (
    <div className="space-y-3.5 md:hidden">
      {rows.map((row) => {
        const labels = unitLabelsFor(row.form);
        const isPiece = isPieceOnlyForm(row.form);
        const isOutOfStock = row.stockPatas <= 0;
        const isLowStock = !isOutOfStock && row.lowStockThreshold > 0 && row.stockPatas <= row.lowStockThreshold;

        return (
          <div
            key={row.id}
            className={`rounded-3xl border bg-surface p-4 shadow-sm space-y-3 transition-all ${
              !row.active
                ? "border-line bg-slate-50/50 opacity-80"
                : isOutOfStock
                ? "border-rose-200 bg-gradient-to-b from-rose-50/20 to-surface"
                : isLowStock
                ? "border-amber-200 bg-gradient-to-b from-amber-50/20 to-surface"
                : "border-line"
            }`}
          >
            {/* Header: Name, Generic, Form & Status */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-base font-extrabold text-ink leading-snug">
                    {row.name}
                  </span>
                  <DosageFormBadge form={row.form} />
                </div>
                {row.genericName && (
                  <div className="text-xs text-muted font-medium truncate">
                    {row.genericName}
                  </div>
                )}
                {row.company && (
                  <div className="text-[11px] text-muted/90 flex items-center gap-1">
                    <span>🏢</span>
                    <span>{row.company}</span>
                    {!isPiece && (
                      <span className="text-muted/60">• ({row.patasPerBox} {labels.inner}/{labels.outer})</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <StatusPill active={row.active} />
                <StockStatusBadge
                  stockPatas={row.stockPatas}
                  threshold={row.lowStockThreshold}
                  patasPerBox={row.patasPerBox}
                  form={row.form}
                />
              </div>
            </div>

            {/* Pricing & Stock Card Matrix */}
            <div className="rounded-2xl bg-canvas p-3 border border-line/60 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Wholesale Price Box */}
                <div className="rounded-xl bg-surface p-2.5 border border-line/50">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider">
                    পাইকারি রেট
                  </div>
                  <div className="text-sm font-extrabold text-ink mt-0.5">
                    {formatTaka(row.wholesaleBoxPricePaisa)}
                    <span className="text-[10px] font-normal text-muted"> /{labels.outer}</span>
                  </div>
                  {!isPiece && (
                    <div className="text-[11px] font-semibold text-brand-strong">
                      {formatTaka(row.wholesalePataPricePaisa)}
                      <span className="text-[10px] font-normal text-muted"> /{labels.inner}</span>
                    </div>
                  )}
                </div>

                {/* Retail Price Box */}
                <div className="rounded-xl bg-surface p-2.5 border border-line/50">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider">
                    খুচরা রেট
                  </div>
                  <div className="text-sm font-extrabold text-ink mt-0.5">
                    {formatTaka(row.retailBoxPricePaisa)}
                    <span className="text-[10px] font-normal text-muted"> /{labels.outer}</span>
                  </div>
                  {!isPiece && (
                    <div className="text-[11px] font-semibold text-emerald-700">
                      {formatTaka(row.retailPataPricePaisa)}
                      <span className="text-[10px] font-normal text-muted"> /{labels.inner}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Bar */}
              <div className="flex items-center justify-between pt-0.5 px-1 text-xs">
                <span className="text-muted font-medium">বর্তমান ইনভেন্টরি:</span>
                <span className={`font-extrabold text-sm ${
                  isOutOfStock ? "text-rose-600 font-black" : isLowStock ? "text-amber-600" : "text-ink"
                }`}>
                  {formatStock(row.stockPatas, row.patasPerBox, row.form)}
                </span>
              </div>
            </div>

            {/* Mobile Actions Bar */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onStockIn(row)}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-brand-tint border border-brand-line py-2.5 text-xs font-bold text-brand-strong transition active:scale-95 hover:bg-brand-tint-2"
              >
                <span>📦</span>
                <span>+ স্টক যোগ</span>
              </button>

              <button
                type="button"
                onClick={() => onEdit(row)}
                className="inline-flex items-center justify-center gap-1 rounded-2xl bg-canvas border border-line py-2.5 text-xs font-bold text-ink transition active:scale-95 hover:bg-canvas-deep"
              >
                <span>✏️</span>
                <span>এডিট</span>
              </button>

              <button
                type="button"
                onClick={() => onDeactivate(row)}
                disabled={deactivatingId === row.id || deletingId === row.id}
                className="inline-flex items-center justify-center rounded-2xl bg-canvas border border-line py-2.5 text-xs font-bold text-muted hover:bg-amber-50 hover:text-amber-800 transition active:scale-95 disabled:opacity-50"
              >
                {deactivatingId === row.id ? "..." : row.active ? "বন্ধ" : "চালু"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
