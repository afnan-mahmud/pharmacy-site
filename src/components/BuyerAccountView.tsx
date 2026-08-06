"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";
import { describeDue } from "@/lib/dueDisplay";
import { unitLabelsFor } from "@/lib/unitLabels";

export type BuyerSaleItem = {
  medicineName: string;
  unit: string;
  form?: string;
  quantity: number;
  leftoverPatas?: number;
  ratePaisa: number;
  lineTotalPaisa: number;
};

export type BuyerSaleRow = {
  _id: string;
  invoiceNo?: string | null;
  createdAt: string;
  status: "active" | "cancelled";
  subtotalPaisa: number;
  discountPercent?: number;
  discountPaisa?: number;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  previousDuePaisa?: number;
  items: BuyerSaleItem[];
};

export type BuyerPaymentRow = {
  _id: string;
  amountPaisa: number;
  note?: string;
  createdAt: string;
};

export type BuyerAccountProps = {
  pharmacyName: string;
  buyerName: string;
  buyerShopName: string;
  buyerPhone?: string;
  duePaisa: number;
  sales: BuyerSaleRow[];
  payments: BuyerPaymentRow[];
};

function formatQty(item: BuyerSaleItem) {
  const labels = unitLabelsFor(item.form);
  const leftover = item.leftoverPatas ?? 0;
  if (item.unit === "box") {
    const parts = [];
    if (item.quantity > 0) parts.push(`${item.quantity} ${labels.outer}`);
    if (leftover > 0) parts.push(`${leftover} ${labels.inner}`);
    return parts.length > 0 ? parts.join(" ") : `0 ${labels.outer}`;
  }
  return `${item.quantity} ${labels.inner}`;
}

