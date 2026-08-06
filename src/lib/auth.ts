import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "buyer";

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
  /**
   * Buyers only: the Buyer.sessionVersion this token was signed against, so
   * the guards can tell a current login from one the owner has since revoked
   * (see src/lib/session.ts). Optional because an admin has no such counter —
   * and because a token issued before the field existed simply has none,
   * which reads as 0, the value every buyer starts at.
   */
  sessionVersion?: number;
};

const SESSION_DURATION = "7d";

const MIN_SESSION_SECRET_LENGTH = 32;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long ` +
        `(got ${secret.length}). A short secret makes session tokens brute-forceable offline.`,
    );
  }
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
    // Pin the algorithm explicitly. A Uint8Array key already restricts jose
    // to HMAC, so this isn't exploitable today, but it's cheap defense-in-depth
    // in case this module ever grows asymmetric keys (e.g. RS256) alongside
    // HS256 — an attacker shouldn't be able to pick the algorithm.
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const { userId, role, name, sessionVersion } = payload as Record<
      string,
      unknown
    >;
    if (typeof userId !== "string") return null;
    if (role !== "admin" && role !== "buyer") return null;
    if (typeof name !== "string") return null;
    // Present-but-wrong-type is a malformed token, not an old one: an absent
    // version is the legitimate legacy case and reads as 0 downstream.
    if (sessionVersion !== undefined && typeof sessionVersion !== "number") {
      return null;
    }
    return { userId, role, name, sessionVersion: sessionVersion as number | undefined };
  } catch {
    return null;
  }
}
