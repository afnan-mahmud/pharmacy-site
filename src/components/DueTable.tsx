"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";
import type { DueRow } from "@/actions/due";
import type { BuyerLedgerResult } from "@/actions/due";
import { BuyerLedger } from "./BuyerLedger";
import { card, pageTitle, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

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

  const td = tdCls;
  // "Mot baki" only sums what buyers actually owe — folding in negative
  // (credit) balances would understate the real total outstanding and mask
  // it behind buyers who happen to be in credit. Credit is called out
  // separately so the owner sees both figures honestly rather than one
  // number that quietly nets them together. Shared with the dashboard via
  // splitDueTotals so the two screens cannot drift into disagreeing.
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className={pageTitle}>Baki Khata</h1>
        <div className="text-right text-sm">
          <div className="text-muted">
            Mot baki:{" "}
            <span className="font-display font-extrabold text-danger">
              {formatTaka(totalDuePaisa)}
            </span>
          </div>
          {totalCreditPaisa > 0 && (
            <div className="text-xs text-brand-strong">
              Buyer der total joma ache: {formatTaka(totalCreditPaisa)}
            </div>
          )}
        </div>
      </div>

      {error && <p role="alert" className={errorBox}>{error}</p>}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Buyer</th>
              <th className={`${th} text-right`}>Hisab (৳)</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {dues.map((row) => {
              const due = describeDue(row.duePaisa);
              return (
                <tr key={row.buyerId} className={trow}>
                  <td className={td}>
                    <div className="font-semibold text-ink">{row.buyerName}</div>
                    <div className="text-xs text-muted">{row.buyerShopName}</div>
                  </td>
                  <td className={`${td} text-right font-medium ${due.className}`}>
                    {due.label !== "Baki nei" ? `${due.label} ${due.amountText}` : due.label}
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => handleOpen(row)}
                      disabled={loadingId === row.buyerId}
                      className="rounded-full px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint disabled:opacity-50"
                    >
                      {loadingId === row.buyerId ? "Khulche..." : "Hisab dekhun"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {dues.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-muted">
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
