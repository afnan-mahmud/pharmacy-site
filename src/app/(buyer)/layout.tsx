import { requireBuyer } from "@/lib/session";
import { readSettings } from "@/actions/settings";
import { BuyerNav } from "@/components/BuyerNav";
import { BuyerBottomNav } from "@/components/BuyerBottomNav";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBuyer();
  const settings = await readSettings();

  return (
    <div className="min-h-screen bg-canvas">
      <BuyerNav
        pharmacyName={settings.pharmacyName}
        tagline={settings.tagline}
        logoUrl={settings.logoUrl}
        buyerName={session.name}
      />
      {/* Bottom padding leaves room for the fixed mobile tab bar. */}
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-4 md:pb-8">{children}</main>
      <BuyerBottomNav />
    </div>
  );
}
