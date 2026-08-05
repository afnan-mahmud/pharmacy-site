"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { approveOrder, rejectOrder } from "@/actions/adminOrders";
import { buyerDueBalance } from "@/actions/due";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { parseTakaInput, parsePercentInput } from "@/lib/takaInput";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { formatDhakaDateTime } from "@/lib/dhakaDate";
import { parseQuantityInput } from "@/lib/quantityInput";
import { unitLabelsFor } from "@/lib/unitLabels";
import { describeDue } from "@/lib/dueDisplay";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";
import type { PendingOrderRow } from "./PendingOrders";

type EditingItem = {
  id: string; // medicineId or custom_X
  medicineId?: string;
  customName?: string;
  medicineName: string;
  boxes: number;
  patas: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  form: string;
  isAdded: boolean;
};

/**
 * A line's billable total, mirroring writeWholesaleSale's actual rule
 * (src/lib/writeWholesaleSale.ts): a custom item is box-only — its
 * customPricePaisa is charged as boxes * customPricePaisa, with no patas
 * leg, even if the line carries a buyer-submitted `patas` count. Catalog
 * items bill both legs. Used at every place in this file that previously
 * inlined `boxPricePaisa * boxes + pataPricePaisa * patas`, so the preview
 * can't drift from what approval will actually invoice.
 */
function itemTotal(item: EditingItem): number {
  if (!item.medicineId) return item.boxPricePaisa * item.boxes;
  return item.boxPricePaisa * item.boxes + item.pataPricePaisa * item.patas;
}

