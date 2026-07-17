"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
    >
      Print / PDF koro
    </button>
  );
}
