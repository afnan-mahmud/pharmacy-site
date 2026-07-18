"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/actions/auth";

// The five primary destinations live in the bar; everything else lives behind
// "More", which slides in from the right.
const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/medicines", label: "Medicine", icon: PillIcon },
  { href: "/wholesale", label: "Wholesale", icon: BagIcon },
  { href: "/orders", label: "Pending", icon: ClipboardIcon },
];

const MORE = [
  { href: "/sell", label: "Khuchra Bikri" },
  { href: "/stock", label: "Stock In" },
  { href: "/buyers", label: "Buyer" },
  { href: "/due", label: "Baki Khata" },
  { href: "/reports", label: "Report" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(href);
}

export function AdminBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((l) => isActive(pathname, l.href));

  return (
    <>
      {/* Slide-in drawer for the secondary menu. */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Bondho koro"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 transition-opacity ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-72 max-w-[82%] flex-col bg-surface shadow-2xl transition-transform duration-300 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <span className="font-display text-base font-bold text-ink">
              Aro menu
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Bondho"
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-canvas"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            {MORE.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-brand-tint-2 text-brand-strong"
                      : "text-ink hover:bg-brand-tint"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-line p-3">
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-danger hover:text-danger"
              >
                Logout
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* Bottom tab bar — mobile only; desktop uses the top nav. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl">
          {MAIN.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
                  active ? "text-brand-strong" : "text-muted"
                }`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full transition ${
                    active ? "bg-brand-tint-2" : ""
                  }`}
                >
                  <Icon />
                </span>
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
              moreActive || open ? "text-brand-strong" : "text-muted"
            }`}
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-full transition ${
                moreActive || open ? "bg-brand-tint-2" : ""
              }`}
            >
              <MoreIcon />
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function PillIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-40 12 12)" />
      <path d="M9.5 6.5 14.5 11.5" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
