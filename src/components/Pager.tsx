"use client";

/**
 * Page-number navigation for the lists that read more rows than one screen.
 *
 * Shared rather than written per table so that "page 3 of 9" looks and
 * behaves the same on the medicines table, the sales report and a customer's
 * ledger — three screens the owner moves between constantly.
 */

/**
 * The page numbers to render, with nulls standing in for gaps.
 *
 * Always shows the first and last page, plus a window around the current one,
 * so a long list keeps its two endpoints reachable in one tap without laying
 * out fifty buttons. Below the point where a gap would save anything (nine
 * pages or fewer), every page is listed — an ellipsis that hides one number
 * is just a slower way to show it.
 */
export function pageWindow(page: number, lastPage: number): (number | null)[] {
  if (lastPage <= 9) {
    return Array.from({ length: lastPage }, (_, i) => i + 1);
  }

  const around = [page - 1, page, page + 1].filter(
    (p) => p > 1 && p < lastPage,
  );
  const shown = [1, ...around, lastPage];

  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of shown) {
    if (p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}

export function Pager({
  page,
  lastPage,
  total,
  busy,
  onGo,
  label = "মোট",
}: {
  page: number;
  lastPage: number;
  total: number;
  busy?: boolean;
  onGo: (page: number) => void;
  label?: string;
}) {
  // Nothing to navigate. Rendering "page 1 of 1" next to every short list
  // would be noise on the screens most likely to stay short.
  if (lastPage <= 1) return null;

  const step = (to: number) => () => onGo(Math.min(Math.max(to, 1), lastPage));

  const numberClass = (active: boolean) =>
    `min-w-9 rounded-xl px-3 py-1.5 text-xs font-bold tabular-nums transition ${
      active
        ? "bg-brand text-white"
        : "bg-canvas text-ink hover:bg-canvas-deep"
    }`;

  return (
    <nav
      aria-label="পাতা নির্বাচন"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <p className="text-xs font-semibold text-muted tabular-nums">
        {label} {total} · পাতা {page}/{lastPage}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={step(page - 1)}
          disabled={page <= 1 || busy}
          className="rounded-xl bg-canvas px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-canvas-deep disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="আগের পাতা"
        >
          ←
        </button>

        {pageWindow(page, lastPage).map((p, i) =>
          p === null ? (
            <span
              key={`gap-${i}`}
              aria-hidden="true"
              className="px-1 text-xs text-muted"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={step(p)}
              disabled={busy}
              aria-current={p === page ? "page" : undefined}
              className={numberClass(p === page)}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={step(page + 1)}
          disabled={page >= lastPage || busy}
          className="rounded-xl bg-canvas px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-canvas-deep disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="পরের পাতা"
        >
          →
        </button>
      </div>
    </nav>
  );
}
