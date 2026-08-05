"use client";

import "./globals.css";
import { ErrorState } from "@/components/ErrorState";

/**
 * The last line of defence: a failure in the root layout itself, which no
 * error.tsx can catch because a boundary never wraps the layout in its own
 * segment.
 *
 * When this renders it *replaces* the root layout, so it has to supply its
 * own <html> and <body> — and its own stylesheet import, since the root
 * layout's is gone with it. The fonts are deliberately not re-declared here:
 * next/font sets CSS variables from the layout that is no longer rendering,
 * so this screen falls back to the system stack rather than shipping a font
 * pipeline into the one code path that must work when everything else is
 * broken.
 *
 * metadata cannot be exported from a client component, hence the plain
 * <title> element.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <title>Kichu ekta bhul holo</title>
        <ErrorState
          error={error}
          retry={unstable_retry}
          homeHref="/"
          homeLabel="Shurute firun"
        />
      </body>
    </html>
  );
}
