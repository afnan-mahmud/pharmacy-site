"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The mobile bottom tab bar — the buyer's primary navigation on a phone,
 * matching the reference storefront. Hidden on desktop (md+), where the header
 * carries the same links. The three tabs are the buyer's real sections; no
 * fake "Home/About/Contact" filler.
 */
const TABS = [
  { href: "/buyer", label: "Order dao", icon: BagIcon },
  { href: "/buyer/orders", label: "Amar order", icon: ListIcon },
  { href: "/buyer/account", label: "Amar hisab", icon: WalletIcon },
];

export function BuyerBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-4xl">
        {TABS.map((tab) => {
          const active =
            tab.href === "/buyer"
              ? pathname === "/buyer"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
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
      </div>
    </nav>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
