import Link from "next/link";
import { notFound } from "next/navigation";
import { getMySale } from "@/actions/buyerOrders";
import { readSettings } from "@/actions/settings";
import { Invoice } from "@/components/Invoice";
import { PrintButton } from "@/components/PrintButton";

export default async function BuyerInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sale, settings] = await Promise.all([getMySale(id), readSettings()]);
  if (!sale) notFound();

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/buyer/account"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink transition hover:border-brand hover:text-brand-strong shadow-xs"
        >
          <span>←</span>
          <span>একাউন্ট ও লেজারে ফিরে যান</span>
        </Link>

        <div className="flex items-center gap-3">
          <PrintButton />
        </div>
      </div>

      <Invoice
        pharmacyName={settings.pharmacyName}
        proprietorName={settings.proprietorName ?? ""}
        logoUrl={settings.logoUrl ?? ""}
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
        previousDuePaisa={sale.previousDuePaisa}
        cancelled={sale.status === "cancelled"}
      />
    </div>
  );
}
