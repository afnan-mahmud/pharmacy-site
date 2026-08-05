import Link from "next/link";
import type { DashboardSummary } from "@/actions/dashboard";
import { formatTaka } from "@/lib/money";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="flex flex-col pb-8 space-y-5">
      {/* Hero Banner Section */}
      <section className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 rounded-b-[2.5rem] bg-gradient-to-br from-brand-deep via-brand to-emerald-700 px-5 pb-7 pt-6 text-white shadow-lg relative overflow-hidden">
        {/* Ambient Decorative Glows */}
        <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 translate-y-1/4 -translate-x-1/4 h-48 w-48 rounded-full bg-emerald-400/20 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          {/* Top Bar inside Hero */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
                আজকের বেচাকেনা
              </span>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-white/15 hover:bg-white/25 active:scale-95 px-3 py-1 rounded-full backdrop-blur-md transition"
            >
              হিসাব দেখুন
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>

          {/* Main Total Amount */}
          <div className="mb-4">
            <div className="font-display text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-xs">
              {formatTaka(summary.todayTotalPaisa)}
            </div>
          </div>

          {/* Breakdown Mini-cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
              <div className="text-[11px] font-medium text-emerald-100/90 mb-0.5">🛍️ খুচরা</div>
              <div className="text-xs sm:text-sm font-bold text-white truncate">
                {formatTaka(summary.todayRetailPaisa)}
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
              <div className="text-[11px] font-medium text-emerald-100/90 mb-0.5">📦 পাইকারি</div>
              <div className="text-xs sm:text-sm font-bold text-white truncate">
                {formatTaka(summary.todayWholesalePaisa)}
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-2.5 border border-white/10 text-center">
              <div className="text-[11px] font-medium text-emerald-100/90 mb-0.5">🧾 মোট মেমো</div>
              <div className="text-xs sm:text-sm font-bold text-white">
                {summary.todaySaleCount} টি
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Action Bar */}
      <div className="grid grid-cols-2 gap-3 px-0.5">
        <Link
          href="/sell"
          className="flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white p-3.5 shadow-sm font-bold text-sm transition"
        >
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-white/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span>খুচরা বিক্রি</span>
        </Link>

        <Link
          href="/wholesale"
          className="flex items-center justify-center gap-2.5 rounded-2xl bg-brand hover:bg-brand-strong active:scale-[0.98] text-white p-3.5 shadow-sm font-bold text-sm transition"
        >
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-white/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span>পাইকারি বিক্রি</span>
        </Link>
      </div>

      {/* Main Menu Grid - Ordered exactly to user specification */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">মেনু ও পরিচালনা</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {/* 1. সব বিক্রির হিসাব */}
          <MenuGridCard
            href="/reports"
            title="সব বিক্রির হিসাব"
            subtitle="সকল মেমোর হিসাব"
            value="রিপোর্ট"
            badge="সব রেকর্ড"
            iconColor="text-indigo-600 bg-indigo-50 border-indigo-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
          />

          {/* 2. বাকি খাতা */}
          <MenuGridCard
            href="/due"
            title="বাকি খাতা"
            subtitle={summary.totalCreditPaisa > 0 ? `জমা ৳${formatTaka(summary.totalCreditPaisa)}` : "কাস্টমার বকেয়া"}
            value={formatTaka(summary.totalDuePaisa)}
            valueColor={summary.totalDuePaisa > 0 ? "text-danger" : "text-emerald-600"}
            badge={summary.totalDuePaisa > 0 ? "বকেয়া আছে" : "পরিশোধিত"}
            badgeColor={summary.totalDuePaisa > 0 ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}
            iconColor="text-rose-600 bg-rose-50 border-rose-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            }
          />

          {/* 3. Wholesale বিক্রি */}
          <MenuGridCard
            href="/wholesale"
            title="Wholesale বিক্রি"
            subtitle="পাইকারি বিক্রয় মেমো"
            value="পাইকারি"
            badge="Wholesale"
            iconColor="text-blue-600 bg-blue-50 border-blue-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            }
          />

          {/* 4. Buyers */}
          <MenuGridCard
            href="/buyers"
            title="Buyers (ক্রেতা)"
            subtitle="পাইকারি ক্রেতা ও লেজার"
            value="ক্রেতা তালিকা"
            badge="দোকানদার"
            iconColor="text-purple-600 bg-purple-50 border-purple-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />

          {/* 5. খুচরা বিক্রি */}
          <MenuGridCard
            href="/sell"
            title="খুচরা বিক্রি"
            subtitle="দৈনিক কাস্টমার বিক্রি"
            value="খুচরা বিল"
            badge="Retail POS"
            iconColor="text-emerald-600 bg-emerald-50 border-emerald-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            }
          />

          {/* 6. খুচরা ক্রেতা */}
          <MenuGridCard
            href="/retail-customers"
            title="খুচরা ক্রেতা"
            subtitle="কাস্টমার খাতা ও বাকি"
            value="খুচরা খাতা"
            badge="কাস্টমার"
            iconColor="text-teal-600 bg-teal-50 border-teal-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            }
          />

          {/* 7. Medicine */}
          <MenuGridCard
            href="/medicines"
            title="Medicine"
            subtitle="ওষুধ ও স্টক ম্যানেজমেন্ট"
            value="ওষুধ তালিকা"
            badge="ইনভেন্টরি"
            iconColor="text-sky-600 bg-sky-50 border-sky-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-40 12 12)" />
                <path d="M9.5 6.5 14.5 11.5" />
              </svg>
            }
          />

          {/* 8. Stock Alert */}
          <MenuGridCard
            href="/medicines?filter=low-stock"
            title="Stock Alert"
            subtitle="স্টক কমে যাওয়া ওষুধ"
            value={`${summary.lowStock.length} টি`}
            valueColor={summary.lowStock.length > 0 ? "text-warn" : "text-emerald-600"}
            badge={summary.lowStock.length > 0 ? "স্টক কম" : "পর্যাপ্ত স্টক"}
            badgeColor={summary.lowStock.length > 0 ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}
            iconColor="text-amber-600 bg-amber-50 border-amber-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />

          {/* 9. Pending Order */}
          <MenuGridCard
            href="/orders"
            title="Pending Order"
            subtitle="অনলাইন অর্ডার অনুমোদন"
            value={`${summary.pendingOrderCount} টি`}
            valueColor={summary.pendingOrderCount > 0 ? "text-warn" : "text-emerald-600"}
            badge={summary.pendingOrderCount > 0 ? "অপেক্ষমান" : "সব ক্লিয়ার"}
            badgeColor={summary.pendingOrderCount > 0 ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}
            iconColor="text-orange-600 bg-orange-50 border-orange-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            }
          />

          {/* 10. Custom Bill */}
          <MenuGridCard
            href="/custom-bill"
            title="Custom Bill"
            subtitle="কাস্টম চালান তৈরি"
            value="বিল মেকার"
            badge="ইনভয়েস"
            iconColor="text-cyan-600 bg-cyan-50 border-cyan-100"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
          />

          {/* 11. Settings */}
          <MenuGridCard
            href="/settings"
            title="Settings"
            subtitle="দোকানের তথ্য ও সেটিংস"
            value="সেটিংস"
            badge="কনফিগার"
            iconColor="text-slate-600 bg-slate-100 border-slate-200"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}

