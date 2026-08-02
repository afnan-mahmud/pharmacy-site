"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";
import type { RetailDueRow, RetailLedgerResult } from "@/actions/due";
import { RetailLedger } from "./RetailLedger";
import { card, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

type Props = {
  dues: RetailDueRow[];
  fetchLedger: (phone: string) => Promise<RetailLedgerResult>;
};

export function RetailDueTable({ dues, fetchLedger }: Props) {
  const [openLedger, setOpenLedger] = useState<{
    phone: string;
    name: string;
    duePaisa: number;
    data: RetailLedgerResult;
  } | null>(null);
  const [loadingPhone, setLoadingPhone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? dues.filter((row) => row.customerName.toLowerCase().includes(search.toLowerCase()))
    : dues;

  async function handleOpen(row: RetailDueRow) {
    setLoadingPhone(row.phone);
    setError("");
    try {
      const data = await fetchLedger(row.phone);
      setOpenLedger({ phone: row.phone, name: row.customerName, duePaisa: row.duePaisa, data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setLoadingPhone(null);
    }
  }

  if (openLedger) {
    return (
      <RetailLedger
        phone={openLedger.phone}
        customerName={openLedger.name}
        duePaisa={openLedger.duePaisa}
        ledger={openLedger.data}
        onClose={() => setOpenLedger(null)}
      />
    );
  }

  const td = tdCls;
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">Khuchra Baki</h1>
            <p className="text-sm text-white/90">Khuchra customer der baki hisab.</p>
          </div>
          <div className="text-left md:text-right">
            <div className="text-sm text-white/80">Mot baki</div>
            <div className="font-display text-3xl font-extrabold text-yellow-300">{formatTaka(totalDuePaisa)}</div>
            {totalCreditPaisa > 0 && (
              <div className="mt-1 text-xs font-medium text-white/90">
                Customer der joma ache: {formatTaka(totalCreditPaisa)}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 mt-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer er nam diye khojo..."
            className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white transition"
          />
        </div>
      </section>

      {error && <p role="alert" className={`${errorBox} mb-4 mx-2`}>{error}</p>}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Customer</th>
              <th className={`${th} text-right`}>Hisab (৳)</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const due = describeDue(row.duePaisa);
              return (
                <tr key={row.phone} className={trow}>
                  <td className={td}>
                    <div className="font-semibold text-ink">{row.customerName || "(naam nai)"}</div>
                    <div className="text-xs text-muted">{row.phone}</div>
                  </td>
                  <td className={`${td} text-right font-medium ${due.className}`}>
                    {due.label !== "Baki nei" ? `${due.label} ${due.amountText}` : due.label}
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => handleOpen(row)}
                      disabled={loadingPhone === row.phone}
                      className="rounded-full px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint disabled:opacity-50"
                    >
                      {loadingPhone === row.phone ? "Khulche..." : "Hisab dekhun"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-muted">
                  {search.trim() ? `"${search}" e kono customer pawa jay ni.` : "Kono baki nai."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
