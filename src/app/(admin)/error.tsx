"use client";

import { ErrorState } from "@/components/ErrorState";

/**
 * Catches a failed render anywhere under the admin route group — a Mongo
 * timeout inside dashboardSummary or listMedicines, a thrown domain error
 * from salesReport's date parsing, and so on.
 *
 * Server Action failures do not land here: actionResult (src/lib/actionResult.ts)
 * already returns those to the form as data. This boundary is specifically
 * for the page-render path, which before it had no fallback at all and showed
 * the framework's raw error screen.
 *
 * It does NOT cover (admin)/layout.tsx itself — Next's boundaries never wrap
 * the layout in their own segment — so a readSettings() failure in that layout
 * falls through to src/app/error.tsx. That is why both files exist.
 */
export default function AdminError({
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
      homeHref="/dashboard"
      homeLabel="Dashboard e firun"
    />
  );
}
