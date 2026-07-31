"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toggleMedicineActive, deleteMedicine, listMedicines } from "@/actions/medicines";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { unitLabelsFor, toMedicineForm } from "@/lib/unitLabels";
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

export function MedicineTable({ medicines }: { medicines: MedicineRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [filteredMedicines, setFilteredMedicines] = useState(medicines);
  const [searching, setSearching] = useState(false);

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

  const actions = (row: MedicineRow) => (
    <>
      <button
        onClick={() => setEditingId(row.id)}
        className="rounded-full px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint"
      >
        Edit
      </button>
      <button
        onClick={() => handleDeactivate(row)}
        disabled={deactivatingId === row.id || deletingId === row.id}
        className="ml-2 rounded-full px-3 py-1 text-xs font-semibold text-muted hover:bg-yellow-100 hover:text-yellow-800 disabled:opacity-50 transition"
      >
        {deactivatingId === row.id ? "..." : row.active ? "Bondho" : "Chalu"}
      </button>
      <button
        onClick={() => handleDelete(row)}
        disabled={deactivatingId === row.id || deletingId === row.id}
        className="ml-2 rounded-full px-3 py-1 text-xs font-semibold text-danger hover:bg-danger-bg transition disabled:opacity-50"
      >
        {deletingId === row.id ? "..." : "Delete"}
      </button>
    </>
  );

  async function handleDeactivate(row: MedicineRow) {
    setError("");
    setDeactivatingId(row.id);
    try {
      const result = await toggleMedicineActive(row.id, !row.active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleDelete(row: MedicineRow) {
    if (!window.confirm(`Apni ki "${row.name}" ekebare delete korte chan?`)) return;
    setError("");
    setDeletingId(row.id);
    try {
      const result = await deleteMedicine(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setDeletingId(null);
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
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              Medicines
            </h1>
            <p className="text-sm text-white/90">
              Stock e thaka shob medicine er list.
            </p>
          </div>
          <button onClick={() => setAdding(true)} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-brand-strong shadow-lg transition hover:bg-brand-tint">
            + Notun medicine
          </button>
        </div>

        <div className="relative z-10 mt-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Medicine khojo..."
            className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white transition"
          />
          {searching && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/80">
              Khoja hocche...
            </span>
          )}
        </div>
      </section>

      {error && <p role="alert" className={`${errorBox} mb-4 mx-2`}>{error}</p>}

      {filteredMedicines.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          Kono medicine pawa jay ni.
        </p>
      ) : (
        <>
          <DesktopRows rows={filteredMedicines} actions={actions} />
          <MobileCards rows={filteredMedicines} actions={actions} />
        </>
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? "bg-brand-tint-2 text-brand-strong" : "bg-line text-muted"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brand" : "bg-muted"}`}
      />
      {active ? "Chalu" : "Bondho"}
    </span>
  );
}

function DesktopRows({
  rows,
  actions,
}: {
  rows: MedicineRow[];
  actions: (row: MedicineRow) => React.ReactNode;
}) {
  return (
    <div className={`hidden overflow-x-auto md:block ${card}`}>
      <table className="w-full">
        <thead className={thead}>
          <tr>
            <th className={th}>Nam</th>
            <th className={th}>Company</th>
            <th className={th}>Pack</th>
            <th className={th}>Wholesale Rate</th>
            <th className={th}>Khuchra rate</th>
            <th className={th}>Stock</th>
            <th className={th}>Obostha</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={trow}>
              <td className={`${td} font-medium text-ink`}>
                <div className="flex flex-col">
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-[10px] text-muted">{row.genericName}</span>
                </div>
              </td>
              <td className={`${td} text-xs text-muted`}>{row.company}</td>
              <td className={`${td} text-xs text-muted`}>
                {row.patasPerBox} {unitLabelsFor(row.form).inner} / {unitLabelsFor(row.form).outer}
              </td>
              <td className={`${td} font-medium text-ink`}>
                {formatTaka(row.wholesaleBoxPricePaisa)}
              </td>
              <td className={`${td} font-medium text-ink`}>
                {formatTaka(row.retailPataPricePaisa)} / {unitLabelsFor(row.form).inner}
              </td>
              <td className={td}>
                {formatStock(row.stockPatas, row.patasPerBox, row.form)}
              </td>
              <td className={td}>
                <StatusPill active={row.active} />
              </td>
              <td className={`${td} text-right whitespace-nowrap`}>
                {actions(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  rows,
  actions,
}: {
  rows: MedicineRow[];
  actions: (row: MedicineRow) => React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className={`${card} p-3.5`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-sm font-bold text-ink">
                {row.name}
              </div>
              <div className="text-[10px] text-muted">{row.genericName}</div>
            </div>
            <StatusPill active={row.active} />
          </div>
          <div className="mt-1 text-xs text-muted">{row.company}</div>
          
          <div className="mt-3 flex items-center justify-between rounded-lg bg-canvas p-2 text-xs">
            <div>
              <div className="text-muted">Wholesale Rate</div>
              <div className="font-semibold text-ink">{formatTaka(row.wholesaleBoxPricePaisa)}</div>
            </div>
            <div>
              <div className="text-muted">Khuchra Rate</div>
              <div className="font-semibold text-ink">{formatTaka(row.retailPataPricePaisa)}</div>
            </div>
          </div>
          
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-muted">Stock: </span>
              <span className="font-semibold text-ink">{formatStock(row.stockPatas, row.patasPerBox, row.form)}</span>
            </div>
            <div className="flex gap-1">{actions(row)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
