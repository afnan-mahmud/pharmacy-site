"use client";

import { ErrorState } from "@/components/ErrorState";

/** The buyer-portal counterpart of (admin)/error.tsx — see that file. */
export default function BuyerError({
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
      homeHref="/buyer"
      homeLabel="Home e firun"
    />
  );
}
