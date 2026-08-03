"use client";

import { useState, useRef, useEffect } from "react";
import { input } from "@/components/ui";

export type BuyerOption = {
  id: string;
  name: string;
  shopName: string;
  phone?: string;
};

export function BuyerPicker({
  buyers,
  value,
  onChange,
  disabled = false,
}: {
  buyers: BuyerOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedBuyer = buyers.find((b) => b.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const term = query.toLowerCase().trim();
  const results = term
    ? buyers.filter((b) =>
        b.name.toLowerCase().includes(term) ||
        (b.shopName && b.shopName.toLowerCase().includes(term)) ||
        (b.phone && b.phone.includes(term))
      )
    : [];

  // Dropdown is visible if open is true AND we have typed something
  const showDropdown = open && term.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          disabled={disabled}
          value={query}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={
            selectedBuyer
              ? "Aro khujte type korun..."
              : "Buyer er nam ba phone likhun..."
          }
          className={input}
        />
        {!selectedBuyer && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
      </div>

      {selectedBuyer && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-brand/40 bg-brand-tint/20 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div>
            <p className="font-bold text-ink">
              {selectedBuyer.name} {selectedBuyer.shopName ? <span className="text-muted font-normal">— {selectedBuyer.shopName}</span> : ""}
            </p>
            {selectedBuyer.phone && (
              <p className="text-sm text-muted mt-0.5">{selectedBuyer.phone}</p>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true); // Optional: re-open search immediately
            }}
            className="rounded-full bg-white p-1.5 text-danger shadow-sm border border-line hover:bg-danger hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showDropdown && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-lg">
          {results.length > 0 ? (
            results.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-tint focus:bg-brand-tint focus:outline-none"
                >
                  <span className="font-semibold text-ink">
                    {b.name} {b.shopName ? <span className="text-muted font-normal">— {b.shopName}</span> : ""}
                  </span>
                  {b.phone && (
                    <span className="text-xs text-muted mt-0.5">{b.phone}</span>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-4 text-center text-sm text-muted">
              <p className="mb-3">Kono buyer pawa jayni</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (typeof (window as any).showAddBuyerModal === "function") {
                     (window as any).showAddBuyerModal(query);
                  }
                }}
                className="w-full rounded-xl bg-brand py-2 text-white font-medium hover:bg-brand-deep transition"
              >
                + Add Buyer
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
