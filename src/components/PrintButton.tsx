"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong"
    >
      Print / PDF koro
    </button>
  );
}
