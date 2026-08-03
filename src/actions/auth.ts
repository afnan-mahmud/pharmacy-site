"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { AdminUserModel } from "@/models/AdminUser";
import { BuyerModel } from "@/models/Buyer";
import { verifyPassword, createSessionToken, hashPassword } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export type LoginResult =
  | { ok: true; role?: "admin" | "buyer"; redirectUrl?: string }
  | { ok: false; error: string };

// One message for failure modes: separate messages would let an attacker
// discover which usernames or phones exist.
const LOGIN_FAILED = "Username ba password bhul";

export async function login(
  identifier: string,
  password: string,
): Promise<LoginResult> {
  // login is the only unauthenticated, network-reachable action in the app
  // — anyone can POST to it directly, no page render required. A malformed
  // (non-string) identifier or password must fail exactly like a wrong
  // identifier/password: the same LOGIN_FAILED result, not a raw TypeError
  // and not some other message.
  if (typeof identifier !== "string" || typeof password !== "string") {
    return { ok: false, error: LOGIN_FAILED };
  }

  const trimmed = identifier.trim();
  if (!trimmed || !password) {
    return { ok: false, error: LOGIN_FAILED };
  }

  await connectDb();

  // 1. Check Admin user
  const adminUser = await AdminUserModel.findOne({ username: trimmed });
  if (adminUser) {
    const valid = await verifyPassword(password, adminUser.passwordHash);
    if (valid) {
      const token = await createSessionToken({
        userId: String(adminUser._id),
        role: "admin",
        name: adminUser.name,
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return { ok: true, role: "admin", redirectUrl: "/dashboard" };
    }
  }

  // 2. Check Buyer user
  const buyer = await BuyerModel.findOne({ phone: trimmed });
  if (buyer && buyer.active) {
    const valid = await verifyPassword(password, buyer.passwordHash);
    if (valid) {
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

      return { ok: true, role: "buyer", redirectUrl: "/buyer" };
    }
  }

  return { ok: false, error: LOGIN_FAILED };
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

  return { ok: true, role: "buyer", redirectUrl: "/buyer" };
}

export async function buyerLogout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function registerBuyer(
  name: string,
  phone: string,
  shopName: string,
  address: string,
  password: string,
): Promise<LoginResult> {
  if (
    typeof name !== "string" ||
    typeof phone !== "string" ||
    typeof shopName !== "string" ||
    typeof address !== "string" ||
    typeof password !== "string"
  ) {
    return { ok: false, error: "Tothyo sothik noy" };
  }

  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  const cleanShopName = shopName.trim();
  const cleanAddress = address.trim();

  if (!cleanName) return { ok: false, error: "Nam dorkar" };
  if (!cleanPhone) return { ok: false, error: "Phone number dorkar" };
  // We'll let hashPassword throw if the password is too short (min 6).
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Password sothik noy",
    };
  }

  await connectDb();

  try {
    const buyer = await BuyerModel.create({
      name: cleanName,
      phone: cleanPhone,
      shopName: cleanShopName,
      address: cleanAddress,
      passwordHash,
      active: true, // Auto-active for self-registration
    });

    // Auto-login after successful registration
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
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      return { ok: false, error: "Ei phone number already ase" };
    }
    console.error("Buyer registration error:", error);
    return { ok: false, error: "Registration e shomossha hoyeche" };
  }
}
