"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buyerLogin } from "@/actions/auth";
import { CapsuleMark } from "@/components/Brand";
import { input, btnPrimary, label as labelCls, errorBox } from "@/components/ui";

export default function BuyerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await buyerLogin(phone, password);
    if (result.ok) {
      router.push("/buyer");
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
            Buyer Login
          </h1>
          <p className="text-xs text-muted">Phone number diye login koro</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className={labelCls}>
            Phone
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
