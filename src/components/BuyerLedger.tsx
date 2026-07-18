"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTaka } from "@/lib/money";
import { describeDue } from "@/lib/dueDisplay";
import { recordPayment, type BuyerLedgerResult } from "@/actions/due";
import Link from "next/link";
import { card, input, btnPrimary, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

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

  const currentDue = describeDue(duePaisa);

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

  const td = tdCls;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            onClick={onClose}
            className="mb-1 text-xs font-semibold text-muted hover:text-brand-strong"
          >
            ← Baki Khata
          </button>
          <h2 className="font-display text-lg font-extrabold text-ink">{buyerName}</h2>
          {buyerShopName && <p className="text-sm text-muted">{buyerShopName}</p>}
          <p className={`text-sm font-semibold ${currentDue.className}`}>
            {currentDue.label !== "Baki nei"
              ? `${currentDue.label}: ${currentDue.amountText}`
              : currentDue.label}
          </p>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-display text-sm font-bold text-ink">Joma nin</h3>
        <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Taka</label>
            <input type="number" step="0.01" min={0} required className={input}
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted">Note</label>
            <input type="text" className={input} placeholder="Cash / Bank"
              value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !payAmount} className={btnPrimary}>
            {busy ? "Wait..." : "Joma add koro"}
          </button>
        </form>
        {error && <p role="alert" className={`mt-3 ${errorBox}`}>{error}</p>}
      </div>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Biboron</th>
              <th className={`${th} text-right`}>Baki (৳)</th>
              <th className={`${th} text-right`}>Joma (৳)</th>
              <th className={`${th} text-right`}>Balance (৳)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBalance = describeDue(r.balance);
              return (
                <tr key={r.id} className={trow}>
                  <td className={`${td} text-muted`}>
                    {r.date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </td>
                  <td className={td}>
                    {r.link ? (
                      <Link href={r.link} className="font-medium text-brand-strong hover:underline">
                        {r.desc}
                      </Link>
                    ) : (
                      r.desc
                    )}
                  </td>
                  <td className={`${td} text-right text-danger`}>
                    {r.debit > 0 ? formatTaka(r.debit) : "—"}
                  </td>
                  <td className={`${td} text-right text-brand-strong`}>
                    {r.credit > 0 ? formatTaka(r.credit) : "—"}
                  </td>
                  <td className={`${td} text-right font-medium ${rowBalance.className}`}>
                    {rowBalance.label !== "Baki nei"
                      ? `${rowBalance.amountText} (${rowBalance.label})`
                      : rowBalance.amountText}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted">
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
