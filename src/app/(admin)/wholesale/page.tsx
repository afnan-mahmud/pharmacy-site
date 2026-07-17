import { listBuyers } from "@/actions/buyers";
import { WholesaleSaleForm } from "@/components/WholesaleSaleForm";

export default async function WholesalePage() {
  // Only active buyers can receive wholesale sales.
  const buyers = await listBuyers(false);

  const buyerOptions = buyers.map((b) => ({
    id: b._id,
    name: b.name,
    shopName: b.shopName,
  }));

  return <WholesaleSaleForm buyers={buyerOptions} />;
}
