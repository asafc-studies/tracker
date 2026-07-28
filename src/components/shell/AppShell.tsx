import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-h-dvh flex bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden">
      <DesktopNav />
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <header className="md:hidden sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Recomp Tracker
            </p>
            {title ? (
              <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
            ) : null}
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-8 max-w-5xl w-full mx-auto min-w-0">
          {title ? (
            <h1 className="hidden md:block text-2xl font-semibold tracking-tight mb-6">
              {title}
            </h1>
          ) : null}
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
