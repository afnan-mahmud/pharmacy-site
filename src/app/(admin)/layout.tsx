import { cache } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/actions/settings";
import { AdminNav } from "@/components/AdminNav";

// Memoized per-request so generateMetadata() and the layout body below share
// one DB round trip instead of each calling getSettings() independently.
// react's cache() is the right tool here (not something added to
// src/actions/settings.ts) because settings.ts is a "use server" module,
// where every export must be an async function declaration — a
// cache()-wrapped export would violate that. Scoping the wrapper to this
// layout also keeps the memoization confined to the one place that
// currently double-fetches.
const getCachedSettings = cache(getSettings);

export async function generateMetadata(): Promise<Metadata> {
  // getSettings() is now a guarded Server Action (it's admin-only work, same
  // as everything else in src/actions/) — it throws for anyone without a
  // valid admin session instead of just returning data. generateMetadata()
  // runs independently of (and can run before) AdminLayout's own body below,
  // so without this call an unauthenticated visit to an admin route would
  // surface getSettings()'s thrown Error as an unhandled render error here,
  // instead of the redirect-to-login the layout body produces. Calling the
  // page-guard first keeps this path's failure mode identical to the layout
  // body's: redirect, not throw.
  await requireAdmin();
  const settings = await getCachedSettings();
  return { title: settings.pharmacyName };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const settings = await getCachedSettings();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav pharmacyName={settings.pharmacyName} />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
