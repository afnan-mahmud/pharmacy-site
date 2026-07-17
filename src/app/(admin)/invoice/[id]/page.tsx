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

  // Only wholesale sales have invoice numbers and are printable.
  if (sale.type !== "wholesale") notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-3">
        <PrintButton />
        {sale.status === "active" && (
          <form
            action={async () => {
              "use server";
              await cancelSale(id, "Admin er maddome cancel kora hoyeche");
              revalidatePath(`/invoice/${id}`);
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
          quantity: item.quantity,
          ratePaisa: item.ratePaisa,
          lineTotalPaisa: item.lineTotalPaisa,
        }))}
        subtotalPaisa={sale.subtotalPaisa}
        discountPaisa={sale.discountPaisa ?? 0}
        totalPaisa={sale.totalPaisa}
        paidPaisa={sale.paidPaisa}
        duePaisa={sale.duePaisa}
        cancelled={sale.status === "cancelled"}
      />
    </div>
  );
}
