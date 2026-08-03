"use client";

import { useState } from "react";
import { filterBuyers } from "@/lib/buyerSearch";
import {
  RetailCustomerForm,
  type RetailCustomerFormValues,
} from "./RetailCustomerForm";
import { card, thead, th, td, trow } from "@/components/ui";

export type RetailCustomerRow = RetailCustomerFormValues & {
  id: string;
};

/**
 * The khuchra-buyer list, deliberately built the same way as BuyerTable: one
 * hero with the search box in it, a desktop table, phone-sized cards below
 * `md`. A retail customer has no shop, no address and no login, so there is
 * no status column and no password — just the name and the phone the whole
 * retail ledger hangs off.
 */
export function RetailCustomerTable({
  customers,
}: {
  customers: RetailCustomerRow[];
}) {
  const [editing, setEditing] = useState<RetailCustomerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  if (adding || editing) {
    return (
      <RetailCustomerForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  // Same in-memory filter the wholesale list uses — the page already handed
  // every customer down, so results appear as the owner types.
  const shown = filterBuyers(customers, query);
  const searching = query.trim().length > 0;

  const actions = (row: RetailCustomerRow) => (
    <button
      onClick={() => setEditing(row)}
      className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint"
    >
      Edit
    </button>
  );

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              Khuchra Buyer
            </h1>
            <p className="text-sm text-white/90">
              Apnar shob khuchra customer er list.
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-brand-strong shadow-lg transition hover:bg-brand-tint"
          >
            + Notun khuchra buyer
          </button>
        </div>

        <div className="relative z-10 mt-6 flex items-center">
          <div className="absolute left-4">
            <SearchIcon className="h-5 w-5 text-white/60" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nam ba phone diye khojo..."
            className="w-full rounded-2xl border-0 bg-white/10 pl-11 pr-4 py-3 text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white transition"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Search muche dao"
              className="absolute right-3 grid h-6 w-6 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              ×
            </button>
          )}
        </div>
      </section>

      {customers.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          Kono khuchra buyer nai. Upor theke add koro.
        </p>
      ) : shown.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          &ldquo;{query.trim()}&rdquo; naame kono khuchra buyer pawa jay ni.
        </p>
      ) : (
        <>
          <DesktopRows rows={shown} actions={actions} />
          <MobileCards rows={shown} actions={actions} />
        </>
      )}
    </div>
  );
}

function DesktopRows({
  rows,
  actions,
}: {
  rows: RetailCustomerRow[];
  actions: (row: RetailCustomerRow) => React.ReactNode;
}) {
  return (
    <div className={`hidden overflow-x-auto md:block ${card}`}>
      <table className="w-full">
        <thead className={thead}>
          <tr>
            <th className={th}>Nam</th>
            <th className={th}>Phone</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={trow}>
              <td className={`${td} font-semibold`}>{row.name}</td>
              <td className={`${td} text-muted`}>{row.phone}</td>
              <td className={`${td} text-right`}>{actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  rows,
  actions,
}: {
  rows: RetailCustomerRow[];
  actions: (row: RetailCustomerRow) => React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className={`${card} p-3.5`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-ink">
                {row.name}
              </div>
              <div className="mt-0.5 text-xs text-muted">{row.phone}</div>
            </div>
            {actions(row)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
