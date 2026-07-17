"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";
import type { DueRow } from "@/actions/due";
import type { BuyerLedgerResult } from "@/actions/due";
import { BuyerLedger } from "./BuyerLedger";

type Props = {
  dues: DueRow[];
  fetchLedger: (buyerId: string) => Promise<BuyerLedgerResult>;
};

export function DueTable({ dues, fetchLedger }: Props) {
  const [openLedger, setOpenLedger] = useState<{
    id: string;
    name: string;
    shopName: string;
    duePaisa: number;
    data: BuyerLedgerResult;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleOpen(row: DueRow) {
    setLoadingId(row.buyerId);
    setError("");
    try {
      const data = await fetchLedger(row.buyerId);
      setOpenLedger({
        id: row.buyerId,
        name: row.buyerName,
        shopName: row.buyerShopName,
        duePaisa: row.duePaisa,
        data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setLoadingId(null);
    }
  }

  if (openLedger) {
    return (
      <BuyerLedger
        buyerId={openLedger.id}
        buyerName={openLedger.name}
        buyerShopName={openLedger.shopName}
        duePaisa={openLedger.duePaisa}
        ledger={openLedger.data}
        onClose={() => setOpenLedger(null)}
      />
    );
  }

  const td = "px-3 py-3 text-sm";
  // "Mot baki" only sums what buyers actually owe — folding in negative
  // (credit) balances would understate the real total outstanding and mask
  // it behind buyers who happen to be in credit. Credit is called out
  // separately so the owner sees both figures honestly rather than one
  // number that quietly nets them together. Shared with the dashboard via
  // splitDueTotals so the two screens cannot drift into disagreeing.
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Baki Khata</h1>
        <div className="text-right text-sm">
          <div>
            Mot baki: <span className="font-bold text-red-600">{formatTaka(totalDuePaisa)}</span>
          </div>
          {totalCreditPaisa > 0 && (
            <div className="text-xs text-teal-700">
              Buyer der total joma ache: {formatTaka(totalCreditPaisa)}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className={td}>Buyer</th>
              <th className={`${td} text-right`}>Hisab (৳)</th>
              <th className={td}></th>
            </tr>
          </thead>
          <tbody>
            {dues.map((row) => {
              const due = describeDue(row.duePaisa);
              return (
                <tr key={row.buyerId} className="border-b border-slate-100">
                  <td className={td}>
                    <div className="font-medium text-slate-900">{row.buyerName}</div>
                    <div className="text-xs text-slate-500">{row.buyerShopName}</div>
                  </td>
                  <td className={`${td} text-right font-medium ${due.className}`}>
                    {due.label !== "Baki nei" ? `${due.label} ${due.amountText}` : due.label}
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => handleOpen(row)}
                      disabled={loadingId === row.buyerId}
                      className="text-teal-700 hover:underline disabled:opacity-50"
                    >
                      {loadingId === row.buyerId ? "Khulche..." : "Hisab dekhun"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {dues.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-400">
                  Kono baki nai.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
