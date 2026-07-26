"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buyerLogin, registerBuyer } from "@/actions/auth";
import { readSettings } from "@/actions/settings";
import { CapsuleMark } from "@/components/Brand";
import { input, btnPrimary, label as labelCls, errorBox } from "@/components/ui";
import { Eye, EyeOff, Key } from "lucide-react";

export default function BuyerLoginPage() {
  const router = useRouter();
  
  const [isLogin, setIsLogin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Dynamic Settings
  const [pharmacyName, setPharmacyName] = useState("Green Pharma & Surgical");
  const [shortName, setShortName] = useState("Green Pharma");

  useEffect(() => {
    readSettings().then(settings => {
      setPharmacyName(settings.pharmacyName);
      // Assuming short name could be first two words or we can just use the full name everywhere. Let's just use the full name if short is needed we take first 2 words.
      const words = settings.pharmacyName.split(" ");
      setShortName(words.length > 1 ? `${words[0]} ${words[1]}` : words[0]);
    }).catch(console.error);
  }, []);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    if (isLogin) {
      const result = await buyerLogin(phone, password);
      if (result.ok) {
        router.push("/buyer");
        router.refresh();
      } else {
        setError(result.error);
        setBusy(false);
      }
    } else {
      const result = await registerBuyer(name, phone, shopName, address, password);
      if (result.ok) {
        router.push("/buyer");
        router.refresh();
      } else {
        setError(result.error);
        setBusy(false);
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas pb-20">
      <main className="flex flex-1 flex-col items-center px-4 pt-12 pb-8">
        {/* Logo Section */}
        <div className="mb-8 flex flex-col items-center text-center">
          <CapsuleMark className="mb-4 h-16 w-16 -rotate-45" />
          <h1 className="font-display text-2xl font-extrabold text-brand-strong">
            {pharmacyName}
          </h1>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-md">
          {/* Toggle Login / Register */}
          <div className="mb-6 flex rounded-2xl bg-white p-1.5 shadow-sm border border-line">
            <button
              onClick={() => {
                setIsLogin(true);
                setError("");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
                isLogin
                  ? "bg-brand text-white shadow-md"
                  : "text-muted hover:bg-canvas"
              }`}
            >
              <Key className="h-4 w-4" />
              Login
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
                !isLogin
                  ? "bg-brand text-white shadow-md"
                  : "text-muted hover:bg-canvas"
              }`}
            >
              ✨ Register
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-ink">
                {isLogin ? "অ্যাকাউন্টে প্রবেশ করুন" : "নতুন অ্যাকাউন্ট তৈরি করুন"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {isLogin
                  ? "ফোন ও পাসওয়ার্ড দিয়ে Login করুন"
                  : "আপনার তথ্য দিয়ে Register করুন"}
              </p>
            </div>

            <div className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="name" className={labelCls}>
                      নাম *
                    </label>
                    <input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="আপনার নাম"
                      className={input}
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label htmlFor="shopName" className={labelCls}>
                      ফার্মেসির নাম
                    </label>
                    <input
                      id="shopName"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="ফার্মেসির নাম"
                      className={input}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="address" className={labelCls}>
                      ফার্মেসির ঠিকানা
                    </label>
                    <input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="ফার্মেসির ঠিকানা"
                      className={input}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label htmlFor="phone" className={labelCls}>
                  মোবাইল নম্বর *
                </label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="01XXXXXXXXX"
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
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    required
                    placeholder="পাসওয়ার্ড"
                    className={`${input} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
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
              {busy
                ? "Wait..."
                : isLogin
                  ? "প্রবেশ করুন →"
                  : "রেজিস্টার করুন →"}
            </button>

            <div className="mt-6 text-center text-sm text-muted">
              {isLogin ? (
                <>
                  অ্যাকাউন্ট নেই?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(false)}
                    className="font-bold text-brand hover:underline focus:outline-none"
                  >
                    Register করুন
                  </button>
                </>
              ) : (
                <>
                  অ্যাকাউন্ট আছে?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className="font-bold text-brand hover:underline focus:outline-none"
                  >
                    Login করুন
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted">
        © 2026 <span className="font-bold text-brand-strong">{pharmacyName}</span>. All Rights Reserved.
      </footer>
    </div>
  );
}
