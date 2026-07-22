"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBuyerActive } from "@/actions/buyers";
import { filterBuyers } from "@/lib/buyerSearch";
import { BuyerForm, type BuyerFormValues } from "./BuyerForm";
import {
  card,
  pageTitle,
  input,
  btnPrimary,
  thead,
  th,
  td,
  trow,
  errorBox,
} from "@/components/ui";

export type BuyerRow = BuyerFormValues & {
  id: string;
  active: boolean;
};

export function BuyerTable({ buyers }: { buyers: BuyerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BuyerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(row: BuyerRow) {
    setError("");
    setTogglingId(row.id);
    try {
      await setBuyerActive(row.id, !row.active);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setTogglingId(null);
    }
  }

  if (adding || editing) {
    return (
      <BuyerForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  // The page hands down every buyer, so this is a plain in-memory filter —
  // no server round trip, and results appear as the owner types.
  const shown = filterBuyers(buyers, query);
  const searching = query.trim().length > 0;

  const actions = (row: BuyerRow) => (
    <RowActions
      row={row}
      busy={togglingId === row.id}
      onEdit={() => setEditing(row)}
      onToggle={() => handleToggle(row)}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className={pageTitle}>Wholesale Buyer</h1>
        <button onClick={() => setAdding(true)} className={btnPrimary}>
          + Notun buyer
        </button>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nam, dokan ba phone diye khojo..."
          aria-label="Buyer khojo"
          className={`${input} pl-10 ${searching ? "pr-10" : ""}`}
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Search muche dao"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
          >
            ×
          </button>
        )}
      </div>

      {error && <p role="alert" className={errorBox}>{error}</p>}

      {buyers.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          Kono buyer nai. Upor theke add koro.
        </p>
      ) : shown.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          &ldquo;{query.trim()}&rdquo; naame kono buyer pawa jay ni.
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

/** Rendered by both layouts, so the two views cannot drift in what they do. */
function RowActions({
  row,
  busy,
  onEdit,
  onToggle,
}: {
  row: BuyerRow;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        onClick={onEdit}
        className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint"
      >
        Edit
      </button>
      <button
        onClick={onToggle}
        disabled={busy}
        className="ml-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        {row.active ? "Bondho" : "Chalu"}
      </button>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? "bg-brand-tint-2 text-brand-strong" : "bg-line text-muted"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brand" : "bg-muted"}`}
      />
      {active ? "Chalu" : "Bondho"}
    </span>
  );
}

function DesktopRows({
  rows,
  actions,
}: {
  rows: BuyerRow[];
  actions: (row: BuyerRow) => React.ReactNode;
}) {
  return (
    <div className={`hidden overflow-x-auto md:block ${card}`}>
      <table className="w-full">
        <thead className={thead}>
          <tr>
            <th className={th}>Nam</th>
            <th className={th}>Dokan</th>
            <th className={th}>Phone</th>
            <th className={th}>Address</th>
            <th className={th}>Obostha</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={trow}>
              <td className={`${td} font-semibold`}>{row.name}</td>
              <td className={`${td} text-muted`}>{row.shopName}</td>
              <td className={`${td} text-muted`}>{row.phone}</td>
              <td className={`${td} text-muted`}>{row.address}</td>
              <td className={td}>
                <StatusPill active={row.active} />
              </td>
              <td className={`${td} text-right`}>{actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The table is six columns wide, which on a phone means scrolling sideways
 * through rows you cannot read. Below `md` each buyer becomes a card instead.
 */
function MobileCards({
  rows,
  actions,
}: {
  rows: BuyerRow[];
  actions: (row: BuyerRow) => React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className={`${card} p-3.5`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-display text-sm font-bold text-ink">
              {row.name}
            </span>
            <StatusPill active={row.active} />
          </div>
          {row.shopName && (
            <div className="text-xs text-muted">{row.shopName}</div>
          )}
          <div className="mt-1 text-xs text-muted">
            {row.phone}
            {row.address ? ` · ${row.address}` : ""}
          </div>
          <div className="mt-2 flex justify-end border-t border-line/70 pt-2">
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
