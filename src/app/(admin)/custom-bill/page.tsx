import { Suspense } from "react";
import { WholesaleSaleForm } from "@/components/WholesaleSaleForm";
import { BuyerModel } from "@/models/Buyer";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";

export const metadata = {
  title: "Custom Bill Generate | Becha-Kena Admin",
};

export default async function CustomBillPage() {
  await requireAdminAction();
  await connectDb();

  const buyers = await BuyerModel.find({ active: true })
    .select("name shopName")
    .sort({ name: 1 })
    .lean<{ _id: any; name: string; shopName: string }[]>();

  const buyerOptions = buyers.map((b) => ({
    id: String(b._id),
    name: b.name,
    shopName: b.shopName,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="animate-pulse bg-surface h-96 rounded-3xl" />}>
        <WholesaleSaleForm buyers={buyerOptions} allowCustomItems={true} />
      </Suspense>
    </div>
  );
}
