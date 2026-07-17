"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBuyerActive } from "@/actions/buyers";
import { BuyerForm, type BuyerFormValues } from "./BuyerForm";

export type BuyerRow = BuyerFormValues & {
  id: string;
  active: boolean;
};

export function BuyerTable({ buyers }: { buyers: BuyerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BuyerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(row: BuyerRow) {
    setError("");
    setTogglingId(row.id);
    try {
      await setBuyerActive(row.id, !row.active);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Wholesale Buyer</h1>
        <button onClick={() => setAdding(true)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          + Notun buyer
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="p-3">Nam</th>
              <th className="p-3">Dokan</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Address</th>
              <th className="p-3">Obostha</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {buyers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  Kono buyer nai. Upor theke add koro.
                </td>
              </tr>
            )}
            {buyers.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="p-3 font-medium text-slate-900">{row.name}</td>
                <td className="p-3 text-slate-600">{row.shopName}</td>
                <td className="p-3 text-slate-600">{row.phone}</td>
                <td className="p-3 text-slate-500">{row.address}</td>
                <td className="p-3">
                  <span className={row.active ? "text-teal-700" : "text-slate-400"}>
                    {row.active ? "Chalu" : "Bondho"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing(row)}
                    className="text-teal-700 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleToggle(row)}
                    disabled={togglingId === row.id}
                    className="ml-3 text-slate-400 hover:text-red-600 disabled:opacity-50">
                    {row.active ? "Bondho" : "Chalu"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
