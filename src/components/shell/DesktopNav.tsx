"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] min-h-screen sticky top-0">
      <div className="px-5 pt-8 pb-6">
        <Link href="/" className="block">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Recomp
          </p>
          <p className="text-xl font-semibold tracking-tight text-[var(--foreground)] mt-1">
            Tracker
          </p>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-[var(--muted)] border-t border-[var(--border)]">
        <Link href="/settings" className="hover:text-[var(--foreground)]">
          Settings
        </Link>
      </div>
    </aside>
  );
}
