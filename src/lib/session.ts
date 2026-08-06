import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, type SessionPayload } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { BuyerModel } from "@/models/Buyer";

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
export const BUYER_INACTIVE_ERROR = "Apnar account bondho ache";
export const BUYER_SESSION_STALE_ERROR =
  "Apnar login ar cholbe na — abar login korun";

/**
 * Confirms the buyer behind a signed token is still allowed to use it.
 *
 * A session is a stateless 7-day JWT, so nothing about switching an account
 * off or resetting its password reaches a token already in someone's
 * browser. Checking here, in the guard every buyer entry point already
 * calls, is what makes that structural: submitOrder and submitShortlist used
 * to re-read `active` themselves and the read paths — the price list, the
 * order history, the ledger, an invoice — did not, so a deactivated buyer
 * kept full read access to the wholesale catalogue for up to a week. A rule
 * enforced per action is a rule the next action forgets.
 *
 * Returns a reason rather than throwing so the two guards can do what suits
 * them: an action rejects, a page redirects.
 */
async function buyerSessionProblem(
  session: SessionPayload,
): Promise<string | null> {
  await connectDb();
  const buyer = await BuyerModel.findById(session.userId)
    .select("active sessionVersion")
    .lean<{ active: boolean; sessionVersion?: number }>();

  if (!buyer || !buyer.active) return BUYER_INACTIVE_ERROR;
  // Absent on both sides means a token and a document that predate the
  // field; 0 === 0 and the session stands, which is right — the owner has
  // not revoked anything.
  if ((buyer.sessionVersion ?? 0) !== (session.sessionVersion ?? 0)) {
    return BUYER_SESSION_STALE_ERROR;
  }
  return null;
}

/** Page guard for buyer routes — redirects a non-buyer to the login page. */
export async function requireBuyer(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") redirect("/login");
  // A revoked session is no more usable than no session, so it lands in the
  // same place rather than on an error screen the buyer can do nothing with.
  if (await buyerSessionProblem(session)) redirect("/login");
  return session;
}

/**
 * Action guard for buyer server actions. Throws rather than redirects, for
 * the same reason requireAdminAction does: a server action is a POST-shaped
 * endpoint with no page render to turn a redirect into. See requireAdminAction.
 *
 * This proves that some buyer is calling and that their session has not been
 * revoked (see buyerSessionProblem). It does NOT prove the buyer owns the
 * data an action names — that check must live in each action, which is the
 * only place that knows which order or balance is being touched.
 */
export async function requireBuyerAction(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") {
    throw new Error(BUYER_ONLY_ERROR);
  }
  const problem = await buyerSessionProblem(session);
  if (problem) throw new Error(problem);
  return session;
}
