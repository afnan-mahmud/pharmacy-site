"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateMedicine } from "@/actions/medicines";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { unitLabelsFor } from "@/lib/unitLabels";
import { MedicineForm, type MedicineFormValues } from "./MedicineForm";
import {
  card,
  pageTitle,
  btnPrimary,
  thead,
  th,
  td,
  trow,
  errorBox,
} from "@/components/ui";

export type MedicineRow = MedicineFormValues & {
  id: string;
  stockPatas: number;
};

export function MedicineTable({ medicines }: { medicines: MedicineRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MedicineRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  async function handleDeactivate(row: MedicineRow) {
    setError("");
    setDeactivatingId(row.id);
    try {
      await deactivateMedicine(row.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setDeactivatingId(null);
    }
  }

  if (adding || editing) {
    return (
      <MedicineForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className={pageTitle}>Medicine</h1>
        <button onClick={() => setAdding(true)} className={btnPrimary}>
          + Notun medicine
        </button>
      </div>

      {error && <p role="alert" className={errorBox}>{error}</p>}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Nam</th>
              <th className={th}>Company</th>
              <th className={th}>Pack</th>
              <th className={th}>Pack rate</th>
              <th className={th}>Khuchra rate</th>
              <th className={th}>Stock</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted">
                  Kono medicine nai. Upor theke add koro.
                </td>
              </tr>
            )}
            {medicines.map((row) => {
              const low = row.stockPatas <= row.lowStockThreshold;
              return (
                <tr key={row.id} className={trow}>
                  <td className={td}>
                    <div className="font-semibold text-ink">{row.name}</div>
                    <div className="text-xs text-muted">{row.genericName}</div>
                  </td>
                  <td className={`${td} text-muted`}>{row.company}</td>
                  <td className={`${td} text-muted`}>
                    {row.patasPerBox} {unitLabelsFor(row.form).inner}/
                    {unitLabelsFor(row.form).outer}
                  </td>
                  <td className={`${td} font-medium`}>{formatTaka(row.boxPricePaisa)}</td>
                  <td className={td}>{formatTaka(row.pataPricePaisa)}</td>
                  <td className={`${td} ${low ? "font-semibold text-danger" : ""}`}>
                    {formatStock(row.stockPatas, row.patasPerBox, row.form)}
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => setEditing(row)}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeactivate(row)}
                      disabled={deactivatingId === row.id}
                      className="ml-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                    >
                      Off
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
