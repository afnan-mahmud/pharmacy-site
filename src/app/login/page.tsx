"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/auth";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">Login</h1>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm text-slate-700">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Login"}
        </button>
      </form>
    </main>
  );
}
