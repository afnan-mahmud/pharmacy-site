/**
 * Shared className strings for the storefront design system, so every screen
 * builds cards, inputs, buttons, and tables from the same tokens and can't
 * drift into its own spacing or colour. Import what you need; compose with
 * extra classes as usual.
 */

export const card = "rounded-3xl border border-line bg-surface shadow-md";

export const pageTitle = "font-display text-xl font-extrabold text-ink";

export const label = "text-sm font-medium text-ink";

export const input =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export const btnPrimary =
  "rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-brand/20 transition hover:bg-brand-strong disabled:opacity-60";

export const btnGhost =
  "rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:bg-canvas hover:text-ink";

export const btnDanger =
  "rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger-bg";

// Table primitives.
export const thead = "border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const th = "px-3.5 py-3 font-semibold";
export const td = "px-3.5 py-3 text-sm text-ink";
export const trow = "border-b border-line/70 last:border-0";

export const errorBox =
  "rounded-xl bg-danger-bg px-4 py-2.5 text-sm text-danger";
export const successBox =
  "rounded-xl bg-brand-tint px-4 py-2.5 text-sm font-medium text-brand-strong";
