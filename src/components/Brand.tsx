/**
 * The pharmacy's mark: a two-tone capsule (the pill — the shop's core
 * artifact, and the signature shape carried through the whole UI) next to the
 * name and an optional tagline, both read from Settings. Sizes down cleanly
 * for a mobile header.
 */
export function Brand({
  name,
  tagline,
  size = "md",
}: {
  name: string;
  tagline?: string;
  size?: "sm" | "md";
}) {
  const mark = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const nameCls =
    size === "sm"
      ? "text-sm font-extrabold"
      : "text-base font-extrabold sm:text-lg";

  return (
    <div className="flex items-center gap-2.5">
      <CapsuleMark className={mark} />
      <div className="leading-tight">
        <div className={`font-display text-brand-strong ${nameCls}`}>{name}</div>
        {tagline ? (
          <div className="text-[11px] font-medium text-muted">{tagline}</div>
        ) : null}
      </div>
    </div>
  );
}

export function CapsuleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="Pharmacy logo"
    >
      <g transform="rotate(-38 20 20)">
        {/* left half — brand green; right half — warm amber; hairline seam */}
        <rect x="6" y="14" width="28" height="14" rx="7" fill="#16a34a" />
        <path
          d="M20 14 h7 a7 7 0 0 1 7 7 v0 a7 7 0 0 1 -7 7 h-7 z"
          fill="#fb923c"
        />
        <rect x="19.2" y="14" width="1.6" height="14" fill="#ffffff" opacity="0.9" />
        {/* soft highlight */}
        <rect x="9" y="16.5" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.35" />
      </g>
    </svg>
  );
}
