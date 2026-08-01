import { notFound } from "next/navigation";
import { getOrderForAdmin, currentWholesalePrices } from "@/actions/adminOrders";
import { OrderEditor } from "@/components/OrderEditor";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderForAdmin(id);

  if (!order || order.status !== "pending") {
    notFound();
  }

  // Fetch current prices so the admin sees exactly what they are approving
  const uniqueMedicineIds = [
    ...new Set(
      order.items
        .map((i) => (i.medicineId ? String(i.medicineId) : null))
        .filter((id): id is string => id !== null),
    ),
  ];
  
  const priceMap = await currentWholesalePrices(uniqueMedicineIds);

  return <OrderEditor order={order} currentPrices={priceMap} />;
}
