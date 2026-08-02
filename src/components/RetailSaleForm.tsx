"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordRetailSale, searchRetailCustomers, type RetailSaleInput } from "@/actions/sales";
import { retailDueBalance } from "@/actions/due";
import { formatTaka, paisaToTaka, takaToPaisa } from "@/lib/money";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";
import { describeDue } from "@/lib/dueDisplay";

type CustomerSuggestion = {
  name: string;
  phone: string;
};

/**
 * `<input type="number">` does not stop anyone typing "-5" or an "e" — the
 * string reaches the component either way. takaToPaisa throws on those, and a
 * throw during render is a blank white page, so every taka box is parsed
 * through here instead: null means "show a message", never "crash".
 */
function parseTakaInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  try {
    return takaToPaisa(trimmed);
  } catch {
    return null;
  }
}

/** Same guard for the percent box, which is a plain number, not money. */
function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function RetailSaleForm({
  allowCustomItems = false,
}: {
  allowCustomItems?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [nameFromHistory, setNameFromHistory] = useState(false);
  const [priorDuePaisa, setPriorDuePaisa] = useState<number | null>(null);

  // Phone autocomplete
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Discount: two boxes side by side, one in % and one in ৳. Only the box the
  // owner last typed into is authoritative — the other one displays the value
  // derived from it, so the two can never disagree about the same discount.
  const [discountSource, setDiscountSource] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountInput, setDiscountInput] = useState("");
  const [paid, setPaid] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  // The phone-lookup effect below reads the current name to decide whether it
  // may overwrite it, but it must only re-run when the *phone* changes —
  // adding the name to its dep array would restart the debounce on every
  // keystroke in the name box. Refs give it the live values without that.
  const customerNameRef = useRef(customerName);
  customerNameRef.current = customerName;
  const nameFromHistoryRef = useRef(nameFromHistory);
  nameFromHistoryRef.current = nameFromHistory;

  // Phone lookup and suggestions debounce
  useEffect(() => {
    const trimmed = customerPhone.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      setPriorDuePaisa(null);
      setNameFromHistory(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchRetailCustomers(trimmed);
        if (cancelled) return;
        setSuggestions(found);
        setShowSuggestions(found.length > 0);

        // If exact match found, auto-populate name and check balance
        const exact = found.find((c) => c.phone === trimmed);
        if (exact) {
          // Only fill in a name the owner has not typed themselves — a name
          // this same lookup put there earlier is fair game to replace.
          if (!customerNameRef.current.trim() || nameFromHistoryRef.current) {
            setCustomerName(exact.name);
            setNameFromHistory(true);
          }
        }

        const bal = await retailDueBalance(trimmed);
        if (!cancelled) {
          setPriorDuePaisa(bal);
        }
      } catch {
        // Ignore lookup errors
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectSuggestion(suggestion: CustomerSuggestion) {
    setCustomerPhone(suggestion.phone);
    setCustomerName(suggestion.name);
    setNameFromHistory(true);
    setShowSuggestions(false);
    // A failed balance lookup (expired session, network) leaves the prior-due
    // badge blank rather than becoming an unhandled rejection.
    retailDueBalance(suggestion.phone)
      .then((bal) => setPriorDuePaisa(bal))
      .catch(() => setPriorDuePaisa(null));
  }

  function lineTotalFor(line: CartLine): number {
    return (
      line.boxes * line.medicine.retailBoxPricePaisa +
      line.patas * line.medicine.retailPataPricePaisa
    );
  }

  const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
  const hasBillableLine = cart.some(
    (line) => line.boxes > 0 || line.patas > 0 || line.medicine.id.startsWith("custom_"),
  );
  const paidPaisa = parseTakaInput(paid);

  let discountArg: DiscountInput | null = null;
  if (discountSource === "percent") {
    const percent = parsePercentInput(discountInput);
    discountArg = percent === null ? null : { kind: "percent", percent };
  } else {
    const amountPaisa = parseTakaInput(discountInput);
    discountArg = amountPaisa === null ? null : { kind: "amount", amountPaisa };
  }

  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let discountPaisa = 0;
  let discountPercent = 0;
  let totalsError = "";
  if (discountArg === null) {
    totalsError = "Discount thik nai";
  } else if (paidPaisa === null) {
    totalsError = "Joma thik nai";
  } else {
    try {
      const totals = computeTotals(
        cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
        discountArg,
        paidPaisa,
      );
      discountPaisa = totals.discountPaisa;
      discountPercent = totals.discountPercent;
      totalPaisa = totals.totalPaisa;
      duePaisa = totals.duePaisa;
    } catch (err) {
      totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
    }
  }

  // Whichever discount box the owner is not typing in mirrors the other one.
  // Both go blank while the discount is empty or unusable, so a stale derived
  // figure never sits next to an error message.
  const discountEmpty = !discountInput.trim();
  const showDerived = !discountEmpty && !totalsError;
  const percentBoxValue =
    discountSource === "percent"
      ? discountInput
      : showDerived
        ? String(discountPercent)
        : "";
  const amountBoxValue =
    discountSource === "amount"
      ? discountInput
      : showDerived
        ? paisaToTaka(discountPaisa).toFixed(2)
        : "";

  function updateBoxes(idx: number, raw: string) {
    const boxes = parseQuantityInput(raw, 0);
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, boxes } : line)),
    );
  }

  function updatePatas(idx: number, raw: string) {
    const newPatas = parseQuantityInput(raw, 0);
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, patas: newPatas } : line)),
    );
  }

  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  const isDueWithoutPhone = duePaisa > 0 && !customerPhone.trim();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) {
      setError("Cart khali");
      return;
    }
    if (!hasBillableLine) {
      setError("Onto ekta line e poriman dite hobe");
      return;
    }
    if (!customerName.trim()) {
      setError("Customer er nam ditei hobe");
      return;
    }
    if (isDueWithoutPhone) {
      setError("Baki thakle phone number ditei hobe");
      return;
    }
    // The submit button is disabled while these are unusable; this is the
    // belt-and-braces check so a bad discount/joma can never reach the server
    // as a silently-coerced 0.
    if (totalsError || discountArg === null || paidPaisa === null) {
      setError(totalsError || "Hisab thik nai");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const payloadItems = cart.map((l) => {
        if (l.medicine.id.startsWith("custom_")) {
          return {
            customName: l.medicine.name,
            customPricePaisa: l.medicine.retailBoxPricePaisa,
            boxes: l.boxes,
            patas: l.patas,
          };
        }
        return { medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas };
      });

      const payload: RetailSaleInput = {
        items: payloadItems,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        discount: discountArg,
        paidPaisa,
      };

      const result = await recordRetailSale(payload);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const sale = result.data;
      setCart([]);
      setDiscountSource("percent");
      setDiscountInput("");
      setPaid("");
      setCustomerPhone("");
      setCustomerName("");
      setNameFromHistory(false);
      setPriorDuePaisa(null);
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      setStep(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";
  const tdCls = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
              <span className="text-yellow-300">🏪</span> Khuchra
            </div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              {step === 1 ? "Notun Bikri" : "Checkout"}
            </h1>
            <p className="text-sm text-white/90">
              {step === 1
                ? "Product khuje cart e add korun."
                : "Customer hisab ebong payment complete koro."}
            </p>
          </div>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 transition backdrop-blur-sm"
            >
              ← Piche ferot
            </button>
          )}
        </div>
      </section>

      {lastInvoice && lastSaleId && (
        <div className="mb-6 flex flex-col items-center justify-center rounded-3xl bg-surface border-2 border-brand p-8 text-center shadow-lg">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint mb-4 text-3xl">
            🎉
          </div>
          <h3 className="mb-2 font-display text-xl font-bold text-ink">
            Invoice {lastInvoice} record kora hoyeche!
          </h3>
          <p className="mb-6 text-muted">
            Bikri successfully save hoyeche, ebar invoice print korte paren.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/invoice/${lastSaleId}`}
              className="rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-brand/30 hover:bg-brand-strong transition"
            >
              🖨️ Invoice Print Koro
            </Link>
            <button
              type="button"
              onClick={() => {
                setLastInvoice(null);
                setLastSaleId(null);
              }}
              className="rounded-full border border-line bg-canvas px-6 py-3.5 text-base font-bold text-ink hover:bg-line/50 transition"
            >
              + Notun Bikri
            </button>
          </div>
        </div>
      )}

      {step === 1 ? (
        <SaleItemPicker
          cart={cart}
          priceMode="retail"
          allowCustomItems={allowCustomItems}
          onAdd={(med, boxes, patas) => {
            setCart((prev) => {
              if (prev.find((l) => l.medicine.id === med.id)) return prev;
              return [...prev, { medicine: med, boxes, patas }];
            });
          }}
          onRemove={(id) => {
            setCart((prev) => prev.filter((l) => l.medicine.id !== id));
          }}
          onQuantityChange={(id, boxes, patas) => {
            setCart((prev) =>
              prev.map((l) => (l.medicine.id === id ? { ...l, boxes, patas } : l)),
            );
          }}
          onAddCustom={(med, boxes) => {
            setCart((prev) => [...prev, { medicine: med, boxes, patas: 0 }]);
          }}
          onProceed={() => setStep(2)}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-md">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">
              Customer er tothyo
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative space-y-1.5" ref={suggestionsRef}>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="customerPhone"
                    className="text-sm font-medium text-ink"
                  >
                    Customer phone {isDueWithoutPhone ? (
                      <span className="text-danger font-bold">* (baki thakle dorkar)</span>
                    ) : (
                      <span className="text-xs text-muted">(optional)</span>
                    )}
                  </label>
                  {priorDuePaisa !== null && priorDuePaisa !== 0 && (
                    <span
                      className={`text-xs font-bold ${
                        priorDuePaisa > 0 ? "text-danger" : "text-brand-strong"
                      }`}
                    >
                      {describeDue(priorDuePaisa).label}:{" "}
                      {describeDue(priorDuePaisa).amountText}
                    </span>
                  )}
                </div>
                <input
                  id="customerPhone"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="01XXXXXXXXX"
                  className={`${field} ${isDueWithoutPhone ? "border-danger focus:ring-danger" : ""}`}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-xl">
                    {suggestions.map((s) => (
                      <button
                        key={s.phone}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-canvas transition"
                      >
                        <span className="font-semibold text-ink">{s.name || "(naam nai)"}</span>
                        <span className="text-xs text-muted font-mono">{s.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="customerName"
                  className="text-sm font-medium text-ink"
                >
                  Customer nam <span className="font-bold text-danger">*</span>
                </label>
                <input
                  id="customerName"
                  required
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setNameFromHistory(false);
                  }}
                  placeholder="Nam likho"
                  className={`${field} ${
                    customerName.trim() ? "" : "border-danger focus:ring-danger"
                  }`}
                />
                {nameFromHistory && (
                  <p className="text-xs text-brand-strong">Ager naam — bodlano jabe</p>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-md">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted bg-canvas/50">
                <tr>
                  <th className={tdCls}>Medicine</th>
                  <th className={tdCls}>Pack rate</th>
                  <th className={tdCls}>Poriman</th>
                  <th className={`${tdCls} text-right`}>Mot</th>
                  <th className={tdCls}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, idx) => (
                  <tr
                    key={line.medicine.id}
                    className="border-b border-line/50 last:border-0"
                  >
                    <td className={tdCls}>
                      <div className="font-bold text-ink">
                        {line.medicine.name}
                      </div>
                      <div className="text-xs font-medium text-muted mt-0.5">
                        {line.medicine.patasPerBox}{" "}
                        {unitLabelsFor(line.medicine.form).inner}/
                        {unitLabelsFor(line.medicine.form).outer}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {formatTaka(line.medicine.retailBoxPricePaisa)}
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={line.boxes}
                          onChange={(e) => updateBoxes(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
                        />
                        <span className="text-xs font-medium text-muted">
                          {unitLabelsFor(line.medicine.form).outer}
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={line.patas}
                          onChange={(e) => updatePatas(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
                        />
                        <span className="text-xs font-medium text-muted">
                          {unitLabelsFor(line.medicine.form).inner}
                        </span>
                      </div>
                      {line.boxes === 0 && line.patas === 0 && (
                        <div className="mt-1 text-[11px] font-medium text-muted">
                          invoice e thakbe, dam nai
                        </div>
                      )}
                    </td>
                    <td className={`${tdCls} text-right font-bold text-ink`}>
                      {formatTaka(lineTotalFor(line))}
                    </td>
                    <td className={tdCls}>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-muted hover:text-danger rounded-full p-1 hover:bg-danger-bg transition"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-md sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Discount</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <input
                    id="discountPercent"
                    aria-label="Discount percent"
                    type="number"
                    step="0.01"
                    min={0}
                    className={field}
                    placeholder="0"
                    value={percentBoxValue}
                    onChange={(e) => {
                      setDiscountSource("percent");
                      setDiscountInput(e.target.value);
                    }}
                  />
                  <p className="text-center text-[11px] font-medium text-muted">
                    % e
                  </p>
                </div>
                <div className="space-y-1">
                  <input
                    id="discountAmount"
                    aria-label="Discount taka"
                    type="number"
                    step="0.01"
                    min={0}
                    className={field}
                    placeholder="0"
                    value={amountBoxValue}
                    onChange={(e) => {
                      setDiscountSource("amount");
                      setDiscountInput(e.target.value);
                    }}
                  />
                  <p className="text-center text-[11px] font-medium text-muted">
                    ৳ e
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="paid" className="text-sm font-medium text-ink">
                Joma (৳)
              </label>
              <input
                id="paid"
                type="number"
                step="0.01"
                min={0}
                className={field}
                placeholder="0"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </div>
            <div className="space-y-3 rounded-2xl bg-brand/5 p-4 border border-brand/10">
              <div className="flex justify-between text-sm text-muted">
                <span>Subtotal</span>
                <span>{formatTaka(subtotalPaisa)}</span>
              </div>
              {discountPaisa > 0 && (
                <div className="flex justify-between text-sm text-muted">
                  <span>Discount ({discountPercent}%)</span>
                  <span>− {formatTaka(discountPaisa)}</span>
                </div>
              )}
              {totalsError ? (
                <p role="alert" className="text-sm text-danger">
                  {totalsError}
                </p>
              ) : (
                <>
                  <div className="flex justify-between text-sm font-display font-bold text-ink">
                    <span>Mot</span>
                    <span>{formatTaka(totalPaisa)}</span>
                  </div>
                  {duePaisa > 0 ? (
                    <div className="flex justify-between text-sm font-semibold text-danger">
                      <span>Baki</span>
                      <span>{formatTaka(duePaisa)}</span>
                    </div>
                  ) : duePaisa < 0 ? (
                    <div className="flex justify-between text-sm font-semibold text-teal-700">
                      <span>Customer pabe</span>
                      <span>{formatTaka(Math.abs(duePaisa))}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm font-semibold text-muted">
                      <span>Baki</span>
                      <span>৳0.00 (Baki nei)</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {cart.length > 0 && !hasBillableLine && (
            <p className="text-sm text-muted">
              Shob line 0 — onto ekta line e poriman dile invoice kora jabe.
            </p>
          )}

          {!customerName.trim() && (
            <div className="rounded-2xl border border-danger/30 bg-danger-bg p-4 text-sm font-medium text-danger">
              ⚠️ Customer er nam likha baddhotamulok.
            </div>
          )}

          {isDueWithoutPhone && (
            <div className="rounded-2xl border border-danger/30 bg-danger-bg p-4 text-sm font-medium text-danger">
              ⚠️ Baki thakle customer er phone number likha baddhotamulok.
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger px-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              busy ||
              cart.length === 0 ||
              !hasBillableLine ||
              !customerName.trim() ||
              isDueWithoutPhone ||
              !!totalsError
            }
            className="w-full rounded-full bg-brand hover:bg-brand-strong px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand/30 disabled:opacity-50 transition"
          >
            {busy ? "Wait..." : "Bikri Confirm Koro"}
          </button>
        </form>
      )}
    </div>
  );
}
