"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTaka } from "@/lib/money";
import { recordPayment, type BuyerLedgerResult } from "@/actions/due";
import Link from "next/link";

type Props = {
  buyerId: string;
  buyerName: string;
  buyerShopName: string;
  duePaisa: number;
  ledger: BuyerLedgerResult;
  onClose: () => void;
};

type Entry = {
  id: string;
  date: Date;
  type: "sale" | "payment";
  desc: string;
  debit: number; // Increases due
  credit: number; // Decreases due
  link?: string;
};

export function BuyerLedger({ buyerId, buyerName, buyerShopName, duePaisa, ledger, onClose }: Props) {
  const router = useRouter();
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const entries: Entry[] = [];

  for (const s of ledger.sales) {
    if (s.status === "cancelled") continue;
    // For a sale, the amount added to their due balance is s.duePaisa
    // (since they already paid s.paidPaisa out of the total at the time of sale).
    entries.push({
      id: s._id as string,
      date: new Date(s.createdAt),
      type: "sale",
      desc: `Invoice ${s.invoiceNo}`,
      debit: s.duePaisa,
      credit: 0,
      link: `/invoice/${s._id}`,
    });
  }

  for (const p of ledger.payments) {
    entries.push({
      id: p._id as string,
      date: new Date(p.createdAt),
      type: "payment",
      desc: p.note ? `Joma — ${p.note}` : "Joma",
      debit: 0,
      credit: p.amountPaisa,
    });
  }

  // Oldest first
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  const rows = entries.map((e) => {
    runningBalance = runningBalance + e.debit - e.credit;
    return { ...e, balance: runningBalance };
  });

  // Most recent first for display
  rows.reverse();

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await recordPayment(buyerId, Number(payAmount), payNote);
      setPayAmount("");
      setPayNote("");
      router.refresh();
      // Keep it open to see the new payment in the ledger
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const td = "px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{buyerName}</h2>
          {buyerShopName && <p className="text-sm text-slate-500">{buyerShopName}</p>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          × Bondho
        </button>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-slate-900">Joma Nin</h3>
        <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Taka</label>
            <input type="number" step="0.01" min={0} required className={field}
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-slate-500">Note</label>
            <input type="text" className={field} placeholder="Cash / Bank"
              value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !payAmount}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Wait..." : "Joma add koro"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className={td}>Date</th>
              <th className={td}>Biboron</th>
              <th className={`${td} text-right`}>Baki (৳)</th>
              <th className={`${td} text-right`}>Joma (৳)</th>
              <th className={`${td} text-right font-semibold`}>Balance (৳)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className={td}>
                  {r.date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                </td>
                <td className={td}>
                  {r.link ? (
                    <Link href={r.link} className="text-teal-700 hover:underline">
                      {r.desc}
                    </Link>
                  ) : (
                    r.desc
                  )}
                </td>
                <td className={`${td} text-right text-red-600`}>
                  {r.debit > 0 ? formatTaka(r.debit) : "—"}
                </td>
                <td className={`${td} text-right text-teal-700`}>
                  {r.credit > 0 ? formatTaka(r.credit) : "—"}
                </td>
                <td className={`${td} text-right font-medium text-slate-900`}>
                  {formatTaka(Math.max(0, r.balance))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  Kono record nai.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
