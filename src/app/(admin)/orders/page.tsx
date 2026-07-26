import { listPendingOrders } from "@/actions/adminOrders";
import { PendingOrders } from "@/components/PendingOrders";

export default async function OrdersPage() {
  const orders = await listPendingOrders();
  return <PendingOrders orders={orders} />;
}