export function BuyerAccountView({
  pharmacyName,
  buyerName,
  buyerShopName,
  buyerPhone,
  duePaisa,
  sales,
  payments,
}: BuyerAccountProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "payments">("overview");
  const [selectedSale, setSelectedSale] = useState<BuyerSaleRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "paid" | "cancelled">("all");

  const due = describeDue(duePaisa);

  // Financial statistics
  const activeSales = useMemo(() => sales.filter((s) => s.status === "active"), [sales]);
  const totalPurchasesPaisa = useMemo(
    () => activeSales.reduce((sum, s) => sum + s.totalPaisa, 0),
    [activeSales],
  );
  const totalDirectPaidPaisa = useMemo(
    () => activeSales.reduce((sum, s) => sum + s.paidPaisa, 0),
    [activeSales],
  );
  const totalLedgerPaidPaisa = useMemo(
    () => payments.reduce((sum, p) => sum + p.amountPaisa, 0),
    [payments],
  );
  const totalOverallPaidPaisa = totalDirectPaidPaisa + totalLedgerPaidPaisa;

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const invMatch = (sale.invoiceNo ?? "").toLowerCase().includes(searchQuery.toLowerCase().trim());
      const dateMatch = formatDhakaDate(sale.createdAt).toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesSearch = !searchQuery || invMatch || dateMatch;

      if (!matchesSearch) return false;

      if (statusFilter === "cancelled") return sale.status === "cancelled";
      if (statusFilter === "due") return sale.status === "active" && sale.duePaisa > 0;
      if (statusFilter === "paid") return sale.status === "active" && sale.duePaisa <= 0;
      return true;
    });
  }, [sales, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner & Due Summary */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand-strong to-brand-deep p-6 text-white shadow-xl">
        <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-y-1/4 -translate-x-1/4 h-48 w-48 rounded-full bg-black/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                <span>{buyerShopName || "দোকানের হিসাব"}</span>
              </div>
              {buyerPhone && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
                  <span>📞</span>
                  <span>{buyerPhone}</span>
                </div>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-black md:text-3xl font-display">
              {buyerName}
            </h1>
            <p className="mt-0.5 text-xs text-white/80">
              {pharmacyName} এর সাথে আপনার সার্বিক লেনদেন ও চালান বিবরণী
            </p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md min-w-[220px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">
                {due.label === "Baki"
                  ? "বর্তমান বকেয়া"
                  : due.label === "Joma ache"
                  ? "অগ্রিম জমা"
                  : "হিসাব ক্লিয়ার"}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                  duePaisa > 0
                    ? "bg-rose-500/80 text-white"
                    : duePaisa < 0
                    ? "bg-emerald-400 text-emerald-950"
                    : "bg-white/20 text-white"
                }`}
              >
                {duePaisa > 0 ? "বকেয়া" : duePaisa < 0 ? "জমা" : "পরিশোধিত"}
              </span>
            </div>
            <div className="mt-2 font-display text-3xl font-black tracking-tight text-white">
              {due.amountText}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Metric Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 font-bold text-lg">
              🛒
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">মোট ক্রয় (সক্রিয়)</div>
              <div className="font-display text-lg font-bold text-ink">
                {formatTaka(totalPurchasesPaisa)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-brand-strong font-bold text-lg">
              💰
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">মোট জমা / পরিশোধ</div>
              <div className="font-display text-lg font-bold text-brand-strong">
                {formatTaka(totalOverallPaidPaisa)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-lg">
              🧾
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">মোট চালান / ইনভয়েস</div>
              <div className="font-display text-lg font-bold text-ink">
                {sales.length} টি
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-line pb-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
            activeTab === "overview"
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:bg-surface hover:text-ink"
          }`}
        >
          <span>📊</span>
          <span>সারসংক্ষেপ (Overview)</span>
        </button>

        <button
          onClick={() => setActiveTab("sales")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
            activeTab === "sales"
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:bg-surface hover:text-ink"
          }`}
        >
          <span>🧾</span>
          <span>চালান ও ইনভয়েস ({sales.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
            activeTab === "payments"
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:bg-surface hover:text-ink"
          }`}
        >
          <span>💵</span>
          <span>জমা হিস্টোরি ({payments.length})</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Recent Invoices Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
                <span>🧾</span> সাম্প্রতিক ইনভয়েস
              </h2>
              {sales.length > 4 && (
                <button
                  onClick={() => setActiveTab("sales")}
                  className="text-xs font-bold text-brand-strong hover:underline"
                >
                  সবগুলো দেখুন ({sales.length}) →
                </button>
              )}
            </div>

            {sales.length === 0 ? (
              <div className="rounded-3xl border border-line bg-surface p-8 text-center text-sm text-muted">
                এখনো কোনো বিক্রয় চালান নেই।
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sales.slice(0, 4).map((sale) => (
                  <InvoiceCard
                    key={sale._id}
                    sale={sale}
                    onOpenModal={() => setSelectedSale(sale)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Recent Payments Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
                <span>💵</span> সাম্প্রতিক জমার রেকর্ড
              </h2>
              {payments.length > 4 && (
                <button
                  onClick={() => setActiveTab("payments")}
                  className="text-xs font-bold text-brand-strong hover:underline"
                >
                  সব জমা দেখুন ({payments.length}) →
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="rounded-3xl border border-line bg-surface p-8 text-center text-sm text-muted">
                এখনো কোনো সরাসরি জমা পাওয়া যায়নি।
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
                <div className="divide-y divide-line/70">
                  {payments.slice(0, 4).map((payment) => (
                    <div
                      key={payment._id}
                      className="flex items-center justify-between p-4 transition hover:bg-canvas"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-strong font-bold">
                          ৳
                        </div>
                        <div>
                          <div className="text-sm font-bold text-ink">
                            {formatTaka(payment.amountPaisa)}
                          </div>
                          <div className="text-xs text-muted">
                            {formatDhakaDate(payment.createdAt)}
                          </div>
                        </div>
                      </div>
                      {payment.note && (
                        <div className="max-w-[160px] truncate text-right text-xs text-muted italic">
                          {payment.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: Sales & Invoices with Search and Filter */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ইনভয়েস নং বা তারিখ দিয়ে খুঁজুন..."
                className="w-full rounded-xl border border-line bg-canvas pl-10 pr-4 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-brand text-white"
                    : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                সব ({sales.length})
              </button>
              <button
                onClick={() => setStatusFilter("due")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === "due"
                    ? "bg-rose-600 text-white"
                    : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                বকেয়া
              </button>
              <button
                onClick={() => setStatusFilter("paid")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === "paid"
                    ? "bg-emerald-600 text-white"
                    : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                পরিশোধিত
              </button>
              <button
                onClick={() => setStatusFilter("cancelled")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === "cancelled"
                    ? "bg-slate-700 text-white"
                    : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                বাতিল
              </button>
            </div>
          </div>

          {/* Invoices List / Grid */}
          {filteredSales.length === 0 ? (
            <div className="rounded-3xl border border-line bg-surface p-12 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm font-semibold text-ink">কোনো ইনভয়েস পাওয়া যায়নি</div>
              <p className="text-xs text-muted mt-1">
                আপনার অনুসন্ধানের সাথে মিল রেখে কোনো রেকর্ড পাওয়া যায়নি।
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredSales.map((sale) => (
                  <InvoiceCard
                    key={sale._id}
                    sale={sale}
                    onOpenModal={() => setSelectedSale(sale)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Payments */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
            <div>
              <div className="text-xs font-semibold text-muted">সর্বমোট জমা</div>
              <div className="font-display text-xl font-extrabold text-brand-strong">
                {formatTaka(totalLedgerPaidPaisa)}
              </div>
            </div>
            <div className="text-xs text-muted">মোট {payments.length} টি জমার রেকর্ড</div>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-3xl border border-line bg-surface p-12 text-center text-sm text-muted">
              এখনো কোনো জমার তথ্য নথিভুক্ত করা হয়নি।
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas/60 text-xs font-bold uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">তারিখ</th>
                    <th className="px-4 py-3 text-right">জমার পরিমাণ</th>
                    <th className="px-4 py-3">বিবরণ / নোট</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {payments.map((payment) => (
                    <tr key={payment._id} className="transition hover:bg-canvas/50">
                      <td className="px-4 py-3 font-medium text-ink">
                        {formatDhakaDate(payment.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-display font-bold text-brand-strong">
                        + {formatTaka(payment.amountPaisa)}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {payment.note || "সরাসরি জমা"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoice Details Modal */}
      {selectedSale && (
        <InvoiceDetailsModal
          sale={selectedSale}
          pharmacyName={pharmacyName}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </div>
  );
}

// ---------------- Sub Components ----------------

function InvoiceCard({
  sale,
  onOpenModal,
}: {
  sale: BuyerSaleRow;
  onOpenModal: () => void;
}) {
  const isCancelled = sale.status === "cancelled";
  const isDue = sale.status === "active" && sale.duePaisa > 0;
  const isPaid = sale.status === "active" && sale.duePaisa <= 0;

  return (
    <div
      onClick={onOpenModal}
      className={`group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-3xl border p-5 transition shadow-sm hover:shadow-md ${
        isCancelled
          ? "border-danger/30 bg-danger-bg/20 opacity-75"
          : "border-line bg-surface hover:border-brand/40"
      }`}
    >
      <div>
        {/* Card Header: Invoice # & Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-extrabold text-ink group-hover:text-brand-strong transition">
              #{sale.invoiceNo || "চালান"}
            </span>
            <span className="text-[11px] text-muted">
              • {formatDhakaDate(sale.createdAt)}
            </span>
          </div>

          <div>
            {isCancelled ? (
              <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-[10px] font-bold text-danger border border-danger/20">
                বাতিল
              </span>
            ) : isDue ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-200">
                বকেয়া
              </span>
            ) : isPaid ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-strong border border-emerald-200">
                পরিশোধিত
              </span>
            ) : null}
          </div>
        </div>

        {/* Item preview summary */}
        <div className="mt-3 text-xs text-muted line-clamp-2">
          {sale.items.map((i) => `${i.medicineName} (${formatQty(i)})`).join(", ")}
        </div>
      </div>

      {/* Financials & Action */}
      <div className="mt-4 border-t border-line/80 pt-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] text-muted">মোট বিল</div>
            <div
              className={`font-display text-base font-extrabold ${
                isCancelled ? "text-muted line-through" : "text-ink"
              }`}
            >
              {formatTaka(sale.totalPaisa)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-muted">
              {isCancelled ? "অবস্থা" : isDue ? "বকেয়া বাকি" : "জমা হয়েছে"}
            </div>
            <div
              className={`font-display text-sm font-bold ${
                isCancelled
                  ? "text-muted"
                  : isDue
                  ? "text-rose-600"
                  : "text-brand-strong"
              }`}
            >
              {isCancelled
                ? "বাতিলকৃত"
                : isDue
                ? formatTaka(sale.duePaisa)
                : formatTaka(sale.paidPaisa)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-brand-strong font-bold group-hover:translate-x-0.5 transition inline-flex items-center gap-1">
            <span>বিবরণ ও আইটেম দেখুন</span>
            <span>→</span>
          </span>

          <Link
            href={`/buyer/invoice/${sale._id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full border border-line bg-canvas px-3 py-1 text-[11px] font-bold text-ink transition hover:border-brand hover:bg-brand hover:text-white"
            title="ইনভয়েস প্রিন্ট করুন"
          >
            🖨️ রশিদ প্রিন্ট
          </Link>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetailsModal({
  sale,
  pharmacyName,
  onClose,
}: {
  sale: BuyerSaleRow;
  pharmacyName: string;
  onClose: () => void;
}) {
  const isCancelled = sale.status === "cancelled";
  const hasPriorDue =
    sale.previousDuePaisa !== undefined && sale.previousDuePaisa !== 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-canvas text-muted hover:bg-line hover:text-ink transition"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="border-b border-line pb-4">
          <div className="text-xs font-bold text-brand-strong">{pharmacyName}</div>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">
            ইনভয়েস #{sale.invoiceNo || "চালান"}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span>📅 {formatDhakaDate(sale.createdAt)}</span>
            {isCancelled && (
              <span className="rounded-md bg-danger-bg px-2 py-0.5 font-bold text-danger">
                বাতিলকৃত
              </span>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="my-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            ক্রয়কৃত ঔষধ সামগ্রী ({sale.items.length} টি আইটেম)
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-canvas/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-canvas text-muted">
                <tr>
                  <th className="p-3">ঔষধের নাম</th>
                  <th className="p-3 text-center">পরিমাণ</th>
                  <th className="p-3 text-right">দর</th>
                  <th className="p-3 text-right">মোট</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-canvas">
                    <td className="p-3 font-semibold text-ink">
                      {item.medicineName}
                    </td>
                    <td className="p-3 text-center text-muted font-medium">
                      {formatQty(item)}
                    </td>
                    <td className="p-3 text-right text-muted">
                      {formatTaka(item.ratePaisa)}
                    </td>
                    <td className="p-3 text-right font-bold text-ink">
                      {formatTaka(item.lineTotalPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="space-y-1.5 rounded-2xl bg-canvas p-4 text-xs">
          {sale.discountPaisa && sale.discountPaisa > 0 ? (
            <>
              <div className="flex justify-between text-muted">
                <span>সাবটোটাল</span>
                <span>{formatTaka(sale.subtotalPaisa)}</span>
              </div>
              <div className="flex justify-between text-brand-strong font-medium">
                <span>
                  ডিসকাউন্ট{" "}
                  {sale.discountPercent ? `(${sale.discountPercent}%)` : ""}
                </span>
                <span>− {formatTaka(sale.discountPaisa)}</span>
              </div>
            </>
          ) : null}

          <div className="flex justify-between font-bold text-ink text-sm border-t border-line/80 pt-1.5">
            <span>এই চালানের মোট বিল</span>
            <span>{formatTaka(sale.totalPaisa)}</span>
          </div>

          {hasPriorDue && (
            <div className="flex justify-between text-muted border-t border-dotted border-line pt-1">
              <span>পূর্বের বকেয়া/জমা</span>
              <span>
                {sale.previousDuePaisa! > 0
                  ? `+ ${formatTaka(sale.previousDuePaisa!)}`
                  : `− ${formatTaka(Math.abs(sale.previousDuePaisa!))}`}
              </span>
            </div>
          )}

          {sale.paidPaisa > 0 && (
            <div className="flex justify-between text-brand-strong font-semibold">
              <span>নগদ জমা (Paid)</span>
              <span>− {formatTaka(sale.paidPaisa)}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-line pt-2 text-sm font-extrabold">
            <span className={sale.duePaisa > 0 ? "text-rose-600" : "text-brand-strong"}>
              {sale.duePaisa > 0
                ? "সর্বমোট বকেয়া (Due)"
                : sale.duePaisa < 0
                ? "অগ্রিম জমা (Advance)"
                : "পরিশোধিত (Paid)"}
            </span>
            <span
              className={`font-display ${
                sale.duePaisa > 0 ? "text-rose-600" : "text-brand-strong"
              }`}
            >
              {formatTaka(Math.abs(sale.duePaisa))}
            </span>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
          <button
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2 text-xs font-semibold text-muted hover:bg-canvas hover:text-ink transition"
          >
            বন্ধ করুন
          </button>
          <Link
            href={`/buyer/invoice/${sale._id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-strong transition"
          >
            <span>🖨️ পূর্ণাঙ্গ রশিদ ও প্রিন্ট</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
