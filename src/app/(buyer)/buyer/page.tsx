import { requireBuyer } from "@/lib/session";
import { readSettings } from "@/actions/settings";
import { BuyerDashboard } from "@/components/BuyerDashboard";
import { BuyerModel } from "@/models/Buyer";
import { connectDb } from "@/lib/db";

export default async function BuyerHomePage() {
  const session = await requireBuyer();
  const settings = await readSettings();
  
  await connectDb();
  const buyer = await BuyerModel.findById(session.userId).lean();

  return (
    <BuyerDashboard 
      pharmacyName={settings.pharmacyName}
      buyerName={session.name}
      buyerShop={buyer?.shopName || "Pharmacy Shop"}
      aboutUs={settings.aboutUs ?? ""}
      phone={settings.phone}
    />
  );
}
