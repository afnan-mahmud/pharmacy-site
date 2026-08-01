import { listMyOrders } from "@/actions/buyerOrders";
import { BuyerOrderList, type OrderRow } from "@/components/BuyerOrderList";

export default async function MyOrdersPage() {
  const orders = await listMyOrders();

  const rows: OrderRow[] = orders.map((o) => ({
    id: o._id,
    createdAt: o.createdAt,
    status: o.status,
    rejectReason: o.rejectReason,
    items: o.items.map((i) => ({
      medicineName: i.medicineName,
      form: i.form,
      boxes: i.boxes,
      patas: i.patas,
      wholesaleBoxPricePaisa: i.wholesaleBoxPricePaisa,
      wholesalePataPricePaisa: i.wholesalePataPricePaisa,
    })),
  }));

  return <BuyerOrderList orders={rows} />;
}
