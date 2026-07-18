import { listPendingOrders, currentBoxPrices } from "@/actions/adminOrders";
import { PendingOrders, type PendingOrderRow } from "@/components/PendingOrders";

export default async function OrdersPage() {
  const orders = await listPendingOrders();

  // Approval bills at each medicine's current box price, not the price the
  // buyer saw when ordering. Fetch the current prices so the preview total on
  // this screen matches the invoice the owner is about to create. A medicine
  // that is gone or deactivated is absent from the map, so its line falls back
  // to the order's snapshot price for display.
  const uniqueMedicineIds = [
    ...new Set(
      orders.flatMap((o) => o.items.map((i) => String(i.medicineId))),
    ),
  ];
  const priceMap = await currentBoxPrices(uniqueMedicineIds);

  const rows: PendingOrderRow[] = orders.map((o) => ({
    id: o._id,
    createdAt: o.createdAt,
    buyerName: o.buyerName,
    buyerShopName: o.buyerShopName,
    items: o.items.map((i) => {
      const medicineId = String(i.medicineId);
      return {
        medicineId,
        medicineName: i.medicineName,
        boxes: i.boxes,
        boxPricePaisa: priceMap[medicineId] ?? i.boxPricePaisa,
      };
    }),
  }));

  return <PendingOrders orders={rows} />;
}
