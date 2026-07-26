"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/actions/settings";
import { card, input, label as labelCls, btnPrimary, errorBox, successBox } from "@/components/ui";

export function SettingsForm({
  initial,
}: {
  initial: {
    pharmacyName: string;
    tagline: string;
    address: string;
    phone: string;
    invoicePrefix: string;
    aboutUs: string;
  };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone(false);

    try {
      const result = await updateSettings(values);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const saved = result.data;
      setValues({
        pharmacyName: saved.pharmacyName,
        tagline: saved.tagline ?? "",
        address: saved.address,
        phone: saved.phone,
        invoicePrefix: saved.invoicePrefix,
        aboutUs: saved.aboutUs ?? "",
      });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  function updateField(patch: Partial<typeof values>) {
    setValues((prev) => ({ ...prev, ...patch }));
    setDone(false);
  }

  return (
    <form onSubmit={handleSubmit} className={`max-w-lg space-y-4 ${card} p-5`}>
      <div>
        <h1 className="font-display text-base font-bold text-ink">Settings</h1>
        <p className="text-xs text-muted">
          Ei nam ar tagline header ar invoice-e dekhabe.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pharmacyName" className={labelCls}>Pharmacy-r nam</label>
        <input id="pharmacyName" className={input} required value={values.pharmacyName}
          onChange={(e) => updateField({ pharmacyName: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tagline" className={labelCls}>Tagline</label>
        <input id="tagline" className={input} value={values.tagline}
          onChange={(e) => updateField({ tagline: e.target.value })}
          placeholder="Jemon: Medicine & Surgical" />
        <p className="text-xs text-muted">Naam er niche chhoto kore dekhabe.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="address" className={labelCls}>Address</label>
        <input id="address" className={input} value={values.address}
          onChange={(e) => updateField({ address: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="phone" className={labelCls}>Phone</label>
        <input id="phone" className={input} value={values.phone}
          onChange={(e) => updateField({ phone: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="invoicePrefix" className={labelCls}>Invoice prefix</label>
        <input id="invoicePrefix" className={input} required value={values.invoicePrefix}
          onChange={(e) => updateField({ invoicePrefix: e.target.value })} />
        <p className="text-xs text-muted">
          Invoice number eirokom hobe: {values.invoicePrefix || "ABC"}-000041
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="aboutUs" className={labelCls}>Amader Somporke (About Us)</label>
        <textarea id="aboutUs" className={`${input} min-h-[100px]`} value={values.aboutUs}
          onChange={(e) => updateField({ aboutUs: e.target.value })}
          placeholder="Apnar pharmacy somporke kichu kotha..." />
        <p className="text-xs text-muted">Eta buyer dashboard e dekhabe.</p>
      </div>

      {error && <p role="alert" className={errorBox}>{error}</p>}
      {done && <p className={successBox}>Save hoyeche.</p>}

      <button type="submit" disabled={busy} className={btnPrimary}>
        {busy ? "Wait..." : "Save"}
      </button>
    </form>
  );
}
