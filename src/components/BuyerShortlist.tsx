"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  submitShortlist,
} from "@/actions/buyerOrders";
import { toast } from "sonner";

type ShortlistRow = {
  name: string;
  boxes: number;
  patas: number;
};

export function BuyerShortlist({
  buyerName,
  buyerPhone,
  buyerAddress,
}: {
  buyerName: string;
  buyerPhone: string;
  buyerAddress: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [rows, setRows] = useState<ShortlistRow[]>([
    { name: "", boxes: 1, patas: 0 },
    { name: "", boxes: 1, patas: 0 },
    { name: "", boxes: 1, patas: 0 },
    { name: "", boxes: 1, patas: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  // Delivery form state
  const [dName, setDName] = useState(buyerName);
  const [dPhone, setDPhone] = useState(buyerPhone);
  const [dAddress, setDAddress] = useState(buyerAddress);

  function addRow() {
    setRows((prev) => [...prev, { name: "", boxes: 1, patas: 0 }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateName(idx: number, name: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, name } : row,
      ),
    );
  }

  function updateBoxes(idx: number, boxes: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, boxes: Math.max(0, boxes) } : row,
      ),
    );
  }

  function updatePatas(idx: number, patas: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, patas: Math.max(0, patas) } : row,
      ),
    );
  }

  const filledRows = rows.filter((r) => r.name.trim() !== "");

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (filledRows.length === 0) {
      toast.error("কমপক্ষে একটি প্রোডাক্ট এর নাম লিখুন");
      return;
    }
    setStep(2);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await submitShortlist(
        filledRows.map((r) => ({
          name: r.name,
          boxes: r.boxes,
          patas: r.patas,
        })),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("অর্ডার সফলভাবে পাঠানো হয়েছে!");
      setTimeout(() => {
        router.push("/buyer/orders");
      }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
    } finally {
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <div className="-mt-4 flex flex-col pb-6">
        {/* Header Section */}
        <section className="-mx-4 mb-6 rounded-b-3xl bg-brand px-6 pb-12 pt-8 text-white shadow-sm relative overflow-hidden">
          <div className="relative z-10 text-center pt-2">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Short Item</h1>
            <p className="mt-1 text-sm text-white/90">
              অর্ডারটি রিভিউ করুন
            </p>
          </div>
        </section>

        {/* Input Card */}
        <form onSubmit={handleNext} className="relative z-20 -mt-14 space-y-5 rounded-3xl bg-white px-4 py-6 shadow-md border border-line/50">
          
          <div className="grid grid-cols-[1fr_65px_65px_40px] gap-1 px-1 pb-2 text-[11px] font-bold tracking-wider text-muted/70 uppercase">
            <div>Product</div>
            <div className="text-center">Box</div>
            <div className="text-center">Pata</div>
            <div className="text-right">Del</div>
          </div>

          <div className="space-y-4">
            {rows.map((row, idx) => (
              <ShortlistRowInput
                key={idx}
                row={row}
                onNameChange={(q) => updateName(idx, q)}
                onBoxesChange={(b) => updateBoxes(idx, b)}
                onPatasChange={(p) => updatePatas(idx, p)}
                onRemove={rows.length > 1 ? () => removeRow(idx) : undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line/60 py-3.5 text-sm font-bold text-muted transition hover:bg-canvas"
          >
            <span className="text-lg leading-none">+</span> Add Another Product
          </button>

          <button
            type="submit"
            className="mt-6 w-full rounded-2xl bg-brand py-4 text-center text-base font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-strong"
          >
            অর্ডার করুন <span className="ml-1 text-lg">→</span>
          </button>
        </form>
      </div>
    );
  }

  // STEP 2: SUMMARY
  return (
    <div className="flex flex-col pb-6">
      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm font-medium text-blue-900 shadow-sm flex gap-3 items-start">
        <span className="text-xl">📋</span>
        <p>
          <strong className="font-bold">Short Item Order</strong> — আপনার custom product গুলোর দাম আমরা পরে confirm করব। অর্ডার দেওয়ার পর আমরা আপনার সাথে যোগাযোগ করব।
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-brand-strong">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <h2 className="font-display text-lg font-bold">অর্ডার সারাংশ</h2>
      </div>

      <div className="mb-8 rounded-3xl bg-white p-5 shadow-sm border border-line">
        <div className="space-y-4">
          {filledRows.map((r, i) => (
            <div key={i} className="flex items-start justify-between border-b border-line pb-4 last:border-0 last:pb-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-ink">{r.name}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Short Item</span>
                </div>
                <div className="mt-1 text-xs text-muted">Box: {r.boxes}, Pata: {r.patas}</div>
              </div>
              <div className="text-sm font-semibold text-muted">দাম confirm হবে</div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line pt-4 space-y-2">
          <div className="flex justify-between text-sm text-muted">
            <span>Subtotal</span>
            <span>৳0.00</span>
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>Delivery charge</span>
            <span>৳0.00</span>
          </div>
          <div className="flex justify-between font-display text-lg font-bold text-ink pt-2">
            <span>মোট পরিমাণ</span>
            <span className="text-brand-strong">৳0.00</span>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <h2 className="font-display text-lg font-bold text-ink">ডেলিভারি তথ্য</h2>
      </div>

      <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-5 shadow-sm border border-line space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">দোকানের নাম*</label>
          <input 
            required 
            value={dName}
            onChange={(e) => setDName(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand" 
            placeholder="পুরো নাম" 
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">মোবাইল নম্বর*</label>
          <input 
            required 
            value={dPhone}
            onChange={(e) => setDPhone(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand" 
            placeholder="01XXXXXXXXX" 
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">দোকানের ঠিকানা*</label>
          <input 
            required 
            value={dAddress}
            onChange={(e) => setDAddress(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand" 
            placeholder="ঠিকানা" 
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-brand py-4 text-center text-base font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "অপেক্ষা করুন..." : "কনফার্ম করুন"}
        </button>
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={busy}
          className="w-full rounded-2xl bg-canvas py-3 text-center text-sm font-bold text-muted transition hover:bg-line/50 disabled:opacity-50 mt-2"
        >
          ফিরে যান
        </button>
      </form>
    </div>
  );
}

function ShortlistRowInput({
  row,
  onNameChange,
  onBoxesChange,
  onPatasChange,
  onRemove,
}: {
  row: ShortlistRow;
  onNameChange: (name: string) => void;
  onBoxesChange: (boxes: number) => void;
  onPatasChange: (patas: number) => void;
  onRemove?: () => void;
}) {
  const hasName = row.name.trim() !== "";

  return (
    <div className="grid grid-cols-[1fr_65px_65px_40px] items-center gap-1">
      {/* Name Input */}
      <div className="relative min-w-0">
        <input
          value={row.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Product Name"
          className={`w-full rounded-xl border-0 px-2 py-3 text-sm font-medium focus:ring-2 focus:ring-brand ${
            hasName ? "bg-canvas text-ink" : "bg-canvas/50 text-muted"
          }`}
        />
      </div>

      {/* Stepper */}
      <div className={`flex items-center rounded-xl border ${hasName ? "border-brand bg-white" : "border-line bg-canvas"} h-[44px] px-0.5 w-full`}>
        <button
          type="button"
          onClick={() => onBoxesChange(row.boxes - 1)}
          className={`grid h-full flex-1 place-items-center text-lg ${hasName ? "text-brand" : "text-muted"}`}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={row.boxes}
          onChange={(e) => onBoxesChange(Number(e.target.value))}
          className={`w-6 border-0 bg-transparent p-0 text-center text-sm font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${hasName ? "text-ink" : "text-muted"}`}
        />
        <button
          type="button"
          onClick={() => onBoxesChange(row.boxes + 1)}
          className={`grid h-full flex-1 place-items-center text-lg ${hasName ? "text-brand" : "text-muted"}`}
        >
          +
        </button>
      </div>

      {/* Pata Stepper */}
      <div className={`flex items-center rounded-xl border ${hasName ? "border-brand bg-white" : "border-line bg-canvas"} h-[44px] px-0.5 w-full`}>
        <button
          type="button"
          onClick={() => onPatasChange(row.patas - 1)}
          className={`grid h-full flex-1 place-items-center text-lg ${hasName ? "text-brand" : "text-muted"}`}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={row.patas}
          onChange={(e) => onPatasChange(Number(e.target.value))}
          className={`w-6 border-0 bg-transparent p-0 text-center text-sm font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${hasName ? "text-ink" : "text-muted"}`}
        />
        <button
          type="button"
          onClick={() => onPatasChange(row.patas + 1)}
          className={`grid h-full flex-1 place-items-center text-lg ${hasName ? "text-brand" : "text-muted"}`}
        >
          +
        </button>
      </div>

      {/* Delete Button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={!onRemove}
        className="grid h-[44px] w-full place-items-center rounded-xl bg-danger-bg text-danger hover:bg-danger hover:text-white transition disabled:opacity-30 disabled:hover:bg-danger-bg disabled:hover:text-danger"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>
  );
}
