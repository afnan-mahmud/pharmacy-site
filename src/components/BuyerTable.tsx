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
        <h1 className="font-display text-lg font-extrabold text-ink">Wholesale Buyer</h1>
        <button onClick={() => setAdding(true)}
          className="rounded-full bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-white">
          + Notun buyer
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
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
                <td colSpan={6} className="p-6 text-center text-muted">
                  Kono buyer nai. Upor theke add koro.
                </td>
              </tr>
            )}
            {buyers.map((row) => (
              <tr key={row.id} className="border-b border-line">
                <td className="p-3 font-medium text-ink">{row.name}</td>
                <td className="p-3 text-muted">{row.shopName}</td>
                <td className="p-3 text-muted">{row.phone}</td>
                <td className="p-3 text-muted">{row.address}</td>
                <td className="p-3">
                  <span className={row.active ? "text-brand-strong" : "text-muted"}>
                    {row.active ? "Chalu" : "Bondho"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing(row)}
                    className="text-brand-strong hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleToggle(row)}
                    disabled={togglingId === row.id}
                    className="ml-3 text-muted hover:text-danger disabled:opacity-50">
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
