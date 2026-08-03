"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRetailCustomer,
  renameRetailCustomer,
} from "@/actions/retailCustomers";

export type RetailCustomerFormValues = {
  id?: string;
  name: string;
  phone: string;
};

export function RetailCustomerForm({
  initial,
  onDone,
}: {
  initial?: RetailCustomerFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<RetailCustomerFormValues>(
    initial ?? { name: "", phone: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const editing = Boolean(initial?.id);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      // Editing touches the name only — the phone is this customer's key
      // everywhere else. See renameRetailCustomer.
      const result = initial?.id
        ? await renameRetailCustomer(initial.id, values.name)
        : await createRetailCustomer({
            name: values.name,
            phone: values.phone,
          });

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm";
  const label = "text-sm text-ink";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 className="font-display font-bold text-ink">
        {editing ? "Khuchra buyer edit" : "Notun khuchra buyer"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="retailCustomerName" className={label}>
            Nam
          </label>
          <input
            id="retailCustomerName"
            className={field}
            required
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="retailCustomerPhone" className={label}>
            Phone
          </label>
          <input
            id="retailCustomerPhone"
            className={`${field} ${editing ? "bg-canvas text-muted" : ""}`}
            required
            readOnly={editing}
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
          />
          {editing && (
            <p className="text-xs text-muted">
              Phone bodlano jabe na — puraton bikri ar baki er hisab ei number
              diyei rakha hoy.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
