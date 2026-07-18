import { listPendingOrders } from "@/actions/adminOrders";
import { PendingOrders, type PendingOrderRow } from "@/components/PendingOrders";

export default async function OrdersPage() {
  const orders = await listPendingOrders();

  const rows: PendingOrderRow[] = orders.map((o) => ({
    id: o._id,
    createdAt: o.createdAt,
    buyerName: o.buyerName,
    buyerShopName: o.buyerShopName,
    items: o.items.map((i) => ({
      medicineId: String(i.medicineId),
      medicineName: i.medicineName,
      boxes: i.boxes,
      boxPricePaisa: i.boxPricePaisa,
    })),
  }));

  return <PendingOrders orders={rows} />;
}
