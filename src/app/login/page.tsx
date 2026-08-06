"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, registerBuyer } from "@/actions/auth";
import { readSettings } from "@/actions/settings";
import { CapsuleMark } from "@/components/Brand";
import { input, btnPrimary, label as labelCls, errorBox } from "@/components/ui";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Login form state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Registration form state (Buyer)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [pharmacyName, setPharmacyName] = useState("Green Pharma & Surgical");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    readSettings()
      .then((settings) => {
        setPharmacyName(settings.pharmacyName);
        if (settings.logoUrl) {
          setLogoUrl(settings.logoUrl);
        }
      })
      .catch(console.error);
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const result = await login(identifier, password);
    if (result.ok) {
      const destination =
        result.redirectUrl ||
        (result.role === "buyer" ? "/buyer" : "/dashboard");
      router.push(destination);
      router.refresh();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const result = await registerBuyer(
      name,
      phone,
      shopName,
      address,
      regPassword,
    );
    if (result.ok) {
      router.push("/buyer");
      router.refresh();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas pb-16 pt-10 sm:pt-14">
      <main className="flex flex-1 flex-col items-center px-4">
        {/* Logo & Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={pharmacyName}
              className="mb-3 h-16 w-16 rounded-2xl object-contain shadow-md bg-surface p-1 border border-line"
            />
          ) : (
            <CapsuleMark className="mb-3 h-16 w-16 -rotate-45" />
          )}
          <h1 className="font-display text-2xl font-extrabold text-brand-strong sm:text-3xl">
            {pharmacyName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            অ্যাডমিন ও বায়ার সমন্বিত লগইন পোর্টাল
          </p>
        </div>

        {/* Card Container */}
        <div className="w-full max-w-md">
          {/* Mode Switcher Tabs */}
          <div className="mb-5 flex rounded-2xl border border-line bg-white p-1.5 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError("");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                isLogin
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <LogIn className="h-4 w-4" />
              লগইন (Login)
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                !isLogin
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              বায়ার রেজিস্ট্রেশন
            </button>
          </div>

          {/* Card Body */}
          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
            {isLogin ? (
              <form onSubmit={handleLogin}>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-bold text-ink">
                    অ্যাকাউন্টে প্রবেশ করুন
                  </h2>
                  <p className="mt-1 text-xs text-muted sm:text-sm">
                    অ্যাডমিন ইউজারনেম অথবা বায়ার মোবাইল নম্বর দিন
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="identifier" className={labelCls}>
                      ইউজারনেম বা মোবাইল নম্বর *
                    </label>
                    <input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                      placeholder="e.g. admin অথবা 01XXXXXXXXX"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className={labelCls}>
                      পাসওয়ার্ড *
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        placeholder="আপনার পাসওয়ার্ড"
                        className={`${input} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink focus:outline-none"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
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
                  {busy ? "যাচাই করা হচ্ছে..." : "প্রবেশ করুন →"}
                </button>

                <div className="mt-6 text-center text-xs text-muted sm:text-sm">
                  বায়ার হিসেবে নতুন অ্যাকাউন্ট খুলতে চান?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(false);
                      setError("");
                    }}
                    className="font-bold text-brand hover:underline focus:outline-none"
                  >
                    রেজিস্ট্রেশন করুন
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-bold text-ink">
                    নতুন বায়ার অ্যাকাউন্ট
                  </h2>
                  <p className="mt-1 text-xs text-muted sm:text-sm">
                    আপনার ফার্মেসির তথ্য দিয়ে রেজিস্টার করুন
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="reg-name" className={labelCls}>
                      আপনার নাম *
                    </label>
                    <input
                      id="reg-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="পুরো নাম"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-shop" className={labelCls}>
                      ফার্মেসির নাম
                    </label>
                    <input
                      id="reg-shop"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="ফার্মেসি / দোকানের নাম"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-phone" className={labelCls}>
                      মোবাইল নম্বর *
                    </label>
                    <input
                      id="reg-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      required
                      placeholder="01XXXXXXXXX"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-address" className={labelCls}>
                      ঠিকানা
                    </label>
                    <input
                      id="reg-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="দোকানের ঠিকানা"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-password" className={labelCls}>
                      পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        placeholder="পাসওয়ার্ড"
                        className={`${input} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink focus:outline-none"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
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
                  {busy ? "অ্যাকাউন্ট তৈরি হচ্ছে..." : "রেজিস্টার করুন →"}
                </button>

                <div className="mt-6 text-center text-xs text-muted sm:text-sm">
                  ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(true);
                      setError("");
                    }}
                    className="font-bold text-brand hover:underline focus:outline-none"
                  >
                    লগইন করুন
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-10 text-center text-xs text-muted">
        © 2026 <span className="font-bold text-brand-strong">{pharmacyName}</span>. All Rights Reserved.
      </footer>
    </div>
  );
}
