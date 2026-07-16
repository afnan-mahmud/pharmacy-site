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
