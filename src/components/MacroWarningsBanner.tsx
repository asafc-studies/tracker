"use client";

import type { MacroWarning, MacroWarningTone } from "@/lib/macros";

function toneClasses(
  tone: MacroWarningTone = "warn",
  severity: MacroWarning["severity"] = "warn",
) {
  if (tone === "low") {
    return {
      box: "border-[var(--protein-low)]/50 bg-[var(--protein-low-soft)]",
      title: "text-[var(--protein-low)]",
    };
  }
  if (tone === "soft") {
    return {
      box: "border-[var(--accent)]/40 bg-[var(--accent-soft)]",
      title: "text-[var(--accent)]/90",
    };
  }
  if (tone === "hard") {
    return {
      box: "border-[var(--accent)] bg-[var(--accent-soft)]",
      title: "text-[var(--accent)]",
    };
  }
  return {
    box:
      severity === "high"
        ? "border-[var(--warn)] bg-[var(--warn-soft)]"
        : "border-[var(--warn)]/50 bg-[var(--warn-soft)]/70",
    title: "text-[var(--warn)]",
  };
}

export function MacroWarningsBanner({
  warnings,
}: {
  warnings: MacroWarning[];
}) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {warnings.map((w) => {
        const styles = toneClasses(w.tone ?? "warn", w.severity);
        return (
          <div
            key={w.metric}
            className={`rounded-lg border px-3 py-3 ${styles.box}`}
          >
            <p className={`text-sm font-medium ${styles.title}`}>{w.title}</p>
            <p className="text-xs text-[var(--muted)] leading-relaxed mt-1">
              {w.detail}
            </p>
          </div>
        );
      })}
    </div>
  );
}
