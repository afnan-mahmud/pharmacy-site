import Link from "next/link";
import { logout } from "@/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sell", label: "Khuchra Bikri" },
  { href: "/wholesale", label: "Wholesale Bikri" },
  { href: "/medicines", label: "Medicine" },
  { href: "/stock", label: "Stock In" },
  { href: "/buyers", label: "Buyer" },
  { href: "/due", label: "Baki Khata" },
  { href: "/settings", label: "Settings" },
];

export function AdminNav({ pharmacyName }: { pharmacyName: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-semibold text-teal-800">{pharmacyName}</span>
        <nav className="ml-auto flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-600 hover:text-teal-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
