"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/auth";
import { CapsuleMark } from "@/components/Brand";
import { input, btnPrimary, label as labelCls, errorBox } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await login(username, password);
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-tint to-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-line bg-surface p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <CapsuleMark className="h-11 w-11" />
          <h1 className="font-display text-xl font-extrabold text-ink">
            Admin Login
          </h1>
          <p className="text-xs text-muted">Pharmacy management panel</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="username" className={labelCls}>
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className={input}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className={labelCls}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={input}
          />
        </div>

        {error && (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={`w-full ${btnPrimary} py-3`}>
          {busy ? "Wait..." : "Login"}
        </button>
      </form>
    </main>
  );
}
