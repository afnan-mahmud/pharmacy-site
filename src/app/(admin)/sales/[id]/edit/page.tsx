import { notFound } from "next/navigation";
import { getSale, currentPricesForSale } from "@/actions/sales";
import { SaleEditor } from "@/components/SaleEditor";

export const metadata = {
  title: "অর্ডার / বিক্রির হিসাব এডিট",
};

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(id);

  if (!sale) {
    notFound();
  }

  const medicineIds = sale.items
    .map((item) => (item.medicineId ? String(item.medicineId) : null))
    .filter((id): id is string => Boolean(id));

  const currentPrices = await currentPricesForSale(medicineIds, sale.type);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <SaleEditor sale={sale} currentPrices={currentPrices} />
    </main>
  );
}
