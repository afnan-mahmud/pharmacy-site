"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateMedicine } from "@/actions/medicines";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { MedicineForm, type MedicineFormValues } from "./MedicineForm";

export type MedicineRow = MedicineFormValues & {
  id: string;
  stockPatas: number;
};

export function MedicineTable({ medicines }: { medicines: MedicineRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MedicineRow | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleDeactivate(row: MedicineRow) {
    await deactivateMedicine(row.id);
    router.refresh();
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
        <h1 className="text-lg font-semibold text-slate-900">Medicine</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
        >
          + Notun medicine
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="p-3">Nam</th>
              <th className="p-3">Company</th>
              <th className="p-3">1 box</th>
              <th className="p-3">Box rate</th>
              <th className="p-3">Pata rate</th>
              <th className="p-3">Stock</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Kono medicine nai. Upor theke add koro.
                </td>
              </tr>
            )}
            {medicines.map((row) => {
              const low = row.stockPatas <= row.lowStockThreshold;
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="p-3">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.genericName}</div>
                  </td>
                  <td className="p-3 text-slate-600">{row.company}</td>
                  <td className="p-3 text-slate-600">{row.patasPerBox} pata</td>
                  <td className="p-3">{formatTaka(row.boxPricePaisa)}</td>
                  <td className="p-3">{formatTaka(row.pataPricePaisa)}</td>
                  <td className={`p-3 ${low ? "font-medium text-red-600" : "text-slate-700"}`}>
                    {formatStock(row.stockPatas, row.patasPerBox)}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(row)}
                      className="text-teal-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeactivate(row)}
                      className="ml-3 text-slate-400 hover:text-red-600">
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
