import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

// A deliberate pairing: Plus Jakarta Sans carries the warmth of the brand in
// headings and the logo; Inter keeps prices, tables, and form data neutral and
// legible. All UI copy is Banglish (Latin letters), so the latin subset covers it.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

// Static fallback title for routes outside the (admin) group (e.g. /login,
// /_not-found). It must not depend on the database and must not name the
// pharmacy — that comes only from Settings, read by the (admin) layout.
export const metadata: Metadata = {
  title: "Pharmacy Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
