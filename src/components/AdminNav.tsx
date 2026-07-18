"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/actions/auth";
import { Brand } from "@/components/Brand";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sell", label: "Khuchra Bikri" },
  { href: "/wholesale", label: "Wholesale Bikri" },
  { href: "/orders", label: "Pending Order" },
  { href: "/medicines", label: "Medicine" },
  { href: "/stock", label: "Stock In" },
  { href: "/buyers", label: "Buyer" },
  { href: "/due", label: "Baki Khata" },
  { href: "/reports", label: "Report" },
  { href: "/settings", label: "Settings" },
];

export function AdminNav({
  pharmacyName,
  tagline,
}: {
  pharmacyName: string;
  tagline?: string;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href="/dashboard" className="shrink-0">
          <Brand name={pharmacyName} tagline={tagline} />
        </Link>

        {/* Scrolls horizontally on narrow screens rather than wrapping. */}
        <nav className="ml-auto flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((link) => {
            const active =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand-tint-2 text-brand-strong"
                    : "text-muted hover:bg-brand-tint hover:text-brand-strong"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form action={logout} className="shrink-0">
          <button
            type="submit"
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-danger hover:text-danger"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
