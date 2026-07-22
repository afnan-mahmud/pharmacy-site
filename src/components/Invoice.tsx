import { formatTaka } from "@/lib/money";
import { unitLabelsFor } from "@/lib/unitLabels";

type InvoiceProps = {
  pharmacyName: string;
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

export function Invoice({
  pharmacyName,
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
  cancelled,
}: InvoiceProps) {
  return (
    <div
      className="invoice mx-auto max-w-sm bg-white px-4 py-4 font-mono text-xs text-black"
      style={{ width: "80mm" }}
    >
      {cancelled && (
        <div className="mb-2 border border-red-600 p-1 text-center font-bold text-red-600">
          CANCELLED
        </div>
      )}

      <div className="mb-4 text-center">
        <div className="text-base font-bold">{pharmacyName}</div>
        {address && <div>{address}</div>}
        {phone && <div>Tel: {phone}</div>}
      </div>

      <div className="mb-2 border-t border-b border-dashed border-black py-1">
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
            <span>{buyerName}</span>
          </div>
        )}
        {buyerShopName && (
          <div className="flex justify-between">
            <span>Shop:</span>
            <span>{buyerShopName}</span>
          </div>
        )}
      </div>

      <table className="mb-2 w-full">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="py-1 text-left">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const labels = unitLabelsFor(item.form);
            return (
              <tr key={idx} className="border-b border-dashed border-slate-200">
                <td className="py-1 pr-1">{item.medicineName}</td>
                <td className="py-1 text-right">
                  {item.quantity}
                  {item.unit === "box" ? labels.outerShort : labels.innerShort}
                </td>
                {/* A zero line is on the paper to show what was ordered and
                    could not be supplied, so it carries no price at all —
                    neither a rate nor an amount. */}
                <td className="py-1 text-right">
                  {item.quantity === 0 ? "" : formatTaka(item.ratePaisa)}
                </td>
                <td className="py-1 text-right">
                  {item.quantity === 0 ? "" : formatTaka(item.lineTotalPaisa)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black pt-1">
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
          <span>Total</span>
          <span>{formatTaka(totalPaisa)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>{formatTaka(paidPaisa)}</span>
        </div>
        {duePaisa > 0 && (
          <div className="flex justify-between font-bold">
            <span>Due</span>
            <span>{formatTaka(duePaisa)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-xs text-slate-500">
        Dhanyabad! Abar asben.
      </div>
    </div>
  );
}
