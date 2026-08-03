import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, type SessionPayload } from "@/lib/auth";

export const SESSION_COOKIE = "session";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  return session;
}

export const ADMIN_ONLY_ERROR = "Admin login chara ei kaj kora jabe na";

/**
 * Guards a Server Action, as opposed to requireAdmin() which guards a page
 * render.
 *
 * Server Actions are independently-callable POST endpoints — their action
 * IDs ship in the client bundle, so they're reachable directly with no page
 * render or browser navigation in flight. redirect() only makes sense when
 * Next.js is rendering a page and can turn the special control-flow error
 * it throws into a real HTTP redirect response; called from an action
 * invoked out-of-band (no page involved), there is nothing for it to
 * redirect. Throwing a plain Error instead surfaces as the same "ordinary
 * caught error" every action-calling component already displays via
 * `err.message` (see StockInForm/MedicineForm's catch blocks) — the honest
 * failure mode for a POST-shaped entry point, and it composes correctly
 * with client code that already expects actions to reject rather than
 * navigate out from under it.
 *
 * Kept as a separate function rather than a parameter on requireAdmin()
 * so that the page-guard's redirect behavior (which src/app/(admin)/layout.tsx
 * depends on) can never be accidentally weakened by a call site that meant
 * to ask for the action-guard instead.
 */
export async function requireAdminAction(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error(ADMIN_ONLY_ERROR);
  }
  return session;
}

export const BUYER_ONLY_ERROR = "Buyer login chara ei kaj kora jabe na";

/** Page guard for buyer routes — redirects a non-buyer to the login page. */
export async function requireBuyer(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") redirect("/login");
  return session;
}

/**
 * Action guard for buyer server actions. Throws rather than redirects, for
 * the same reason requireAdminAction does: a server action is a POST-shaped
 * endpoint with no page render to turn a redirect into. See requireAdminAction.
 *
 * This proves only that *some* buyer is calling. It does NOT prove the buyer
 * owns the data an action names — that check must live in each action, which
 * is the only place that knows which order or balance is being touched.
 */
export async function requireBuyerAction(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") {
    throw new Error(BUYER_ONLY_ERROR);
  }
  return session;
}