export function OrderEditor({
  order,
  currentPrices,
}: {
  order: PendingOrderRow;
  currentPrices: Record<string, { boxPricePaisa: number; pataPricePaisa: number }>;
}) {
  const router = useRouter();

  const [items, setItems] = useState<EditingItem[]>(() => {
    let customCounter = 0;
    return order.items.map((i) => {
      const isCustom = !i.medicineId;
      const id = isCustom ? `custom_req_${customCounter++}` : String(i.medicineId);
      const current = i.medicineId ? currentPrices[String(i.medicineId)] : undefined;
      return {
        id,
        medicineId: i.medicineId ? String(i.medicineId) : undefined,
        customName: isCustom ? i.medicineName : undefined,
        medicineName: i.medicineName,
        boxes: i.boxes,
        // Was hardcoded to 0 here, silently dropping whatever the buyer
        // actually ordered — now carries the order's own patas through.
        patas: i.patas,
        boxPricePaisa: current?.boxPricePaisa ?? i.wholesaleBoxPricePaisa,
        pataPricePaisa: current?.pataPricePaisa ?? i.wholesalePataPricePaisa,
        form: i.form,
        isAdded: false,
      };
    });
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);
  const [discountSource, setDiscountSource] = useState<"percent" | "amount">(
    "percent",
  );
  const [percentDiscount, setPercentDiscount] = useState("");
  const [amountDiscount, setAmountDiscount] = useState("");
  const [paidStr, setPaidStr] = useState("");
  const [priorDuePaisa, setPriorDuePaisa] = useState<number | null>(null);

  useEffect(() => {
    if (!order.buyerId) return;
    let cancelled = false;
    buyerDueBalance(String(order.buyerId))
      .then((bal) => {
        if (!cancelled) setPriorDuePaisa(bal);
      })
      .catch(() => {
        if (!cancelled) setPriorDuePaisa(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order.buyerId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (id: string, updates: Partial<EditingItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const addMedicine = (medicine: PickedMedicine) => {
    if (items.some((i) => i.medicineId === medicine.id)) return;
    const current = currentPrices[medicine.id];
    setItems((prev) => [
      ...prev,
      {
        id: medicine.id,
        medicineId: medicine.id,
        medicineName: medicine.name,
        boxes: 1,
        patas: 0,
        boxPricePaisa: current?.boxPricePaisa ?? medicine.wholesaleBoxPricePaisa,
        pataPricePaisa: current?.pataPricePaisa ?? medicine.wholesalePataPricePaisa,
        form: medicine.form,
        isAdded: true,
      },
    ]);
    setPickerOpen(false);
  };

  const addCustomItem = () => {
    if (!customName.trim()) {
      alert("Nam dite hobe");
      return;
    }
    const parsedPrice = parseFloat(customPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      alert("Thikmoto dam din");
      return;
    }
    const pricePaisa = Math.round(takaToPaisa(parsedPrice));
    setItems((prev) => [
      ...prev,
      {
        id: `custom_added_${Date.now()}`,
        customName: customName.trim(),
        medicineName: customName.trim(),
        boxes: customBoxes,
        patas: 0,
        boxPricePaisa: pricePaisa,
        pataPricePaisa: pricePaisa,
        form: "other",
        isAdded: true,
      },
    ]);
    setShowCustomForm(false);
    setCustomName("");
    setCustomPrice("");
    setCustomBoxes(1);
  };

  const handleApprove = async () => {
    setError("");
    
    // Validate custom items have prices
    for (const item of items) {
      if (!item.medicineId && item.boxPricePaisa < 0) {
        setError(`"${item.medicineName}" er dam thik nai!`);
        return;
      }
    }

    setBusy(true);
    try {
      const inputItems = items.map((i) => ({
        medicineId: i.medicineId,
        customName: i.customName,
        customPricePaisa: i.boxPricePaisa,
        boxes: i.boxes,
        patas: i.patas,
      }));

      let discountArg: DiscountInput = { kind: "percent", percent: 0 };
      if (discountSource === "percent") {
        const percent = parsePercentInput(percentDiscount);
        if (percent === null) {
          setError("Discount thik nai");
          setBusy(false);
          return;
        }
        discountArg = { kind: "percent", percent };
      } else {
        const amountPaisa = parseTakaInput(amountDiscount);
        if (amountPaisa === null) {
          setError("Discount thik nai");
          setBusy(false);
          return;
        }
        discountArg = { kind: "amount", amountPaisa };
      }

      const paidPaisa = parseTakaInput(paidStr);
      if (paidPaisa === null) {
        setError("Joma thik nai");
        setBusy(false);
        return;
      }

      const result = await approveOrder(order._id, inputItems, discountArg, paidPaisa);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.push(`/invoice/${result.data._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt("Reject korar karon:");
    if (reason === null) return;
    setError("");
    setBusy(true);
    try {
      const result = await rejectOrder(order._id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  };

  const subtotalPaisa = items.reduce((sum, item) => sum + itemTotal(item), 0);

  let discountArg: DiscountInput | null = null;
  if (discountSource === "percent") {
    const percent = parsePercentInput(percentDiscount);
    discountArg = percent === null ? null : { kind: "percent", percent };
  } else {
    const amountPaisa = parseTakaInput(amountDiscount);
    discountArg = amountPaisa === null ? null : { kind: "amount", amountPaisa };
  }

  const paidPaisa = parseTakaInput(paidStr) ?? 0;

  let netTotalPaisa = subtotalPaisa;
  let discountPaisa = 0;
  let discountPercent = 0;
  let totalsError = "";

  if (discountArg === null) {
    totalsError = "Discount thik nai";
  } else {
    try {
      const totals = computeTotals(
        items.map((item) => ({ ratePaisa: itemTotal(item), quantity: 1 })),
        discountArg,
        paidPaisa,
      );
      discountPaisa = totals.discountPaisa;
      discountPercent = totals.discountPercent;
      netTotalPaisa = totals.totalPaisa;
    } catch (err) {
      totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
    }
  }

  const hasPriorDue = priorDuePaisa !== null && priorDuePaisa !== 0;
  const effectivePriorDue = priorDuePaisa ?? 0;
  const totalPayablePaisa = netTotalPaisa + effectivePriorDue;
  const finalDuePaisa = totalPayablePaisa - paidPaisa;

  const hasBillableLine = items.some((i) => i.boxes > 0 || i.patas > 0 || !i.medicineId);

  return (
    <div className="flex flex-col pb-32 space-y-4">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
        <div className="relative z-10">
          <h1 className="mb-2 font-display text-3xl font-extrabold leading-tight">
            Edit Order
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/90">
            <span>
              {order.buyerName} ({order.buyerShopName})
            </span>
            {hasPriorDue && (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                {describeDue(priorDuePaisa!).label}: {describeDue(priorDuePaisa!).amountText}
              </span>
            )}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-danger px-2 font-semibold">{error}</p>}

      <div className="space-y-4 px-2">
        {items.map((item) => {
          const isCustom = !item.medicineId;
          const labels = isCustom ? { outer: "boxes", inner: "pcs" } : unitLabelsFor(item.form);

          return (
            <div key={item.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm relative overflow-hidden">
               {item.isAdded && (
                 <div className="absolute top-0 right-0 bg-brand text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                   Notun
                 </div>
               )}
               {isCustom && !item.isAdded && (
                 <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                   Custom Request
                 </div>
               )}
               
               <h3 className="font-bold text-ink pr-16">{item.medicineName}</h3>
               
               <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-line/50 pt-3">
                 
                 {/* Price Section */}
                 <div className="min-w-0">
                   <label className="block text-xs font-semibold text-muted mb-1">Rate</label>
                   {isCustom ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">৳</span>
                        <input
                          type="number"
                          placeholder="Price"
                          value={item.boxPricePaisa > 0 ? (item.boxPricePaisa / 100).toString() : ""}
                          onChange={(e) => {
                            const pricePaisa = Math.round(takaToPaisa(parseFloat(e.target.value) || 0));
                            updateItem(item.id, { boxPricePaisa: pricePaisa, pataPricePaisa: pricePaisa });
                          }}
                          className="w-full max-w-[120px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-medium focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                        />
                      </div>
                   ) : (
                     <div className="text-sm font-semibold text-ink">
                       {formatTaka(item.boxPricePaisa)}<span className="text-xs text-muted font-normal">/{labels.outer}</span>
                       {" · "}
                       {formatTaka(item.pataPricePaisa)}<span className="text-xs text-muted font-normal">/{labels.inner}</span>
                     </div>
                   )}
                   {isCustom && item.patas > 0 && (
                     <p className="mt-1 text-[11px] text-muted leading-snug">
                       Buyer {item.patas} pata-o cheyechilo, kintu custom item shudhu {labels.outer} rate-e bill hobe.
                     </p>
                   )}
                 </div>

                 {/* Quantity Section */}
                 <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {/* Box Stepper */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-canvas rounded-full border border-line p-0.5">
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { boxes: Math.max(0, item.boxes - 1) })}
                          className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-surface text-ink font-bold shadow-sm hover:bg-line/50 active:scale-95 transition"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={item.boxes}
                          onChange={(e) => updateItem(item.id, { boxes: parseQuantityInput(e.target.value, 0) })}
                          className="w-9 sm:w-11 text-center text-xs sm:text-sm font-bold bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { boxes: item.boxes + 1 })}
                          className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-brand text-white font-bold shadow-sm hover:bg-brand-strong active:scale-95 transition"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs font-medium text-muted">{labels.outer}</span>
                    </div>

                    {/* Pata Stepper */}
                    {!isCustom && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center bg-canvas rounded-full border border-line p-0.5">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { patas: Math.max(0, item.patas - 1) })}
                            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-surface text-ink font-bold shadow-sm hover:bg-line/50 active:scale-95 transition"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.patas}
                            onChange={(e) => updateItem(item.id, { patas: parseQuantityInput(e.target.value, 0) })}
                            className="w-9 sm:w-11 text-center text-xs sm:text-sm font-bold bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { patas: item.patas + 1 })}
                            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-brand text-white font-bold shadow-sm hover:bg-brand-strong active:scale-95 transition"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs font-medium text-muted">{labels.inner}</span>
                      </div>
                    )}
                 </div>
               </div>

               <div className="mt-3 flex justify-between items-center bg-canvas -mx-4 -mb-4 px-4 py-2 border-t border-line/50">
                  <div className="text-xs font-semibold text-brand-strong">
                    Total: {formatTaka(itemTotal(item))}
                    {item.boxes === 0 && item.patas === 0 && (
                      <span className="ml-2 font-normal text-muted">(0 qty)</span>
                    )}
                  </div>
                  {item.isAdded && (
                    <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-xs text-danger font-medium hover:underline">
                      Remove
                    </button>
                  )}
               </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 mt-6 flex flex-col gap-3">
        {pickerOpen ? (
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <MedicinePicker onPick={addMedicine} placeholder="Notun medicine khojo..." />
            <button onClick={() => setPickerOpen(false)} className="mt-3 text-xs font-semibold text-muted hover:text-ink">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setPickerOpen(true)} className="rounded-xl border-2 border-dashed border-brand/30 bg-brand-tint/10 py-4 text-sm font-bold text-brand-strong hover:bg-brand-tint transition">
            + Product add korun
          </button>
        )}

        {showCustomForm ? (
          <div className="rounded-2xl border border-brand bg-brand-tint/20 p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-bold text-brand-strong">Add Custom Item</h4>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Item name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Price (৳)"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-xs font-semibold text-muted sm:hidden">Quantity:</span>
                  <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(Math.max(0, customBoxes - 1))}
                      className="grid h-[42px] w-9 place-items-center text-base font-bold text-brand hover:bg-brand/10 active:scale-95 transition"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={customBoxes}
                      onChange={(e) => setCustomBoxes(parseQuantityInput(e.target.value, 0))}
                      className="w-12 border-0 bg-transparent p-0 text-center text-sm font-bold text-ink focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomBoxes(customBoxes + 1)}
                      className="grid h-[42px] w-9 place-items-center text-base font-bold text-brand hover:bg-brand/10 active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={addCustomItem} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:bg-brand-strong active:scale-98 transition">Add</button>
                <button onClick={() => setShowCustomForm(false)} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink hover:bg-canvas transition">Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCustomForm(true)} className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-ink hover:bg-line/50 transition">
            + Custom field add korun
          </button>
        )}
      </div>

      <div className="px-2 mt-6 mb-8 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
           <div>
              <label className="text-xs text-muted font-medium mb-1 block">Discount (%)</label>
              <input 
                type="number" 
                step="0.01"
                min={0}
                value={percentDiscount}
                onChange={e => {
                  setDiscountSource("percent");
                  setPercentDiscount(e.target.value);
                  setAmountDiscount("");
                }}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                placeholder="0"
              />
           </div>
           <div>
              <label className="text-xs text-muted font-medium mb-1 block">Discount (৳)</label>
              <input 
                type="number" 
                step="0.01"
                min={0}
                value={amountDiscount}
                onChange={e => {
                  setDiscountSource("amount");
                  setAmountDiscount(e.target.value);
                  setPercentDiscount("");
                }}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                placeholder="0"
              />
           </div>
           <div>
              <label className="text-xs text-muted font-medium mb-1 block">Joma (৳)</label>
              <input 
                type="number" 
                step="0.01"
                min={0}
                value={paidStr}
                onChange={e => setPaidStr(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                placeholder="0"
              />
           </div>
        </div>
        
        <div className="bg-surface rounded-2xl p-4 border border-line shadow-sm text-sm space-y-2.5">
           <div className="flex justify-between text-muted">
             <span>Subtotal</span>
             <span>{formatTaka(subtotalPaisa)}</span>
           </div>
           {discountPaisa > 0 && (
             <div className="flex justify-between text-muted">
               <span>
                 Discount
                 {discountSource === "percent" && discountPercent > 0
                   ? ` (${discountPercent}%)`
                   : ""}
               </span>
               <span>− {formatTaka(discountPaisa)}</span>
             </div>
           )}
           <div className="flex justify-between font-bold text-ink">
             <span>Bortoman Bill</span>
             <span>{formatTaka(netTotalPaisa)}</span>
           </div>

           {hasPriorDue && (
             <>
               {priorDuePaisa! > 0 ? (
                 <div className="flex justify-between text-danger font-medium">
                   <span>Purber Baki</span>
                   <span>+ {formatTaka(priorDuePaisa!)}</span>
                 </div>
               ) : (
                 <div className="flex justify-between text-teal-700 font-medium">
                   <span>Purber Joma (Advance)</span>
                   <span>− {formatTaka(Math.abs(priorDuePaisa!))}</span>
                 </div>
               )}
               <div className="flex justify-between font-bold text-ink border-t border-brand/10 pt-1.5">
                 <span>Total Due</span>
                 <span className="text-brand-strong">{formatTaka(totalPayablePaisa)}</span>
               </div>
             </>
           )}

           {paidPaisa > 0 && (
             <div className="flex justify-between text-emerald-700 font-medium">
               <span>Joma (Payment)</span>
               <span>− {formatTaka(paidPaisa)}</span>
             </div>
           )}

           <div className="flex justify-between font-bold text-base border-t border-line/60 pt-2 mt-1">
             {finalDuePaisa > 0 ? (
               <>
                 <span className="text-danger font-display">Mot Baki</span>
                 <span className="text-danger">{formatTaka(finalDuePaisa)}</span>
               </>
             ) : finalDuePaisa < 0 ? (
               <>
                 <span className="text-teal-700 font-display">Buyer pabe</span>
                 <span className="text-teal-700">{formatTaka(Math.abs(finalDuePaisa))}</span>
               </>
             ) : (
               <>
                 <span className="text-muted font-display">Baki</span>
                 <span className="text-muted">৳0.00 (Shodh)</span>
               </>
             )}
           </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line p-4 pb-8 sm:pb-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="mx-auto max-w-lg flex flex-col gap-3">
          
          <div className="flex justify-between items-center px-2">
            <span className="text-sm text-muted font-medium">Net Total</span>
            <span className="font-display text-2xl font-extrabold text-ink">{formatTaka(netTotalPaisa)}</span>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={busy}
              className="flex-1 rounded-xl border border-line bg-canvas py-4 text-sm font-bold text-ink shadow-sm transition hover:bg-line/50 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={busy || !hasBillableLine}
              className="flex-[2] rounded-xl bg-brand py-4 text-sm font-bold text-white shadow-xl shadow-brand/30 transition hover:bg-brand-strong hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
            >
              Approve koro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
