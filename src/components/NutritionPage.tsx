"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { MacrosLogPanel } from "@/components/MacrosLogPanel";
import { MenuDailyPanel, MenuTemplatesPanel } from "@/components/MenuPanels";
import {
  NutritionPanelNav,
  nutritionFieldClass,
  type NutritionPanel,
} from "@/components/nutrition-ui";
import { todayISODate } from "@/lib/tdee";

function clampDate(d: string): string {
  const today = todayISODate();
  return d > today ? today : d;
}

function normalizePanel(p: string | null): NutritionPanel {
  if (p === "macros") return "log";
  if (p === "menu" || p === "templates" || p === "log") return p;
  return "log";
}

function NutritionContent() {
  const searchParams = useSearchParams();
  const initialPanel = normalizePanel(searchParams.get("panel"));
  const initialDate = clampDate(
    searchParams.get("date") || todayISODate(),
  );

  const [panel, setPanel] = useState<NutritionPanel>(initialPanel);
  const [date, setDate] = useState(initialDate);
  const today = todayISODate();
  const field = nutritionFieldClass();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-sm w-full sm:w-auto">
          <span className="text-[var(--muted)] shrink-0">Date</span>
          <input
            type="date"
            className={`${field} max-w-[11rem]`}
            value={date}
            max={today}
            onChange={(e) => setDate(clampDate(e.target.value))}
          />
        </label>
        {date !== today ? (
          <button
            type="button"
            onClick={() => setDate(today)}
            className="text-xs text-[var(--accent)] hover:underline min-h-[44px]"
          >
            Today
          </button>
        ) : null}
      </div>

      <NutritionPanelNav active={panel} onChange={setPanel} />

      {panel === "log" ? <MacrosLogPanel date={date} /> : null}
      {panel === "menu" ? <MenuDailyPanel date={date} /> : null}
      {panel === "templates" ? (
        <MenuTemplatesPanel
          date={date}
          onApplied={() => setPanel("menu")}
        />
      ) : null}
    </>
  );
}

export function NutritionPage() {
  return (
    <AppShell title="Nutrition">
      <Suspense
        fallback={
          <p className="text-sm text-[var(--muted)] py-6">Loading…</p>
        }
      >
        <NutritionContent />
      </Suspense>
    </AppShell>
  );
}
