import { requireBuyer } from "@/lib/session";
import { myDueBalance, myLedger } from "@/actions/buyerOrders";
import { readSettings } from "@/actions/settings";
import { BuyerModel } from "@/models/Buyer";
import { connectDb } from "@/lib/db";
import { BuyerAccountView } from "@/components/BuyerAccountView";

export default async function BuyerAccountPage() {
  const session = await requireBuyer();
  await connectDb();

  const [duePaisa, ledger, settings, buyer] = await Promise.all([
    myDueBalance(),
    myLedger(),
    readSettings(),
    BuyerModel.findById(session.userId).lean(),
  ]);

  return (
    <BuyerAccountView
      pharmacyName={settings.pharmacyName}
      buyerName={session.name}
      buyerShopName={buyer?.shopName || "দোকানের হিসাব"}
      buyerPhone={buyer?.phone || ""}
      duePaisa={duePaisa}
      sales={ledger.sales.map((s) => ({
        _id: String(s._id),
        invoiceNo: s.invoiceNo,
        createdAt: s.createdAt,
        status: s.status,
        subtotalPaisa: s.subtotalPaisa,
        discountPercent: s.discountPercent,
        discountPaisa: s.discountPaisa,
        totalPaisa: s.totalPaisa,
        paidPaisa: s.paidPaisa,
        duePaisa: s.duePaisa,
        previousDuePaisa: s.previousDuePaisa,
        items: s.items.map((it) => ({
          medicineName: it.medicineName,
          unit: it.unit,
          form: it.form,
          quantity: it.quantity,
          leftoverPatas: it.leftoverPatas,
          ratePaisa: it.ratePaisa,
          lineTotalPaisa: it.lineTotalPaisa,
        })),
      }))}
      payments={ledger.payments.map((p) => ({
        _id: String(p._id),
        amountPaisa: p.amountPaisa,
        note: p.note,
        createdAt: p.createdAt,
      }))}
    />
  );
}
