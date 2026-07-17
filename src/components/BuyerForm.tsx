"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBuyer, updateBuyer, setBuyerPassword } from "@/actions/buyers";

export type BuyerFormValues = {
  id?: string;
  name: string;
  shopName: string;
  phone: string;
  address: string;
};

export function BuyerForm({
  initial,
  onDone,
}: {
  initial?: BuyerFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BuyerFormValues>(
    initial ?? { name: "", shopName: "", phone: "", address: "" },
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const editing = Boolean(initial?.id);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const input = {
        name: values.name,
        shopName: values.shopName,
        phone: values.phone,
        address: values.address,
      };

      if (initial?.id) {
        await updateBuyer(initial.id, input);
        // Blank means "leave the password alone" — the owner is editing
        // details, not resetting access.
        if (password) await setBuyerPassword(initial.id, password);
      } else {
        await createBuyer(input, password);
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const label = "text-sm text-slate-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">
        {editing ? "Buyer edit" : "Notun buyer"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="buyerName" className={label}>Nam</label>
          <input id="buyerName" className={field} required value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="shopName" className={label}>Dokan er nam</label>
          <input id="shopName" className={field} value={values.shopName}
            onChange={(e) => setValues({ ...values, shopName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="buyerPhone" className={label}>Phone</label>
          <input id="buyerPhone" className={field} required value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="buyerAddress" className={label}>Address</label>
          <input id="buyerAddress" className={field} value={values.address}
            onChange={(e) => setValues({ ...values, address: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="buyerPassword" className={label}>
            {editing ? "Notun password (khali rakhle bodlabe na)" : "Password"}
          </label>
          <input id="buyerPassword" type="password" className={field}
            required={!editing} value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-slate-500">
            Ei password diye buyer nijer portal e login korbe.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Save"}
        </button>
        <button type="button" onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
