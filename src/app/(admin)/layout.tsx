import { cache } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { readSettings } from "@/actions/settings";
import { AdminNav } from "@/components/AdminNav";
import { AdminBottomNav } from "@/components/AdminBottomNav";

// Memoized per-request so generateMetadata() and the layout body below share
// one DB round trip instead of each calling readSettings() independently.
// react's cache() is the right tool here (not something added to
// src/actions/settings.ts) because settings.ts is a "use server" module,
// where every export must be an async function declaration — a
// cache()-wrapped export would violate that. Scoping the wrapper to this
// layout also keeps the memoization confined to the one place that
// currently double-fetches.
//
// This reads via readSettings(), not getSettings(): the nav/title here only
// ever display the pharmacy name, they never need getSettings()'s upsert.
// requireAdmin() below is still what actually gates this route — readSettings()
// itself is intentionally unguarded (see src/actions/settings.ts), so it isn't
// standing in as the auth check.
const getCachedSettings = cache(readSettings);

export async function generateMetadata(): Promise<Metadata> {
  // requireAdmin() is a page-guard: it redirects (rather than throws) an
  // unauthenticated visitor. generateMetadata() runs independently of (and
  // can run before) AdminLayout's own body below, so without this call an
  // unauthenticated visit to an admin route could reach readSettings()
  // (which no longer throws for anyone — see Fix 2) and render a title
  // before ever being redirected. Calling the page-guard first keeps this
  // path's failure mode identical to the layout body's: redirect, not render.
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
    <div className="min-h-screen bg-canvas">
      <AdminNav pharmacyName={settings.pharmacyName} tagline={settings.tagline} />
      {/* Bottom padding leaves room for the fixed mobile tab bar. */}
      <main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:pb-6">{children}</main>
      <AdminBottomNav />
    </div>
  );
}
