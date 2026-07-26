"use client";

import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { useState } from "react";

export function BuyerDashboard({
  pharmacyName,
  buyerName,
  buyerShop,
  aboutUs,
  phone,
}: {
  pharmacyName: string;
  buyerName: string;
  buyerShop: string;
  aboutUs: string;
  phone: string;
}) {
  const [showAboutUs, setShowAboutUs] = useState(false);

  return (
    <div className="flex flex-col pb-6">
      {/* Hero Section */}
      <section className="-mx-4 -mt-4 mb-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
            <span className="text-yellow-300">✓</span> বিশ্বস্ত ঔষধ সরবরাহকারী
          </div>

          <h1 className="mb-2 font-display text-3xl font-extrabold leading-tight">
            স্বাগতম!
            <br />
            {pharmacyName}
          </h1>

          <p className="mb-6 text-sm text-white/90 max-w-sm">
            আপনার পরিবারের সুস্বাস্থ্যের জন্য সেরা মানের ঔষধ ও সার্জিক্যাল সামগ্রী
          </p>

          <Link
            href="/buyer/search"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-brand-strong shadow-lg shadow-black/5 transition hover:scale-[1.02] hover:shadow-xl"
          >
            <SearchIcon />
            <span className="text-base font-bold">Medicine খুঁজুন</span>
          </Link>
        </div>
      </section>

      {/* Quick Orders */}
      <section className="mb-8">
        <SectionHeader icon="⚡" title="দ্রুত অর্ডার করুন" />
        <div className="grid grid-cols-2 gap-4">
          <GridCard
            href="/buyer/search"
            title="Products"
            subtitle="সকল ঔষধ দেখুন"
            icon={<FolderIcon />}
            bgTint="bg-yellow-50"
          />
          <GridCard
            href="/buyer/shortlist"
            title="Short Item"
            subtitle="কাস্টম অর্ডার"
            icon={<ClipboardColorIcon />}
            bgTint="bg-emerald-50"
          />
          <GridCard
            href="/buyer/orders"
            title="Amar Order"
            subtitle="অর্ডার হিস্টোরি"
            icon={<DocumentColorIcon />}
            bgTint="bg-blue-50"
          />
          <GridCard
            href="/buyer/account"
            title="Amar Hisab"
            subtitle="বকেয়া ও পেমেন্ট"
            icon={<WalletColorIcon />}
            bgTint="bg-indigo-50"
          />
        </div>
      </section>

      {/* Features */}
      <section className="mb-8">
        <SectionHeader icon="🌟" title="আমাদের সুবিধা" />
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 snap-x">
          <FeatureBadge icon="🚀" text="দ্রুত ডেলিভারি" />
          <FeatureBadge icon="💯" text="আসল ঔষধ" />
          <FeatureBadge icon="💰" text="সেরা দাম" />
        </div>
      </section>

      {/* More Info */}
      <section className="mb-8">
        <SectionHeader icon="ℹ️" title="আরও জানুন" />
        <div className="space-y-3">
          <ListCard
            title="আমাদের সম্পর্কে"
            subtitle={`${pharmacyName} সম্পর্কে জানুন`}
            icon={<HospitalIcon />}
            onClick={() => setShowAboutUs(true)}
          />
          <ListCard
            title="যোগাযোগ করুন"
            subtitle="যেকোনো প্রশ্ন বা সাহায্যের জন্য"
            icon={<PhoneIcon />}
            href={`tel:${phone}`}
          />
        </div>
      </section>

      {/* Account */}
      <section>
        <SectionHeader icon="👤" title="আপনার একাউন্ট" />
        <div className="rounded-2xl bg-brand p-5 text-white shadow-md relative overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-xl"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white/20 shadow-inner backdrop-blur">
                <UserIcon />
              </div>
              <div>
                <div className="font-display text-lg font-bold">
                  {buyerName}
                </div>
                <div className="text-xs text-white/80">{buyerShop}</div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <Link 
                href="/buyer/orders"
                className="rounded-lg bg-white px-4 py-1.5 text-center text-xs font-bold text-brand shadow hover:bg-brand-tint transition"
              >
                Orders
              </Link>
              <Link 
                href="/buyer/account"
                className="rounded-lg border border-white/30 bg-transparent px-4 py-1.5 text-center text-xs font-bold text-white transition hover:bg-white/10"
              >
                Hisab
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* About Us Modal */}
      {showAboutUs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowAboutUs(false)} 
              className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-canvas text-muted hover:text-ink transition"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-tint/30 text-brand-strong">
                <HospitalIcon />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-ink">আমাদের সম্পর্কে</h3>
                <p className="text-xs text-muted">{pharmacyName}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-canvas p-4 text-sm leading-relaxed text-ink/80 whitespace-pre-wrap border border-line">
              {aboutUs || "কোন তথ্য দেওয়া হয়নি।"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- UI Components ----------------

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <h2 className="font-display text-lg font-bold text-ink flex-1">{title}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-line to-transparent"></div>
    </div>
  );
}

function GridCard({
  href,
  title,
  subtitle,
  icon,
  bgTint,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bgTint: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-surface p-4 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] transition hover:shadow-md border border-white"
    >
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full ${bgTint} blur-xl opacity-60`}></div>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-canvas shadow-sm relative z-10">
        {icon}
      </div>
      <h3 className="font-bold text-ink relative z-10">{title}</h3>
      <p className="mt-0.5 text-[10px] text-muted relative z-10">{subtitle}</p>
    </Link>
  );
}

function FeatureBadge({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm snap-start">
      <span className="text-xl">{icon}</span>
      <span className="font-semibold text-ink text-sm">{text}</span>
    </div>
  );
}

function ListCard({
  title,
  subtitle,
  icon,
  onClick,
  href,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] border border-white hover:bg-canvas transition cursor-pointer">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-tint/30 text-brand-strong">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <div className="text-muted/50">
        <ChevronRightIcon />
      </div>
    </div>
  );

  if (href) {
    return <a href={href} className="block w-full">{inner}</a>;
  }
  return <div onClick={onClick} className="block w-full">{inner}</div>;
}

// ---------------- Icons ----------------

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-yellow-500" fill="currentColor">
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
      <path fill="#FDE047" d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8z" />
      <rect x="4" y="10" width="16" height="8" fill="#FEF08A" />
      <path fill="#CA8A04" d="M6 12h4v2H6z" />
    </svg>
  );
}

function ClipboardColorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-600" fill="currentColor">
      <path fill="#A7F3D0" d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
      <path fill="#059669" d="M12 3c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-4 6h8v2H8V9zm0 4h8v2H8v-2z" />
    </svg>
  );
}

function DocumentColorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-blue-600" fill="currentColor">
      <path fill="#BFDBFE" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z" />
      <path fill="#2563EB" d="M13 3.5V9h5.5L13 3.5zm-5 11h8v2H8v-2zm0-4h8v2H8v-2z" />
    </svg>
  );
}

function WalletColorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-indigo-600" fill="currentColor">
      <path fill="#C7D2FE" d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72z" />
      <path fill="#4F46E5" d="M20 9h-7c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h7v-6zm-2 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

function HospitalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12h-2v-2H7v-2h2V9h2v2h2v2h-2v2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
