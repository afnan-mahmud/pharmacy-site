import { requireBuyer } from "@/lib/session";
import { readSettings } from "@/actions/settings";
import { BuyerNav } from "@/components/BuyerNav";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBuyer();
  const settings = await readSettings();

  return (
    <div className="min-h-screen bg-slate-50">
      <BuyerNav pharmacyName={settings.pharmacyName} buyerName={session.name} />
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
