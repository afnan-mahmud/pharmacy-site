"use client";

import { ErrorState } from "@/components/ErrorState";

/**
 * The catch-all boundary: the login screens, and — more importantly — any
 * failure inside (admin)/layout.tsx or (buyer)/layout.tsx, which their own
 * sibling error.tsx files cannot catch (a boundary never wraps the layout in
 * its own segment).
 *
 * That layout case is the realistic one. Both layouts call readSettings()
 * before rendering anything, so a database that is briefly unreachable fails
 * there rather than in the page, and without this file it would reach the
 * user as the framework's raw error screen on every admin and buyer route at
 * once.
 *
 * Home points at "/" rather than a role-specific screen because at this depth
 * the failure may well be the layout that establishes which role we are in.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      homeHref="/"
      homeLabel="Shurute firun"
    />
  );
}
