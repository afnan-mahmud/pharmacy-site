"use client";

import { useEffect } from "react";
import { card, btnPrimary, btnGhost, pageTitle } from "@/components/ui";

/**
 * The fallback every error.tsx boundary renders.
 *
 * Lives here rather than being written out four times so the wording and the
 * two recovery affordances stay identical wherever a render fails; the
 * boundaries themselves stay thin because Next requires each to be its own
 * file at a specific path.
 *
 * Two ways out, on purpose. `retry` re-runs the failed segment, which is the
 * right move for the failure this app actually hits most — a transient
 * MongoDB blip during an Atlas failover, where the very next attempt
 * succeeds. But a retry that keeps failing leaves the user stuck on this
 * screen, so there is always a plain link to somewhere known-good.
 */
export function ErrorState({
  error,
  retry,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // In a production build Next replaces the real message with a digest
    // before the error reaches the client, so this is not the place the
    // actual cause shows up — the server log is. Logging it anyway puts the
    // digest in the browser console, which is what ties a user's "it broke"
    // to the matching server-side entry.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10">
      <div className={`${card} w-full p-6 text-center`}>
        <h2 className={pageTitle}>Kichu ekta bhul holo</h2>
        <p className="mt-2 text-sm text-muted">
          Ei page ta load korte somossha hoyeche. Abar cheshta korun — bar bar
          hole ektu por try korben.
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-muted">
            Error code: <span className="font-mono">{error.digest}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={retry} className={btnPrimary}>
            Abar cheshta korun
          </button>
          <a href={homeHref} className={btnGhost}>
            {homeLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
