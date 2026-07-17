"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { AdminUserModel } from "@/models/AdminUser";
import { BuyerModel } from "@/models/Buyer";
import { verifyPassword, createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export type LoginResult = { ok: true } | { ok: false; error: string };

// One message for both failure modes: separate messages would let an attacker
// discover which usernames exist.
const LOGIN_FAILED = "Username ba password bhul";

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  // login is the only unauthenticated, network-reachable action in the app
  // — anyone can POST to it directly, no page render required. A malformed
  // (non-string) username or password must fail exactly like a wrong
  // username/password: the same LOGIN_FAILED result, not a raw TypeError
  // and not some other message. Either of those would itself be a new
  // distinguishable signal an attacker could use to probe the endpoint,
  // on top of the username-enumeration signal LOGIN_FAILED already exists
  // to prevent.
  if (typeof username !== "string" || typeof password !== "string") {
    return { ok: false, error: LOGIN_FAILED };
  }

  await connectDb();

  const user = await AdminUserModel.findOne({ username: username.trim() });
  if (!user) return { ok: false, error: LOGIN_FAILED };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: LOGIN_FAILED };

  const token = await createSessionToken({
    userId: String(user._id),
    role: "admin",
    name: user.name,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

// Same discipline as admin login: one message for wrong-phone, wrong-password,
// and inactive-account, so the endpoint can't be probed for which phones exist
// or which accounts are active.
const BUYER_LOGIN_FAILED = "Phone ba password bhul";

export async function buyerLogin(
  phone: string,
  password: string,
): Promise<LoginResult> {
  if (typeof phone !== "string" || typeof password !== "string") {
    return { ok: false, error: BUYER_LOGIN_FAILED };
  }

  await connectDb();

  const buyer = await BuyerModel.findOne({ phone: phone.trim() });
  if (!buyer) return { ok: false, error: BUYER_LOGIN_FAILED };
  // An inactive buyer fails identically to a wrong password — the account
  // still exists (with its order history), it just cannot sign in.
  if (!buyer.active) return { ok: false, error: BUYER_LOGIN_FAILED };

  const valid = await verifyPassword(password, buyer.passwordHash);
  if (!valid) return { ok: false, error: BUYER_LOGIN_FAILED };

  const token = await createSessionToken({
    userId: String(buyer._id),
    role: "buyer",
    name: buyer.name,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true };
}

export async function buyerLogout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/buyer/login");
}
