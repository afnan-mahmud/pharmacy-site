import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "buyer";

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
};

const SESSION_DURATION = "7d";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey());
}

export async function readSessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { userId, role, name } = payload as Record<string, unknown>;
    if (typeof userId !== "string") return null;
    if (role !== "admin" && role !== "buyer") return null;
    if (typeof name !== "string") return null;
    return { userId, role, name };
  } catch {
    return null;
  }
}