function MenuGridCard({
  href,
  title,
  subtitle,
  value,
  valueColor = "text-ink",
  badge,
  badgeColor = "bg-line/40 text-muted border-line/60",
  icon,
  iconColor,
}: {
  href: string;
  title: string;
  subtitle: string;
  value: string;
  valueColor?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  iconColor: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface p-3.5 sm:p-4 border border-line/70 shadow-xs transition hover:shadow-md hover:border-brand/40 active:scale-[0.98] min-h-[118px]"
    >
      {/* Top row: Icon + optional badge */}
      <div className="flex items-center justify-between gap-1 mb-2.5">
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${iconColor} shadow-2xs group-hover:scale-105 transition duration-200`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor} truncate max-w-[85px]`}>
            {badge}
          </span>
        )}
      </div>

      {/* Middle & Bottom text */}
      <div className="space-y-0.5">
        <h3 className="font-bold text-ink text-xs sm:text-sm leading-snug group-hover:text-brand-strong transition">
          {title}
        </h3>
        <div className={`font-display text-sm sm:text-base font-extrabold truncate ${valueColor}`}>
          {value}
        </div>
        <p className="text-[10px] sm:text-[11px] font-medium text-muted truncate">
          {subtitle}
        </p>
      </div>
    </Link>
  );
}
