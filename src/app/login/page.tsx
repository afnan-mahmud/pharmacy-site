"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/auth";
import { readSettings } from "@/actions/settings";
import { CapsuleMark } from "@/components/Brand";
import { input, btnPrimary, label as labelCls, errorBox } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pharmacyName, setPharmacyName] = useState("Green Pharma & Surgical");

  useEffect(() => {
    readSettings().then(settings => {
      setPharmacyName(settings.pharmacyName);
    }).catch(console.error);
  }, []);

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
    <div className="flex min-h-screen flex-col bg-canvas pb-20 pt-16">
      <main className="flex flex-1 flex-col items-center px-4">
        {/* Logo Section */}
        <div className="mb-8 flex flex-col items-center text-center">
          <CapsuleMark className="mb-4 h-16 w-16 -rotate-45" />
          <h1 className="font-display text-2xl font-extrabold text-brand-strong">
            {pharmacyName}
          </h1>
          <p className="mt-2 text-sm text-muted">Admin Portal</p>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-sm">
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-ink">
                অ্যাডমিন লগিন
              </h2>
              <p className="mt-1 text-sm text-muted">
                ইউজারনেম ও পাসওয়ার্ড দিয়ে Login করুন
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="username" className={labelCls}>
                  Username *
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="admin"
                  className={input}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className={labelCls}>
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="পাসওয়ার্ড"
                  className={input}
                />
              </div>
            </div>

            {error && (
              <div className={`mt-4 ${errorBox}`}>
                <p role="alert">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className={`mt-6 w-full ${btnPrimary} py-3.5 text-base shadow-brand/30 hover:shadow-brand/50`}
            >
              {busy ? "Wait..." : "প্রবেশ করুন →"}
            </button>
          </form>
        </div>
      </main>

      <footer className="mt-12 text-center text-xs text-muted">
        © 2026 <span className="font-bold text-brand-strong">{pharmacyName}</span>. All Rights Reserved.
      </footer>
    </div>
  );
}
