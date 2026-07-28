"use client";

import type { MacroWarning } from "@/lib/macros";

export function MacroWarningsBanner({
  warnings,
}: {
  warnings: MacroWarning[];
}) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {warnings.map((w) => (
        <div
          key={w.metric}
          className={`rounded-lg border px-3 py-3 ${
            w.severity === "high"
              ? "border-[var(--warn)] bg-[var(--warn-soft)]"
              : "border-[var(--warn)]/50 bg-[var(--warn-soft)]/70"
          }`}
        >
          <p className="text-sm font-medium text-[var(--warn)]">{w.title}</p>
          <p className="text-xs text-[var(--muted)] leading-relaxed mt-1">
            {w.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
