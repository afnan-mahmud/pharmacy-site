import { listBuyers } from "@/actions/buyers";
import { BuyerTable, type BuyerRow } from "@/components/BuyerTable";

export default async function BuyersPage() {
  // Inactive buyers stay visible here so the owner can reactivate one.
  const buyers = await listBuyers(true);

  const rows: BuyerRow[] = buyers.map((b) => ({
    id: b._id,
    name: b.name,
    shopName: b.shopName,
    phone: b.phone,
    address: b.address,
    active: b.active,
  }));

  return <BuyerTable buyers={rows} />;
}
