import { notFound } from "next/navigation";
import { getSale } from "@/actions/sales";
import { readSettings } from "@/actions/settings";
import { Invoice } from "@/components/Invoice";
import { PrintButton } from "@/components/PrintButton";
import { cancelSale } from "@/actions/sales";
import { revalidatePath } from "next/cache";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sale, settings] = await Promise.all([getSale(id), readSettings()]);
  if (!sale) notFound();


  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-3">
        <PrintButton />
        {sale.status === "active" && (
          <form
            action={async (formData: FormData) => {
              "use server";
              const reason = String(formData.get("reason") ?? "");
              // cancelSale itself rejects a blank reason — the required
              // attribute below is just a client-side head start, not a
              // substitute for that server-side check.
              const result = await cancelSale(id, reason);
              // This form has nowhere to render a message, so a failure is
              // re-thrown rather than silently revalidating as if the sale
              // had been cancelled. The reason still reaches the server log.
              if (!result.ok) throw new Error(result.error);
              revalidatePath(`/invoice/${id}`);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              name="reason"
              required
              placeholder="Cancel korar karon"
              className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-full border border-danger/50 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg"
            >
              Cancel bikri
            </button>
          </form>
        )}
      </div>

      <Invoice
        pharmacyName={settings.pharmacyName}
        address={settings.address ?? ""}
        phone={settings.phone ?? ""}
        invoiceNo={sale.invoiceNo ?? ""}
        buyerName={sale.buyerName ?? ""}
        buyerShopName={sale.buyerShopName ?? ""}
        createdAt={sale.createdAt}
        items={sale.items.map((item) => ({
          medicineName: item.medicineName,
          unit: item.unit,
          form: item.form,
          quantity: item.quantity,
          leftoverPatas: item.leftoverPatas,
          ratePaisa: item.ratePaisa,
          lineTotalPaisa: item.lineTotalPaisa,
        }))}
        subtotalPaisa={sale.subtotalPaisa}
        discountPaisa={sale.discountPaisa ?? 0}
        discountPercent={sale.discountPercent ?? 0}
        totalPaisa={sale.totalPaisa}
        paidPaisa={sale.paidPaisa}
        duePaisa={sale.duePaisa}
        cancelled={sale.status === "cancelled"}
      />
    </div>
  );
}
