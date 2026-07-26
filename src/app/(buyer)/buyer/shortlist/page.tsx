import { requireBuyer } from "@/lib/session";
import { BuyerModel } from "@/models/Buyer";
import { connectDb } from "@/lib/db";
import { BuyerShortlist } from "@/components/BuyerShortlist";

export default async function ShortlistPage() {
  const session = await requireBuyer();
  await connectDb();
  const buyer = await BuyerModel.findById(session.userId).lean();

  return (
    <BuyerShortlist 
      buyerName={buyer?.name || ""}
      buyerPhone={buyer?.phone || ""}
      buyerAddress={buyer?.shopName || ""}
    />
  );
}
