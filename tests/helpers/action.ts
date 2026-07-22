import type { ActionResult } from "@/lib/actionResult";

/**
 * Turns an ActionResult back into the throw-or-value shape a test reads most
 * naturally, so a failure assertion stays `rejects.toThrow("...")` and a happy
 * path stays a plain value.
 *
 * The actions return failures as data because Next.js redacts thrown messages
 * in production (see src/lib/actionResult.ts). That matters at the browser
 * boundary; inside a test it is just noise, and unwrapping keeps each test
 * about the behaviour it is checking rather than about the transport shape.
 */
export async function unwrap<T>(
  promise: Promise<ActionResult<T>>,
): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
