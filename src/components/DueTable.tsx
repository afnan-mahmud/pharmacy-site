"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
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

  async function handleOpen(row: DueRow) {
    setLoadingId(row.buyerId);
    try {
      const data = await fetchLedger(row.buyerId);
      setOpenLedger({
        id: row.buyerId,
        name: row.buyerName,
        shopName: row.buyerShopName,
        duePaisa: row.duePaisa,
        data,
      });
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
  const totalDuePaisa = dues.reduce((sum, row) => sum + row.duePaisa, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Baki Khata</h1>
        <div className="text-sm">
          Mot baki: <span className="font-bold text-red-600">{formatTaka(totalDuePaisa)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className={td}>Buyer</th>
              <th className={`${td} text-right`}>Baki (৳)</th>
              <th className={td}></th>
            </tr>
          </thead>
          <tbody>
            {dues.map((row) => (
              <tr key={row.buyerId} className="border-b border-slate-100">
                <td className={td}>
                  <div className="font-medium text-slate-900">{row.buyerName}</div>
                  <div className="text-xs text-slate-500">{row.buyerShopName}</div>
                </td>
                <td className={`${td} text-right font-medium text-red-600`}>
                  {formatTaka(row.duePaisa)}
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
            ))}
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
