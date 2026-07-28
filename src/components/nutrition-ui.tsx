"use client";

export type NutritionPanel = "log" | "menu" | "templates";

export const NUTRITION_PANELS: Array<{
  id: NutritionPanel;
  label: string;
  short?: string;
}> = [
  { id: "log", label: "Log food", short: "Log" },
  { id: "menu", label: "Daily menu", short: "Menu" },
  { id: "templates", label: "Meal ideas", short: "Ideas" },
];

export function NutritionPanelNav({
  active,
  onChange,
}: {
  active: NutritionPanel;
  onChange: (id: NutritionPanel) => void;
}) {
  return (
    <nav
      className="flex gap-0.5 overflow-x-auto border-b border-[var(--border)] mb-6 -mx-1 px-1"
      aria-label="Nutrition sections"
    >
      {NUTRITION_PANELS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px min-h-[44px] ${
              isActive
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short ?? tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function nutritionFieldClass() {
  return "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] min-h-[44px]";
}
