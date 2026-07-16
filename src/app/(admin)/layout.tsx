import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/actions/settings";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav pharmacyName={settings.pharmacyName} />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
