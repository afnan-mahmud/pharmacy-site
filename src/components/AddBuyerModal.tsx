"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { input } from "@/components/ui";
import { createBuyer } from "@/actions/buyers";

export function AddBuyerModal({
  initialQuery,
  onClose,
  onCreated,
}: {
  initialQuery: string;
  onClose: () => void;
  onCreated: (buyerId: string) => void;
}) {
  const router = useRouter();
  
  // Try to parse the initial query. If it's all digits (and optional plus), it's likely a phone number.
  const isLikelyPhone = /^[0-9+]+$/.test(initialQuery.trim());

  const [name, setName] = useState(isLikelyPhone ? "" : initialQuery);
  const [phone, setPhone] = useState(isLikelyPhone ? initialQuery : "");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Buyer er nam dorkar");
    if (!phone.trim()) return setError("Phone number dorkar");
    if (password.length < 4) return setError("Password kompokkhe 4 okkhor hote hobe");

    setBusy(true);
    setError("");

    try {
      const result = await createBuyer(
        { name, shopName, phone, address },
        password
      );
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      
      // Success! Refresh the server components to get the new buyer list
      // and call onCreated with the new ID so the picker selects it.
      router.refresh();
      onCreated(String(result.data._id));
    } catch (err: any) {
      setError(err.message || "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-line">
          <h2 className="text-xl font-bold text-ink">Notun Buyer Jog Korun</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink transition"
            disabled={busy}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Nam <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={input}
              placeholder="e.g. Karim Uddin"
              required
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Phone Number <span className="text-danger">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={input}
              placeholder="01711000000"
              required
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Dokaner Nam
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className={input}
              placeholder="Karim Medical Hall"
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Thikana (Address)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={input}
              placeholder="Mirpur-10, Dhaka"
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Password (Eita diye buyer portal e login korbe) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
              placeholder="Password..."
              required
              minLength={4}
              disabled={busy}
            />
          </div>

          {error && <div className="text-sm font-medium text-danger">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-2xl bg-canvas py-3 font-semibold text-ink transition hover:bg-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-2xl bg-brand py-3 font-bold text-white shadow-md shadow-brand/30 transition hover:bg-brand-deep disabled:opacity-70"
            >
              {busy ? "Opekkha korun..." : "Save Buyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
