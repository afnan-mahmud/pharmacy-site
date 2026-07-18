import Link from "next/link";
import { buyerLogout } from "@/actions/auth";

const LINKS = [
  { href: "/buyer", label: "Order dao" },
  { href: "/buyer/orders", label: "Amar order" },
  { href: "/buyer/account", label: "Amar hisab" },
];

export function BuyerNav({ pharmacyName, buyerName }: { pharmacyName: string; buyerName: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
        <span className="font-semibold text-teal-800">{pharmacyName}</span>
        <nav className="ml-auto flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}
              className="text-slate-600 hover:text-teal-700">
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-slate-400">{buyerName}</span>
        <form action={buyerLogout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
