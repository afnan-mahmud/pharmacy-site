import Link from "next/link";
import { buyerLogout } from "@/actions/auth";
import { Brand } from "@/components/Brand";

const LINKS = [
  { href: "/buyer", label: "Order dao" },
  { href: "/buyer/orders", label: "Amar order" },
  { href: "/buyer/account", label: "Amar hisab" },
];

export function BuyerNav({
  pharmacyName,
  tagline,
  buyerName,
}: {
  pharmacyName: string;
  tagline?: string;
  buyerName: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-2.5">
        <Link href="/buyer" className="shrink-0">
          <Brand name={pharmacyName} tagline={tagline} />
        </Link>

        {/* Desktop links; on mobile these live in the bottom tab bar instead. */}
        <nav className="ml-auto hidden gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-muted transition hover:bg-brand-tint hover:text-brand-strong"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span className="hidden text-xs font-medium text-muted sm:block">
            {buyerName}
          </span>
          <form action={buyerLogout}>
            <button
              type="submit"
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-danger hover:text-danger"
            >
              Logout
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
