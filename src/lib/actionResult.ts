/**
 * Server Actions return their failures as data instead of throwing them.
 *
 * Next.js redacts the message of any error that escapes a Server Action in a
 * production build, replacing it with "An error occurred in the Server
 * Components render..." and a digest. That is right for an unexpected crash —
 * it stops internals leaking — but it also destroyed every message this app
 * meant the user to read: "Ei phone number already exists" reached the
 * pharmacy owner as a paragraph about digests. A returned value is not
 * redacted, so anything the user is supposed to act on comes back as one.
 *
 * Unexpected failures still reach the caller as messages here rather than
 * crashing the page, which is the right trade for a form: the owner sees that
 * something went wrong and the server log keeps the stack.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Next's own control flow — redirect() and notFound() — is implemented by
 * throwing an error the framework catches. Swallowing one would turn a
 * redirect into an error message on the page it was trying to leave, so those
 * are re-thrown untouched.
 */
function isFrameworkControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

export async function actionResult<T>(
  run: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (isFrameworkControlFlow(error)) throw error;
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Kichu ekta bhul holo",
    };
  }
}
