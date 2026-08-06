import { formatTaka } from "@/lib/money";
import { unitLabelsFor } from "@/lib/unitLabels";

type InvoiceProps = {
  pharmacyName: string;
  proprietorName?: string;
  logoUrl?: string;
  address: string;
  phone: string;
  invoiceNo: string;
  buyerName: string;
  buyerShopName: string;
  createdAt: string;
  items: {
    medicineName: string;
    unit: string;
    // Absent on sales written before medicine forms existed; unitLabelsFor
    // renders those as the box/pata wording they were printed with.
    form?: string;
    quantity: number;
    leftoverPatas?: number;
    ratePaisa: number;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  discountPaisa: number;
  // Absent on sales written before discounts became percentages; those print
  // the amount alone, which is what they said when they were printed.
  discountPercent?: number;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  previousDuePaisa?: number;
  cancelled: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A wholesale line's quantity, e.g. "10bx 3pt". `leftoverPatas` is absent or
 * 0 on every retail line and on a wholesale line that is whole boxes only,
 * so the old "10bx" rendering is what those keep showing.
 */
function formatWholesaleQty(
  boxes: number,
  leftoverPatas: number,
  outerShort: string,
  innerShort: string,
): string {
  if (boxes === 0 && leftoverPatas === 0) return `0${outerShort}`;
  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes}${outerShort}`);
  if (leftoverPatas > 0) parts.push(`${leftoverPatas}${innerShort}`);
  return parts.join(" ");
}

export function Invoice({
  pharmacyName,
  proprietorName,
  logoUrl,
  address,
  phone,
  invoiceNo,
  buyerName,
  buyerShopName,
  createdAt,
  items,
  subtotalPaisa,
  discountPaisa,
  discountPercent,
  totalPaisa,
  paidPaisa,
  duePaisa,
  previousDuePaisa,
  cancelled,
}: InvoiceProps) {
  const hasPriorDue = previousDuePaisa !== undefined && previousDuePaisa !== 0;
  const effectivePriorDue = previousDuePaisa ?? 0;
  const totalPayablePaisa = totalPaisa + effectivePriorDue;
  const finalDuePaisa = totalPayablePaisa - paidPaisa;

  return (
    <div
      className="invoice mx-auto max-w-[58mm] bg-white px-3 py-3 font-mono text-[10px] text-black"
      style={{ width: "58mm" }}
    >
      {cancelled && (
        <div className="mb-2 border border-red-600 p-1 text-center font-bold text-red-600">
          CANCELLED
        </div>
      )}

      <div className="mb-3 text-center">
        {logoUrl && (
          <img
            src={logoUrl}
            alt={pharmacyName}
            className="mx-auto mb-1.5 h-8 w-auto max-w-[80px] object-contain"
          />
        )}
        <div className="text-sm font-bold leading-tight">{pharmacyName}</div>
        {proprietorName && <div className="text-[9px]">স্বত্বাধিকারী - {proprietorName}</div>}
        {address && <div className="text-[9px]">{address}</div>}
        {phone && <div className="text-[9px]">Tel: {phone}</div>}
      </div>

      <div className="mb-2 border-t border-b border-dashed border-black py-1 text-[9px]">
        <div className="flex justify-between">
          <span>Invoice:</span>
          <span className="font-bold">{invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDate(createdAt)}</span>
        </div>
        {buyerName && (
          <div className="flex justify-between">
            <span>Buyer:</span>
            <span className="truncate max-w-[120px] text-right">{buyerName}</span>
          </div>
        )}
        {buyerShopName && (
          <div className="flex justify-between">
            <span>Shop:</span>
            <span className="truncate max-w-[120px] text-right">{buyerShopName}</span>
          </div>
        )}
      </div>

      <table className="mb-2 w-full text-[9px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="py-0.5 text-left">Item</th>
            <th className="py-0.5 text-right">Qty</th>
            <th className="py-0.5 text-right">Rate</th>
            <th className="py-0.5 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const labels = unitLabelsFor(item.form);
            const leftoverPatas = item.leftoverPatas ?? 0;
            const isZeroLine = item.unit === "box"
              ? item.quantity === 0 && leftoverPatas === 0
              : item.quantity === 0;
            return (
              <tr key={idx} className="border-b border-dashed border-slate-200">
                <td className="py-0.5 pr-1 leading-tight">{item.medicineName}</td>
                <td className="py-0.5 text-right whitespace-nowrap">
                  {item.unit === "box"
                    ? formatWholesaleQty(item.quantity, leftoverPatas, labels.outerShort, labels.innerShort)
                    : `${item.quantity}${labels.innerShort}`}
                </td>
                {/* A zero line is on the paper to show what was ordered and
                    could not be supplied, so it carries no price at all —
                    neither a rate nor an amount. */}
                <td className="py-0.5 text-right whitespace-nowrap">
                  {isZeroLine ? "" : formatTaka(item.ratePaisa)}
                </td>
                <td className="py-0.5 text-right whitespace-nowrap font-semibold">
                  {isZeroLine ? "" : formatTaka(item.lineTotalPaisa)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black pt-1 space-y-0.5">
        {discountPaisa > 0 && (
          <>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatTaka(subtotalPaisa)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Discount
                {discountPercent ? ` (${discountPercent}%)` : ""}
              </span>
              <span>− {formatTaka(discountPaisa)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-bold">
          <span>{hasPriorDue ? "Current Bill" : "Total"}</span>
          <span>{formatTaka(totalPaisa)}</span>
        </div>

        {hasPriorDue && (
          <>
            {previousDuePaisa! > 0 ? (
              <div className="flex justify-between">
                <span>Previous Due</span>
                <span>+ {formatTaka(previousDuePaisa!)}</span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span>Previous Advance</span>
                <span>− {formatTaka(Math.abs(previousDuePaisa!))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-dotted border-black/40 pt-0.5">
              <span>Total Due</span>
              <span>{formatTaka(totalPayablePaisa)}</span>
            </div>
          </>
        )}

        {paidPaisa > 0 && (
          <div className="flex justify-between">
            <span>Paid (Joma)</span>
            <span>− {formatTaka(paidPaisa)}</span>
          </div>
        )}

        <div className="flex justify-between font-bold border-t border-dashed border-black pt-1 mt-1">
          {finalDuePaisa > 0 ? (
            <>
              <span>Total Due (Baki)</span>
              <span>{formatTaka(finalDuePaisa)}</span>
            </>
          ) : finalDuePaisa < 0 ? (
            <>
              <span>Advance (Pabe)</span>
              <span>{formatTaka(Math.abs(finalDuePaisa))}</span>
            </>
          ) : (
            <>
              <span>Due (Baki)</span>
              <span>৳0.00</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 text-center text-[9px] text-slate-500">
        Dhanyabad! Abar asben.
      </div>
    </div>
  );
}
