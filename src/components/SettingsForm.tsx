"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/actions/settings";

export function SettingsForm({
  initial,
}: {
  initial: {
    pharmacyName: string;
    address: string;
    phone: string;
    invoicePrefix: string;
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
      await updateSettings(values);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h1 className="font-semibold text-slate-900">Settings</h1>
      <p className="text-xs text-slate-500">
        Ei nam ta sob jaygay ar invoice e dekhabe.
      </p>

      <div className="space-y-1">
        <label htmlFor="pharmacyName" className="text-sm text-slate-700">Pharmacy-r nam</label>
        <input id="pharmacyName" className={field} required value={values.pharmacyName}
          onChange={(e) => setValues({ ...values, pharmacyName: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="address" className="text-sm text-slate-700">Address</label>
        <input id="address" className={field} value={values.address}
          onChange={(e) => setValues({ ...values, address: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="text-sm text-slate-700">Phone</label>
        <input id="phone" className={field} value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="invoicePrefix" className="text-sm text-slate-700">Invoice prefix</label>
        <input id="invoicePrefix" className={field} required value={values.invoicePrefix}
          onChange={(e) => setValues({ ...values, invoicePrefix: e.target.value })} />
        <p className="text-xs text-slate-500">
          Invoice number eirokom hobe: {values.invoicePrefix || "ABC"}-000041
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">Save hoyeche.</p>}

      <button type="submit" disabled={busy}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Wait..." : "Save"}
      </button>
    </form>
  );
}
